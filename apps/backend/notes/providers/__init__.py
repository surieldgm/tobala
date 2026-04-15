"""LLM + embedding provider registry.

Reads ``settings.TOBALA_LLM`` to decide which provider class instantiates each
task (embedding / tagging / linking / retrieval). Adding a new provider is:
1. Drop a module under ``providers/`` that implements the protocol from ``base``.
2. Register it in ``_PROVIDERS`` below.
3. Flip the env var (e.g. ``LINKING_PROVIDER=anthropic``).

No call sites change.
"""
from __future__ import annotations

from django.conf import settings

from .base import EmbeddingProvider, LLMProvider, ProviderError
from .openai import OpenAIEmbeddingProvider, OpenAILLMProvider

# Anthropic is imported lazily because the SDK is optional — we don't want an
# ImportError on boot when a user is running OpenAI-only.


def _lazy_anthropic():
    from .anthropic import AnthropicLLMProvider

    return AnthropicLLMProvider


_EMBEDDING_PROVIDERS = {
    "openai": OpenAIEmbeddingProvider,
}

_LLM_PROVIDERS = {
    "openai": OpenAILLMProvider,
    "anthropic": _lazy_anthropic,
}


_TASK_MODEL_KEYS = {
    "tagging": ("tagging_provider", "tagging_model"),
    "linking": ("linking_provider", "linking_model"),
    "retrieval": ("retrieval_provider", "retrieval_model"),
}


def get_embedding_provider() -> EmbeddingProvider:
    cfg = settings.TOBALA_LLM
    name = cfg["embedding_provider"]
    cls = _EMBEDDING_PROVIDERS.get(name)
    if cls is None:
        raise ProviderError(
            f"Unknown embedding provider '{name}'. Known: {list(_EMBEDDING_PROVIDERS)}"
        )
    return cls(model=cfg["embedding_model"])


def get_llm_provider(task: str) -> LLMProvider:
    """Return the configured LLM provider for a task.

    ``task`` is one of: 'tagging', 'linking', 'retrieval'. The task is
    stashed on the instance as ``_task`` so :func:`notes.observability.log_llm_call`
    can attribute every invocation to the correct bucket in the admin.
    """
    cfg = settings.TOBALA_LLM
    try:
        provider_key, model_key = _TASK_MODEL_KEYS[task]
    except KeyError as exc:
        raise ProviderError(f"Unknown LLM task '{task}'") from exc

    name = cfg[provider_key]
    cls_or_loader = _LLM_PROVIDERS.get(name)
    if cls_or_loader is None:
        raise ProviderError(
            f"Unknown LLM provider '{name}'. Known: {list(_LLM_PROVIDERS)}"
        )
    # lazy imports return a callable that itself returns the class
    cls = cls_or_loader() if not isinstance(cls_or_loader, type) else cls_or_loader
    instance = cls(model=cfg[model_key])
    instance._task = task
    return instance


__all__ = [
    "EmbeddingProvider",
    "LLMProvider",
    "ProviderError",
    "get_embedding_provider",
    "get_llm_provider",
]
