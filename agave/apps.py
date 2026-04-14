from django.apps import AppConfig


class AgaveConfig(AppConfig):
    name = "agave"
    verbose_name = "Agave"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        # Future: register signals, populate vertex label registry
        pass
