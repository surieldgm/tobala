"""WebSocket-bound event fan-out helper.

Celery tasks call :func:`publish` at each pipeline lifecycle transition —
``note.embedding.ready``, ``note.tags.updated``, ``note.link.proposed``,
etc. The call is synchronous (Celery workers are sync) but the Channels
layer is async, so we wrap with ``async_to_sync``.

All events land in the user's per-user group (``user_<id>``). The consumer
(see :class:`notes.consumers.NoteStatusConsumer`) unpacks the outer
Channels envelope and forwards the ``event`` + ``data`` fields to the
browser verbatim — the frontend doesn't need to know about Channels.

If the channel layer isn't configured (e.g., during unit tests that don't
spin up Redis), the call becomes a no-op rather than raising, so a bad WS
config never breaks the pipeline.
"""
from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def publish(user_id: int, event: str, data: dict[str, Any]) -> None:
    """Queue an event for delivery to the user's WS group.

    ``event`` is the frontend-facing type (e.g. ``"note.embedding.ready"``).
    It is nested inside a Channels envelope with ``type="note.status"`` so the
    consumer routes it to :meth:`NoteStatusConsumer.note_status`.
    """
    layer = get_channel_layer()
    if layer is None:  # pragma: no cover — test / eager-mode escape hatch
        logger.debug("ws.publish (no layer) user=%s event=%s", user_id, event)
        return

    try:
        async_to_sync(layer.group_send)(
            f"user_{user_id}",
            {"type": "note.status", "event": event, "data": data},
        )
    except Exception:
        # Don't let a WS fan-out failure kill a Celery task: the DB write
        # already happened, the next GET will pick up the truth.
        logger.exception("ws.publish failed user=%s event=%s", user_id, event)
