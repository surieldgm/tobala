"""
Unit tests for agave configuration module.
"""

from unittest.mock import patch

import pytest


class TestAgaveSettings:
    def test_default_graph_name(self):
        from agave.conf import AgaveSettings

        settings = AgaveSettings()
        with patch("agave.conf.settings") as mock_settings:
            mock_settings.AGAVE = {}
            settings.reload()
            assert settings.DEFAULT_GRAPH_NAME == "default_graph"

    def test_override_from_django_settings(self):
        from agave.conf import AgaveSettings

        settings = AgaveSettings()
        with patch("agave.conf.settings") as mock_settings:
            mock_settings.AGAVE = {"DEFAULT_GRAPH_NAME": "my_graph"}
            settings.reload()
            assert settings.DEFAULT_GRAPH_NAME == "my_graph"

    def test_default_vector_dimensions(self):
        from agave.conf import AgaveSettings

        settings = AgaveSettings()
        with patch("agave.conf.settings") as mock_settings:
            mock_settings.AGAVE = {}
            settings.reload()
            assert settings.VECTOR_DIMENSIONS == 1536

    def test_invalid_setting_raises(self):
        from agave.conf import AgaveSettings

        settings = AgaveSettings()
        with patch("agave.conf.settings") as mock_settings:
            mock_settings.AGAVE = {}
            settings.reload()
            with pytest.raises(AttributeError, match="Invalid agave setting"):
                _ = settings.NONEXISTENT_SETTING

    def test_all_defaults_accessible(self):
        from agave.conf import DEFAULTS, AgaveSettings

        settings = AgaveSettings()
        with patch("agave.conf.settings") as mock_settings:
            mock_settings.AGAVE = {}
            settings.reload()
            for key in DEFAULTS:
                assert getattr(settings, key) == DEFAULTS[key]
