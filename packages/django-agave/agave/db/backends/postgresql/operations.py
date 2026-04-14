"""
AGE graph DDL and DML operations.

These functions provide the bridge between Django models and
Apache AGE's Cypher queries. They handle vertex/edge CRUD
via the ``ag_catalog.cypher()`` SQL wrapper.
"""

import logging

from agave.utils.connection import (
    _escape_identifier,
    _escape_value,
    build_properties_set,
    execute_cypher,
    execute_cypher_void,
    get_cursor,
    parse_agtype,
)

logger = logging.getLogger("agave.db")


# ---------------------------------------------------------------------------
# Graph DDL
# ---------------------------------------------------------------------------


def create_graph(graph_name, using="default"):
    """Create an AGE graph if it doesn't already exist."""
    name = _escape_identifier(graph_name)
    cursor = get_cursor(using)
    try:
        # Check if graph exists
        cursor.execute(
            "SELECT count(*) FROM ag_catalog.ag_graph WHERE name = %s",
            (graph_name,),
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute(
                "SELECT ag_catalog.create_graph(%s)", (graph_name,)
            )
            logger.info("Created graph: %s", graph_name)
        else:
            logger.debug("Graph already exists: %s", graph_name)
    finally:
        cursor.close()


def drop_graph(graph_name, cascade=True, using="default"):
    """Drop an AGE graph."""
    cursor = get_cursor(using)
    try:
        cursor.execute(
            "SELECT ag_catalog.drop_graph(%s, %s)",
            (graph_name, cascade),
        )
        logger.info("Dropped graph: %s", graph_name)
    finally:
        cursor.close()


def graph_exists(graph_name, using="default"):
    """Check if a graph exists."""
    cursor = get_cursor(using)
    try:
        cursor.execute(
            "SELECT count(*) FROM ag_catalog.ag_graph WHERE name = %s",
            (graph_name,),
        )
        return cursor.fetchone()[0] > 0
    finally:
        cursor.close()


# ---------------------------------------------------------------------------
# Vertex operations
# ---------------------------------------------------------------------------


def upsert_vertex(graph_name, label, pk, properties=None, using="default"):
    """
    Create or update a vertex in the AGE graph.

    Uses Cypher MERGE on ``_django_pk`` to find or create the vertex,
    then SET all properties.
    """
    label = _escape_identifier(label)
    props = {"_django_pk": pk}
    if properties:
        props.update(properties)

    set_clause = build_properties_set(props, "n")

    cypher = (
        f"MERGE (n:{label} {{_django_pk: {_escape_value(pk)}}}) "
        f"{set_clause} "
        f"RETURN n"
    )

    results = execute_cypher(graph_name, cypher, using=using)
    if results:
        return parse_agtype(results[0][0])
    return None


def delete_vertex(graph_name, label, pk, using="default"):
    """
    Delete a vertex from the AGE graph by its Django PK.
    Uses DETACH DELETE to also remove connected edges.
    """
    label = _escape_identifier(label)

    cypher = (
        f"MATCH (n:{label} {{_django_pk: {_escape_value(pk)}}}) "
        f"DETACH DELETE n "
        f"RETURN count(*)"
    )

    results = execute_cypher(graph_name, cypher, using=using)
    return results


def get_vertex(graph_name, label, pk, using="default"):
    """Retrieve a vertex by its Django PK."""
    label = _escape_identifier(label)

    cypher = (
        f"MATCH (n:{label} {{_django_pk: {_escape_value(pk)}}}) "
        f"RETURN n"
    )

    results = execute_cypher(graph_name, cypher, using=using)
    if results:
        return parse_agtype(results[0][0])
    return None


# ---------------------------------------------------------------------------
# Edge operations
# ---------------------------------------------------------------------------


def upsert_edge(
    graph_name,
    label,
    source_label,
    source_pk,
    target_label,
    target_pk,
    properties=None,
    using="default",
):
    """
    Create or update an edge between two vertices.
    Matches vertices by ``_django_pk`` and creates/merges the edge.
    """
    label = _escape_identifier(label)
    source_label = _escape_identifier(source_label)
    target_label = _escape_identifier(target_label)

    props_str = ""
    if properties:
        prop_parts = [
            f"{k}: {_escape_value(v)}" for k, v in properties.items()
        ]
        props_str = " {" + ", ".join(prop_parts) + "}"

    cypher = (
        f"MATCH (a:{source_label} {{_django_pk: {_escape_value(source_pk)}}}), "
        f"(b:{target_label} {{_django_pk: {_escape_value(target_pk)}}}) "
        f"MERGE (a)-[e:{label}{props_str}]->(b) "
        f"RETURN e"
    )

    results = execute_cypher(graph_name, cypher, using=using)
    if results:
        return parse_agtype(results[0][0])
    return None


def delete_edge(
    graph_name,
    label,
    source_label,
    source_pk,
    target_label,
    target_pk,
    using="default",
):
    """Delete an edge between two vertices."""
    label = _escape_identifier(label)
    source_label = _escape_identifier(source_label)
    target_label = _escape_identifier(target_label)

    cypher = (
        f"MATCH (a:{source_label} {{_django_pk: {_escape_value(source_pk)}}})"
        f"-[e:{label}]->"
        f"(b:{target_label} {{_django_pk: {_escape_value(target_pk)}}}) "
        f"DELETE e "
        f"RETURN count(*)"
    )

    return execute_cypher(graph_name, cypher, using=using)


def get_neighbors(
    graph_name,
    label,
    pk,
    edge_label=None,
    depth=1,
    direction="outgoing",
    using="default",
):
    """
    Get PKs of neighbor vertices connected via edges.

    Args:
        graph_name: AGE graph name.
        label: Vertex label of the source node.
        pk: Django PK of the source node.
        edge_label: Filter by edge label (optional).
        depth: Maximum traversal depth.
        direction: 'outgoing', 'incoming', or 'both'.
        using: Database alias.

    Returns:
        List of ``_django_pk`` values of neighboring vertices.
    """
    label = _escape_identifier(label)

    edge_filter = ""
    if edge_label:
        edge_filter = f":{_escape_identifier(edge_label)}"

    depth_str = f"*1..{depth}" if depth > 1 else ""

    if direction == "outgoing":
        pattern = f"(a)-[{edge_filter}{depth_str}]->(b)"
    elif direction == "incoming":
        pattern = f"(a)<-[{edge_filter}{depth_str}]-(b)"
    else:
        pattern = f"(a)-[{edge_filter}{depth_str}]-(b)"

    cypher = (
        f"MATCH (a:{label} {{_django_pk: {_escape_value(pk)}}}), "
        f"{pattern} "
        f"RETURN DISTINCT b._django_pk"
    )

    results = execute_cypher(graph_name, cypher, using=using)
    pks = []
    for row in results:
        val = row[0]
        if isinstance(val, str):
            # agtype might return quoted integers
            val = parse_agtype(val)
        pks.append(val)
    return pks


# ---------------------------------------------------------------------------
# Bulk operations (MVP: simple loop, Phase 4: UNWIND)
# ---------------------------------------------------------------------------


def bulk_upsert_vertices(graph_name, label, items, using="default"):
    """
    Bulk upsert vertices. Each item is a (pk, properties) tuple.
    MVP implementation: loops over individual upserts.
    """
    results = []
    for pk, properties in items:
        result = upsert_vertex(
            graph_name, label, pk, properties, using=using
        )
        results.append(result)
    return results


def bulk_insert_edges(graph_name, edge_label, edges_data, using="default"):
    """
    Bulk insert edges. Each item is a dict with:
    source_label, source_pk, target_label, target_pk, properties.
    MVP implementation: loops over individual upserts.
    """
    results = []
    for edge in edges_data:
        result = upsert_edge(
            graph_name,
            edge_label,
            edge["source_label"],
            edge["source_pk"],
            edge["target_label"],
            edge["target_pk"],
            edge.get("properties"),
            using=using,
        )
        results.append(result)
    return results
