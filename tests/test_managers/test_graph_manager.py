"""
Integration tests for GraphManager.
"""

import pytest

from tests.testapp.models import Cites, Paper


@pytest.mark.django_db(transaction=True)
class TestGraphManager:
    def test_neighbors(self):
        p1 = Paper.objects.create(title="Root Paper", year=2024)
        p2 = Paper.objects.create(title="Neighbor 1", year=2023)
        p3 = Paper.objects.create(title="Neighbor 2", year=2022)
        p4 = Paper.objects.create(title="Not Connected", year=2021)

        Cites.objects.create(source=p1, target=p2)
        Cites.objects.create(source=p1, target=p3)

        neighbors = Paper.graph.neighbors(p1, edge_label="CITES")
        neighbor_pks = set(neighbors.values_list("pk", flat=True))

        assert p2.pk in neighbor_pks
        assert p3.pk in neighbor_pks
        assert p4.pk not in neighbor_pks

    def test_neighbors_depth(self):
        p1 = Paper.objects.create(title="Root", year=2024)
        p2 = Paper.objects.create(title="Hop 1", year=2023)
        p3 = Paper.objects.create(title="Hop 2", year=2022)

        Cites.objects.create(source=p1, target=p2)
        Cites.objects.create(source=p2, target=p3)

        # Depth 1: only p2
        neighbors_d1 = Paper.graph.neighbors(p1, edge_label="CITES", depth=1)
        pks_d1 = set(neighbors_d1.values_list("pk", flat=True))
        assert p2.pk in pks_d1
        assert p3.pk not in pks_d1

        # Depth 2: p2 and p3
        neighbors_d2 = Paper.graph.neighbors(p1, edge_label="CITES", depth=2)
        pks_d2 = set(neighbors_d2.values_list("pk", flat=True))
        assert p2.pk in pks_d2
        assert p3.pk in pks_d2

    def test_subgraph(self):
        p1 = Paper.objects.create(title="Center", year=2024)
        p2 = Paper.objects.create(title="Connected", year=2023)
        p3 = Paper.objects.create(title="Isolated", year=2022)

        Cites.objects.create(source=p1, target=p2)

        subgraph = Paper.graph.subgraph(p1, depth=1)
        pks = set(subgraph.values_list("pk", flat=True))
        assert p1.pk in pks  # root included
        assert p2.pk in pks
        assert p3.pk not in pks

    def test_create_edge_convenience(self):
        p1 = Paper.objects.create(title="A", year=2024)
        p2 = Paper.objects.create(title="B", year=2023)

        edge = Paper.graph.create_edge(p1, p2, Cites, weight=0.5)
        assert edge.pk is not None
        assert edge.weight == 0.5
