"""Django settings for tobala_project."""
import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-secret-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get(
    "DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,backend"
).split(",")

INSTALLED_APPS = [
    # Daphne must come first so its runserver override wins (Channels docs).
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "channels",
    "agave",
    # Local
    "accounts",
    "notes",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "tobala_project.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "tobala_project.wsgi.application"
ASGI_APPLICATION = "tobala_project.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "agave.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "tobala"),
        "USER": os.environ.get("POSTGRES_USER", "tobala"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "tobala_dev"),
        "HOST": os.environ.get("DB_HOST", "db"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- django-agave ---------------------------------------------------------
AGAVE = {
    "DEFAULT_GRAPH_NAME": "tobala",
    # Bumped from 384 → 1536 (OpenAI text-embedding-3-small native dim) in
    # migration 0003_embedding_1536. Existing embeddings are nulled and must
    # be regenerated via the async pipeline (or `manage.py reembed_all`).
    "VECTOR_DIMENSIONS": 1536,
    "VECTOR_INDEX_TYPE": "hnsw",
    "AUTO_CREATE_GRAPH": False,  # created explicitly via CreateGraph migration op
}

# --- Celery (async pipeline) ---------------------------------------------
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = TIME_ZONE
# When True, tasks run inline (no worker needed). Handy for tests + single-user dev
# runs that don't want the worker container up. Default False in prod.
CELERY_TASK_ALWAYS_EAGER = os.environ.get("CELERY_EAGER", "0") == "1"
CELERY_TASK_EAGER_PROPAGATES = True

# --- Channels (WebSockets) ------------------------------------------------
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

# --- LLM pipeline (R2) ----------------------------------------------------
# Single config block the providers/* modules read from. Swap models per-task
# via env without touching code.
TOBALA_LLM = {
    "embedding_provider": os.environ.get("EMBEDDING_PROVIDER", "openai"),
    "embedding_model": os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small"),
    "embedding_dim": 1536,
    "tagging_provider": os.environ.get("TAGGING_PROVIDER", "openai"),
    "tagging_model": os.environ.get("TAGGING_MODEL", "gpt-4o-mini"),
    "linking_provider": os.environ.get("LINKING_PROVIDER", "openai"),
    "linking_model": os.environ.get("LINKING_MODEL", "gpt-4o-mini"),
    "retrieval_provider": os.environ.get("RETRIEVAL_PROVIDER", "openai"),
    "retrieval_model": os.environ.get("RETRIEVAL_MODEL", "gpt-4o"),
    # How many semantically-close candidates to consider for auto-linking.
    "top_k_links": 5,
    # Min LLM confidence to surface an auto-linking proposal (below → dropped).
    "linking_confidence_threshold": 0.5,
    # How many anchor notes to ground retrieval against.
    "top_k_retrieval": 8,
    # Tag count bounds the tagging LLM must respect.
    "tag_min": 3,
    "tag_max": 7,
}

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# --- DRF ------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
}

# --- CORS -----------------------------------------------------------------
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
).split(",")

# --- Logging --------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "loggers": {
        "agave": {"handlers": ["console"], "level": "INFO"},
        "django.db.backends": {"handlers": ["console"], "level": "WARNING"},
    },
}
