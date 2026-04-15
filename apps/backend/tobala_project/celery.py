"""Celery application wiring for the async pipeline.

The worker container runs `celery -A tobala_project worker`, which imports this
module and picks up tasks from every INSTALLED_APP via autodiscover.
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "tobala_project.settings")

app = Celery("tobala")

# Pull broker/result-backend + task-related settings from Django settings,
# using the CELERY_ prefix (e.g. CELERY_BROKER_URL).
app.config_from_object("django.conf:settings", namespace="CELERY")

# Discover tasks.py modules in every installed app.
app.autodiscover_tasks()
