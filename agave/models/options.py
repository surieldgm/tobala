"""
Graph-specific metadata for GraphModel and Edge classes.
"""

from agave.conf import agave_settings

# Global registry of vertex labels → model classes
_vertex_registry = {}

# Global registry of edge labels → edge model classes
_edge_registry = {}


class GraphMeta:
    """
    Holds graph-specific configuration for a GraphModel.

    Populated from the inner ``GraphMeta`` class on model definitions.
    Attached to the model class as ``_graph_meta``.
    """

    def __init__(
        self,
        graph_name=None,
        vertex_label=None,
        properties=None,
        model_class=None,
    ):
        self.graph_name = graph_name or agave_settings.DEFAULT_GRAPH_NAME
        self.vertex_label = vertex_label
        self.properties = properties or []
        self.model_class = model_class

    def get_property_values(self, instance):
        """Extract property dict from a model instance."""
        props = {}
        for field_name in self.properties:
            props[field_name] = getattr(instance, field_name, None)
        return props


class EdgeMeta:
    """
    Holds edge-specific configuration for an Edge model.

    Populated from the inner ``EdgeMeta`` class on edge definitions.
    Attached to the model class as ``_edge_meta``.
    """

    def __init__(
        self,
        edge_label=None,
        graph_name=None,
        directed=True,
        properties=None,
        model_class=None,
    ):
        self.edge_label = edge_label
        self.graph_name = graph_name or agave_settings.DEFAULT_GRAPH_NAME
        self.directed = directed
        self.properties = properties or []
        self.model_class = model_class


def register_vertex(label, model_class):
    """Register a vertex label → model class mapping."""
    _vertex_registry[label] = model_class


def register_edge(label, model_class):
    """Register an edge label → edge model class mapping."""
    _edge_registry[label] = model_class


def get_model_for_label(label):
    """Get the model class registered for a vertex label."""
    return _vertex_registry.get(label)


def get_edge_model_for_label(label):
    """Get the edge model class registered for an edge label."""
    return _edge_registry.get(label)
