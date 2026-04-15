# Import celery app at Django startup so @shared_task references resolve
# to this project's Celery instance.
from .celery import app as celery_app

__all__ = ("celery_app",)
