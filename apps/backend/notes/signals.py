"""post_save handler that fires the async pipeline on note create/edit.

We watch only changes that actually affect the embedding — title or body
mutations. Context-only or tag-only changes do not rerun the pipeline
because the embedding is independent of those.

Guard strategy (replaces the old ``status=="ready"`` guard):

The worker stores the sha1 of the text it embedded in
``Note.embedding_content_hash``. On every post_save we recompute the hash
of the current title+body and compare. If they match, the stored embedding
already represents this exact content — no work needed. If they differ, we
enqueue a fresh embed.

This fixes a silent bug in the original guard: once ``status="ready"``
was written by the worker (via ``.update()``, which does NOT fire
post_save), subsequent edits would never trigger re-embedding even when
the text changed significantly.
"""
from __future__ import annotations

import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Note, content_hash

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Note)
def enqueue_pipeline(sender, instance: Note, created: bool, **kwargs) -> None:  # noqa: ANN001
    """Kick the embed → infer_tags → propose_links chain after commit."""

    # Only trigger if there's something to embed. A blank note created by
    # the "New Note" button skips the pipeline until the user writes content.
    text = f"{instance.title}\n{instance.body}".strip()
    if not text:
        return

    # Hash guard: skip if the embedding already covers this exact content.
    # Handles context-only saves, repeated auto-saves of identical text, and
    # undo/redo cycles — none of them should burn an embedding API call.
    new_hash = content_hash(instance.title, instance.body)
    if not created and instance.embedding_content_hash == new_hash:
        logger.debug(
            "enqueue_pipeline: note %s unchanged (hash=%s), skipping",
            instance.pk,
            new_hash[:8],
        )
        return

    # Late import — avoids circular import at module load time.
    from .tasks import embed_note

    def _fire() -> None:
        logger.info(
            "enqueue_pipeline: embed_note(%s) created=%s hash=%s→%s",
            instance.pk,
            created,
            instance.embedding_content_hash[:8] or "(none)",
            new_hash[:8],
        )
        embed_note.delay(instance.pk)

    # on_commit guarantees the row is visible to the worker before it runs.
    transaction.on_commit(_fire)
