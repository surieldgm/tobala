from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Custom user — kept minimal so we can extend later without a painful swap."""
