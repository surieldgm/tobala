"""
Agave configuration module.

Reads from ``settings.AGAVE`` dict with sensible defaults.
Follows the same pattern as DRF's ``api_settings``.
"""

from django.conf import settings

DEFAULTS = {
    "DEFAULT_GRAPH_NAME": "default_graph",
    "VECTOR_DIMENSIONS": 1536,
    "VECTOR_INDEX_TYPE": "hnsw",  # hnsw | ivfflat
    "EMBEDDING_PROVIDER": None,
    "EMBEDDING_MODEL": None,
    "AUTO_CREATE_GRAPH": True,
}


class AgaveSettings:
    """
    Lazy settings object that reads from ``settings.AGAVE``
    with fallback to ``DEFAULTS``.
    """

    def __init__(self):
        self._cached = None

    def _get_user_settings(self):
        if self._cached is None:
            self._cached = getattr(settings, "AGAVE", {})
        return self._cached

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)

        user = self._get_user_settings()
        if name in user:
            return user[name]
        if name in DEFAULTS:
            return DEFAULTS[name]
        raise AttributeError(
            f"Invalid agave setting: '{name}'. "
            f"Valid settings: {list(DEFAULTS.keys())}"
        )

    def reload(self):
        """Clear cached settings (useful for testing)."""
        self._cached = None


agave_settings = AgaveSettings()
