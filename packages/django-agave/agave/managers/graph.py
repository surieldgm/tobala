"""
GraphManager and GraphQuerySet for graph operations.

Provides graph traversal methods that chain seamlessly
with standard Django QuerySet filters.
"""

from django.db import models


class GraphQuerySet(models.QuerySet):
    """
    Extended QuerySet for graph operations.

    Graph methods (traverse, neighbors, etc.) execute Cypher queries
    to find PKs, then filter the relational QuerySet by those PKs.
    """

    def traverse(self, edge_label, depth=1, direction="outgoing"):
        """
        Traverse edges from the current result set.

        Returns a new QuerySet containing the nodes reachable
        by traversing ``edge_label`` edges up to ``depth`` hops.

        Usage::

            Paper.graph.filter(title="ML Paper").traverse("CITES", depth=3)
        """
        clone = self._clone()
        clone._traverse_config = {
            "edge_label": edge_label,
            "depth": depth,
            "direction": direction,
        }
        return clone

    def match(self, pattern):
        """
        Raw Cypher pattern match with Django model hydration.

        Phase 2: will be processed by CypherCompiler.
        MVP: stores the pattern for future use.
        """
        clone = self._clone()
        clone._cypher_pattern = pattern
        return clone

    def neighbors(self, instance, edge_label=None, depth=1):
        """
        Get all neighbors of a given node.

        Executes a Cypher traversal and returns a QuerySet
        of the neighboring model instances.
        """
        from agave.db.backends.postgresql.operations import get_neighbors

        meta = self.model._graph_meta
        pks = get_neighbors(
            graph_name=meta.graph_name,
            label=meta.vertex_label,
            pk=instance.pk,
            edge_label=edge_label,
            depth=depth,
        )
        return self.filter(pk__in=pks)

    def shortest_path(self, source, target, edge_label=None):
        """
        Find shortest path between two model instances.

        Phase 2: will use CypherCompiler with shortestPath().
        MVP: executes raw Cypher.
        """
        from agave.utils.connection import execute_cypher, parse_agtype

        meta = self.model._graph_meta
        label = meta.vertex_label

        edge_filter = ""
        if edge_label:
            edge_filter = f":{edge_label}"

        cypher = (
            f"MATCH p = shortestPath("
            f"(a:{label} {{_django_pk: {source.pk}}})"
            f"-[{edge_filter}*]->"
            f"(b:{label} {{_django_pk: {target.pk}}})"
            f") RETURN [n IN nodes(p) | n._django_pk]"
        )

        results = execute_cypher(meta.graph_name, cypher)
        if results:
            pks_raw = parse_agtype(results[0][0])
            if isinstance(pks_raw, list):
                return self.filter(pk__in=pks_raw)
        return self.none()

    def subgraph(self, root, depth=2):
        """
        Extract a subgraph rooted at ``root``.

        Returns a QuerySet of all nodes reachable within ``depth`` hops.
        """
        from agave.db.backends.postgresql.operations import get_neighbors

        meta = self.model._graph_meta
        pks = get_neighbors(
            graph_name=meta.graph_name,
            label=meta.vertex_label,
            pk=root.pk,
            depth=depth,
            direction="both",
        )
        # Include the root node itself
        pks.append(root.pk)
        return self.filter(pk__in=pks)

    def _clone(self):
        clone = super()._clone()
        # Preserve graph-specific state
        if hasattr(self, "_traverse_config"):
            clone._traverse_config = self._traverse_config
        if hasattr(self, "_cypher_pattern"):
            clone._cypher_pattern = self._cypher_pattern
        return clone


class GraphManager(models.Manager):
    """
    Default manager for GraphModel providing graph operations
    alongside standard Django ORM methods.

    Usage::

        # Standard Django
        Paper.objects.filter(title__contains="AI")

        # Graph traversal
        Paper.graph.neighbors(paper_instance, edge_label='CITES', depth=2)

        # Combined
        Paper.graph.filter(year__gte=2020).neighbors(paper, 'CITES')
    """

    def get_queryset(self):
        return GraphQuerySet(self.model, using=self._db)

    def traverse(self, *args, **kwargs):
        return self.get_queryset().traverse(*args, **kwargs)

    def match(self, *args, **kwargs):
        return self.get_queryset().match(*args, **kwargs)

    def shortest_path(self, *args, **kwargs):
        return self.get_queryset().shortest_path(*args, **kwargs)

    def neighbors(self, *args, **kwargs):
        return self.get_queryset().neighbors(*args, **kwargs)

    def subgraph(self, *args, **kwargs):
        return self.get_queryset().subgraph(*args, **kwargs)

    def create_edge(self, source, target, edge_model, **properties):
        """Convenience method to create an edge between two vertices."""
        return edge_model.objects.create(
            source=source,
            target=target,
            **properties,
        )

    def bulk_create_edges(self, edges_data, edge_model):
        """Batch edge creation."""
        from agave.db.backends.postgresql.operations import bulk_insert_edges

        return bulk_insert_edges(
            self.model._graph_meta.graph_name,
            edge_model._edge_meta.edge_label,
            edges_data,
        )
