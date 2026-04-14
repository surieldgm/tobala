"""
Custom PostgreSQL DatabaseWrapper that bootstraps Apache AGE
and pgvector extensions at connection time.
"""

import logging

from django.db.backends.postgresql import base as pg_base

from agave.db.backends.postgresql.creation import DatabaseCreation
from agave.db.backends.postgresql.introspection import DatabaseIntrospection
from agave.db.backends.postgresql.schema import DatabaseSchemaEditor

logger = logging.getLogger("agave.db")


class DatabaseWrapper(pg_base.DatabaseWrapper):

    creation_class = DatabaseCreation
    introspection_class = DatabaseIntrospection
    SchemaEditorClass = DatabaseSchemaEditor
    """
    Extends Django's PostgreSQL backend to ensure Apache AGE
    and pgvector are loaded on every database connection.

    AGE requires ``LOAD 'age'`` per session (it's a shared library,
    not a standard extension). The search_path must include
    ``ag_catalog`` for AGE functions to resolve.
    """

    vendor = "postgresql"

    def init_connection_state(self):
        """
        Run AGE session setup during ``connect()``, after autocommit is configured.

        Doing this from ``ensure_connection()`` runs *after* a full connect and can
        leave psycopg in ``INTRANS`` when autocommit is off (e.g. pytest-django),
        which then breaks the next ``connect()`` / ``set_autocommit`` cycle.
        """
        super().init_connection_state()
        if self.connection is not None and not self.pool:
            self._configure_agave_session()

    def _configure_agave_session(self):
        """Load AGE shared library and configure search_path (mirrors timezone/role)."""
        cursor = self.connection.cursor()
        try:
            cursor.execute("LOAD 'age';")
            cursor.execute(
                "SET search_path = ag_catalog, \"$user\", public;"
            )
            logger.debug("AGE initialized on connection %s", id(self))
        except Exception:
            logger.warning(
                "Failed to initialize AGE. Ensure Apache AGE is installed.",
                exc_info=True,
            )
            raise
        finally:
            cursor.close()
        if not self.get_autocommit():
            self.connection.commit()
