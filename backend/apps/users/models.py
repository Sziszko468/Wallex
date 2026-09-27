from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower

from apps.currencies.models import Currency


class User(AbstractUser):
    email = models.EmailField(unique=True)
    # Every total (analytics, budgets, subscription totals) is in this currency. Changed only
    # through apps.currencies.services.change_base_currency, which re-expresses the user's data.
    base_currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.EUR)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        constraints = [
            # "Anna@x.com" and "anna@x.com" are the same mailbox: never two accounts.
            models.UniqueConstraint(Lower("email"), name="user_email_case_insensitive_unique"),
        ]
