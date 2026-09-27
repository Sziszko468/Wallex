"""Achievements: milestones earned from the user's own data, decided on the server.

Same shape as insights.py: every fact is loaded once into ``AchievementFacts`` (a fixed
number of queries, through the existing services — nothing here re-implements how
savings, budgets or spending are computed), then each rule is a pure function of those
facts. ``evaluate()`` stores the outcome: the progress of every achievement, and the moment
one is unlocked. Unlocking is permanent — a streak that breaks later doesn't take it back.

Tracking days are the (UTC) days on which the user *recorded* a transaction (created_at),
not the booking dates: back-dating a dozen receipts in one sitting is one day of tracking.
"""

import calendar
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.budgets import savings
from apps.budgets.models import Budget, SavingsGoal
from apps.categories.models import TransactionType
from apps.currencies.rates import Converter
from apps.transactions.models import Transaction

from .models import Achievement, AchievementRule, UserAchievement
from .services import BudgetStatus, budget_variance

ZERO = Decimal("0.00")
WHOLE_MONTH = Decimal(1)


@dataclass(frozen=True)
class AchievementFacts:
    today: date
    # Distinct days a transaction was recorded on, ascending.
    tracking_days: list[date]
    # Money in the savings goals that aren't archived (as on the Savings page), per currency
    # it may be needed in; None when there was no exchange rate to convert it.
    saved: dict[str, Decimal | None]
    # The latest finished month's budget that wasn't exceeded (with expenses tracked that month).
    budget_kept: dict | None
    # The latest savings goal that reached its target.
    completed_goal: str | None


@dataclass(frozen=True)
class Progress:
    value: Decimal
    context: dict = field(default_factory=dict)


# --- Facts ------------------------------------------------------------------------------------


def _tracking_days(user) -> list[date]:
    return list(
        Transaction.objects.filter(user=user)
        .annotate(day=TruncDate("created_at"))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )


def _saved_in(user, today: date, currencies: set[str]) -> dict[str, Decimal | None]:
    """The Savings page's total (base currency), expressed in each currency a target uses."""
    if not currencies:
        return {}
    total_saved = savings.get_summary(user, today)["total_saved"]
    return {
        currency: Converter(currency, today).to_base(total_saved, user.base_currency) for currency in currencies
    }


def _latest_kept_budget(user, today: date) -> dict | None:
    """The most recent budget of a finished month that ended within its limit — judged by the
    dashboard's own rule (not over budget), in a month the user tracked expenses in."""
    finished = (
        Budget.objects.filter(user=user)
        .filter(Q(year__lt=today.year) | Q(year=today.year, month__lt=today.month))
        .select_related("category")
        .with_spent()
        .order_by("-year", "-month", "id")
    )
    tracked_months = {
        (day.year, day.month)
        for day in Transaction.objects.filter(
            user=user, type=TransactionType.EXPENSE, date__lt=today.replace(day=1)
        ).dates("date", "month")
    }
    for budget in finished:
        if (budget.year, budget.month) not in tracked_months:
            continue  # an untouched budget isn't an achievement
        if budget_variance(budget.amount, budget.spent, WHOLE_MONTH)["status"] != BudgetStatus.OVER_BUDGET:
            return {
                "category_name": budget.category.name if budget.category_id else "Overall",
                "year": budget.year,
                "month": budget.month,
            }
    return None


def load_facts(user, today: date, catalog: list[Achievement]) -> AchievementFacts:
    money_currencies = {
        achievement.target_currency for achievement in catalog if achievement.rule == AchievementRule.SAVINGS_TOTAL
    }
    return AchievementFacts(
        today=today,
        tracking_days=_tracking_days(user),
        saved=_saved_in(user, today, money_currencies),
        budget_kept=_latest_kept_budget(user, today),
        completed_goal=(
            SavingsGoal.objects.filter(user=user).reached().order_by("-updated_at").values_list("name", flat=True).first()
        ),
    )


# --- Streaks ----------------------------------------------------------------------------------


def longest_streak(days: list[date]) -> int:
    """Most consecutive days in `days` (sorted, distinct)."""
    longest = run = 0
    previous = None
    for day in days:
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = day
    return longest


def current_streak(days: list[date], today: date) -> int:
    """The run of consecutive days ending today — or yesterday, since today isn't over yet."""
    if not days or days[-1] < today - timedelta(days=1):
        return 0
    run = 1
    for later, earlier in zip(reversed(days), list(reversed(days))[1:]):
        if later - earlier != timedelta(days=1):
            break
        run += 1
    return run


# --- Rules: facts → progress (None: can't be judged now, keep the stored progress) --------------


def first_transaction_rule(facts: AchievementFacts, achievement: Achievement) -> Progress:
    return Progress(Decimal(1) if facts.tracking_days else ZERO)


def tracking_streak_rule(facts: AchievementFacts, achievement: Achievement) -> Progress:
    if longest_streak(facts.tracking_days) >= achievement.target:
        return Progress(achievement.target)
    return Progress(Decimal(current_streak(facts.tracking_days, facts.today)))


def savings_total_rule(facts: AchievementFacts, achievement: Achievement) -> Progress | None:
    saved = facts.saved.get(achievement.target_currency)
    return None if saved is None else Progress(saved)


def budget_kept_rule(facts: AchievementFacts, achievement: Achievement) -> Progress:
    if facts.budget_kept is None:
        return Progress(ZERO)
    return Progress(Decimal(1), context=facts.budget_kept)


def goal_completed_rule(facts: AchievementFacts, achievement: Achievement) -> Progress:
    if facts.completed_goal is None:
        return Progress(ZERO)
    return Progress(Decimal(1), context={"goal_name": facts.completed_goal})


RULES: dict[str, Callable[[AchievementFacts, Achievement], Progress | None]] = {
    AchievementRule.FIRST_TRANSACTION: first_transaction_rule,
    AchievementRule.TRACKING_STREAK: tracking_streak_rule,
    AchievementRule.SAVINGS_TOTAL: savings_total_rule,
    AchievementRule.BUDGET_KEPT: budget_kept_rule,
    AchievementRule.GOAL_COMPLETED: goal_completed_rule,
}


# --- Evaluation -------------------------------------------------------------------------------


@transaction.atomic
def evaluate(user, today: date) -> list[UserAchievement]:
    """Brings the user's achievements up to date and returns all of them, in catalog order.

    Idempotent: with unchanged data it writes nothing. A fixed number of queries.
    """
    catalog = list(Achievement.objects.all())
    facts = load_facts(user, today, catalog)
    stored = {record.achievement_id: record for record in UserAchievement.objects.filter(user=user)}
    now = timezone.now()
    records, created, changed = [], [], []

    for achievement in catalog:
        record = stored.get(achievement.id)
        if record is None:
            record = UserAchievement(user=user, achievement=achievement)
            created.append(record)
        record.achievement = achievement
        records.append(record)
        if record.is_unlocked:
            continue  # permanent

        progress = RULES[achievement.rule](facts, achievement)
        if progress is None:
            continue
        value = min(progress.value, achievement.target).quantize(Decimal("0.01"))
        before = (record.progress, record.unlocked_at, record.context)
        record.progress = value
        if value >= achievement.target:
            record.unlocked_at = now
            record.context = progress.context
        if record.pk is not None and (record.progress, record.unlocked_at, record.context) != before:
            changed.append(record)

    if created:
        UserAchievement.objects.bulk_create(created, ignore_conflicts=True)
    if changed:
        UserAchievement.objects.bulk_update(changed, ["progress", "unlocked_at", "context", "updated_at"])
    return records


def mark_seen(user) -> int:
    """Marks every unlocked achievement as seen; returns how many were new."""
    return UserAchievement.objects.filter(user=user, unlocked_at__isnull=False, seen_at__isnull=True).update(
        seen_at=timezone.now()
    )


def title_and_detail(record: UserAchievement) -> tuple[str, str | None]:
    """The unlocked achievement as the user earned it: "Stayed Under Food Budget" · "August 2026"."""
    achievement, context = record.achievement, record.context
    if achievement.rule == AchievementRule.BUDGET_KEPT and context.get("category_name"):
        month = f"{calendar.month_name[context['month']]} {context['year']}"
        return f"Stayed Under {context['category_name']} Budget", month
    if achievement.rule == AchievementRule.GOAL_COMPLETED and context.get("goal_name"):
        return achievement.name, context["goal_name"]
    return achievement.name, None


def progress_percentage(record: UserAchievement) -> float:
    return float(min(round(record.progress / record.achievement.target * 100, 2), Decimal(100)))
