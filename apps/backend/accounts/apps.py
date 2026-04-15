from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self) -> None:
        # Import signals so the post_save receiver on User is wired up.
        # Required for string-sender receivers like `sender=AUTH_USER_MODEL`.
        from . import signals  # noqa: F401
