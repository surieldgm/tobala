"""Abstract protocols for embedding + LLM providers.

Keeps the rest of the code provider-agnostic: call sites import from
``notes.providers`` and get back an object that satisfies these protocols.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


class ProviderError(RuntimeError):
    """Base class for all provider-level failures.

    Celery task retry rules watch for this; raising it from a provider call
    tells the pipeline to back off and retry (vs. ValueError, which won't).
    """


@dataclass
class LLMUsage:
    """Token/cost bookkeeping returned alongside every LLM response."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    model: str = ""
    provider: str = ""


@dataclass
class LLMResponse:
    """Wraps a structured-output LLM call."""

    content: Any  # parsed JSON when response_format is json_schema, else str
    raw: str
    usage: LLMUsage = field(default_factory=LLMUsage)


@runtime_checkable
class EmbeddingProvider(Protocol):
    model: str

    def embed(self, text: str) -> list[float]:
        """Return a vector of ``settings.TOBALA_LLM['embedding_dim']`` floats.

        Raises ``ProviderError`` on any failure (network, auth, bad response).
        """
        ...


@runtime_checkable
class LLMProvider(Protocol):
    model: str

    def complete(
        self,
        *,
        system: str,
        user: str,
        response_schema: dict | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> LLMResponse:
        """Single-turn completion with optional JSON-schema structured output.

        ``response_schema`` follows the JSON-Schema subset accepted by OpenAI's
        ``response_format={"type":"json_schema", ...}`` and Anthropic's tool-use
        input schema. Providers convert as needed.
        """
        ...
