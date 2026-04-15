from django.apps import AppConfig


class NotesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "notes"

    def ready(self) -> None:
        # Import signal handlers + Celery tasks so autodiscover picks them up
        # and the post_save receiver is registered once the app is ready.
        # `onboarding` must be imported here too — it defines a @shared_task
        # that Celery only registers on module import, and it's not in
        # `tasks.py` so autodiscover doesn't find it automatically.
        from . import signals  # noqa: F401
        from . import tasks  # noqa: F401
        from . import onboarding  # noqa: F401
