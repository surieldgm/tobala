"""ASGI entry point — serves HTTP (Django) and WebSockets (Channels)."""
import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "tobala_project.settings")
django.setup()  # must run before we import modules that touch Django models

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.core.asgi import get_asgi_application  # noqa: E402

from notes.routing import websocket_urlpatterns  # noqa: E402
from tobala_project.ws_auth import JWTAuthMiddleware  # noqa: E402

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
    }
)
