"""Unusual spending: a category costing clearly more than usual by this point of the month.

"Usual" is the average of the previous BASELINE_MONTHS months, each cut at today's day of
the month, so the month in progress is compared with the same days of earlier months
(1st–12th against 1st–12th). A baseline month only counts when the user was already
tracking expenses by then, and at least MIN_BASELINE_MONTHS are needed: before that there
is no "usual" to compare with.

A category is unusual when its spending so far is at least INCREASE_PERCENT above its usual
amount AND the difference is at least MIN_SHARE_PERCENT of what the user usually spends in
a whole month. The second test keeps the rule currency-neutral (a fixed minimum such as
10.00 means nothing in forints) and ignores large percentages of small amounts.

Amounts are in the base currency (Transaction.base_amount). One query.
"""

from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db.models import Min, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth

from apps.categories.defaults import display_name
from apps.categories.models import TransactionType
from apps.transactions.models import Transaction

from .services import MONEY_OUTPUT, ZERO, percentage_change, shift_month, to_cents

BASELINE_MONTHS = 3
MIN_BASELINE_MONTHS = 2
INCREASE_PERCENT = Decimal(20)
MIN_SHARE_PERCENT = Decimal(5)


@dataclass(frozen=True)
class UnusualSpending:
    category_id: int
    category_name: str
    current_amount: Decimal  # spent this month up to today
    usual_amount: Decimal  # average for the same days of the baseline months
    increase_percentage: Decimal


def baseline_months(today: date) -> list[date]:
    """First days of the BASELINE_MONTHS months before today's month, most recent first."""
    return [date(*shift_month(today.year, today.month, -offset), 1) for offset in range(1, BASELINE_MONTHS + 1)]


def _same_days_end(month_start: date, today: date) -> date:
    """The last day of `month_start`'s month that is compared: today's day, clamped to the month."""
    return month_start.replace(day=min(today.day, monthrange(month_start.year, month_start.month)[1]))


def find_unusual_spending(user, today: date) -> list[UnusualSpending]:
    """Unusual categories of today's month, the largest excess first."""
    months = baseline_months(today)
    same_days = Q(date__day__lte=today.day)
    rows = list(
        Transaction.objects.filter(user=user, type=TransactionType.EXPENSE, date__gte=months[-1], date__lte=today)
        .annotate(month=TruncMonth("date"))
        .values("category_id", "category__name", "month")
        .annotate(
            month_total=Sum("base_amount"),
            same_days_total=Coalesce(Sum("base_amount", filter=same_days), Value(ZERO), output_field=MONEY_OUTPUT),
            first_day=Min("date"),
        )
        .order_by()
    )
    if not rows:
        return []

    first_expense = min(row["first_day"] for row in rows)
    months_with_expenses = {row["month"] for row in rows}
    tracked = [
        month for month in months if month in months_with_expenses and first_expense <= _same_days_end(month, today)
    ]
    if len(tracked) < MIN_BASELINE_MONTHS:
        return []

    count = Decimal(len(tracked))
    usual_month_total = sum((row["month_total"] for row in rows if row["month"] in tracked), ZERO) / count
    min_increase = usual_month_total * MIN_SHARE_PERCENT / 100

    this_month = today.replace(day=1)
    current: dict[int, tuple[str, Decimal]] = {}
    usual_sums: dict[int, Decimal] = defaultdict(lambda: ZERO)
    for row in rows:
        if row["month"] == this_month:
            current[row["category_id"]] = (display_name(row["category__name"]), row["same_days_total"])
        elif row["month"] in tracked:
            usual_sums[row["category_id"]] += row["same_days_total"]

    found = []
    for category_id, (name, spent) in current.items():
        usual = to_cents(usual_sums[category_id] / count)
        increase = percentage_change(usual, spent)
        # No usual amount (a new kind of expense) gives no percentage: not "unusual" by this rule.
        if increase is None or increase < INCREASE_PERCENT or spent - usual < min_increase:
            continue
        found.append(UnusualSpending(category_id, name, spent, usual, increase))

    return sorted(found, key=lambda item: (item.usual_amount - item.current_amount, item.category_name))
