"""WebSocket consumer for per-user note pipeline events.

Every authenticated user has exactly one Channels group (``user_{id}``) —
``events.publish`` fans out to that group, and this consumer re-broadcasts
messages to the client. The connection is write-only: ``receive_json`` is a
no-op today, but the hook is there so a later phase can accept client-side
"ack" messages or in-app chat.

Close codes:
    4401 — no valid JWT on the handshake (browser should drop the socket).
"""
from __future__ import annotations

import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)


class NoteStatusConsumer(AsyncJsonWebsocketConsumer):
    #: Channels dispatcher calls a method named after ``type`` with dots
    #: replaced by underscores. ``events.publish`` emits ``type="note.status"``
    #: so our handler is :meth:`note_status`.
    groups: list[str] = []

    async def connect(self):
        user = self.scope.get("user")
        if user is None or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4401)
            return

        self._group = f"user_{user.id}"
        await self.channel_layer.group_add(self._group, self.channel_name)
        await self.accept()
        logger.debug("ws connect user=%s channel=%s", user.id, self.channel_name)

    async def disconnect(self, code):
        group = getattr(self, "_group", None)
        if group and self.channel_layer is not None:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        """Client→server is unused in R2 — ignore whatever the client sends."""
        logger.debug("ws unsolicited receive: %s", content)

    async def note_status(self, event):
        """Group-send handler — forward the payload to the client verbatim.

        ``events.publish`` packs the useful bits under ``event`` + ``data``
        (see :mod:`notes.events`); we re-emit that exact shape so the client
        doesn't need to know about Channels' outer envelope.
        """
        await self.send_json({"event": event["event"], "data": event["data"]})
