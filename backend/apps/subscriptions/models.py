"""A subscription is a recurring expense — not a separate financial record.

`Subscription` is a *proxy* of RecurringTransaction: no table of its own, only the rows
with `is_subscription=True`. Everything already built on recurring transactions keeps
working for subscriptions without a line of extra code — payment reminders, the
*recurring share* insight, fixed-expense detection, category protection — and the
transactions they are paid with stay ordinary Transactions.
"""

from django.db import models

from apps.categories.models import TransactionType
from apps.transactions.models import RecurringTransaction


class SubscriptionManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_subscription=True)


class Subscription(RecurringTransaction):
    objects = SubscriptionManager()

    class Meta:
        proxy = True
        ordering = ["-is_active", "name", "id"]

    def save(self, *args, **kwargs):
        # Whatever the caller set: a subscription row is always a subscription, and an expense.
        self.is_subscription = True
        self.type = TransactionType.EXPENSE
        super().save(*args, **kwargs)
