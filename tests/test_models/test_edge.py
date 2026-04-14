"""
Integration tests for Edge model.
"""

import pytest

from tests.testapp.models import Author, AuthoredBy, Cites, Paper


@pytest.mark.django_db(transaction=True)
class TestEdgeMeta:
    def test_edge_meta_attached(self):
        assert hasattr(Cites, "_edge_meta")
        assert Cites._edge_meta.edge_label == "CITES"
        assert Cites._edge_meta.properties == ["weight"]

    def test_edge_meta_defaults(self):
        assert AuthoredBy._edge_meta.edge_label == "AUTHORED_BY"
        assert AuthoredBy._edge_meta.graph_name == "test_graph"


@pytest.mark.django_db(transaction=True)
class TestEdgeCRUD:
    def test_create_edge(self):
        p1 = Paper.objects.create(title="Paper A", year=2024)
        p2 = Paper.objects.create(title="Paper B", year=2023)

        edge = Cites.objects.create(source=p1, target=p2, weight=0.9)
        assert edge.pk is not None
        assert Cites.objects.filter(pk=edge.pk).exists()

    def test_edge_syncs_to_graph(self):
        from agave.utils.connection import execute_cypher, parse_agtype

        p1 = Paper.objects.create(title="Citing Paper", year=2024)
        p2 = Paper.objects.create(title="Cited Paper", year=2023)
        Cites.objects.create(source=p1, target=p2, weight=0.8)

        # Verify edge exists in AGE
        cypher = (
            f"MATCH (a:Paper {{_django_pk: {p1.pk}}})"
            f"-[e:CITES]->"
            f"(b:Paper {{_django_pk: {p2.pk}}}) "
            f"RETURN e"
        )
        results = execute_cypher("test_graph", cypher)
        assert len(results) > 0

    def test_delete_edge_removes_from_graph(self):
        from agave.utils.connection import execute_cypher

        p1 = Paper.objects.create(title="Source", year=2024)
        p2 = Paper.objects.create(title="Target", year=2023)
        edge = Cites.objects.create(source=p1, target=p2)
        edge.delete()

        cypher = (
            f"MATCH (a:Paper {{_django_pk: {p1.pk}}})"
            f"-[e:CITES]->"
            f"(b:Paper {{_django_pk: {p2.pk}}}) "
            f"RETURN e"
        )
        results = execute_cypher("test_graph", cypher)
        assert len(results) == 0

    def test_cross_model_edge(self):
        paper = Paper.objects.create(title="My Paper", year=2024)
        author = Author.objects.create(name="Alice")
        edge = AuthoredBy.objects.create(source=paper, target=author)
        assert edge.pk is not None
