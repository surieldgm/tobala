"""JWT-based authentication middleware for Django Channels.

Reads a SimpleJWT access token from the WebSocket handshake — query param
``?token=<access>`` preferred (browsers can't set custom headers on the WS
handshake without subprotocol shenanigans); falls back to the ``Authorization``
header so server-side clients / tests can pass it the normal way.

On success, attaches the resolved Django user to ``scope["user"]`` and the
raw JWT ``user_id`` to ``scope["user_id"]``. On failure, leaves
``AnonymousUser`` in place — the consumer is expected to close with code
4401 if auth is required for the route.
"""
from __future__ import annotations

import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)


@database_sync_to_async
def _get_user(user_id: int):
    User = get_user_model()
    try:
        return User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return AnonymousUser()


def _extract_token(scope) -> str | None:
    # Query-param wins — it's what the browser WS client actually sends.
    qs = parse_qs((scope.get("query_string") or b"").decode("latin-1"))
    token_list = qs.get("token") or qs.get("access")
    if token_list:
        return token_list[0]
    # Fallback: Authorization header (only if we're behind a proxy that
    # forwards it or a test client is connecting).
    for name, value in scope.get("headers") or []:
        if name == b"authorization":
            raw = value.decode("latin-1")
            if raw.lower().startswith("bearer "):
                return raw.split(" ", 1)[1].strip()
    return None


class JWTAuthMiddleware:
    """Populate ``scope["user"]`` from a SimpleJWT access token.

    Import of ``rest_framework_simplejwt`` is deferred to ``__call__`` so the
    module is importable before Django's apps are ready (Channels loads us
    early during ASGI boot).
    """

    def __init__(self, inner):
        self._inner = inner

    async def __call__(self, scope, receive, send):
        scope = dict(scope)  # never mutate the caller's mapping
        scope["user"] = AnonymousUser()

        token = _extract_token(scope)
        if token:
            try:
                # Lazy import so this module is safe to import at ASGI boot.
                from rest_framework_simplejwt.tokens import UntypedToken
                from rest_framework_simplejwt.exceptions import (
                    InvalidToken,
                    TokenError,
                )

                validated = UntypedToken(token)
                user_id = validated.get("user_id")
                if user_id is not None:
                    scope["user"] = await _get_user(int(user_id))
                    scope["user_id"] = int(user_id)
            except (InvalidToken, TokenError) as exc:
                logger.info("ws auth: rejecting token (%s)", exc)
            except Exception:  # pragma: no cover — defensive
                logger.exception("ws auth: unexpected failure")

        return await self._inner(scope, receive, send)
