"""
GraphModel base class and metaclass.

Provides dual-storage: Django ORM table (relational) + Apache AGE vertex (graph).
Synchronization is transparent — save() writes to both, delete() removes from both.
"""

import logging

from django.db import models

from agave.models.options import GraphMeta, register_vertex

logger = logging.getLogger("agave.models")


class GraphModelBase(models.base.ModelBase):
    """
    Metaclass for GraphModel that:

    1. Extracts graph-specific ``GraphMeta`` inner class options
    2. Registers the vertex label in the global registry
    3. Auto-attaches ``GraphManager`` as ``cls.graph``
    """

    def __new__(mcs, name, bases, namespace, **kwargs):
        cls = super().__new__(mcs, name, bases, namespace, **kwargs)

        # Skip processing for abstract models
        if cls._meta.abstract:
            return cls

        # Skip if this is the base GraphModel class itself
        parents = [b for b in bases if isinstance(b, GraphModelBase)]
        if not parents:
            return cls

        # Extract GraphMeta configuration
        inner_meta = namespace.get("GraphMeta") or getattr(
            cls, "GraphMeta", None
        )
        graph_meta = GraphMeta(model_class=cls)

        if inner_meta:
            graph_meta.graph_name = getattr(
                inner_meta, "graph_name", None
            ) or graph_meta.graph_name
            graph_meta.vertex_label = getattr(
                inner_meta, "vertex_label", None
            ) or name
            graph_meta.properties = list(
                getattr(inner_meta, "properties", [])
            )
        else:
            graph_meta.vertex_label = name

        cls._graph_meta = graph_meta

        # Register vertex label
        register_vertex(graph_meta.vertex_label, cls)

        # Auto-attach GraphManager (lazy import to avoid circular deps)
        if not hasattr(cls, "graph") or not isinstance(
            getattr(cls, "graph", None), models.Manager
        ):
            from agave.managers.graph import GraphManager

            manager = GraphManager()
            manager.auto_created = True
            cls.add_to_class("graph", manager)

        # Auto-attach VectorManager if model has VectorFields.
        # Use only local field lists — get_fields() builds the relation graph and
        # requires AppRegistryReady (fails while sibling models still load).
        from agave.models.fields import VectorField

        def _local_field_instances(meta):
            yield from meta.local_fields
            yield from meta.local_many_to_many
            yield from meta.private_fields

        has_vector = any(
            isinstance(f, VectorField) for f in _local_field_instances(cls._meta)
        )
        if has_vector and not hasattr(cls, "vectors"):
            from agave.managers.vector import VectorManager

            manager = VectorManager()
            manager.auto_created = True
            cls.add_to_class("vectors", manager)

        logger.debug(
            "Registered GraphModel %s with vertex label '%s' in graph '%s'",
            name,
            graph_meta.vertex_label,
            graph_meta.graph_name,
        )

        return cls


class GraphModel(models.Model, metaclass=GraphModelBase):
    """
    Base model for graph-enabled Django models.

    Stores data in BOTH:
    - PostgreSQL table (Django relational, as usual)
    - Apache AGE vertex (graph layer)

    Synchronization is transparent via overridden save()/delete().

    Usage::

        class Paper(GraphModel):
            title = models.CharField(max_length=255)
            year = models.IntegerField()

            class GraphMeta:
                graph_name = 'research'
                vertex_label = 'Paper'
                properties = ['title', 'year']
    """

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self._sync_to_graph()

    def delete(self, *args, **kwargs):
        self._remove_from_graph()
        return super().delete(*args, **kwargs)

    def _sync_to_graph(self):
        """Create or update the corresponding AGE vertex."""
        from agave.db.backends.postgresql.operations import upsert_vertex

        meta = self._graph_meta
        properties = meta.get_property_values(self)
        try:
            upsert_vertex(
                graph_name=meta.graph_name,
                label=meta.vertex_label,
                pk=self.pk,
                properties=properties,
            )
        except Exception:
            logger.error(
                "Failed to sync %s (pk=%s) to graph '%s'",
                meta.vertex_label,
                self.pk,
                meta.graph_name,
                exc_info=True,
            )
            raise

    def _remove_from_graph(self):
        """Remove the corresponding AGE vertex."""
        from agave.db.backends.postgresql.operations import delete_vertex

        meta = self._graph_meta
        try:
            delete_vertex(
                graph_name=meta.graph_name,
                label=meta.vertex_label,
                pk=self.pk,
            )
        except Exception:
            logger.error(
                "Failed to remove %s (pk=%s) from graph '%s'",
                meta.vertex_label,
                self.pk,
                meta.graph_name,
                exc_info=True,
            )
            raise

    def _get_graph_properties(self):
        """Extract property dict from model fields."""
        return self._graph_meta.get_property_values(self)
