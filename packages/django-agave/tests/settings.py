import os

SECRET_KEY = "test-secret-key-do-not-use-in-production"

DATABASES = {
    "default": {
        "ENGINE": "agave.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "agave_test"),
        "USER": os.environ.get("POSTGRES_USER", "agave"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "agave"),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "agave",
    "tests.testapp",
]

AGAVE = {
    "DEFAULT_GRAPH_NAME": "test_graph",
    "VECTOR_DIMENSIONS": 3,
    "VECTOR_INDEX_TYPE": "hnsw",
    "AUTO_CREATE_GRAPH": True,
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

USE_TZ = True
