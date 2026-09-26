"""Where the money goes: expenses grouped by merchant, at most three queries.

A merchant is a transaction's description, compared without letter case and
surrounding spaces ("ALBERT HEIJN " and "Albert Heijn" are one merchant). Receipt
scans and CSV imports store the merchant there. Expenses without a description
count in the month's total but belong to no merchant.
"""

from django.db.models import Aggregate, CharField, Count, Max, Sum
from django.db.models.functions import Lower, Trim

from apps.categories.models import TransactionType
from apps.transactions.models import Transaction

from .services import ZERO, get_month_summary, month_date_range, percentage_change, previous_month, to_cents

DEFAULT_LIMIT = 10
MAX_LIMIT = 50


class Mode(Aggregate):
    """PostgreSQL's most frequent value of a group: the spelling to show for a merchant."""

    function = "MODE"
    template = "%(function)s() WITHIN GROUP (ORDER BY %(expressions)s)"
    output_field = CharField()


def _merchant_expenses(user):
    return (
        Transaction.objects.filter(user=user, type=TransactionType.EXPENSE)
        .annotate(merchant_key=Lower(Trim("description")))
        .exclude(merchant_key="")
    )


def get_merchants(user, year: int, month: int, limit: int = DEFAULT_LIMIT) -> dict:
    current_range = month_date_range(year, month)
    top = list(
        _merchant_expenses(user)
        .filter(date__range=current_range)
        .values("merchant_key")
        .annotate(
            name=Mode(Trim("description")),
            total=Sum("base_amount"),
            transaction_count=Count("id"),
            last_date=Max("date"),
        )
        .order_by("-total", "merchant_key")[:limit]
    )

    month_total = get_month_summary(user, year, month)["total_expenses"]
    previous_totals = {}
    if top:
        previous_totals = dict(
            _merchant_expenses(user)
            .filter(date__range=month_date_range(*previous_month(year, month)))
            .filter(merchant_key__in=[row["merchant_key"] for row in top])
            .values("merchant_key")
            .annotate(total=Sum("base_amount"))
            .order_by()
            .values_list("merchant_key", "total")
        )

    merchants = []
    for row in top:
        previous_total = previous_totals.get(row["merchant_key"], ZERO)
        merchants.append(
            {
                "merchant": row["name"],
                "transaction_count": row["transaction_count"],
                "total": row["total"],
                "average": to_cents(row["total"] / row["transaction_count"]),
                "share_percentage": round(row["total"] / month_total * 100, 2) if month_total else None,
                "previous_total": previous_total,
                "change_percentage": percentage_change(previous_total, row["total"]),
                "last_date": row["last_date"],
            }
        )
    return {"year": year, "month": month, "total_expenses": month_total, "merchants": merchants}
