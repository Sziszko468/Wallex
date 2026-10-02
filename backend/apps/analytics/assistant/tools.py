"""The assistant's tools — the only way the model can see financial data.

Each tool validates the model's arguments (a DRF serializer, like any other API input), runs
the services the dashboard already uses — always for the signed-in user — and returns
aggregated figures as JSON:

- money as decimal strings in `currency` (the base currency unless a row names another one)
- never ids, the user's name or e-mail, or individual transactions
- `has_data: false` with a `note` when there is nothing to base an answer on, so the model
  says so instead of guessing

Tools only read. Adding one = a runner, an argument serializer and an entry in TOOLS.
"""

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from django.utils.dates import MONTHS
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy
from rest_framework import serializers

from apps.budgets import savings
from apps.budgets.models import SavingsGoal
from apps.categories.defaults import display_name
from apps.categories.models import Category, TransactionType
from apps.categories.rules import normalize_text
from apps.currencies.rates import Converter
from apps.subscriptions import services as subscription_services
from apps.subscriptions.models import Subscription

from .. import merchants, services
from ..services import Against

logger = logging.getLogger(__name__)

TOP_CATEGORIES = 5
MAX_UPCOMING_PAYMENTS = 20


# --- Output helpers ----------------------------------------------------------------------


def _money(value: Decimal | None) -> str | None:
    return None if value is None else str(value)


def _percent(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def month_label(year: int, month: int) -> str:
    return f"{MONTHS[month]} {year}"


def _period(year: int, month: int, today: date) -> dict:
    start, end = services.month_date_range(year, month)
    if start > today:
        state = "future"
    elif end >= today:
        state = "in_progress"
    else:
        state = "complete"
    period = {"label": month_label(year, month), "from": start.isoformat(), "to": end.isoformat(), "state": state}
    if state == "in_progress":
        period["data_until"] = today.isoformat()
    return period


def _no_data(note: str, **fields) -> dict:
    return {**fields, "has_data": False, "note": note}


def _future(period: dict, currency: str) -> dict:
    return _no_data(
        f"{period['label']} hasn't started yet, so there is no data for it.", period=period, currency=currency
    )


def _matches(query: str, name: str) -> bool:
    """Case- and accent-insensitive; either may contain the other ("Japan Trip goal" ↔ "Japan trip")."""
    wanted, candidate = normalize_text(query).strip(), normalize_text(name).strip()
    return bool(wanted and candidate) and (wanted in candidate or candidate in wanted)


# --- Arguments ---------------------------------------------------------------------------


class MonthArguments(serializers.Serializer):
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)


class CategoryArguments(MonthArguments):
    category = serializers.CharField(required=False, max_length=100)


class MerchantArguments(MonthArguments):
    merchant = serializers.CharField(required=False, max_length=100)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=merchants.MAX_LIMIT)


class ComparisonArguments(MonthArguments):
    against = serializers.ChoiceField(choices=Against.CHOICES, required=False)


class GoalArguments(serializers.Serializer):
    goal = serializers.CharField(required=False, max_length=100)


class NoArguments(serializers.Serializer):
    pass


_YEAR = {"type": "integer", "description": "Calendar year, e.g. 2026."}
_MONTH = {"type": "integer", "description": "Month number, 1-12."}


def _month_schema(**extra: dict) -> dict:
    return {
        "type": "object",
        "properties": {"year": _YEAR, "month": _MONTH, **extra},
        "required": ["year", "month"],
        "additionalProperties": False,
    }


# --- Runners (user, validated arguments, today) -> JSON-ready dict -------------------------


def _category_row(row: dict) -> dict:
    return {
        "category": row["category_name"],
        "amount": _money(row["amount"]),
        "share_percentage": _percent(row["percentage"]),
    }


def monthly_spending(user, args: dict, today: date) -> dict:
    year, month = args["year"], args["month"]
    period, currency = _period(year, month, today), user.base_currency
    if period["state"] == "future":
        return _future(period, currency)

    summary = services.get_month_summary(user, year, month)
    if not summary["transaction_count"]:
        return _no_data(f"No transactions are recorded for {period['label']}.", period=period, currency=currency)

    breakdown = services.get_category_breakdown(user, year, month)
    return {
        "period": period,
        "currency": currency,
        "has_data": True,
        "total_expenses": _money(summary["total_expenses"]),
        "total_income": _money(summary["total_income"]),
        "balance": _money(summary["balance"]),
        "transaction_count": summary["transaction_count"],
        "top_expense_categories": [_category_row(row) for row in breakdown[:TOP_CATEGORIES]],
    }


def category_spending(user, args: dict, today: date) -> dict:
    year, month = args["year"], args["month"]
    period, currency = _period(year, month, today), user.base_currency
    if period["state"] == "future":
        return _future(period, currency)

    rows = [_category_row(row) for row in services.get_category_breakdown(user, year, month)]
    spent_in = {row["category"] for row in rows}
    all_expense_categories = Category.objects.filter(user=user, type=TransactionType.EXPENSE).values_list(
        "name", flat=True
    )
    without_spending = sorted(set(all_expense_categories) - spent_in)

    result = {
        "period": period,
        "currency": currency,
        "has_data": bool(rows),
        "total_expenses": _money(sum((Decimal(row["amount"]) for row in rows), Decimal("0.00"))),
        "categories": rows,
        "expense_categories_without_spending": without_spending,
    }
    if not rows:
        result["note"] = f"No expenses are recorded for {period['label']}."
    if requested := args.get("category"):
        matching = [row for row in rows if _matches(requested, row["category"])] + [
            {"category": name, "amount": "0.00", "share_percentage": 0.0}
            for name in without_spending
            if _matches(requested, name)
        ]
        result["requested_category"] = requested
        result["matching_categories"] = matching
        if not matching:
            result["has_data"] = False
            result["note"] = (
                f'The user has no expense category matching "{requested}". Their expense categories are '
                "those in `categories` and `expense_categories_without_spending`."
            )
    return result


def merchant_spending(user, args: dict, today: date) -> dict:
    year, month = args["year"], args["month"]
    period, currency = _period(year, month, today), user.base_currency
    if period["state"] == "future":
        return _future(period, currency)

    requested = args.get("merchant")
    limit = merchants.MAX_LIMIT if requested else args.get("limit", merchants.DEFAULT_LIMIT)
    found = merchants.get_merchants(user, year, month, limit=limit)
    rows = [
        {
            "merchant": row["merchant"],
            "total": _money(row["total"]),
            "payments": row["transaction_count"],
            "average_payment": _money(row["average"]),
            "share_percentage": _percent(row["share_percentage"]),
            "previous_month_total": _money(row["previous_total"]),
            "change_percentage": _percent(row["change_percentage"]),
            "last_payment_date": row["last_date"].isoformat(),
        }
        for row in found["merchants"]
    ]
    if not rows:
        return _no_data(
            f"No expenses with a merchant (transaction description) are recorded for {period['label']}.",
            period=period,
            currency=currency,
        )

    result = {
        "period": period,
        "currency": currency,
        "has_data": True,
        "total_expenses": _money(found["total_expenses"]),
        "merchants": rows,
        "note": (
            "Merchants come from transaction descriptions; expenses without a description belong to no "
            "merchant, so merchant totals can add up to less than total_expenses."
        ),
    }
    if requested:
        result["requested_merchant"] = requested
        result["merchants"] = [row for row in rows if _matches(requested, row["merchant"])]
        if not result["merchants"]:
            result["has_data"] = False
            result["note"] = (
                f'No merchant matching "{requested}" among the {len(rows)} largest merchants of {period["label"]}.'
            )
    return result


def budget_status(user, args: dict, today: date) -> dict:
    year, month = args["year"], args["month"]
    period, currency = _period(year, month, today), user.base_currency
    if period["state"] == "future":
        return _future(period, currency)

    usage = services.get_budget_usage(user, year, month, today)
    if not usage:
        return _no_data(f"No budgets are set for {period['label']}.", period=period, currency=currency)

    return {
        "period": period,
        "currency": currency,
        "has_data": True,
        "month_elapsed_percentage": float(round(services.elapsed_fraction(year, month, today) * 100, 1)),
        "budgets": [
            {
                "budget": entry["category_name"],
                "covers": "a category" if entry["category_id"] else "all expenses",
                "limit": _money(entry["budget_amount"]),
                "spent": _money(entry["spent_amount"]),
                "remaining": _money(entry["remaining_amount"]),
                "usage_percentage": _percent(entry["usage_percentage"]),
                "expected_spending_by_now": _money(entry["expected_to_date"]),
                "status": entry["status"],
            }
            for entry in usage
        ],
    }


def subscription_costs(user, args: dict, today: date) -> dict:
    currency = user.base_currency
    subscriptions = list(Subscription.objects.filter(user=user).select_related("category"))
    if not subscriptions:
        return _no_data("The user has no subscriptions recorded.", as_of=today.isoformat(), currency=currency)

    converter = Converter(currency, today)
    rows = []
    for subscription in subscriptions:
        cost = subscription_services.cost_of(subscription, converter)
        status = subscription_services.status_of(subscription, today)
        next_payment = subscription_services.next_payment_date(subscription, today)
        # Active first, then the most expensive; costs that can't be converted last.
        base_monthly = cost.base_monthly
        sort_key = (
            status != subscription_services.Status.ACTIVE,
            base_monthly is None,
            -(base_monthly or 0),
            subscription.name,
        )
        rows.append(
            (
                sort_key,
                {
                    "name": subscription.name,
                    "category": display_name(subscription.category.name),
                    "status": status,
                    "price": _money(subscription.amount),
                    "currency": subscription.currency,
                    "billed": subscription.frequency,
                    "monthly_cost": _money(cost.monthly),
                    "yearly_cost": _money(cost.yearly),
                    "monthly_cost_in_base_currency": _money(cost.base_monthly),
                    "yearly_cost_in_base_currency": _money(cost.base_yearly),
                    "next_payment_date": next_payment.isoformat() if next_payment else None,
                },
            )
        )

    summary = subscription_services.get_summary(user, today)
    return {
        "as_of": today.isoformat(),
        "currency": currency,
        "has_data": True,
        "active_count": summary["active_count"],
        "paused_count": summary["paused_count"],
        "ended_count": summary["ended_count"],
        "active_monthly_total": _money(summary["monthly_total"]),
        "active_yearly_total": _money(summary["yearly_total"]),
        "active_by_category": [
            {
                "category": entry["category_name"],
                "monthly_total": _money(entry["monthly_total"]),
                "subscriptions": entry["subscription_count"],
                "share_percentage": _percent(entry["percentage"]),
            }
            for entry in summary["by_category"]
        ],
        "payments_due_next_30_days": [
            {
                "subscription": payment.subscription.name,
                "date": payment.date.isoformat(),
                "amount": _money(payment.base_amount),
            }
            for payment in summary["upcoming"][:MAX_UPCOMING_PAYMENTS]
        ],
        # Subscriptions billed in these currencies have no recent exchange rate: not in the totals.
        "currencies_without_exchange_rate": summary["unconverted_currencies"],
        "subscriptions": [row for _, row in sorted(rows, key=lambda item: item[0])],
    }


def savings_progress(user, args: dict, today: date) -> dict:
    currency = user.base_currency
    goals = list(SavingsGoal.objects.filter(user=user))
    if not goals:
        return _no_data("The user has no savings goals.", as_of=today.isoformat(), currency=currency)

    converter = Converter(currency, today)
    rows = []
    for goal in goals:
        figures = savings.figures_of(goal, today, converter)
        rows.append(
            {
                "name": goal.name,
                "status": goal.status,
                "currency": goal.currency,
                "saved": _money(goal.current_amount),
                "target": _money(goal.target_amount),
                "progress_percentage": _percent(figures.progress_percentage),
                "still_needed": _money(figures.remaining_amount),
                "target_date": goal.target_date.isoformat() if goal.target_date else None,
                "days_left": figures.days_left,
                "monthly_saving_needed": _money(figures.monthly_needed),
                "saved_in_base_currency": _money(figures.base_current_amount),
                "target_in_base_currency": _money(figures.base_target_amount),
            }
        )

    summary = savings.get_summary(user, today)
    result = {
        "as_of": today.isoformat(),
        "currency": currency,
        "has_data": True,
        "totals_of_goals_not_archived": {
            "active": summary["active_count"],
            "completed": summary["completed_count"],
            "archived": summary["archived_count"],
            "saved": _money(summary["total_saved"]),
            "target": _money(summary["total_target"]),
            "progress_percentage": _percent(summary["progress_percentage"]),
            "currencies_without_exchange_rate": summary["unconverted_currencies"],
        },
        "goals": rows,
    }
    if requested := args.get("goal"):
        result["requested_goal"] = requested
        result["goals"] = [row for row in rows if _matches(requested, row["name"])]
        if not result["goals"]:
            result.update(
                has_data=False,
                note=f'The user has no savings goal matching "{requested}". Their goals: '
                + ", ".join(f'"{row["name"]}"' for row in rows)
                + ".",
            )
    return result


def _period_totals(label: str, period: tuple[date, date], summary: dict) -> dict:
    return {
        "label": label,
        "from": period[0].isoformat(),
        "to": period[1].isoformat(),
        "total_expenses": _money(summary["total_expenses"]),
        "total_income": _money(summary["total_income"]),
        "balance": _money(summary["balance"]),
        "transaction_count": summary["transaction_count"],
    }


def month_comparison(user, args: dict, today: date) -> dict:
    year, month = args["year"], args["month"]
    against = args.get("against", Against.PREVIOUS_MONTH)
    currency = user.base_currency
    current_range, compared_range, month_to_date = services.comparison_ranges(year, month, today, against)
    if current_range[0] > today:
        return _future(_period(year, month, today), currency)

    current = services.get_period_summary(user, *current_range)
    compared = services.get_period_summary(user, *compared_range)
    result = {
        "currency": currency,
        "against": against,
        "month_to_date": month_to_date,
        "current_period": _period_totals(month_label(year, month), current_range, current),
        "compared_period": _period_totals(
            month_label(*services.compared_month(year, month, against)), compared_range, compared
        ),
    }
    missing = [
        side["label"]
        for side, summary in ((result["current_period"], current), (result["compared_period"], compared))
        if not summary["transaction_count"]
    ]
    if missing:
        return _no_data(
            f"No transactions are recorded for {' and '.join(missing)}, so there is nothing to compare.", **result
        )

    fields = ("total_expenses", "total_income", "balance")
    categories = services.get_category_comparison(user, current_range, compared_range)
    result.update(
        has_data=True,
        difference={field: _money(current[field] - compared[field]) for field in fields},
        percentage_change={
            field: _percent(services.percentage_change(compared[field], current[field])) for field in fields
        },
        expense_categories=[
            {
                "category": row["category_name"],
                "current": _money(row["current_amount"]),
                "compared": _money(row["previous_amount"]),
                "change": _money(row["change_amount"]),
                "change_percentage": _percent(row["change_percentage"]),
            }
            for row in sorted(categories, key=lambda row: (-row["change_amount"], row["category_name"]))
        ],
    )
    if month_to_date:
        result["note"] = (
            f"{month_label(year, month)} is still in progress: both periods cover only days 1-{today.day} "
            "of their month, so the comparison is fair."
        )
    return result


# --- Registry ----------------------------------------------------------------------------


@dataclass(frozen=True)
class Tool:
    name: str
    label: str  # what the apps show under an answer ("Based on: Spending by category")
    description: str
    input_schema: dict
    arguments: type[serializers.Serializer]
    run: Callable[[Any, dict, date], dict]

    def definition(self) -> dict:
        return {"name": self.name, "description": self.description, "input_schema": self.input_schema}


TOOLS: dict[str, Tool] = {
    tool.name: tool
    for tool in [
        Tool(
            name="get_monthly_spending",
            label=gettext_lazy("Monthly spending"),
            description=(
                "Totals of one calendar month: total expenses, total income, balance (income minus expenses), "
                "number of transactions, and the five expense categories with the most spending. Call this for "
                "questions about how much the user spent or earned in a month, their balance, or what they spent "
                "the most on."
            ),
            input_schema=_month_schema(),
            arguments=MonthArguments,
            run=monthly_spending,
        ),
        Tool(
            name="get_category_spending",
            label=gettext_lazy("Spending by category"),
            description=(
                "One month's expenses per category (the user's own categories), largest first, with each "
                "category's share of the month's expenses; also lists the expense categories with no spending "
                "that month. Pass `category` to look one up by name (case- and accent-insensitive, partial names "
                "match). Call this for questions about spending in a category, such as restaurants, groceries or "
                "transport. If no category matches what the user asked about, tell them and name the existing "
                "categories instead of silently using a different one."
            ),
            input_schema=_month_schema(
                category={"type": "string", "description": 'Optional: a category name to look up, e.g. "Food".'}
            ),
            arguments=CategoryArguments,
            run=category_spending,
        ),
        Tool(
            name="get_merchant_spending",
            label=gettext_lazy("Spending by merchant"),
            description=(
                "One month's expenses per merchant (shop, company or payee, taken from transaction descriptions), "
                "largest first: total, number of payments, average payment, share of the month's expenses and the "
                "change against the previous month. Pass `merchant` to look one up by name. Call this for "
                "questions about where — at which shops or companies — the user spends money."
            ),
            input_schema=_month_schema(
                merchant={"type": "string", "description": 'Optional: a merchant name to look up, e.g. "Tesco".'},
                limit={
                    "type": "integer",
                    "description": f"How many merchants, largest first (1-{merchants.MAX_LIMIT}). Default {merchants.DEFAULT_LIMIT}.",
                },
            ),
            arguments=MerchantArguments,
            run=merchant_spending,
        ),
        Tool(
            name="get_budget_status",
            label=gettext_lazy("Budgets"),
            description=(
                "The user's budgets (monthly spending limits) for one month: limit, spent, remaining, usage in %, "
                "what spending evenly over the month would allow by today, and a status — on_track (within the "
                "month's pace), ahead_of_pace (spending faster than the month passes, not over the limit yet) or "
                'over_budget (limit exceeded). A budget covering all expenses is named "Overall". Call this for '
                "questions about budgets, limits or overspending."
            ),
            input_schema=_month_schema(),
            arguments=MonthArguments,
            run=budget_status,
        ),
        Tool(
            name="get_subscription_costs",
            label=gettext_lazy("Subscriptions"),
            description=(
                "The user's subscriptions (streaming, software, gym, phone…) as of today: each one's price and "
                "billing cycle, monthly and yearly cost (in its own currency and in the base currency), status "
                "(active, paused, ended) and next payment date — active ones first, most expensive first — plus "
                "totals of the active ones, totals per category and the payments due in the next 30 days. Call "
                "this for questions about subscriptions, recurring services or what they cost."
            ),
            input_schema={"type": "object", "properties": {}, "additionalProperties": False},
            arguments=NoArguments,
            run=subscription_costs,
        ),
        Tool(
            name="get_savings_progress",
            label=gettext_lazy("Savings goals"),
            description=(
                "The user's savings goals as of today: saved amount, target, progress in %, amount still needed, "
                "target date, days left and how much to save per month to reach it in time (in the goal's own "
                "currency), plus totals in the base currency. Pass `goal` to look one up by name. Call this for "
                "questions about savings goals or saving progress."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "goal": {"type": "string", "description": 'Optional: a goal name to look up, e.g. "Japan trip".'}
                },
                "additionalProperties": False,
            },
            arguments=GoalArguments,
            run=savings_progress,
        ),
        Tool(
            name="get_month_comparison",
            label=gettext_lazy("Month comparison"),
            description=(
                "Compares a month with the previous month (default) or with the same month a year earlier: "
                "expenses, income and balance of both periods, their differences and % changes, and every expense "
                "category's change, largest increase first. For the current month, which is still in progress, "
                "both periods cover the same days of their month only. Call this for questions about change: why "
                "spending went up or down, or where the user spent more or less than before."
            ),
            input_schema=_month_schema(
                against={
                    "type": "string",
                    "enum": [Against.PREVIOUS_MONTH, Against.PREVIOUS_YEAR],
                    "description": "previous_month (default) or previous_year: the same month one year earlier.",
                }
            ),
            arguments=ComparisonArguments,
            run=month_comparison,
        ),
    ]
}

# Always sent in this order: the tool list is part of the cached prompt prefix.
TOOL_DEFINITIONS = [tool.definition() for tool in TOOLS.values()]


# --- Running a tool call -----------------------------------------------------------------


@dataclass(frozen=True)
class ToolResult:
    content: str  # JSON text for the model
    is_error: bool = False
    # What the answer can say it's based on: {"tool": name, "arguments": validated arguments}.
    source: dict | None = None


def _error(problem: object) -> ToolResult:
    return ToolResult(json.dumps({"error": problem}, ensure_ascii=False), is_error=True)


def run_tool(user, name: str, arguments: object, today: date) -> ToolResult:
    """Runs one tool call of the model for `user`. Bad calls become error results the model can
    correct; they never raise."""
    tool = TOOLS.get(name)
    if tool is None:
        return _error(f"Unknown tool {name!r}. Available tools: {', '.join(TOOLS)}.")
    if not isinstance(arguments, dict):
        return _error("Arguments must be a JSON object.")
    serializer = tool.arguments(data=arguments)
    if not serializer.is_valid():
        return _error({"invalid_arguments": serializer.errors})

    validated = dict(serializer.validated_data)
    try:
        data = tool.run(user, validated, today)
    except Exception:  # a bug or a database problem: the model tells the user, the log keeps the trace
        logger.exception("Assistant tool %s failed", name)
        return _error("The data could not be loaded right now.")
    return ToolResult(json.dumps(data, ensure_ascii=False), source={"tool": name, "arguments": validated})


def describe_source(source: dict) -> tuple[str, str | None]:
    """(label, detail) of a stored source, e.g. ("Month comparison", "September 2026 vs August 2026")."""
    name, arguments = source.get("tool", ""), source.get("arguments") or {}
    tool = TOOLS.get(name)
    label = str(tool.label) if tool else name
    parts = []
    if "year" in arguments and "month" in arguments:
        period = month_label(arguments["year"], arguments["month"])
        if name == "get_month_comparison":
            against = arguments.get("against", Against.PREVIOUS_MONTH)
            period = _("%(period)s vs %(compared)s") % {
                "period": period,
                "compared": month_label(*services.compared_month(arguments["year"], arguments["month"], against)),
            }
        parts.append(period)
    for key in ("category", "merchant", "goal"):
        if arguments.get(key):
            parts.append(str(arguments[key]))
    return label, " · ".join(parts) or None
