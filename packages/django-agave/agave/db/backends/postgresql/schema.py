"""
Schema editor extensions for AGE graph DDL.
"""

import logging

from django.db.backends.postgresql.schema import (
    DatabaseSchemaEditor as PGSchemaEditor,
)

from agave.db.backends.postgresql.operations import create_graph, drop_graph

logger = logging.getLogger("agave.db")


class DatabaseSchemaEditor(PGSchemaEditor):
    """
    Extends PostgreSQL schema editor with graph DDL methods.
    """

    def create_graph(self, graph_name):
        """Create an AGE graph."""
        create_graph(graph_name, using=self.connection.alias)

    def drop_graph(self, graph_name, cascade=True):
        """Drop an AGE graph."""
        drop_graph(graph_name, cascade=cascade, using=self.connection.alias)

    def create_vertex_label(self, graph_name, label):
        """
        Create a vertex label in the graph.

        AGE auto-creates labels on first use in MERGE/CREATE,
        but this provides explicit DDL for migrations.
        """
        # AGE creates labels implicitly on first vertex creation.
        # We create a dummy vertex and delete it to force label creation.
        from agave.utils.connection import execute_cypher

        cypher = f"CREATE (n:{label} {{_init: true}}) RETURN n"
        execute_cypher(graph_name, cypher, using=self.connection.alias)

        cypher = f"MATCH (n:{label} {{_init: true}}) DELETE n RETURN count(*)"
        execute_cypher(graph_name, cypher, using=self.connection.alias)

        logger.info(
            "Created vertex label '%s' in graph '%s'", label, graph_name
        )

    def create_edge_label(self, graph_name, edge_label, source_label, target_label):
        """
        Create an edge label in the graph.

        Like vertex labels, AGE auto-creates edge labels on first use.
        This forces creation via a dummy edge cycle.
        """
        from agave.utils.connection import execute_cypher

        # Create two temp vertices, an edge, then clean up
        cypher = (
            f"CREATE (a:{source_label} {{_init: true}})"
            f"-[e:{edge_label}]->"
            f"(b:{target_label} {{_init: true}}) "
            f"RETURN e"
        )
        execute_cypher(graph_name, cypher, using=self.connection.alias)

        # Clean up temp vertices
        for lbl in (source_label, target_label):
            cypher = (
                f"MATCH (n:{lbl} {{_init: true}}) DETACH DELETE n RETURN count(*)"
            )
            execute_cypher(graph_name, cypher, using=self.connection.alias)

        logger.info(
            "Created edge label '%s' in graph '%s'", edge_label, graph_name
        )
