"""Grounded Q&A over the user's Zettelkasten (the "Ask Tobalá" mode).

Given a natural-language question, build a strictly-scoped retrieval context
from:
    1. The user's top-K semantically-close notes (anchors).
    2. The 1-hop subgraph of non-rejected links touching those anchors
       (neighbors + edge labels).

Then ask an LLM — with structured JSON output — to answer using **only** the
retrieved context. The schema also carries two side-channels that never
contaminate the answer itself:

    • ``missing_knowledge`` — one-line statements of what the KG doesn't say
      about the question, so the user knows what's missing.
    • ``inspired_notes``   — 0-3 "you should write this" prompts with
      suggested tags. These seed the "write this now" flow in the Ask UI.

Strict grounding is enforced via the system prompt (repeated in two places
because the LLM obeys them unevenly) + the requirement to cite by id.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.db.models import Q

from .embeddings import generate_or_raise
from .models import Note, NoteLink
from .providers import ProviderError, get_llm_provider

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Retrieval — assemble the subgraph context
# ─────────────────────────────────────────────────────────────


@dataclass
class NoteSnippet:
    id: int
    title: str
    body: str
    context_name: str
    tags: list[str]
    # ``None`` for neighbors — only anchors carry a similarity score.
    score: float | None = None

    def to_prompt_block(self) -> str:
        body = (self.body or "").strip()
        if len(body) > 1200:
            body = body[:1200] + "…"
        tags_line = ", ".join(self.tags) if self.tags else "(none)"
        return (
            f"[N:{self.id}] {self.title or '(untitled)'}\n"
            f"  context: {self.context_name}\n"
            f"  tags: {tags_line}\n"
            f"  body: {body}"
        )


@dataclass
class EdgeSummary:
    source_id: int
    target_id: int
    label: str

    def to_prompt_line(self) -> str:
        return f"[N:{self.source_id}] -[{self.label}]-> [N:{self.target_id}]"


@dataclass
class RetrievalContext:
    anchors: list[NoteSnippet] = field(default_factory=list)
    neighbors: list[NoteSnippet] = field(default_factory=list)
    edges: list[EdgeSummary] = field(default_factory=list)

    @property
    def all_note_ids(self) -> set[int]:
        return {n.id for n in self.anchors} | {n.id for n in self.neighbors}


def _snippet_for(note: Note, *, score: float | None = None) -> NoteSnippet:
    ctx_name = note.context.name if note.context_id and note.context else "(unsorted)"
    tag_names = list(
        note.note_tags.select_related("tag")
        .values_list("tag__name", flat=True)
    )
    return NoteSnippet(
        id=note.pk,
        title=note.title,
        body=note.body,
        context_name=ctx_name,
        tags=tag_names,
        score=score,
    )


def fetch_context(user, question: str, *, top_k: int = 8) -> RetrievalContext:
    """Embed the question, anchor on top-K similar notes, expand to 1-hop.

    All edges in the expansion are drawn from non-rejected ``NoteLink`` rows;
    we do NOT traverse AGE here because we also want the ``label`` field in
    the SQL row and the SQL path is simpler/faster.
    """
    q_vec = generate_or_raise(question)

    anchor_qs = (
        Note.vectors.with_distance(
            vector=q_vec,
            vector_field="embedding",
            distance_fn="cosine",
        )
        .filter(owner=user)
        .exclude(embedding__isnull=True)
        .select_related("context")
        .prefetch_related("note_tags__tag")
        .order_by("distance")[:top_k]
    )
    anchors: list[NoteSnippet] = []
    anchor_ids: set[int] = set()
    for n in anchor_qs:
        anchors.append(_snippet_for(n, score=float(getattr(n, "distance", 0.0))))
        anchor_ids.add(n.pk)

    if not anchor_ids:
        return RetrievalContext()

    # One-hop expansion by SQL — we need the edge label per relationship, so
    # graph traversal (which only returns the other-side Node) isn't useful.
    edge_rows = (
        NoteLink.objects.filter(
            Q(source_id__in=anchor_ids) | Q(target_id__in=anchor_ids)
        )
        .exclude(status="rejected")
        .values_list("source_id", "target_id", "label")
    )
    edges: list[EdgeSummary] = []
    neighbor_ids: set[int] = set()
    for s, t, label in edge_rows:
        edges.append(EdgeSummary(source_id=s, target_id=t, label=label))
        if s not in anchor_ids:
            neighbor_ids.add(s)
        if t not in anchor_ids:
            neighbor_ids.add(t)

    neighbors: list[NoteSnippet] = []
    if neighbor_ids:
        neighbor_qs = (
            Note.objects.filter(pk__in=neighbor_ids, owner=user)
            .select_related("context")
            .prefetch_related("note_tags__tag")
        )
        neighbors = [_snippet_for(n) for n in neighbor_qs]

    return RetrievalContext(anchors=anchors, neighbors=neighbors, edges=edges)


# ─────────────────────────────────────────────────────────────
# Answer — ground the LLM in the retrieval context
# ─────────────────────────────────────────────────────────────


_SYSTEM_PROMPT = (
    "You are a Zettelkasten assistant. The user is asking a question about "
    "their own notes — you may use ONLY the notes in the CONTEXT block "
    "below to answer. Do not invent facts. Do not rely on your training "
    "data.\n\n"
    "Rules:\n"
    "- Answer from the context only. If the context is silent, say so in the "
    "  'missing_knowledge' field and leave the 'answer' short or empty.\n"
    "- Cite every note you use inline with the token '[N:<id>]' where <id> "
    "  is the numeric note id from the context.\n"
    "- Each note lists its context (folder) and tags — you may use them as "
    "  signal but never treat them as truth.\n"
    "- 'missing_knowledge' is a short list (0–3 items) of specific things the "
    "  context does not say; one concise sentence each.\n"
    "- 'inspired_notes' suggests 0–3 notes the user has NOT written yet but "
    "  probably should, given the gap. Each entry has a title, a one-sentence "
    "  'why', and 2–5 lower-kebab-case 'suggested_tags'.\n"
    "- Do NOT surface 'inspired_notes' prompts inside 'answer'. Keep them "
    "  strictly in their own field."
)


_SCHEMA = {
    "name": "answer_from_kg",
    "description": "Strictly grounded answer over the user's notes, plus side-channel note prompts.",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "answer": {"type": "string"},
            "cited_note_ids": {
                "type": "array",
                "items": {"type": "integer"},
            },
            "missing_knowledge": {
                "type": "array",
                "items": {"type": "string"},
            },
            "inspired_notes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "title": {"type": "string"},
                        "why": {"type": "string"},
                        "suggested_tags": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["title", "why", "suggested_tags"],
                },
            },
        },
        "required": [
            "answer",
            "cited_note_ids",
            "missing_knowledge",
            "inspired_notes",
        ],
    },
}


def _render_context(ctx: RetrievalContext) -> str:
    lines: list[str] = []
    if ctx.anchors:
        lines.append("ANCHOR NOTES (semantically closest to the question):")
        for a in ctx.anchors:
            lines.append(a.to_prompt_block())
            lines.append("")
    if ctx.neighbors:
        lines.append("NEIGHBOR NOTES (linked 1-hop from an anchor):")
        for n in ctx.neighbors:
            lines.append(n.to_prompt_block())
            lines.append("")
    if ctx.edges:
        lines.append("TYPED EDGES BETWEEN THOSE NOTES:")
        for e in ctx.edges:
            lines.append(e.to_prompt_line())
    if not lines:
        lines.append("(no notes are close enough to the question to anchor on)")
    return "\n".join(lines).strip()


def answer(user, question: str) -> dict[str, Any]:
    """Run the full retrieve-then-answer pipeline for ``question``.

    Always returns a dict shaped by the output schema, even when the KG is
    empty — the frontend treats an empty ``answer`` + populated
    ``missing_knowledge`` as the "your notes don't cover this" state.
    """
    cfg = getattr(settings, "TOBALA_LLM", {})
    top_k = int(cfg.get("top_k_retrieval", 8))

    try:
        ctx = fetch_context(user, question, top_k=top_k)
    except ProviderError:
        raise
    except Exception as exc:  # pragma: no cover — defensive
        raise ProviderError(f"retrieval context build failed: {exc}") from exc

    if not ctx.anchors:
        return {
            "answer": "",
            "cited_note_ids": [],
            "missing_knowledge": [
                "Your notes don't cover this question yet — try writing one."
            ],
            "inspired_notes": [],
        }

    user_msg = (
        f"QUESTION:\n{question.strip()}\n\n"
        f"CONTEXT:\n{_render_context(ctx)}\n\n"
        "Call answer_from_kg with your strictly-grounded response."
    )

    resp = get_llm_provider("retrieval").complete(
        system=_SYSTEM_PROMPT,
        user=user_msg,
        response_schema=_SCHEMA,
        max_tokens=800,
        temperature=0.2,
    )

    payload = resp.content or {}
    # Defensive shape normalization — providers should honor the schema but
    # we've seen structured-output drift, especially when the model hedges.
    allowed_ids = ctx.all_note_ids
    cited = [int(i) for i in (payload.get("cited_note_ids") or []) if isinstance(i, int) or (isinstance(i, str) and i.isdigit())]
    cited = [i for i in cited if i in allowed_ids]

    return {
        "answer": str(payload.get("answer", "")).strip(),
        "cited_note_ids": cited,
        "missing_knowledge": [
            str(m).strip() for m in (payload.get("missing_knowledge") or []) if m
        ],
        "inspired_notes": [
            {
                "title": str(n.get("title", "")).strip(),
                "why": str(n.get("why", "")).strip(),
                "suggested_tags": [
                    str(t).strip() for t in (n.get("suggested_tags") or []) if t
                ][:5],
            }
            for n in (payload.get("inspired_notes") or [])
            if isinstance(n, dict) and n.get("title")
        ][:3],
    }
