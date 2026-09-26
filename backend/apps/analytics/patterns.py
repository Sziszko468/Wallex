"""How the month's spending is shaped: per day, per weekday, fixed vs variable. Two queries.

For the current month everything is month-to-date (1st to today), so the daily
average isn't diluted by days that haven't happened yet.

Fixed expenses are the ones a recurring template accounts for: linked to a template,
or in the same category with exactly the template's amount while it runs (the
monthly rent of 600.00, a 12.99 subscription). Everything else is variable.
"""

import calendar
from collections import Counter
from datetime import date, timedelta

from django.db.models import Count, Exists, OuterRef, Q, Sum, Value
from django.db.models.functions import Coalesce, ExtractIsoWeekDay

from apps.categories.models import TransactionType
from apps.transactions.models import RecurringTransaction, Transaction

from .services import MONEY_OUTPUT, ZERO, get_recurring_monthly_expenses, month_date_range, to_cents


def counted_days(year: int, month: int, today: date) -> list[date]:
    """The days of the month that have happened: all of a past month, 1st–today of the current one."""
    start, end = month_date_range(year, month)
    last = min(end, today)
    return [start + timedelta(days=offset) for offset in range((last - start).days + 1)] if last >= start else []


def _is_fixed() -> Q:
    matches_template = RecurringTransaction.objects.filter(
        user_id=OuterRef("user_id"),
        type=TransactionType.EXPENSE,
        category_id=OuterRef("category_id"),
        amount=OuterRef("base_amount"),
        start_date__lte=OuterRef("date"),
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=OuterRef("date")))
    return Q(recurring_transaction__isnull=False) | Q(Exists(matches_template))


def get_spending_patterns(user, year: int, month: int, today: date) -> dict:
    days = counted_days(year, month, today)
    by_weekday = {}
    if days:
        by_weekday = {
            row["weekday"]: row
            for row in Transaction.objects.filter(
                user=user, type=TransactionType.EXPENSE, date__gte=days[0], date__lte=days[-1]
            )
            .annotate(weekday=ExtractIsoWeekDay("date"))
            .values("weekday")
            .annotate(
                total=Sum("base_amount"),
                fixed=Coalesce(Sum("base_amount", filter=_is_fixed()), Value(ZERO), output_field=MONEY_OUTPUT),
                transaction_count=Count("id"),
            )
            .order_by()
        }

    occurrences = Counter(day.isoweekday() for day in days)
    weekdays = []
    for weekday in range(1, 8):
        row = by_weekday.get(weekday, {"total": ZERO, "transaction_count": 0})
        weekdays.append(
            {
                "weekday": weekday,
                "name": calendar.day_name[weekday - 1],
                "total": row["total"],
                "transaction_count": row["transaction_count"],
                "days": occurrences[weekday],
                "average_per_day": to_cents(row["total"] / occurrences[weekday]) if occurrences[weekday] else None,
            }
        )

    total = sum((row["total"] for row in by_weekday.values()), ZERO)
    fixed = sum((row["fixed"] for row in by_weekday.values()), ZERO)
    return {
        "year": year,
        "month": month,
        "days_counted": len(days),
        "total_expenses": total,
        "average_daily_spending": to_cents(total / len(days)) if days else None,
        "weekdays": weekdays,
        "fixed_expenses": fixed,
        "variable_expenses": total - fixed,
        "fixed_percentage": round(fixed / total * 100, 2) if total else None,
        # What the active recurring expenses add up to per month (the plan behind "fixed").
        "recurring_commitments": get_recurring_monthly_expenses(user, year, month),
    }
