"""Writes: storing ECB rates, and switching a user's base currency."""

from collections.abc import Iterable
from decimal import ROUND_HALF_UP

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.budgets.models import Budget
from apps.transactions.models import Transaction

from .ecb import EcbRate
from .models import ExchangeRate
from .rates import (
    MAX_AMOUNT,
    MAX_BASE_AMOUNT,
    ONE,
    RATE_QUANTUM,
    ConversionError,
    RateTable,
    base_amount_for,
    to_currency,
)

BULK_BATCH_SIZE = 500


def store_rates(rates: Iterable[EcbRate]) -> int:
    """Inserts new rates and updates existing ones (the ECB occasionally corrects a rate). Idempotent."""
    rows = [ExchangeRate(date=rate.day, currency=rate.currency, rate=rate.rate) for rate in rates]
    ExchangeRate.objects.bulk_create(
        rows,
        batch_size=1000,
        update_conflicts=True,
        unique_fields=["currency", "date"],
        update_fields=["rate"],
    )
    return len(rows)


@transaction.atomic
def change_base_currency(user, new_base: str) -> None:
    """Switches the user's base currency and re-expresses everything held in it.

    - Transactions keep their original `amount` and `currency`. Only `exchange_rate` is
      re-expressed against the new base, with the rate of the transaction's own date;
      the database then recomputes `base_amount`. A rate entered by hand stays in effect:
      new rate = old rate × (old base → new base).
    - Budgets are amounts *in* the base currency, so they are converted at the latest
      rate and rounded to the new currency's unit.
    - Recurring transactions and subscriptions carry their own `currency` (what the bill
      says) and are left alone; totals convert them when they are computed.

    All or nothing: if a rate is missing or a result doesn't fit, ConversionError is
    raised and nothing changes.
    """
    locked = get_user_model().objects.select_for_update().get(pk=user.pk)
    old_base = locked.base_currency
    if new_base == old_base:
        return

    now = timezone.now()
    today = timezone.localdate()
    transactions = list(
        Transaction.objects.filter(user=locked).only("id", "amount", "currency", "exchange_rate", "date")
    )
    budgets = list(Budget.objects.filter(user=locked))
    days = [item.date for item in transactions] + [today]
    rates = RateTable.load({old_base, new_base}, min(days), max(days))

    for item in transactions:
        if item.currency == new_base:
            item.exchange_rate = ONE
        else:
            to_new_base = rates.rate(old_base, new_base, item.date).value
            item.exchange_rate = (item.exchange_rate * to_new_base).quantize(RATE_QUANTUM, rounding=ROUND_HALF_UP)
        if base_amount_for(item.amount, item.exchange_rate) > MAX_BASE_AMOUNT:
            raise ConversionError(f"A transaction of {item.amount} {item.currency} is too large to express in {new_base}.")
        item.updated_at = now

    if budgets:
        latest = rates.rate(old_base, new_base, today).value
        for budget in budgets:
            budget.amount = to_currency(budget.amount, latest, new_base)
            if budget.amount > MAX_AMOUNT:
                raise ConversionError(f"A budget would be too large in {new_base}.")
            budget.updated_at = now

    Transaction.objects.bulk_update(transactions, ["exchange_rate", "updated_at"], batch_size=BULK_BATCH_SIZE)
    Budget.objects.bulk_update(budgets, ["amount", "updated_at"], batch_size=BULK_BATCH_SIZE)

    locked.base_currency = new_base
    locked.save(update_fields=["base_currency"])
    user.base_currency = new_base
