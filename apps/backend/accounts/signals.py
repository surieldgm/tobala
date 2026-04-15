"""Post-signup hook that seeds a new user's workspace.

Every freshly created ``User`` row gets a tutorial set of 9 interlinked
notes (see :mod:`notes.onboarding`). We run it as a Celery task scheduled
from ``transaction.on_commit`` so:

  - the signup HTTP response returns immediately,
  - the seeding runs outside the request/response cycle,
  - a DB rollback on the signup transaction cancels the seed,
  - retries are free (the task itself is idempotent).
"""
from __future__ import annotations

import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import User

logger = logging.getLogger(__name__)


@receiver(post_save, sender=User)
def enqueue_onboarding(sender, instance: User, created: bool, **kwargs) -> None:  # noqa: ANN001
    """Fire off the onboarding seeder once, only on user creation.

    Using the concrete ``User`` class (not ``settings.AUTH_USER_MODEL`` as a
    string) is required: Django's signal dispatcher compares senders by
    object identity, so a string sender would never match the dispatched
    model class and the receiver would silently never fire.
    """
    if not created:
        return

    # Late import: pulling the task (and its notes-model imports) at module
    # load time would break Django's app-loading sequence for accounts.
    from notes.onboarding import seed_user_onboarding

    user_id = instance.pk

    def _fire() -> None:
        logger.info("enqueue_onboarding: seeding user=%s", user_id)
        seed_user_onboarding.delay(user_id)

    transaction.on_commit(_fire)
