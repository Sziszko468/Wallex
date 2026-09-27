"""Savings goals: progress figures, totals, and moving money in and out.

Amounts stay in each goal's own currency. Values in the user's base currency are for
display and totals only, at the latest ECB rate (apps.currencies.rates.Converter): a goal
whose currency has no recent rate is left out of the totals and reported, never guessed.
"""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_CEILING, Decimal
from enum import IntEnum

from django.db import transaction

from apps.currencies.rates import MAX_AMOUNT, Converter, minor_unit

from .models import ZERO, SavingsGoal, SavingsGoalStatus


def progress_percentage(current: Decimal, target: Decimal) -> Decimal:
    """Saved / target × 100, 2 decimals; above 100 when more than the target is saved."""
    return round(current / target * 100, 2)


def full_months_between(start: date, end: date) -> int:
    """Whole calendar months from `start` to `end`: Sep 27 → Mar 27 is 6, Sep 27 → Mar 15 is 5."""
    months = (end.year - start.year) * 12 + (end.month - start.month)
    return months - 1 if end.day < start.day else months


def monthly_needed(goal: SavingsGoal, today: date) -> Decimal | None:
    """What to put aside each month to reach the target by `target_date`, rounded up to the
    currency's unit so that saving it really gets there. None when there is nothing to plan:
    no target date, the date has passed, or the goal isn't active."""
    if goal.status != SavingsGoalStatus.ACTIVE or goal.target_date is None or goal.target_date < today:
        return None
    months = max(1, full_months_between(today, goal.target_date))
    remaining = goal.target_amount - goal.current_amount
    return (remaining / months).quantize(minor_unit(goal.currency), rounding=ROUND_CEILING)


@dataclass(frozen=True)
class GoalFigures:
    progress_percentage: Decimal
    remaining_amount: Decimal  # still to save; 0 once the target is reached
    days_left: int | None  # until target_date; negative when it has passed
    monthly_needed: Decimal | None
    base_current_amount: Decimal | None  # in the base currency; None without a recent rate
    base_target_amount: Decimal | None


def figures_of(goal: SavingsGoal, today: date, converter: Converter) -> GoalFigures:
    return GoalFigures(
        progress_percentage=progress_percentage(goal.current_amount, goal.target_amount),
        remaining_amount=max(goal.target_amount - goal.current_amount, ZERO),
        days_left=(goal.target_date - today).days if goal.target_date else None,
        monthly_needed=monthly_needed(goal, today),
        base_current_amount=converter.to_base(goal.current_amount, goal.currency),
        base_target_amount=converter.to_base(goal.target_amount, goal.currency),
    )


def get_summary(user, today: date) -> dict:
    """Every goal of the user at a glance. Totals cover the goals that aren't archived, in the
    base currency. One query, plus one for exchange rates when a goal is in another currency."""
    goals = list(SavingsGoal.objects.filter(user=user))
    converter = Converter(user.base_currency, today)
    counts = {status: 0 for status in SavingsGoalStatus.values}
    total_saved = total_target = ZERO
    unconverted: set[str] = set()
    for goal in goals:
        counts[goal.status] += 1
        if goal.status == SavingsGoalStatus.ARCHIVED:
            continue
        saved = converter.to_base(goal.current_amount, goal.currency)
        target = converter.to_base(goal.target_amount, goal.currency)
        if saved is None or target is None:
            unconverted.add(goal.currency)
            continue
        total_saved += saved
        total_target += target

    return {
        "currency": user.base_currency,
        "active_count": counts[SavingsGoalStatus.ACTIVE],
        "completed_count": counts[SavingsGoalStatus.COMPLETED],
        "archived_count": counts[SavingsGoalStatus.ARCHIVED],
        "total_saved": total_saved,
        "total_target": total_target,
        "progress_percentage": progress_percentage(total_saved, total_target) if total_target else None,
        "unconverted_currencies": sorted(unconverted),
    }


# --- Adding and removing money ---------------------------------------------------------------


class Direction(IntEnum):
    DEPOSIT = 1
    WITHDRAWAL = -1


class MoneyMovementError(Exception):
    """The deposit or withdrawal can't be done. The message is safe to show to the user."""

    def __init__(self, message: str, field: str = "amount"):
        self.field = field
        super().__init__(message)


@transaction.atomic
def move_money(goal_id: int, amount: Decimal, direction: Direction) -> SavingsGoal:
    """Adds `amount` to the goal (or removes it) and updates its status.

    The row is locked for the read-check-write, so two simultaneous deposits both count
    and a withdrawal can never take the balance below zero.
    """
    goal = SavingsGoal.objects.select_for_update().get(pk=goal_id)
    if goal.status == SavingsGoalStatus.ARCHIVED:
        raise MoneyMovementError("This goal is archived. Restore it to add or remove money.", field="non_field_errors")
    if direction == Direction.WITHDRAWAL and amount > goal.current_amount:
        raise MoneyMovementError(f"You can't remove more than the {goal.current_amount} {goal.currency} saved.")

    new_amount = goal.current_amount + direction * amount
    if new_amount > MAX_AMOUNT:
        raise MoneyMovementError("This would make the saved amount too large.")
    goal.current_amount = new_amount
    goal.sync_status()
    goal.save(update_fields=["current_amount", "status", "updated_at"])
    return goal
