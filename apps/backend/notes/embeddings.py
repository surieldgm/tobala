"""Embedding generator — delegates to the configured provider.

The function still has the same signature as the MVP stub (returns a list of
floats or ``None``), so existing call sites don't need to change. A ``None``
return means the provider raised and the caller should treat the note as
un-embedded (the worker will flip ``embedding_status`` to ``"failed"`` and
surface the error).
"""
from __future__ import annotations

import logging

from .providers import ProviderError, get_embedding_provider

logger = logging.getLogger(__name__)


def generate(text: str) -> list[float] | None:
    """Return an embedding vector for ``text``, or ``None`` on failure.

    Never raises — failures are logged and surface as ``None`` so that sync
    save paths (the initial MVP behavior) don't break when no API key is set.
    The async pipeline uses ``generate_or_raise`` when it wants the error to
    propagate (so Celery's retry logic can kick in).
    """
    try:
        return generate_or_raise(text)
    except ProviderError as exc:
        logger.warning("embeddings.generate returning None: %s", exc)
        return None


def generate_or_raise(text: str) -> list[float]:
    """Like :func:`generate` but re-raises ``ProviderError`` for the worker."""
    return get_embedding_provider().embed(text)
