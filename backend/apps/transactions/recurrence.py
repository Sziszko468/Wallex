from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from .models import Frequency, RecurringTransaction

# How many times each frequency occurs per month / per year on average (weekly = 52 / 12).
MONTHLY_OCCURRENCES = {
    Frequency.WEEKLY: Decimal(52) / Decimal(12),
    Frequency.MONTHLY: Decimal(1),
    Frequency.YEARLY: Decimal(1) / Decimal(12),
}
YEARLY_OCCURRENCES = {
    Frequency.WEEKLY: Decimal(52),
    Frequency.MONTHLY: Decimal(12),
    Frequency.YEARLY: Decimal(1),
}


def monthly_equivalent(amount: Decimal, frequency: str) -> Decimal:
    """What `amount` per occurrence costs per month on average. Unrounded."""
    return amount * MONTHLY_OCCURRENCES[frequency]


def yearly_equivalent(amount: Decimal, frequency: str) -> Decimal:
    """What `amount` per occurrence costs per year. Exact (weekly = 52 payments)."""
    return amount * YEARLY_OCCURRENCES[frequency]


def _add_months(start: date, months: int) -> date:
    """start + N months, clamped to the target month's length (Jan 31 + 1 month = Feb 28/29)."""
    years, month_index = divmod(start.month - 1 + months, 12)
    year = start.year + years
    month = month_index + 1
    return date(year, month, min(start.day, monthrange(year, month)[1]))


def next_occurrence_on_or_after(recurring: RecurringTransaction, day: date) -> date | None:
    """First scheduled date of `recurring` that falls on or after `day`, or None once it has ended.

    Always computed from `start_date`, never by chaining from the previous
    occurrence, so a monthly item starting on the 31st stays on the last day of
    short months instead of drifting to the 28th for good.
    """
    start = recurring.start_date
    if day <= start:
        candidate = start
    elif recurring.frequency == Frequency.WEEKLY:
        weeks = -(-(day - start).days // 7)  # ceiling division
        candidate = start + timedelta(weeks=weeks)
    else:
        step = 12 if recurring.frequency == Frequency.YEARLY else 1
        elapsed_months = (day.year - start.year) * 12 + (day.month - start.month)
        periods = elapsed_months // step
        candidate = _add_months(start, periods * step)
        if candidate < day:
            candidate = _add_months(start, (periods + 1) * step)

    if recurring.end_date and candidate > recurring.end_date:
        return None
    return candidate


def occurrences_from(recurring: RecurringTransaction, day: date, *, until: date | None = None, limit: int) -> list[date]:
    """Up to `limit` scheduled dates on or after `day` (and on or before `until`, when given)."""
    dates: list[date] = []
    occurrence = next_occurrence_on_or_after(recurring, day)
    while occurrence is not None and len(dates) < limit and (until is None or occurrence <= until):
        dates.append(occurrence)
        occurrence = next_occurrence_on_or_after(recurring, occurrence + timedelta(days=1))
    return dates
