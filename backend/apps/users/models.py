from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower


class User(AbstractUser):
    email = models.EmailField(unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        constraints = [
            # "Anna@x.com" and "anna@x.com" are the same mailbox: never two accounts.
            models.UniqueConstraint(Lower("email"), name="user_email_case_insensitive_unique"),
        ]
