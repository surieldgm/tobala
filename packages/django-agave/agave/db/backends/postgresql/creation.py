"""
Database creation for test databases.

Ensures AGE and pgvector extensions exist on the test database *before* migrate
runs (pgvector columns require the ``vector`` type).
"""

import logging
import os
import sys

from django.conf import settings
from django.core.management import call_command
from django.db import router
from django.db.backends.postgresql.creation import (
    DatabaseCreation as PGDatabaseCreation,
)

logger = logging.getLogger("agave.db")


class DatabaseCreation(PGDatabaseCreation):
    """
    Extends PostgreSQL test DB creation: install extensions after the empty
    database exists and ``NAME`` points at it, but before ``migrate``.
    """

    def create_test_db(
        self, verbosity=1, autoclobber=False, serialize=True, keepdb=False
    ):
        from django.apps import apps

        test_database_name = self._get_test_db_name()

        if verbosity >= 1:
            action = "Creating" if not keepdb else "Using existing"
            self.log(
                "%s test database for alias %s..."
                % (
                    action,
                    self._get_database_display_str(verbosity, test_database_name),
                )
            )

        self._create_test_db(verbosity, autoclobber, keepdb)

        self.connection.close()
        settings.DATABASES[self.connection.alias]["NAME"] = test_database_name
        self.connection.settings_dict["NAME"] = test_database_name

        self._install_extensions()

        try:
            if self.connection.settings_dict["TEST"]["MIGRATE"] is False:
                old_migration_modules = settings.MIGRATION_MODULES
                settings.MIGRATION_MODULES = {
                    app.label: None for app in apps.get_app_configs()
                }
            call_command(
                "migrate",
                verbosity=max(verbosity - 1, 0),
                interactive=False,
                database=self.connection.alias,
                run_syncdb=True,
            )
        finally:
            if self.connection.settings_dict["TEST"]["MIGRATE"] is False:
                settings.MIGRATION_MODULES = old_migration_modules

        if serialize:
            self.connection._test_serialized_contents = (
                self.serialize_db_to_string()
            )

        call_command("createcachetable", database=self.connection.alias)

        self.connection.ensure_connection()

        if os.environ.get("RUNNING_DJANGOS_TEST_SUITE") == "true":
            self.mark_expected_failures_and_skips()

        return test_database_name

    def _install_extensions(self):
        """Install AGE and pgvector on the current (test) database."""
        self.connection.ensure_connection()
        with self.connection.cursor() as cursor:
            try:
                cursor.execute("CREATE EXTENSION IF NOT EXISTS age;")
                logger.info("Installed AGE extension on test database")
            except Exception:
                logger.warning(
                    "Could not install AGE extension on test database.",
                    exc_info=True,
                )

            try:
                cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                logger.info("Installed pgvector extension on test database")
            except Exception:
                logger.warning(
                    "Could not install pgvector extension on test database.",
                    exc_info=True,
                )
