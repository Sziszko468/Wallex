"""Monthly and per-category spending trends over a window of months (one query).

The window ends with the selected month and may cross a year boundary
(e.g. November 2025 – April 2026). The month before the window is loaded too, as
the baseline of the first month's change, so every month in the window has one.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.utils.dates import MONTHS

from apps.categories.defaults import display_name
from apps.categories.models import TransactionType
from apps.transactions.models import Transaction

from .services import ZERO, month_date_range, percentage_change, shift_month, to_cents

DEFAULT_MONTHS = 6
MIN_MONTHS = 2  # a trend needs a change
MAX_MONTHS = 24


def window(year: int, month: int, months: int) -> list[date]:
    """First days of the `months` months ending with year/month, oldest first."""
    return [date(*shift_month(year, month, offset), 1) for offset in range(-months + 1, 1)]


def get_trends(user, year: int, month: int, months: int = DEFAULT_MONTHS) -> dict:
    month_starts = window(year, month, months)
    baseline = date(*shift_month(year, month, -months), 1)
    last_day = month_date_range(year, month)[1]

    # One grouped query feeds both the monthly totals and the category series.
    rows = (
        Transaction.objects.filter(user=user, date__gte=baseline, date__lte=last_day)
        .annotate(month_start=TruncMonth("date"))
        .values("month_start", "type", "category_id", "category__name")
        .annotate(total=Sum("base_amount"))
        .order_by()  # the model's default ordering would split the GROUP BY
    )

    income: dict[date, Decimal] = defaultdict(lambda: ZERO)
    expenses: dict[date, Decimal] = defaultdict(lambda: ZERO)
    category_totals: dict[int, dict[date, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    category_names: dict[int, str] = {}
    for row in rows:
        if row["type"] == TransactionType.INCOME:
            income[row["month_start"]] += row["total"]
        else:
            expenses[row["month_start"]] += row["total"]
            category_totals[row["category_id"]][row["month_start"]] += row["total"]
            category_names[row["category_id"]] = display_name(row["category__name"])

    monthly = []
    previous_expenses = expenses[baseline]
    for start in month_starts:
        monthly.append(
            {
                "year": start.year,
                "month": start.month,
                "month_name": str(MONTHS[start.month]),
                "income": income[start],
                "expenses": expenses[start],
                "balance": income[start] - expenses[start],
                "expenses_change_percentage": percentage_change(previous_expenses, expenses[start]),
            }
        )
        previous_expenses = expenses[start]

    categories = []
    for category_id, by_month in category_totals.items():
        amounts = [by_month[start] for start in month_starts]
        total = sum(amounts, ZERO)
        if not total:
            continue  # spending only in the baseline month
        categories.append(
            {
                "category_id": category_id,
                "category_name": category_names[category_id],
                "amounts": amounts,
                "total": total,
                "average": to_cents(total / months),
                # The latest month against the one before it (e.g. September vs August).
                "change_amount": amounts[-1] - amounts[-2],
                "change_percentage": percentage_change(amounts[-2], amounts[-1]),
            }
        )
    categories.sort(key=lambda category: (-category["total"], category["category_name"]))

    window_expenses = sum((expenses[start] for start in month_starts), ZERO)
    return {
        "year": year,
        "month": month,
        "months": monthly,
        "average_monthly_expenses": to_cents(window_expenses / months),
        "categories": categories,
    }
