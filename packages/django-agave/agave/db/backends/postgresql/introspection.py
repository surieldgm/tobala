"""
Database introspection stub for AGE graphs.

MVP: pass-through to Django's PostgreSQL introspection.
Future phases will add graph schema introspection.
"""

from django.db.backends.postgresql.introspection import (
    DatabaseIntrospection as PGIntrospection,
)


class DatabaseIntrospection(PGIntrospection):
    """Stub — extends standard PG introspection with no changes for MVP."""

    pass
