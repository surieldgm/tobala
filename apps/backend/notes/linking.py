"""LLM-driven edge-label classifier for the auto-link pipeline.

Given an ``anchor`` and ``candidate`` note (already semantically close by
vector similarity), ask the LLM whether the candidate stands in a meaningful
typed relationship to the anchor — and if so, which of the five fixed labels
fits. If the LLM declines (``NONE``) or the confidence is below the
configured threshold, we skip the edge.

Why a fixed vocabulary: per the R2 plan the graph's semantics rest on a
curated set of edge types (``REFERENCES``, ``SUPPORTS``, ``CONTRADICTS``,
``EXTENDS``, ``INSPIRES``). Using structured output with an ``enum``-typed
schema forces the LLM to pick from that list (or ``NONE``), which keeps the
graph machine-readable.
"""
from __future__ import annotations

import logging

from django.conf import settings

from .providers import ProviderError, get_llm_provider

logger = logging.getLogger(__name__)


# Human-readable definitions for each label. These live in the prompt so the
# LLM has a shared vocabulary; the list mirrors ``NoteLink.LABEL_CHOICES``.
_LABEL_DEFINITIONS = {
    "REFERENCES": "mentions, cites, or relies on the other note's content",
    "SUPPORTS": "agrees with or provides evidence for the other note's claim",
    "CONTRADICTS": "disagrees with or provides counter-evidence to the other note",
    "EXTENDS": "builds on, elaborates, or generalizes the other note",
    "INSPIRES": "is thematically adjacent — the notes feel related without a direct argumentative link",
}

_SYSTEM_PROMPT = (
    "You label directed edges in a Zettelkasten knowledge graph.\n\n"
    "Given ANCHOR and CANDIDATE notes, choose the best label for the edge "
    "ANCHOR → CANDIDATE, or NONE if the candidate is not meaningfully "
    "related to the anchor.\n\n"
    "Label meanings:\n"
    + "\n".join(f"- {k}: {v}" for k, v in _LABEL_DEFINITIONS.items())
    + "\n- NONE: do not create an edge.\n\n"
    "Rules:\n"
    "- Be conservative. Prefer NONE if you are not sure.\n"
    "- The notes may share tags and/or context. Use them as a hint but do not "
    "create an edge purely because tags overlap.\n"
    "- Confidence is 0..1: how sure you are that this label fits (not that "
    "an edge should exist at all).\n"
    "- One-sentence reason — it will be surfaced to the user in the Proposals inbox.\n"
)


_SCHEMA = {
    "name": "classify_edge",
    "description": "Pick an edge label for two semantically-close notes, or NONE.",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "label": {
                "type": "string",
                "enum": ["REFERENCES", "SUPPORTS", "CONTRADICTS", "EXTENDS", "INSPIRES", "NONE"],
            },
            "confidence": {"type": "number"},
            "reason": {"type": "string"},
        },
        "required": ["label", "confidence", "reason"],
    },
}


def _format_note(role: str, note) -> str:
    """Build a compact text block for the prompt.

    Includes the note's context name + tag names alongside title/body so the
    LLM can use them as signal (per the plan's "anchor.tags ∪ candidate.tags"
    note).
    """
    ctx_name = note.context.name if note.context_id and note.context else "(unsorted)"
    tag_names = list(
        note.note_tags.select_related("tag").values_list("tag__name", flat=True)
    )
    tags_line = ", ".join(tag_names) if tag_names else "(none)"
    body = (note.body or "").strip()
    # Cap body length — pricing scales linearly with prompt tokens, and a
    # Zettelkasten note rarely needs its full body for relationship judging.
    if len(body) > 1400:
        body = body[:1400] + "…"
    return (
        f"{role}:\n"
        f"  title: {note.title or '(untitled)'}\n"
        f"  context: {ctx_name}\n"
        f"  tags: {tags_line}\n"
        f"  body: {body}"
    )


def classify_edge(anchor, candidate) -> tuple[str | None, float, str]:
    """Return ``(label, confidence, reason)`` for ``anchor → candidate``.

    ``label`` is ``None`` when the LLM says NONE or confidence is below the
    configured threshold. Raises :class:`ProviderError` on provider failure
    so the Celery task retries instead of silently swallowing the edge.
    """
    cfg = settings.TOBALA_LLM
    threshold = float(cfg.get("linking_confidence_threshold", 0.5))

    user_msg = (
        _format_note("ANCHOR", anchor)
        + "\n\n"
        + _format_note("CANDIDATE", candidate)
        + "\n\nCall classify_edge with your choice."
    )

    try:
        resp = get_llm_provider("linking").complete(
            system=_SYSTEM_PROMPT,
            user=user_msg,
            response_schema=_SCHEMA,
            max_tokens=200,
            temperature=0.1,
        )
    except ProviderError:
        raise
    except Exception as exc:  # pragma: no cover — defensive
        raise ProviderError(f"linking LLM failed: {exc}") from exc

    content = resp.content or {}
    label = str(content.get("label", "NONE")).upper()
    try:
        confidence = float(content.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))
    reason = str(content.get("reason", "")).strip()[:500]

    if label == "NONE" or label not in _LABEL_DEFINITIONS:
        return None, confidence, reason
    if confidence < threshold:
        logger.info(
            "classify_edge below threshold (conf=%.2f < %.2f): %s -> %s",
            confidence, threshold, anchor.pk, candidate.pk,
        )
        return None, confidence, reason
    return label, confidence, reason
