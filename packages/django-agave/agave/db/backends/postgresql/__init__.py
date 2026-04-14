"""
Agave PostgreSQL backend.

Drop-in replacement for Django's PostgreSQL backend that bootstraps
Apache AGE and pgvector extensions on each connection.

Usage in settings.py::

    DATABASES = {
        'default': {
            'ENGINE': 'agave.db.backends.postgresql',
            ...
        }
    }
"""
