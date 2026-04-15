"""LLM-powered tag extraction.

``infer_tags(text, hint_tags=[])`` returns a list of ``(name, confidence)``
tuples. The worker (``tasks.infer_tags``) wraps each result into a
:class:`NoteTag` row scoped to the note's owner, creating the
:class:`Tag` if it doesn't exist yet.

The prompt:
- enforces a lower-kebab-case normalized output shape
- asks for 3-7 tags (configurable via ``settings.TOBALA_LLM['tag_min/max']``)
- passes the owner's existing top-30 tags as a soft hint so the LLM reuses
  the taxonomy when relevant (tag-space entropy creeps otherwise).
"""
from __future__ import annotations

import logging
from typing import Iterable

from django.conf import settings

from .models import normalize_tag_name
from .providers import ProviderError, get_llm_provider

logger = logging.getLogger(__name__)


_SYSTEM_PROMPT = """You extract topic tags from a Zettelkasten note so future notes can find it by topic.

Rules:
- Return 3-7 tags. Fewer is better than padding with noise.
- Each tag is lower-kebab-case (letters, digits, hyphens only), 2-40 chars, e.g. "gradient-descent", "stoicism", "kubernetes-rbac".
- Prefer topic nouns over proper nouns; include a proper noun only if it is central to the note (a book a tag applies to is fine; the author's surname alone is not).
- Be consistent: if related tags already exist in the user's taxonomy (hint list), reuse them.
- No personal/emotional tags ("interesting", "important"); no meta tags ("note", "idea", "thought").
- Each tag has a confidence in 0..1 reflecting how central the topic is to the note.
"""


_SCHEMA = {
    "name": "extract_tags",
    "description": "Structured tag extraction.",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "tags": {
                "type": "array",
                "minItems": 1,
                "maxItems": 10,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "name": {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                    "required": ["name", "confidence"],
                },
            }
        },
        "required": ["tags"],
    },
}


def infer_tags(
    text: str, *, hint_tags: Iterable[str] = ()
) -> list[tuple[str, float]]:
    """Return a cleaned list of ``(kebab-case-name, confidence)`` pairs.

    Raises :class:`ProviderError` on failure so the Celery task can retry.
    """
    text = (text or "").strip()
    if not text:
        return []

    cfg = settings.TOBALA_LLM
    tag_min, tag_max = cfg["tag_min"], cfg["tag_max"]

    hint_clause = ""
    hints = [t for t in hint_tags if t]
    if hints:
        hint_clause = (
            "\n\nThe user already uses these tags — reuse them when they fit:\n"
            + ", ".join(sorted(set(hints))[:30])
        )

    user_msg = (
        f"Return {tag_min}-{tag_max} tags for the following note. "
        "Respond by calling the extract_tags structured output."
        f"{hint_clause}\n\n"
        "NOTE:\n"
        f"{text}"
    )

    try:
        resp = get_llm_provider("tagging").complete(
            system=_SYSTEM_PROMPT,
            user=user_msg,
            response_schema=_SCHEMA,
            max_tokens=400,
            temperature=0.1,
        )
    except ProviderError:
        raise
    except Exception as exc:  # pragma: no cover — defensive
        raise ProviderError(f"tagging LLM failed: {exc}") from exc

    out: list[tuple[str, float]] = []
    seen: set[str] = set()
    for item in resp.content.get("tags", []) or []:
        name = normalize_tag_name(str(item.get("name", "")))
        if not name or name in seen:
            continue
        try:
            confidence = float(item.get("confidence", 0))
        except (TypeError, ValueError):
            continue
        confidence = max(0.0, min(1.0, confidence))
        seen.add(name)
        out.append((name, confidence))

    # Clamp to the configured bounds: keep the highest-confidence first.
    out.sort(key=lambda p: p[1], reverse=True)
    return out[:tag_max]
