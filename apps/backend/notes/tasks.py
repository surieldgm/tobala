"""Celery tasks for the async note pipeline.

Chain:  ``embed_note`` → ``infer_tags`` → ``propose_links``.

Each task is idempotent and safe to retry. The pipeline runs out-of-band from
the HTTP request/response cycle so the user can keep writing while the LLM
catches up. Success of each stage publishes a WS event (see
:mod:`notes.events`) so the frontend can flip badges without polling.

The chain is intentionally *not* done via Celery's ``chain()`` primitive —
using explicit ``.delay()`` on success makes the pipeline resilient to
individual task failures: a broken link-propose step does not retry the
embed step.
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.db import transaction

from django.conf import settings
from django.db.models import Q

from .events import publish
from .models import Note, NoteLink, NoteTag, Tag, content_hash, normalize_tag_name
from .providers import ProviderError

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# 1) Embedding
# ─────────────────────────────────────────────────────────────


@shared_task(
    bind=True,
    autoretry_for=(ProviderError,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
)
def embed_note(self, note_id: int) -> None:
    """Vectorize the note's title+body and store it on the row.

    On success, chains to :func:`infer_tags`. On provider failure, Celery
    retries with exponential backoff. After ``max_retries`` the task lands
    in ``embedding_status="failed"`` with the error message stored so the UI
    can surface it.
    """
    from .embeddings import generate_or_raise  # lazy: keeps tasks importable in eager mode

    try:
        note = Note.objects.get(pk=note_id)
    except Note.DoesNotExist:
        logger.info("embed_note: note %s vanished before processing", note_id)
        return

    # Nothing to embed — a note with no text yet.
    text = f"{note.title}\n{note.body}".strip()
    if not text:
        Note.objects.filter(pk=note_id).update(
            embedding=None,
            embedding_status="pending",
            embedding_error="",
        )
        publish(note.owner_id, "note.embedding.pending", {"note_id": note.pk})
        return

    # Second-line defense: the signal already guards on hash, but a backlog of
    # tasks queued before the current content was committed can still arrive
    # here. Skip the provider call if the current content already matches the
    # embedded hash.
    current_hash = content_hash(note.title, note.body)
    if (
        note.embedding is not None
        and note.embedding_content_hash == current_hash
    ):
        logger.info(
            "embed_note: note %s already embedded for hash=%s — skipping",
            note_id,
            current_hash[:8],
        )
        return

    # Mark processing so the UI can show a spinner.
    Note.objects.filter(pk=note_id).update(
        embedding_status="processing", embedding_error=""
    )
    publish(note.owner_id, "note.embedding.pending", {"note_id": note.pk})

    try:
        vector = generate_or_raise(text)
    except ProviderError as exc:
        # Let Celery handle retry unless we're on the last attempt.
        if self.request.retries >= self.max_retries:
            logger.exception("embed_note: giving up on note %s", note_id)
            Note.objects.filter(pk=note_id).update(
                embedding_status="failed",
                embedding_error=str(exc)[:500],
            )
            publish(
                note.owner_id,
                "note.embedding.failed",
                {"note_id": note.pk, "error": str(exc)},
            )
            return
        raise

    # Store the hash of the text we just embedded so the signal can
    # skip re-enqueuing when the content hasn't changed.
    embedded_hash = content_hash(note.title, note.body)
    Note.objects.filter(pk=note_id).update(
        embedding=vector,
        embedding_status="ready",
        embedding_error="",
        embedding_content_hash=embedded_hash,
    )
    publish(note.owner_id, "note.embedding.ready", {"note_id": note.pk})

    # Fire the next link in the chain once the DB update is committed.
    transaction.on_commit(lambda: infer_tags.delay(note_id))


# ─────────────────────────────────────────────────────────────
# 2) Tagging
# ─────────────────────────────────────────────────────────────


@shared_task(
    bind=True,
    autoretry_for=(ProviderError,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=2,
)
def infer_tags(self, note_id: int) -> None:
    """Extract topic tags for a note; upsert ``NoteTag`` rows.

    System-source rows only overwrite other system rows — a user-endorsed
    tag is sticky, even if the LLM would have suggested something different
    on the second run. On success, chains to :func:`propose_links`.
    """
    from .tagging import infer_tags as run_tagging

    try:
        note = Note.objects.select_related("owner").get(pk=note_id)
    except Note.DoesNotExist:
        return

    text = f"{note.title}\n{note.body}".strip()
    if not text:
        return

    # Hash guard: skip the LLM call when tagging already ran for this exact
    # content. Prevents redundant API calls from backlogged duplicate tasks.
    current_hash = content_hash(note.title, note.body)
    if note.tagging_content_hash == current_hash:
        logger.info(
            "infer_tags: note %s already tagged for hash=%s — skipping",
            note_id,
            current_hash[:8],
        )
        return

    # Soft-hint the LLM with the owner's existing tag namespace so repeated
    # topics converge on the same kebab form.
    hint_tags = list(
        Tag.objects.filter(owner=note.owner)
        .order_by("-id")[:30]
        .values_list("name", flat=True)
    )

    try:
        pairs = run_tagging(text, hint_tags=hint_tags)
    except ProviderError:
        raise
    except Exception as exc:  # pragma: no cover — defensive
        logger.exception("infer_tags: unexpected failure for %s: %s", note_id, exc)
        return

    written: list[dict] = []
    with transaction.atomic():
        for name, confidence in pairs:
            normalized = normalize_tag_name(name)
            if not normalized:
                continue
            tag, _ = Tag.objects.get_or_create(
                owner=note.owner, name=normalized
            )
            existing = NoteTag.objects.filter(note=note, tag=tag).first()
            # Never clobber a user-endorsed tag with a system write.
            if existing and existing.source == "user":
                continue
            NoteTag.objects.update_or_create(
                note=note,
                tag=tag,
                defaults={"source": "system", "confidence": confidence},
            )
            written.append({"name": normalized, "confidence": confidence, "source": "system"})

        # Record the content hash so the guard above can skip duplicate runs.
        Note.objects.filter(pk=note_id).update(
            tagging_content_hash=current_hash,
        )

    publish(
        note.owner_id,
        "note.tags.updated",
        {"note_id": note.pk, "tags": written},
    )

    transaction.on_commit(lambda: propose_links.delay(note_id))


# ─────────────────────────────────────────────────────────────
# 3) Auto-linking
# ─────────────────────────────────────────────────────────────


@shared_task(
    bind=True,
    autoretry_for=(ProviderError,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=2,
)
def propose_links(self, note_id: int) -> None:
    """Pick top-k semantically close notes and let the LLM classify each edge.

    For each close candidate that isn't already linked in either direction,
    the LLM picks an edge label (or declines). Accepted picks are saved as
    ``NoteLink(status="proposed", created_by="system")`` rows and published
    as WS events so the frontend's ProposalsInbox updates live.

    We never overwrite an existing edge between the two notes — if the user
    has already confirmed or rejected something, we skip.
    """
    from .linking import classify_edge

    try:
        note = Note.objects.select_related("context").get(pk=note_id)
    except Note.DoesNotExist:
        return

    if note.embedding is None:
        # Can't propose if the note never embedded — the embed stage failed
        # and should've already reported via note.embedding.failed.
        return

    # Hash guard: skip the LLM classify_edge() calls when link proposals were
    # already generated for this exact content. Prevents the backlog from
    # multiplying API calls when many propose_links tasks are queued for the
    # same note version.
    link_hash = content_hash(note.title, note.body)
    if note.linking_content_hash == link_hash:
        logger.info(
            "propose_links: note %s already linked for hash=%s — skipping",
            note_id,
            link_hash[:8],
        )
        return

    cfg = settings.TOBALA_LLM
    top_k = int(cfg.get("top_k_links", 5))

    # Over-fetch so we have room to filter out self + already-linked pairs.
    similar = (
        Note.vectors.with_distance(
            vector=note.embedding,
            vector_field="embedding",
            distance_fn="cosine",
        )
        .filter(owner=note.owner)
        .exclude(embedding__isnull=True)
        .select_related("context")
        .prefetch_related("note_tags__tag")
        .order_by("distance")[: top_k + 10]
    )

    # Gather existing edge endpoints in either direction, regardless of status
    # (so we don't spam the user with a proposal they already rejected).
    linked_pks: set[int] = set()
    for s, t in NoteLink.objects.filter(
        Q(source=note) | Q(target=note)
    ).values_list("source_id", "target_id"):
        linked_pks.update([s, t])
    linked_pks.discard(note.pk)

    candidates = []
    for c in similar:
        if c.pk == note.pk or c.pk in linked_pks:
            continue
        candidates.append(c)
        if len(candidates) >= top_k:
            break

    if not candidates:
        return

    created: list[NoteLink] = []
    for candidate in candidates:
        try:
            label, confidence, _reason = classify_edge(note, candidate)
        except ProviderError:
            # Let the task retry as a whole — retrying per-candidate duplicates
            # work and races with the user accepting/rejecting the first batch.
            raise

        if label is None:
            continue

        # Double-check in case two concurrent runs race — get_or_create on a
        # (source, target, label) tuple is idempotent via unique_together.
        link, was_created = NoteLink.objects.get_or_create(
            source=note,
            target=candidate,
            label=label,
            defaults={
                "status": "proposed",
                "created_by": "system",
                "confidence": confidence,
            },
        )
        if was_created:
            created.append(link)

    # Record the hash so duplicate tasks skip classify_edge() calls.
    Note.objects.filter(pk=note_id).update(linking_content_hash=link_hash)

    for link in created:
        publish(
            note.owner_id,
            "note.link.proposed",
            {
                "link_id": link.pk,
                "source_id": link.source_id,
                "target_id": link.target_id,
                "label": link.label,
                "confidence": link.confidence,
            },
        )

    logger.info(
        "propose_links: note=%s candidates=%d proposed=%d",
        note.pk,
        len(candidates),
        len(created),
    )
