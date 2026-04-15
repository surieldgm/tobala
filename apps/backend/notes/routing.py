"""WebSocket URL routing for the notes app."""
from django.urls import re_path

from .consumers import NoteStatusConsumer

websocket_urlpatterns = [
    re_path(r"^ws/notes/$", NoteStatusConsumer.as_asgi()),
]
