"""
Graph and vector constraints — stubs for Phase 3.
"""


class GraphUniqueConstraint:
    """
    Constraint ensuring uniqueness of a property within a vertex label.
    Stub for Phase 3 migration autodetection.
    """

    def __init__(self, fields, name, graph_name=None):
        self.fields = fields
        self.name = name
        self.graph_name = graph_name


class VectorIndexConstraint:
    """
    Constraint for vector index configuration.
    Stub for Phase 3 migration autodetection.
    """

    def __init__(self, field, index_type="hnsw", name=None, **kwargs):
        self.field = field
        self.index_type = index_type
        self.name = name
        self.options = kwargs
