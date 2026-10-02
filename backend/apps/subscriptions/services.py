"""What subscriptions cost and when they are paid. Read-only: nothing here writes.

- Costs per subscription are in its own currency (`monthly`, `yearly`) and in the user's
  base currency (`base_monthly`, `base_yearly`), converted with the latest ECB rate
  (at most 7 days old, see apps/currencies/rates.py). Without such a rate the base values
  are None and the subscription is left out of the totals — reported, never guessed.
- Totals are sums of the rounded per-subscription values, so a list always adds up to
  the total shown under it.
- Weekly = 52 payments a year (52 / 12 a month), yearly = 1 / 12 a month.

The schedule helpers (`next_payment_date`, `upcoming_payments`) are the building blocks
for payment reminders and smart notifications.
"""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Q

from apps.categories.defaults import display_name
from apps.currencies.rates import Converter
from apps.transactions.recurrence import (
    monthly_equivalent,
    next_occurrence_on_or_after,
    occurrences_from,
    yearly_equivalent,
)

from .models import Subscription

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
UPCOMING_DAYS = 30  # the summary's "upcoming payments" window, today included
SCHEDULE_PREVIEW = 3  # next payment dates shown per subscription


class Status:
    ACTIVE = "active"  # running: has payments ahead
    PAUSED = "paused"  # switched off by the user (`active: false`)
    ENDED = "ended"  # active, but past its end date
    CHOICES = [(ACTIVE, ACTIVE), (PAUSED, PAUSED), (ENDED, ENDED)]


def to_cents(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class Cost:
    monthly: Decimal  # in the subscription's currency
    yearly: Decimal
    base_monthly: Decimal | None  # in the base currency; None without an exchange rate
    base_yearly: Decimal | None


def cost_of(subscription: Subscription, converter: Converter) -> Cost:
    monthly = monthly_equivalent(subscription.amount, subscription.frequency)
    yearly = yearly_equivalent(subscription.amount, subscription.frequency)
    return Cost(
        monthly=to_cents(monthly),
        yearly=to_cents(yearly),
        base_monthly=converter.to_base(monthly, subscription.currency),
        base_yearly=converter.to_base(yearly, subscription.currency),
    )


def next_payment_date(subscription: Subscription, today: date) -> date | None:
    """The next payment on or after `today`; None while paused or once it has ended."""
    if not subscription.is_active:
        return None
    return next_occurrence_on_or_after(subscription, today)


def status_of(subscription: Subscription, today: date) -> str:
    if not subscription.is_active:
        return Status.PAUSED
    return Status.ACTIVE if next_payment_date(subscription, today) else Status.ENDED


def payment_schedule(subscription: Subscription, today: date, count: int = SCHEDULE_PREVIEW) -> list[date]:
    """The next `count` payment dates; empty while paused or once ended."""
    if not subscription.is_active:
        return []
    return occurrences_from(subscription, today, limit=count)


@dataclass(frozen=True)
class UpcomingPayment:
    subscription: Subscription
    date: date
    base_amount: Decimal | None  # the payment in the base currency; None without an exchange rate


def upcoming_payments(
    subscriptions: list[Subscription], today: date, converter: Converter, days: int = UPCOMING_DAYS
) -> list[UpcomingPayment]:
    """Every payment of the active subscriptions due from `today` to `today + days - 1`, soonest first."""
    last_day = today + timedelta(days=days - 1)
    payments = [
        UpcomingPayment(subscription, day, converter.to_base(subscription.amount, subscription.currency))
        for subscription in subscriptions
        if subscription.is_active
        for day in occurrences_from(subscription, today, until=last_day, limit=days)
    ]
    return sorted(payments, key=lambda payment: (payment.date, payment.subscription.name, payment.subscription.id))


def _percentage(part: Decimal, whole: Decimal) -> Decimal | None:
    return round(part / whole * 100, 2) if whole else None


def get_summary(user, today: date) -> dict:
    """The user's subscriptions right now: counts, what the running ones cost per month and
    per year, per category, and what is due in the next UPCOMING_DAYS days. One query, plus
    one for exchange rates when a subscription is billed in another currency."""
    subscriptions = list(Subscription.objects.filter(user=user).select_related("category"))
    converter = Converter(user.base_currency, today)
    statuses = {subscription.id: status_of(subscription, today) for subscription in subscriptions}
    running = [subscription for subscription in subscriptions if statuses[subscription.id] == Status.ACTIVE]

    monthly_total = yearly_total = ZERO
    unconverted: set[str] = set()
    by_category: dict[int, dict] = {}
    for subscription in running:
        cost = cost_of(subscription, converter)
        if cost.base_monthly is None or cost.base_yearly is None:
            unconverted.add(subscription.currency)
            continue
        monthly_total += cost.base_monthly
        yearly_total += cost.base_yearly
        entry = by_category.setdefault(
            subscription.category_id,
            {
                "category_id": subscription.category_id,
                "category_name": display_name(subscription.category.name),
                "monthly_total": ZERO,
                "subscription_count": 0,
            },
        )
        entry["monthly_total"] += cost.base_monthly
        entry["subscription_count"] += 1

    categories = sorted(by_category.values(), key=lambda entry: (-entry["monthly_total"], entry["category_name"]))
    for entry in categories:
        entry["percentage"] = _percentage(entry["monthly_total"], monthly_total)

    counts = {status: 0 for status, _ in Status.CHOICES}
    for status in statuses.values():
        counts[status] += 1

    return {
        "currency": user.base_currency,
        "active_count": counts[Status.ACTIVE],
        "paused_count": counts[Status.PAUSED],
        "ended_count": counts[Status.ENDED],
        "monthly_total": monthly_total,
        "yearly_total": yearly_total,
        "by_category": categories,
        "upcoming": upcoming_payments(running, today, converter),
        "unconverted_currencies": sorted(unconverted),
    }


def get_month_overview(user, year: int, month: int, today: date) -> dict:
    """The subscriptions of one month, for the dashboard: those active at some point during it,
    what they cost per month / year, and what was (or will be) billed within the month.

    Converted at the rate of the month's last day, or today's for the current month. One
    query, plus one for exchange rates when a subscription is billed in another currency.
    """
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])
    subscriptions = list(
        Subscription.objects.filter(user=user, is_active=True, start_date__lte=last_day).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=first_day)
        )
    )
    converter = Converter(user.base_currency, min(last_day, today))
    monthly_total = yearly_total = due_this_month = ZERO
    unconverted: set[str] = set()
    for subscription in subscriptions:
        cost = cost_of(subscription, converter)
        if cost.base_monthly is None or cost.base_yearly is None:
            unconverted.add(subscription.currency)
            continue
        monthly_total += cost.base_monthly
        yearly_total += cost.base_yearly
        payments = occurrences_from(subscription, first_day, until=last_day, limit=last_day.day)
        payment = converter.to_base(subscription.amount, subscription.currency)
        due_this_month += payment * len(payments)

    return {
        "active_count": len(subscriptions),
        "monthly_total": monthly_total,
        "yearly_total": yearly_total,
        "due_this_month": due_this_month,
        "unconverted_currencies": sorted(unconverted),
    }
