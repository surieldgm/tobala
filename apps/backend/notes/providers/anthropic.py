"""Anthropic LLM provider (chat only — Anthropic has no embeddings API).

When embeddings are needed with Anthropic selected, we suggest Voyage AI as
the future fallback; today ``.embed`` raises ``ProviderError``.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from django.conf import settings

from .base import LLMResponse, LLMUsage, ProviderError


def _logged(task: str):
    """Same lazy telemetry wrapper as ``providers.openai._logged``."""

    def outer(fn):
        from functools import wraps

        @wraps(fn)
        def wrapper(*args, **kwargs):
            from ..observability import log_llm_call

            return log_llm_call(task)(fn)(*args, **kwargs)

        return wrapper

    return outer

logger = logging.getLogger(__name__)


# Rough USD/1K-token prices (keep up-to-date; used only for monitoring).
_CHAT_PRICES = {
    "claude-opus-4-6": (0.015, 0.075),
    "claude-sonnet-4-6": (0.003, 0.015),
    "claude-haiku-4-5-20251001": (0.001, 0.005),
}


def _client():
    try:
        from anthropic import Anthropic
    except ImportError as exc:
        raise ProviderError("anthropic package not installed") from exc

    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        raise ProviderError(
            "ANTHROPIC_API_KEY is empty — set it in .env to use the Anthropic provider."
        )
    return Anthropic(api_key=api_key)


class AnthropicLLMProvider:
    provider_name = "anthropic"

    def __init__(self, model: str = "claude-haiku-4-5-20251001") -> None:
        self.model = model

    def embed(self, text: str) -> list[float]:
        # Deliberate: Anthropic offers no embeddings API. Future fix: swap in
        # Voyage AI for embeddings when the LLM provider is Anthropic.
        raise ProviderError(
            "Anthropic has no embeddings API — use openai (or future voyage) for "
            "embeddings while keeping Anthropic for tagging/linking/retrieval."
        )

    @_logged("__pertask__")
    def complete(
        self,
        *,
        system: str,
        user: str,
        response_schema: dict | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> LLMResponse:
        # Anthropic uses a tool-use pattern for structured output: we expose a
        # single dummy tool whose ``input_schema`` is our JSON Schema, then
        # force the model to call it.
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        tool_name = None
        if response_schema is not None:
            tool_name = response_schema.get("name", "respond")
            kwargs["tools"] = [
                {
                    "name": tool_name,
                    "description": response_schema.get(
                        "description", "Return a structured response."
                    ),
                    "input_schema": response_schema["schema"],
                }
            ]
            kwargs["tool_choice"] = {"type": "tool", "name": tool_name}

        try:
            start = time.perf_counter()
            resp = _client().messages.create(**kwargs)
            elapsed_ms = int((time.perf_counter() - start) * 1000)
        except ProviderError:
            raise
        except Exception as exc:  # pragma: no cover — defensive
            raise ProviderError(f"anthropic chat failed: {exc}") from exc

        content: Any
        raw: str
        if tool_name is not None:
            tool_use = next(
                (
                    block
                    for block in resp.content
                    if getattr(block, "type", None) == "tool_use"
                    and getattr(block, "name", None) == tool_name
                ),
                None,
            )
            if tool_use is None:
                raise ProviderError(
                    "anthropic did not call the structured-output tool"
                )
            content = tool_use.input
            raw = json.dumps(content)
        else:
            raw = "".join(
                getattr(b, "text", "")
                for b in resp.content
                if getattr(b, "type", None) == "text"
            )
            content = raw

        prompt_in, prompt_out = _CHAT_PRICES.get(self.model, (0.0, 0.0))
        prompt_tokens = resp.usage.input_tokens if resp.usage else 0
        completion_tokens = resp.usage.output_tokens if resp.usage else 0
        cost = (prompt_tokens / 1000) * prompt_in + (
            completion_tokens / 1000
        ) * prompt_out

        return LLMResponse(
            content=content,
            raw=raw,
            usage=LLMUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
                cost_usd=round(cost, 6),
                latency_ms=elapsed_ms,
                model=self.model,
                provider=self.provider_name,
            ),
        )
