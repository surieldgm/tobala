"""Seed a new user's workspace with the onboarding note set.

A YAML fixture (``notes/fixtures/onboarding.yaml``) defines 9 interlinked
notes explaining how Tobalá works. On first login the new user sees a
fully-populated graph — which doubles as a tutorial and as proof that the
pipeline (embedding, tagging, graph, retrieval) is alive.

Fired from :mod:`accounts.signals` via ``transaction.on_commit`` so the
signup response doesn't block on fixture loading or the Celery enqueue.
"""
from __future__ import annotations

import logging
from pathlib import Path

import yaml
from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Context, Note, NoteLink, content_hash

logger = logging.getLogger(__name__)

FIXTURE_PATH = Path(settings.BASE_DIR) / "notes" / "fixtures" / "onboarding.yaml"


def _load_fixture() -> dict:
    """Read + parse the YAML once. Cached at module level would save I/O,
    but the fixture is tiny (~2KB) and seeding is rare — keeping it simple."""
    if not FIXTURE_PATH.exists():
        raise FileNotFoundError(f"onboarding fixture missing: {FIXTURE_PATH}")
    data = yaml.safe_load(FIXTURE_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("onboarding fixture must be a mapping at the top level")
    return data


@shared_task(bind=True, max_retries=2, default_retry_delay=5)
def seed_user_onboarding(self, user_id: int) -> None:
    """Populate a new user's workspace with the onboarding notes + links.

    Idempotent: re-running the task is a no-op if the context already exists
    (we key on ``(owner, name)`` and bail early). Runs as a single atomic
    transaction so a mid-seed failure doesn't leave the user with a partial
    graph. The per-note ``post_save`` signal on ``Note`` fires after commit,
    which embeds and tags the notes — good, we want them tagged and
    retrievable. ``propose_links`` is suppressed per-note via a pre-filled
    ``linking_content_hash`` so the LLM doesn't second-guess our hand-crafted
    topology (see the note on creation below).
    """
    User = get_user_model()

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.info("seed_user_onboarding: user %s vanished before seeding", user_id)
        return

    try:
        fixture = _load_fixture()
    except Exception as exc:
        logger.exception("seed_user_onboarding: fixture load failed: %s", exc)
        raise self.retry(exc=exc)

    ctx_spec = fixture.get("context") or {}
    ctx_name: str = ctx_spec.get("name") or "Welcome"

    # Idempotency guard: if the onboarding context already exists for this
    # user, assume seeding ran and do nothing.
    if Context.objects.filter(owner=user, name=ctx_name).exists():
        logger.info(
            "seed_user_onboarding: user %s already has context %r — skipping",
            user_id,
            ctx_name,
        )
        return

    notes_spec: list[dict] = fixture.get("notes") or []
    links_spec: list[list[str]] = fixture.get("links") or []

    with transaction.atomic():
        context = Context.objects.create(
            owner=user,
            name=ctx_name,
            color=ctx_spec.get("color") or "ochre",
            description=ctx_spec.get("description") or "",
        )

        # Map the fixture's human-readable key (e.g. "agave-origen") to the
        # created Note row so we can resolve links without relying on titles.
        by_key: dict[str, Note] = {}
        for spec in notes_spec:
            key = spec.get("key")
            if not key:
                logger.warning("seed_user_onboarding: skipping note without key: %r", spec)
                continue
            title = spec.get("title") or ""
            body = spec.get("body") or ""
            # Pre-fill `linking_content_hash` so `propose_links` skips these
            # notes on first run. The hand-crafted edges in the fixture are
            # the whole demo topology — we don't want the LLM adding ~36
            # extra classify_edge() calls (5 candidates × 9 seeded notes)
            # on every signup just to find connections we deliberately left
            # out. When the user later edits one of these notes, the hash
            # changes, the guard releases, and linking runs normally.
            note = Note.objects.create(
                owner=user,
                context=context,
                title=title,
                body=body,
                linking_content_hash=content_hash(title, body),
            )
            by_key[key] = note

        # Pre-create typed edges as confirmed user links so they show up
        # solid (not as proposals) from the first render.
        created_edges = 0
        for row in links_spec:
            if not (isinstance(row, (list, tuple)) and len(row) == 3):
                logger.warning("seed_user_onboarding: bad link row: %r", row)
                continue
            src_key, tgt_key, label = row
            src = by_key.get(src_key)
            tgt = by_key.get(tgt_key)
            if not src or not tgt:
                logger.warning(
                    "seed_user_onboarding: unknown key in link %s → %s",
                    src_key,
                    tgt_key,
                )
                continue
            NoteLink.objects.create(
                source=src,
                target=tgt,
                label=label,
                status="confirmed",
                created_by="user",
            )
            created_edges += 1

    logger.info(
        "seed_user_onboarding: user=%s ctx=%r notes=%d edges=%d",
        user_id,
        ctx_name,
        len(by_key),
        created_edges,
    )
