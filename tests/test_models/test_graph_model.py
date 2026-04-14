"""
Integration tests for GraphModel.

These tests require a running PostgreSQL instance with
Apache AGE and pgvector extensions installed.
"""

import pytest

from tests.testapp.models import Author, Paper


@pytest.mark.django_db(transaction=True)
class TestGraphModelMeta:
    def test_graph_meta_attached(self):
        assert hasattr(Paper, "_graph_meta")
        assert Paper._graph_meta.vertex_label == "Paper"
        assert Paper._graph_meta.properties == ["title", "year"]

    def test_graph_meta_defaults(self):
        assert Author._graph_meta.vertex_label == "Author"
        assert Author._graph_meta.graph_name == "test_graph"

    def test_graph_manager_attached(self):
        assert hasattr(Paper, "graph")

    def test_vectors_manager_attached_when_vector_field(self):
        assert hasattr(Paper, "vectors")

    def test_vectors_manager_not_attached_when_no_vector_field(self):
        # Author has no VectorField
        assert not hasattr(Author, "vectors")


@pytest.mark.django_db(transaction=True)
class TestGraphModelCRUD:
    def test_create_saves_to_relational(self):
        paper = Paper.objects.create(title="Test Paper", year=2024)
        assert paper.pk is not None
        assert Paper.objects.filter(pk=paper.pk).exists()

    def test_create_syncs_to_graph(self):
        from agave.db.backends.postgresql.operations import get_vertex

        paper = Paper.objects.create(title="Graph Sync Test", year=2024)
        vertex = get_vertex("test_graph", "Paper", paper.pk)
        assert vertex is not None
        assert vertex["properties"]["_django_pk"] == paper.pk
        assert vertex["properties"]["title"] == "Graph Sync Test"

    def test_update_syncs_to_graph(self):
        from agave.db.backends.postgresql.operations import get_vertex

        paper = Paper.objects.create(title="Original", year=2024)
        paper.title = "Updated"
        paper.save()

        vertex = get_vertex("test_graph", "Paper", paper.pk)
        assert vertex["properties"]["title"] == "Updated"

    def test_delete_removes_from_graph(self):
        from agave.db.backends.postgresql.operations import get_vertex

        paper = Paper.objects.create(title="To Delete", year=2024)
        pk = paper.pk
        paper.delete()

        assert not Paper.objects.filter(pk=pk).exists()
        vertex = get_vertex("test_graph", "Paper", pk)
        assert vertex is None

    def test_get_graph_properties(self):
        paper = Paper(title="Props Test", year=2023)
        props = paper._get_graph_properties()
        assert props == {"title": "Props Test", "year": 2023}
