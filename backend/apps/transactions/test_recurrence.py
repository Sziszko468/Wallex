from datetime import date

import pytest

from apps.transactions.models import Frequency, RecurringTransaction
from apps.transactions.recurrence import next_occurrence_on_or_after


def _recurring(frequency, start, end=None):
    # Unsaved instance: the function only reads these fields.
    return RecurringTransaction(frequency=frequency, start_date=start, end_date=end)


@pytest.mark.parametrize(
    ("frequency", "start", "day", "expected"),
    [
        # Before the start: the first occurrence is the start itself.
        (Frequency.MONTHLY, date(2026, 10, 5), date(2026, 9, 1), date(2026, 10, 5)),
        # On an occurrence day: that day.
        (Frequency.MONTHLY, date(2026, 1, 15), date(2026, 9, 15), date(2026, 9, 15)),
        (Frequency.MONTHLY, date(2026, 1, 15), date(2026, 9, 10), date(2026, 9, 15)),
        (Frequency.MONTHLY, date(2026, 1, 15), date(2026, 9, 20), date(2026, 10, 15)),
        # Month-end clamping without drift.
        (Frequency.MONTHLY, date(2026, 1, 31), date(2026, 2, 10), date(2026, 2, 28)),
        (Frequency.MONTHLY, date(2026, 1, 31), date(2026, 3, 1), date(2026, 3, 31)),
        (Frequency.MONTHLY, date(2026, 11, 20), date(2026, 12, 25), date(2027, 1, 20)),
        (Frequency.WEEKLY, date(2026, 9, 1), date(2026, 9, 8), date(2026, 9, 8)),
        (Frequency.WEEKLY, date(2026, 9, 1), date(2026, 9, 9), date(2026, 9, 15)),
        (Frequency.YEARLY, date(2024, 2, 29), date(2025, 3, 1), date(2026, 2, 28)),
        (Frequency.YEARLY, date(2020, 6, 1), date(2026, 5, 31), date(2026, 6, 1)),
    ],
)
def test_next_occurrence(frequency, start, day, expected):
    assert next_occurrence_on_or_after(_recurring(frequency, start), day) == expected


def test_no_occurrence_after_end_date():
    recurring = _recurring(Frequency.MONTHLY, date(2026, 1, 15), end=date(2026, 9, 1))
    assert next_occurrence_on_or_after(recurring, date(2026, 9, 2)) is None


def test_occurrence_on_end_date_still_counts():
    recurring = _recurring(Frequency.MONTHLY, date(2026, 1, 15), end=date(2026, 9, 15))
    assert next_occurrence_on_or_after(recurring, date(2026, 9, 2)) == date(2026, 9, 15)
