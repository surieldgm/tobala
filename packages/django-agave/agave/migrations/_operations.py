"""
Custom migration operations for AGE graphs and pgvector indexes.

These operations can be used in Django migrations to manage
graph schema alongside relational schema.

Usage in a migration file::

    from agave.migrations import CreateGraph, CreateVectorIndex

    class Migration(migrations.Migration):
        operations = [
            CreateGraph('my_graph'),
            CreateVectorIndex(
                model_name='paper',
                field_name='embedding',
                index_type='hnsw',
            ),
        ]
"""

from django.db import migrations


class CreateGraph(migrations.operations.base.Operation):
    """
    Create an Apache AGE graph.

    Reversible: drops the graph on reverse.
    """

    reversible = True
    reduces_to_sql = True

    def __init__(self, graph_name):
        self.graph_name = graph_name

    def state_forwards(self, app_label, state):
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        from agave.db.backends.postgresql.operations import create_graph

        create_graph(self.graph_name, using=schema_editor.connection.alias)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        from agave.db.backends.postgresql.operations import drop_graph

        drop_graph(
            self.graph_name, cascade=True, using=schema_editor.connection.alias
        )

    def describe(self):
        return f"Create AGE graph '{self.graph_name}'"

    def deconstruct(self):
        return (
            self.__class__.__qualname__,
            [self.graph_name],
            {},
        )


class CreateVertexLabel(migrations.operations.base.Operation):
    """
    Create a vertex label in an AGE graph.
    """

    reversible = True
    reduces_to_sql = True

    def __init__(self, graph_name, label):
        self.graph_name = graph_name
        self.label = label

    def state_forwards(self, app_label, state):
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.create_vertex_label(self.graph_name, self.label)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        # AGE doesn't support dropping individual labels.
        # Vertices with this label can be deleted, but the label
        # metadata persists until the graph is dropped.
        pass

    def describe(self):
        return (
            f"Create vertex label '{self.label}' in graph '{self.graph_name}'"
        )

    def deconstruct(self):
        return (
            self.__class__.__qualname__,
            [self.graph_name, self.label],
            {},
        )


class CreateEdgeLabel(migrations.operations.base.Operation):
    """
    Create an edge label in an AGE graph.
    """

    reversible = True
    reduces_to_sql = True

    def __init__(
        self, graph_name, edge_label, source_label="__init", target_label="__init"
    ):
        self.graph_name = graph_name
        self.edge_label = edge_label
        self.source_label = source_label
        self.target_label = target_label

    def state_forwards(self, app_label, state):
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.create_edge_label(
            self.graph_name,
            self.edge_label,
            self.source_label,
            self.target_label,
        )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        # AGE doesn't support dropping individual edge labels
        pass

    def describe(self):
        return (
            f"Create edge label '{self.edge_label}' in graph '{self.graph_name}'"
        )

    def deconstruct(self):
        return (
            self.__class__.__qualname__,
            [self.graph_name, self.edge_label],
            {
                "source_label": self.source_label,
                "target_label": self.target_label,
            },
        )


class CreateVectorIndex(migrations.operations.base.Operation):
    """
    Create a pgvector index on a VectorField.

    Supports HNSW and IVFFlat index types.
    """

    reversible = True
    reduces_to_sql = True

    def __init__(
        self,
        model_name,
        field_name,
        index_type="hnsw",
        distance_fn="cosine",
        name=None,
        **kwargs,
    ):
        self.model_name = model_name
        self.field_name = field_name
        self.index_type = index_type
        self.distance_fn = distance_fn
        self.name = name
        self.options = kwargs

    def _get_index_name(self, app_label):
        if self.name:
            return self.name
        return f"idx_{app_label}_{self.model_name}_{self.field_name}_{self.index_type}"

    def _get_ops_class(self):
        """Get the pgvector operator class for the distance function."""
        mapping = {
            "cosine": "vector_cosine_ops",
            "l2": "vector_l2_ops",
            "inner_product": "vector_ip_ops",
        }
        return mapping.get(self.distance_fn, "vector_cosine_ops")

    def state_forwards(self, app_label, state):
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.model_name)
        table_name = model._meta.db_table
        index_name = self._get_index_name(app_label)
        ops_class = self._get_ops_class()

        # Build HNSW/IVFFlat specific options
        with_clause = ""
        if self.index_type == "hnsw":
            m = self.options.get("m", 16)
            ef = self.options.get("ef_construction", 64)
            with_clause = f" WITH (m = {m}, ef_construction = {ef})"
        elif self.index_type == "ivfflat":
            lists = self.options.get("lists", 100)
            with_clause = f" WITH (lists = {lists})"

        sql = (
            f"CREATE INDEX IF NOT EXISTS {index_name} "
            f"ON {table_name} "
            f"USING {self.index_type} ({self.field_name} {ops_class})"
            f"{with_clause}"
        )

        schema_editor.execute(sql)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        index_name = self._get_index_name(app_label)
        schema_editor.execute(f"DROP INDEX IF EXISTS {index_name}")

    def describe(self):
        return (
            f"Create {self.index_type} vector index on "
            f"'{self.model_name}.{self.field_name}'"
        )

    def deconstruct(self):
        kwargs = {
            "model_name": self.model_name,
            "field_name": self.field_name,
            "index_type": self.index_type,
            "distance_fn": self.distance_fn,
        }
        if self.name:
            kwargs["name"] = self.name
        kwargs.update(self.options)
        return (
            self.__class__.__qualname__,
            [],
            kwargs,
        )
