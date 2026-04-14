"""
Tests for the database backend and connection utilities.

Pure helpers (``TestConnectionUtils``) run without PostgreSQL. Backend tests need
Docker / ``docker compose up -d``.
"""

import pytest


class TestConnectionUtils:
    """String escaping — no database required."""

    def test_escape_value_int(self):
        from agave.utils.connection import _escape_value

        assert _escape_value(42) == "42"

    def test_escape_value_string(self):
        from agave.utils.connection import _escape_value

        assert _escape_value("hello") == "'hello'"

    def test_escape_value_string_with_quotes(self):
        from agave.utils.connection import _escape_value

        assert _escape_value("it's") == "'it\\'s'"

    def test_escape_value_none(self):
        from agave.utils.connection import _escape_value

        assert _escape_value(None) == "null"

    def test_escape_value_bool(self):
        from agave.utils.connection import _escape_value

        assert _escape_value(True) == "true"
        assert _escape_value(False) == "false"

    def test_escape_identifier_valid(self):
        from agave.utils.connection import _escape_identifier

        assert _escape_identifier("my_graph") == "my_graph"
        assert _escape_identifier("Paper") == "Paper"

    def test_escape_identifier_invalid(self):
        from agave.utils.connection import _escape_identifier

        with pytest.raises(ValueError, match="Invalid identifier"):
            _escape_identifier("'; DROP TABLE --")


@pytest.mark.django_db(transaction=True)
class TestDatabaseBackend:
    def test_connection_loads_age(self):
        """Verify AGE is loaded on connection."""
        from django.db import connection

        with connection.cursor() as cursor:
            # If AGE is loaded, ag_catalog should be in search_path
            cursor.execute("SHOW search_path;")
            search_path = cursor.fetchone()[0]
            assert "ag_catalog" in search_path

    def test_cypher_execution(self):
        """Verify basic Cypher execution works."""
        from agave.utils.connection import execute_cypher

        results = execute_cypher(
            "test_graph",
            "RETURN 1 + 1",
        )
        assert len(results) > 0
