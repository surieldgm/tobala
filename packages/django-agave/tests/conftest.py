import os

import pytest
from django.db.utils import OperationalError
from django.test.utils import setup_databases, teardown_databases

from pytest_django.fixtures import _disable_migrations, _get_databases_for_setup


@pytest.fixture(scope="session")
def django_db_setup(
    request,
    django_test_environment,
    django_db_blocker,
    django_db_use_migrations,
    django_db_keepdb,
    django_db_createdb,
    django_db_modify_db_settings,
):
    """
    Create migrated test DBs (same as pytest-django), then ensure AGE + pgvector
    and the session graph exist.

    Overriding ``django_db_setup`` without calling ``setup_databases`` prevented
    migrations from ever running, so ORM tables were missing.
    """
    from django.conf import settings
    from django.db import connection

    db = settings.DATABASES["default"]

    def _handle_db_unreachable(exc: BaseException) -> None:
        host = db.get("HOST") or "localhost"
        port = db.get("PORT") or "5432"
        msg = (
            f"\nPostgreSQL not reachable at {host}:{port}.\n"
            "Start the stack: docker compose up -d\n"
            "Or set POSTGRES_HOST / POSTGRES_PORT (see tests/settings.py).\n"
            f"\n{exc.__class__.__name__}: {exc}\n"
        )
        if os.environ.get("CI") or os.environ.get("AGAVE_TEST_REQUIRE_POSTGRES"):
            pytest.exit(msg, returncode=1)
        pytest.skip(msg.strip())

    setup_databases_args: dict = {}
    if not django_db_use_migrations:
        _disable_migrations()

    if django_db_keepdb and not django_db_createdb:
        setup_databases_args["keepdb"] = True

    aliases, serialized_aliases = _get_databases_for_setup(request.session.items)

    with django_db_blocker.unblock():
        try:
            db_cfg = setup_databases(
                verbosity=request.config.option.verbose,
                interactive=False,
                aliases=aliases,
                serialized_aliases=serialized_aliases,
                **setup_databases_args,
            )
        except OperationalError as exc:
            _handle_db_unreachable(exc)

    with django_db_blocker.unblock():
        try:
            with connection.cursor() as cursor:
                cursor.execute("CREATE EXTENSION IF NOT EXISTS age;")
                cursor.execute("LOAD 'age';")
                cursor.execute(
                    "SET search_path = ag_catalog, \"$user\", public;"
                )
                cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")

                graph_name = settings.AGAVE.get(
                    "DEFAULT_GRAPH_NAME", "test_graph"
                )
                cursor.execute(
                    "SELECT count(*) FROM ag_catalog.ag_graph WHERE name = %s",
                    [graph_name],
                )
                if cursor.fetchone()[0] == 0:
                    cursor.execute(
                        "SELECT ag_catalog.create_graph(%s)", [graph_name]
                    )
        except OperationalError as exc:
            _handle_db_unreachable(exc)

    yield

    if not django_db_keepdb:
        with django_db_blocker.unblock():
            try:
                teardown_databases(
                    db_cfg, verbosity=request.config.option.verbose
                )
            except Exception as exc:
                request.node.warn(
                    pytest.PytestWarning(
                        f"Error when trying to teardown test databases: {exc!r}"
                    )
                )
