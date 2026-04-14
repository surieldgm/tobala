"""Pluggable embedding generator.

MVP stub: returns ``None`` so notes save with ``embedding=NULL``. Swap this
implementation in for a real provider (sentence-transformers,
Ollama, OpenAI, ...) — keep the signature stable so callers don't need
to change.

The expected output is a list of 384 floats matching
``settings.AGAVE["VECTOR_DIMENSIONS"]``.
"""
from __future__ import annotations


def generate(text: str) -> list[float] | None:
    """Return an embedding for ``text`` or ``None`` if generation is disabled."""
    return None
