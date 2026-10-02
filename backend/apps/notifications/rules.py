"""The "smart" part: deciding whether something in the user's finances is worth telling them.

Each rule reads the facts from the app that owns them (budgets and spending from analytics,
payments from the recurring templates, progress from the savings goals — nothing is
recomputed here), decides, writes the text, and hands it to services.notify() with an event
key. The key makes every rule idempotent: running it again never notifies twice about the
same event. The clients decide nothing; they show the stored title and body.

Real-time rules run in the request that changed the data:
- check_budget_thresholds — after an expense or a budget is written,
- check_savings_goal — after money is added to a goal or its target changes.

Scheduled rules run hourly for every active user (run_scheduled_rules, called by
`manage.py send_scheduled_notifications`):
- send_payment_reminders — subscription and other recurring payments due soon,
- send_unusual_spending — categories clearly above their usual level this month,
- send_monthly_summary — last month in numbers, during the first days of a month,
- send_insight_notifications — important (alert) insights such as overspending.
"""

import logging
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils.dates import MONTHS
from django.utils.translation import gettext as _
from django.utils.translation import ngettext

from apps.analytics import services as analytics
from apps.analytics.anomalies import find_unusual_spending
from apps.analytics.insights import (
    BUDGET_WARNING_PERCENT,
    InsightType,
    Severity,
    generate_insights,
    whole_percent,
)
from apps.budgets.models import Budget, SavingsGoal, SavingsGoalStatus
from apps.budgets.savings import progress_percentage
from apps.categories.models import Category, TransactionType
from apps.common.i18n import in_user_language
from apps.currencies.formatting import format_money
from apps.subscriptions.models import Subscription
from apps.transactions.models import RecurringTransaction
from apps.transactions.recurrence import next_occurrence_on_or_after

from .models import NotificationKind, NotificationPreference
from .services import already_notified, get_preferences, notify

logger = logging.getLogger(__name__)

# Progress (in %) at which a savings goal notifies; FULL_PERCENT = reached.
FULL_PERCENT = 100
SAVINGS_MILESTONES = (25, 50, 75, 90, FULL_PERCENT)
# At most this many unusual-spending notifications per scheduled run, the largest excess first.
MAX_UNUSUAL_SPENDING_PER_RUN = 3
# Last month's summary is sent during the first days of the new month only — a summary
# arriving weeks late (e.g. the job was down) is noise.
MONTHLY_SUMMARY_DAYS = 7

# Budget insights are already covered by the real-time budget notifications.
_BUDGET_INSIGHT_TYPES = {InsightType.BUDGET_EXCEEDED, InsightType.BUDGET_WARNING}


# --- Real-time rules ---------------------------------------------------------


@in_user_language
def check_budget_thresholds(user, year: int, month: int) -> None:
    """Called after anything that can change a month's budget usage (expense or budget written)."""
    preferences = get_preferences(user)
    if not (preferences.budget_warnings or preferences.budget_exceeded):
        return

    month_name = str(MONTHS[month])
    for usage in analytics.get_budget_usage(user, year, month):
        is_overall = usage["category_id"] is None
        data = {"screen": "budgets", "budget_id": usage["budget_id"], "year": year, "month": month}
        used = whole_percent(usage["usage_percentage"])

        if usage["spent_amount"] > usage["budget_amount"]:
            notify(
                user,
                NotificationKind.BUDGET_EXCEEDED,
                title=_("Budget exceeded"),
                body=(
                    _("You've spent %(percent)s%% of your overall budget for %(month)s.")
                    % {"percent": used, "month": month_name}
                    if is_overall
                    else _("You've spent %(percent)s%% of your %(name)s budget for %(month)s.")
                    % {"percent": used, "name": usage["category_name"], "month": month_name}
                ),
                dedupe_key=f"budget_exceeded:{usage['budget_id']}",
                related=(Budget, usage["budget_id"]),
                data=data,
                preferences=preferences,
            )
        elif usage["usage_percentage"] >= BUDGET_WARNING_PERCENT:
            notify(
                user,
                NotificationKind.BUDGET_WARNING,
                title=_("Budget almost used"),
                body=(
                    _("You've used %(percent)s%% of your overall budget for %(month)s.")
                    % {"percent": used, "month": month_name}
                    if is_overall
                    else _("You've used %(percent)s%% of your %(name)s budget for %(month)s.")
                    % {"percent": used, "name": usage["category_name"], "month": month_name}
                ),
                dedupe_key=f"budget_warning:{usage['budget_id']}",
                related=(Budget, usage["budget_id"]),
                data=data,
                preferences=preferences,
            )


@in_user_language
def check_savings_goal(user, goal: SavingsGoal, previous_progress: Decimal) -> None:
    """Called after a goal's progress may have grown (money added, target lowered).

    Notifies the highest milestone crossed since `previous_progress`, once per goal and
    milestone. Only upward crossings count: raising the target or withdrawing money moves
    the progress back below milestones that were already celebrated, and that is no news.
    """
    if goal.status == SavingsGoalStatus.ARCHIVED:
        return
    progress = progress_percentage(goal.current_amount, goal.target_amount)
    crossed = [milestone for milestone in SAVINGS_MILESTONES if previous_progress < milestone <= progress]
    if not crossed:
        return

    milestone = crossed[-1]
    if milestone == FULL_PERCENT:
        title = _("Savings goal reached")
        body = _("You reached your %(goal)s goal of %(amount)s.") % {
            "goal": goal.name,
            "amount": format_money(goal.target_amount, goal.currency),
        }
    else:
        remaining = format_money(goal.target_amount - goal.current_amount, goal.currency)
        title = _("Savings goal progress")
        # Rounded down, so a goal that isn't reached never reads "100% saved".
        body = _("You are %(remaining)s away from your %(goal)s goal (%(percent)s%% saved).") % {
            "remaining": remaining,
            "goal": goal.name,
            "percent": int(progress),
        }
    notify(
        user,
        NotificationKind.SAVINGS_GOAL,
        title=title,
        body=body,
        dedupe_key=f"savings_goal:{goal.id}:{milestone}",
        related=(SavingsGoal, goal.id),
        data={"screen": "savings_goals", "savings_goal_id": goal.id},
    )


# --- Scheduled rules ---------------------------------------------------------


def _subscription_due_text(name: str, days_left: int) -> str:
    if days_left == 0:
        return _("%(name)s payment expected today.") % {"name": name}
    if days_left == 1:
        return _("%(name)s payment expected tomorrow.") % {"name": name}
    return ngettext(
        "%(name)s payment expected in %(days)d day.",
        "%(name)s payment expected in %(days)d days.",
        days_left,
    ) % {"name": name, "days": days_left}


def _recurring_due_text(name: str, days_left: int) -> str:
    if days_left == 0:
        return _("%(name)s is due today.") % {"name": name}
    if days_left == 1:
        return _("%(name)s is due tomorrow.") % {"name": name}
    return ngettext(
        "%(name)s is due in %(days)d day.",
        "%(name)s is due in %(days)d days.",
        days_left,
    ) % {"name": name, "days": days_left}


@in_user_language
def send_payment_reminders(user, preferences: NotificationPreference, today: date) -> None:
    """A reminder `recurring_reminder_days` (or fewer) days before each recurring expense is due.
    Subscriptions get their own kind and switch; every other recurring expense is `recurring_due`."""
    if not (preferences.subscription_reminders or preferences.recurring_reminders):
        return
    recurring_expenses = RecurringTransaction.objects.filter(user=user, type=TransactionType.EXPENSE, is_active=True)
    for recurring in recurring_expenses:
        occurrence = next_occurrence_on_or_after(recurring, today)
        if occurrence is None:
            continue
        days_left = (occurrence - today).days
        if days_left > preferences.recurring_reminder_days:
            continue

        # One reminder per payment, even if the item is turned into a subscription meanwhile.
        dedupe_key = f"recurring_due:{recurring.id}:{occurrence.isoformat()}"
        if recurring.is_subscription:
            notify(
                user,
                NotificationKind.SUBSCRIPTION_DUE,
                title=_("Subscription payment"),
                body=_subscription_due_text(recurring.name, days_left),
                dedupe_key=dedupe_key,
                related=(Subscription, recurring.id),
                data={"screen": "subscriptions", "subscription_id": recurring.id, "date": occurrence.isoformat()},
                preferences=preferences,
            )
        else:
            notify(
                user,
                NotificationKind.RECURRING_DUE,
                title=_("Upcoming payment"),
                body=_recurring_due_text(recurring.name, days_left),
                dedupe_key=dedupe_key,
                related=(RecurringTransaction, recurring.id),
                data={"screen": "recurring", "recurring_id": recurring.id, "date": occurrence.isoformat()},
                preferences=preferences,
            )


@in_user_language
def send_unusual_spending(user, preferences: NotificationPreference, today: date) -> None:
    """Categories spending clearly more than usual by this day of the month (see
    apps/analytics/anomalies.py for what "usual" means). Once per category and month."""
    if not preferences.unusual_spending:
        return
    sent = 0
    for item in find_unusual_spending(user, today):
        if sent == MAX_UNUSUAL_SPENDING_PER_RUN:
            break
        notification = notify(
            user,
            NotificationKind.UNUSUAL_SPENDING,
            title=_("Unusual spending"),
            body=_(
                "Your %(name)s expenses increased by %(percent)s%% compared to your usual spending so far this month."
            )
            % {"name": item.category_name, "percent": whole_percent(item.increase_percentage)},
            dedupe_key=f"unusual_spending:{item.category_id}:{today:%Y-%m}",
            related=(Category, item.category_id),
            data={"screen": "transactions", "category_id": item.category_id, "year": today.year, "month": today.month},
            preferences=preferences,
        )
        if notification is not None:
            sent += 1


def _spending_change_sentence(change: Decimal | None, compared_month: str) -> str:
    if change is None:  # nothing spent in the compared month: no baseline
        return ""
    rounded = whole_percent(abs(change))
    if rounded == "0":
        return " " + _("Spending was about the same as in %(month)s.") % {"month": compared_month}
    if change > 0:
        return " " + _("Spending was %(percent)s%% higher than in %(month)s.") % {
            "percent": rounded,
            "month": compared_month,
        }
    return " " + _("Spending was %(percent)s%% lower than in %(month)s.") % {
        "percent": rounded,
        "month": compared_month,
    }


@in_user_language
def send_monthly_summary(user, preferences: NotificationPreference, today: date) -> None:
    """Last month's spending and income, compared with the month before. Skipped for a month
    without transactions (e.g. before the user signed up)."""
    if not preferences.monthly_summary or today.day > MONTHLY_SUMMARY_DAYS:
        return
    year, month = analytics.previous_month(today.year, today.month)
    dedupe_key = f"monthly_summary:{year}-{month:02d}"
    if already_notified(user, dedupe_key):
        return  # the scheduled job runs hourly; the two summaries below are only computed once

    summary = analytics.get_month_summary(user, year, month)
    if not summary["transaction_count"]:
        return
    before = analytics.get_month_summary(user, *analytics.previous_month(year, month))

    currency = user.base_currency
    month_name = str(MONTHS[month])
    spent = format_money(summary["total_expenses"], currency)
    if summary["total_income"]:
        text = _("You spent %(spent)s and earned %(earned)s in %(month)s.") % {
            "spent": spent,
            "earned": format_money(summary["total_income"], currency),
            "month": month_name,
        }
    else:
        text = _("You spent %(spent)s in %(month)s.") % {"spent": spent, "month": month_name}
    change = analytics.percentage_change(before["total_expenses"], summary["total_expenses"])
    text += _spending_change_sentence(change, str(MONTHS[before["month"]]))

    notify(
        user,
        NotificationKind.MONTHLY_SUMMARY,
        title=_("Your %(month)s summary") % {"month": month_name},
        body=text,
        dedupe_key=dedupe_key,
        data={"screen": "dashboard", "year": year, "month": month},
        preferences=preferences,
    )


def is_important_insight(insight) -> bool:
    return insight.severity == Severity.ALERT and insight.type not in _BUDGET_INSIGHT_TYPES


@in_user_language
def send_insight_notifications(user, preferences: NotificationPreference, today: date) -> None:
    if not preferences.insights:
        return
    for insight in generate_insights(user, today.year, today.month, today=today):
        if not is_important_insight(insight):
            continue
        notify(
            user,
            NotificationKind.INSIGHT,
            title=_("Financial insight"),
            body=insight.message,
            # Once per insight per month, however often the scheduled job runs.
            dedupe_key=f"insight:{insight.id}:{today:%Y-%m}",
            related=(Category, insight.category_id) if insight.category_id else None,
            data={"screen": "dashboard", "year": today.year, "month": today.month},
            preferences=preferences,
        )


SCHEDULED_RULES = (
    send_payment_reminders,
    send_unusual_spending,
    send_monthly_summary,
    send_insight_notifications,
)


def run_scheduled_rules(today: date) -> int:
    """Every scheduled rule for every active user — with or without a phone, since the in-app
    inbox shows the notifications too. Returns the number of users processed.

    One user's failure (e.g. unexpected data) is logged and doesn't stop the others.
    """
    processed = 0
    for user in get_user_model().objects.filter(is_active=True).order_by("id").iterator():
        try:
            preferences = get_preferences(user)
            for rule in SCHEDULED_RULES:
                rule(user, preferences, today)
        except Exception:
            logger.exception("Scheduled notification rules failed for user %s", user.pk)
            continue
        processed += 1
    return processed
