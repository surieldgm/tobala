"""
Custom fields for graph and vector support.

VectorField is re-exported from pgvector-python to avoid
reimplementing battle-tested vector column handling.
"""

from pgvector.django import (  # noqa: F401
    HalfVectorField,
    VectorField,
)


class EmbeddingField(VectorField):
    """
    Auto-generates embeddings from a source text field.

    Uses the configured ``EMBEDDING_PROVIDER`` in ``AGAVE`` settings.
    Full implementation in Phase 3 — MVP just inherits VectorField.
    """

    def __init__(self, source_field=None, *args, **kwargs):
        self.source_field = source_field
        super().__init__(*args, **kwargs)

    def pre_save(self, model_instance, add):
        if self.source_field:
            text = getattr(model_instance, self.source_field, None)
            if text and not getattr(model_instance, self.attname, None):
                # Phase 3: call embedding provider here
                pass
        return super().pre_save(model_instance, add)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        if self.source_field:
            kwargs["source_field"] = self.source_field
        return name, path, args, kwargs


class GraphProperty:
    """
    Marker mixin to indicate a field should be synced
    to the AGE vertex properties.

    Usage::

        class MyModel(GraphModel):
            title = GraphPropertyField(max_length=255)

    For MVP, users list field names in ``GraphMeta.properties``
    instead. This marker is provided for future use.
    """

    graph_property = True
