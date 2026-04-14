"""
Edge base class for graph edges.

Maps to BOTH a Django table (like M2M through) AND an AGE edge.
Synchronization is transparent via overridden save()/delete().
"""

import logging

from django.db import models

from agave.models.options import EdgeMeta, register_edge

logger = logging.getLogger("agave.models")


class EdgeModelBase(models.base.ModelBase):
    """
    Metaclass for Edge that extracts ``EdgeMeta`` configuration
    and registers edge labels.
    """

    def __new__(mcs, name, bases, namespace, **kwargs):
        cls = super().__new__(mcs, name, bases, namespace, **kwargs)

        if cls._meta.abstract:
            return cls

        parents = [b for b in bases if isinstance(b, EdgeModelBase)]
        if not parents:
            return cls

        # Extract EdgeMeta configuration
        inner_meta = namespace.get("EdgeMeta") or getattr(
            cls, "EdgeMeta", None
        )
        edge_meta = EdgeMeta(model_class=cls)

        if inner_meta:
            edge_meta.edge_label = getattr(
                inner_meta, "edge_label", None
            ) or name
            edge_meta.graph_name = getattr(
                inner_meta, "graph_name", None
            ) or edge_meta.graph_name
            edge_meta.directed = getattr(inner_meta, "directed", True)
            edge_meta.properties = list(
                getattr(inner_meta, "properties", [])
            )
        else:
            edge_meta.edge_label = name

        cls._edge_meta = edge_meta

        # Register edge label
        register_edge(edge_meta.edge_label, cls)

        logger.debug(
            "Registered Edge %s with label '%s' in graph '%s'",
            name,
            edge_meta.edge_label,
            edge_meta.graph_name,
        )

        return cls


class Edge(models.Model, metaclass=EdgeModelBase):
    """
    Base class for graph edges.

    Maps to BOTH a Django table AND an AGE edge.

    Subclasses must define ``source`` and ``target`` as ForeignKey fields
    pointing to GraphModel subclasses::

        class Cites(Edge):
            source = models.ForeignKey(
                Paper, on_delete=models.CASCADE, related_name='citations_out'
            )
            target = models.ForeignKey(
                Paper, on_delete=models.CASCADE, related_name='citations_in'
            )

            class EdgeMeta:
                edge_label = 'CITES'
                properties = ['weight']

            weight = models.FloatField(default=1.0)
    """

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self._sync_edge_to_graph()

    def delete(self, *args, **kwargs):
        self._remove_edge_from_graph()
        return super().delete(*args, **kwargs)

    def _get_source_meta(self):
        """Get the GraphMeta of the source model."""
        source_field = self._meta.get_field("source")
        return source_field.related_model._graph_meta

    def _get_target_meta(self):
        """Get the GraphMeta of the target model."""
        target_field = self._meta.get_field("target")
        return target_field.related_model._graph_meta

    def _get_edge_properties(self):
        """Extract edge property dict from model fields."""
        props = {}
        for field_name in self._edge_meta.properties:
            props[field_name] = getattr(self, field_name, None)
        return props

    def _sync_edge_to_graph(self):
        """Create or update the corresponding AGE edge."""
        from agave.db.backends.postgresql.operations import upsert_edge

        meta = self._edge_meta
        source_meta = self._get_source_meta()
        target_meta = self._get_target_meta()

        try:
            upsert_edge(
                graph_name=meta.graph_name,
                label=meta.edge_label,
                source_label=source_meta.vertex_label,
                source_pk=self.source_id,
                target_label=target_meta.vertex_label,
                target_pk=self.target_id,
                properties=self._get_edge_properties(),
            )
        except Exception:
            logger.error(
                "Failed to sync edge %s (source=%s, target=%s) to graph '%s'",
                meta.edge_label,
                self.source_id,
                self.target_id,
                meta.graph_name,
                exc_info=True,
            )
            raise

    def _remove_edge_from_graph(self):
        """Remove the corresponding AGE edge."""
        from agave.db.backends.postgresql.operations import delete_edge

        meta = self._edge_meta
        source_meta = self._get_source_meta()
        target_meta = self._get_target_meta()

        try:
            delete_edge(
                graph_name=meta.graph_name,
                label=meta.edge_label,
                source_label=source_meta.vertex_label,
                source_pk=self.source_id,
                target_label=target_meta.vertex_label,
                target_pk=self.target_id,
            )
        except Exception:
            logger.error(
                "Failed to remove edge %s (source=%s, target=%s) from graph '%s'",
                meta.edge_label,
                self.source_id,
                self.target_id,
                meta.graph_name,
                exc_info=True,
            )
            raise


class EdgeEndpoint:
    """
    Descriptor for defining edge endpoints.

    Phase 3: will auto-create ForeignKey fields from these descriptors.
    For MVP, users define ForeignKey fields directly.
    """

    def __init__(self, model, related_name=None):
        self.model = model
        self.related_name = related_name
