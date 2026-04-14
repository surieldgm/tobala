"""
Integration tests for VectorManager.
"""

import pytest

from tests.testapp.models import Paper


@pytest.mark.django_db(transaction=True)
class TestVectorManager:
    def test_similar_to(self):
        p1 = Paper.objects.create(
            title="Paper A", year=2024, embedding=[1.0, 0.0, 0.0]
        )
        p2 = Paper.objects.create(
            title="Paper B", year=2023, embedding=[0.9, 0.1, 0.0]
        )
        p3 = Paper.objects.create(
            title="Paper C", year=2022, embedding=[0.0, 0.0, 1.0]
        )

        results = Paper.vectors.similar_to(
            [1.0, 0.0, 0.0], top_k=3, distance_fn="cosine"
        )

        result_list = list(results)
        assert len(result_list) == 3
        # p1 should be closest (exact match)
        assert result_list[0].pk == p1.pk

    def test_similar_to_with_instance(self):
        p1 = Paper.objects.create(
            title="Reference", year=2024, embedding=[1.0, 0.0, 0.0]
        )
        p2 = Paper.objects.create(
            title="Similar", year=2023, embedding=[0.95, 0.05, 0.0]
        )
        p3 = Paper.objects.create(
            title="Different", year=2022, embedding=[0.0, 1.0, 0.0]
        )

        results = Paper.vectors.similar_to(p1, top_k=3)
        result_list = list(results)
        assert len(result_list) == 3

    def test_with_distance_annotation(self):
        Paper.objects.create(
            title="Paper A", year=2024, embedding=[1.0, 0.0, 0.0]
        )
        Paper.objects.create(
            title="Paper B", year=2023, embedding=[0.0, 1.0, 0.0]
        )

        qs = Paper.vectors.with_distance([1.0, 0.0, 0.0])
        for paper in qs:
            assert hasattr(paper, "distance")

    def test_similar_to_empty_vector_returns_none(self):
        Paper.objects.create(
            title="Paper A", year=2024, embedding=[1.0, 0.0, 0.0]
        )

        results = Paper.vectors.similar_to(None, top_k=3)
        assert results.count() == 0
