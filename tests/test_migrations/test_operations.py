"""
Integration tests for migration operations.
"""

import pytest


@pytest.mark.django_db(transaction=True)
class TestCreateGraph:
    def test_create_and_drop_graph(self):
        from agave.db.backends.postgresql.operations import (
            create_graph,
            drop_graph,
            graph_exists,
        )

        graph_name = "test_migration_graph"

        # Create
        create_graph(graph_name)
        assert graph_exists(graph_name)

        # Drop
        drop_graph(graph_name, cascade=True)
        assert not graph_exists(graph_name)

    def test_create_graph_idempotent(self):
        from agave.db.backends.postgresql.operations import (
            create_graph,
            drop_graph,
            graph_exists,
        )

        graph_name = "test_idempotent_graph"

        create_graph(graph_name)
        create_graph(graph_name)  # should not raise
        assert graph_exists(graph_name)

        drop_graph(graph_name, cascade=True)


@pytest.mark.django_db(transaction=True)
class TestVertexOperations:
    def test_upsert_and_get_vertex(self):
        from agave.db.backends.postgresql.operations import (
            get_vertex,
            upsert_vertex,
        )

        vertex = upsert_vertex(
            "test_graph",
            "TestNode",
            pk=999,
            properties={"name": "Test", "value": 42},
        )
        assert vertex is not None

        retrieved = get_vertex("test_graph", "TestNode", pk=999)
        assert retrieved is not None
        assert retrieved["properties"]["name"] == "Test"
        assert retrieved["properties"]["value"] == 42

    def test_delete_vertex(self):
        from agave.db.backends.postgresql.operations import (
            delete_vertex,
            get_vertex,
            upsert_vertex,
        )

        upsert_vertex("test_graph", "DeleteMe", pk=888, properties={})
        delete_vertex("test_graph", "DeleteMe", pk=888)

        result = get_vertex("test_graph", "DeleteMe", pk=888)
        assert result is None
