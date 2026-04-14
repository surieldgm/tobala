"""
Low-level helpers for executing Cypher queries via Apache AGE
and parsing agtype results.
"""

import json
import logging
import re

from django.db import connections

logger = logging.getLogger("agave.db")


def get_cursor(using="default"):
    """Get a database cursor from the specified connection."""
    connection = connections[using]
    connection.ensure_connection()
    return connection.connection.cursor()


def execute_cypher(graph_name, cypher_query, params=None, using="default"):
    """
    Execute a Cypher query through Apache AGE's ``ag_catalog.cypher()``
    function and return the raw results.

    Args:
        graph_name: Name of the AGE graph.
        cypher_query: Cypher query string.
        params: Optional dict of parameters to interpolate into the query.
        using: Database alias.

    Returns:
        List of result tuples from the cursor.
    """
    if params:
        cypher_query = _interpolate_params(cypher_query, params)

    sql = (
        f"SELECT * FROM ag_catalog.cypher('{_escape_identifier(graph_name)}', "
        f"$$ {cypher_query} $$) AS (result agtype)"
    )

    cursor = get_cursor(using)
    try:
        logger.debug("Executing Cypher: %s", sql)
        cursor.execute(sql)
        return cursor.fetchall()
    finally:
        cursor.close()


def execute_cypher_void(graph_name, cypher_query, params=None, using="default"):
    """
    Execute a Cypher query that doesn't return results (CREATE, MERGE, DELETE).
    Returns the number of rows affected.
    """
    if params:
        cypher_query = _interpolate_params(cypher_query, params)

    # For void operations, we still need a RETURN clause or use a dummy return
    # AGE requires the cypher() function to have a return type definition
    sql = (
        f"SELECT * FROM ag_catalog.cypher('{_escape_identifier(graph_name)}', "
        f"$$ {cypher_query} $$) AS (result agtype)"
    )

    cursor = get_cursor(using)
    try:
        logger.debug("Executing Cypher (void): %s", sql)
        cursor.execute(sql)
        results = cursor.fetchall()
        return len(results)
    finally:
        cursor.close()


def parse_agtype(value):
    """
    Parse an AGE agtype value into a Python object.

    AGE returns agtype as text in JSON-like format. Vertices look like:
    ``{"id": 123, "label": "Person", "properties": {"name": "Alice"}}``

    Edges look like:
    ``{"id": 456, "label": "KNOWS", "start_id": 123, "end_id": 789,
      "properties": {}}``
    """
    if value is None:
        return None

    if isinstance(value, str):
        # Strip trailing ::vertex or ::edge type annotations
        cleaned = re.sub(r"::(?:vertex|edge|path)$", "", value.strip())
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            # Try as plain value
            return value

    return value


def _interpolate_params(cypher_query, params):
    """
    Safely interpolate parameters into a Cypher query string.

    AGE does not support standard SQL parameter binding ($1, %s)
    inside the $$ delimited Cypher string. We must interpolate
    values directly, with careful escaping.
    """
    for key, value in params.items():
        placeholder = f"${key}"
        escaped = _escape_value(value)
        cypher_query = cypher_query.replace(placeholder, escaped)
    return cypher_query


def _escape_value(value):
    """Escape a Python value for safe use in a Cypher query string."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, str):
        # Escape single quotes for Cypher string literals
        escaped = value.replace("\\", "\\\\").replace("'", "\\'")
        return f"'{escaped}'"
    if isinstance(value, (list, dict)):
        return json.dumps(value)
    return str(value)


def _escape_identifier(name):
    """Escape a graph/label name to prevent injection."""
    # Only allow alphanumeric and underscore
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name):
        raise ValueError(
            f"Invalid identifier: '{name}'. "
            "Only alphanumeric characters and underscores are allowed."
        )
    return name


def build_properties_set(properties, node_var="n"):
    """
    Build a Cypher SET clause from a properties dict.

    Returns a string like: ``SET n.title = 'foo', n.year = 2024``
    """
    if not properties:
        return ""
    parts = []
    for key, value in properties.items():
        parts.append(f"{node_var}.{key} = {_escape_value(value)}")
    return "SET " + ", ".join(parts)
