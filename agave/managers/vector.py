"""
VectorManager and VectorQuerySet for vector similarity operations.

Uses pgvector-python's distance functions for efficient
similarity search with Django ORM annotations.
"""

from django.db import models
from pgvector.django import CosineDistance, L2Distance, MaxInnerProduct


class VectorQuerySet(models.QuerySet):
    """
    Extended QuerySet for vector similarity operations.
    """

    def similar_to(
        self,
        vector,
        vector_field="embedding",
        top_k=10,
        distance_fn="cosine",
    ):
        """
        Find similar items by vector distance.

        Args:
            vector: Query vector (list of floats) or model instance
                (uses its vector_field value).
            vector_field: Name of the VectorField on the model.
            top_k: Maximum number of results.
            distance_fn: Distance function — 'cosine', 'l2', or 'inner_product'.

        Returns:
            QuerySet annotated with ``distance`` and ordered by similarity.

        Usage::

            Paper.vectors.similar_to([0.1, 0.2, ...], top_k=5)
            Paper.vectors.similar_to(paper_instance, top_k=5)
        """
        # If passed a model instance, extract its vector
        if hasattr(vector, vector_field):
            vector = getattr(vector, vector_field)

        if vector is None:
            return self.none()

        distance_class = _get_distance_class(distance_fn)
        return (
            self.annotate(distance=distance_class(vector_field, vector))
            .order_by("distance")[:top_k]
        )

    def similar_to_text(self, text, vector_field="embedding", top_k=10):
        """
        Find similar items by text (generates embedding first).

        Phase 3: requires configured EMBEDDING_PROVIDER.
        """
        from agave.utils.embedding import get_provider

        provider = get_provider()
        vector = provider.embed(text)
        return self.similar_to(
            vector, vector_field=vector_field, top_k=top_k
        )

    def with_distance(self, vector, vector_field="embedding", distance_fn="cosine"):
        """
        Annotate the QuerySet with vector distance without ordering/limiting.

        Useful for combining with other filters::

            Paper.vectors.with_distance(vec).filter(year__gte=2020).order_by('distance')
        """
        if hasattr(vector, vector_field):
            vector = getattr(vector, vector_field)

        distance_class = _get_distance_class(distance_fn)
        return self.annotate(distance=distance_class(vector_field, vector))


class VectorManager(models.Manager):
    """
    Manager for vector similarity operations.

    Auto-attached to any GraphModel that has a VectorField.

    Usage::

        Paper.vectors.similar_to(embedding_vector, top_k=10)
    """

    def get_queryset(self):
        return VectorQuerySet(self.model, using=self._db)

    def similar_to(self, *args, **kwargs):
        return self.get_queryset().similar_to(*args, **kwargs)

    def similar_to_text(self, *args, **kwargs):
        return self.get_queryset().similar_to_text(*args, **kwargs)

    def with_distance(self, *args, **kwargs):
        return self.get_queryset().with_distance(*args, **kwargs)


def _get_distance_class(distance_fn):
    """Map distance function name to pgvector distance class."""
    mapping = {
        "cosine": CosineDistance,
        "l2": L2Distance,
        "inner_product": MaxInnerProduct,
    }
    cls = mapping.get(distance_fn)
    if cls is None:
        raise ValueError(
            f"Unknown distance function: '{distance_fn}'. "
            f"Choose from: {list(mapping.keys())}"
        )
    return cls
