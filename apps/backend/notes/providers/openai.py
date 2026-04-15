"""OpenAI embedding + chat-completions provider."""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from django.conf import settings

from .base import LLMResponse, LLMUsage, ProviderError


def _logged(task: str):
    """Thin wrapper around ``notes.observability.log_llm_call``.

    Imported lazily at *call time* (not decoration time) to keep the
    provider module importable before Django apps are fully loaded —
    ``notes.observability`` pulls in ``notes.models.LLMInvocation``.
    """

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
_EMBEDDING_PRICES = {
    "text-embedding-3-small": (0.00002, 0.0),
    "text-embedding-3-large": (0.00013, 0.0),
}
_CHAT_PRICES = {
    "gpt-4o": (0.0025, 0.01),
    "gpt-4o-mini": (0.00015, 0.0006),
}


def _client():
    # Imported lazily so the backend boots even when openai isn't installed
    # (e.g. during very early dev or when the user picks a different provider).
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ProviderError("openai package not installed") from exc

    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise ProviderError(
            "OPENAI_API_KEY is empty — set it in .env to enable the OpenAI provider."
        )
    return OpenAI(api_key=api_key)


class OpenAIEmbeddingProvider:
    provider_name = "openai"

    def __init__(self, model: str = "text-embedding-3-small") -> None:
        self.model = model

    @_logged("embedding")
    def embed(self, text: str) -> list[float]:
        if not text:
            raise ProviderError("empty text cannot be embedded")
        try:
            start = time.perf_counter()
            resp = _client().embeddings.create(model=self.model, input=text)
            elapsed_ms = int((time.perf_counter() - start) * 1000)
        except ProviderError:
            raise
        except Exception as exc:  # pragma: no cover — defensive
            raise ProviderError(f"openai embed failed: {exc}") from exc

        logger.info(
            "openai.embed model=%s dim=%d tokens=%s latency=%dms",
            self.model,
            len(resp.data[0].embedding),
            getattr(resp.usage, "total_tokens", "?"),
            elapsed_ms,
        )
        return list(resp.data[0].embedding)


class OpenAILLMProvider:
    provider_name = "openai"

    def __init__(self, model: str = "gpt-4o-mini") -> None:
        self.model = model

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
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if response_schema is not None:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": response_schema.get("name", "response"),
                    "strict": True,
                    "schema": response_schema["schema"],
                },
            }

        try:
            start = time.perf_counter()
            resp = _client().chat.completions.create(**kwargs)
            elapsed_ms = int((time.perf_counter() - start) * 1000)
        except ProviderError:
            raise
        except Exception as exc:  # pragma: no cover — defensive
            raise ProviderError(f"openai chat failed: {exc}") from exc

        raw = resp.choices[0].message.content or ""
        content: Any = raw
        if response_schema is not None:
            try:
                content = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ProviderError(
                    f"openai returned non-JSON for json_schema response: {raw!r}"
                ) from exc

        prompt_in, prompt_out = _CHAT_PRICES.get(self.model, (0.0, 0.0))
        usage_obj = resp.usage
        prompt_tokens = getattr(usage_obj, "prompt_tokens", 0) or 0
        completion_tokens = getattr(usage_obj, "completion_tokens", 0) or 0
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
