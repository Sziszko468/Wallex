"""Subscriptions as recurring expenses: the model, the cost math and the payment schedule."""

from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction

from apps.categories.models import TransactionType
from apps.notifications.models import Notification
from apps.notifications.rules import send_payment_reminders
from apps.notifications.services import get_preferences
from apps.transactions.models import Frequency, RecurringTransaction

from . import services
from .models import Subscription

D = Decimal
TODAY = date(2026, 9, 27)  # a Sunday


def _converter(user, day=TODAY):
    return services.Converter(user.base_currency, day)


def _spec_example(make_subscription):
    """Monthly subscriptions: €95.96 — yearly projection: €1,151.52 (Adobe is billed yearly)."""
    make_subscription("Netflix", "17.99")
    make_subscription("Spotify", "10.99")
    make_subscription("Disney+", "9.99")
    make_subscription("Adobe", "299.88", frequency=Frequency.YEARLY, start_date=date(2026, 3, 14))
    make_subscription("Gym", "32.00", start_date=date(2026, 2, 1))


# --- The model: a subscription is a recurring expense ---------------------------------------


@pytest.mark.django_db
def test_a_subscription_is_a_recurring_expense_row(user, make_subscription, entertainment):
    netflix = make_subscription("Netflix", type=TransactionType.INCOME)  # the proxy overrides it
    RecurringTransaction.objects.create(
        user=user, category=entertainment, name="Rent", type=TransactionType.EXPENSE, amount=D("600.00"),
        frequency=Frequency.MONTHLY, start_date=date(2026, 1, 1), next_occurrence_date=date(2026, 1, 1),
    )

    row = RecurringTransaction.objects.get(pk=netflix.pk)
    assert (row.is_subscription, row.type) == (True, TransactionType.EXPENSE)
    assert list(Subscription.objects.values_list("name", flat=True)) == ["Netflix"]
    assert RecurringTransaction.objects.count() == 2  # same table: everything recurring sees it


@pytest.mark.django_db
def test_the_database_rejects_an_income_subscription(user, salary):
    with pytest.raises(IntegrityError), transaction.atomic():
        RecurringTransaction.objects.create(
            user=user, category=salary, name="Odd", type=TransactionType.INCOME, is_subscription=True,
            amount=D("1.00"), frequency=Frequency.MONTHLY, start_date=TODAY, next_occurrence_date=TODAY,
        )


# --- Costs ------------------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("frequency", "amount", "monthly", "yearly"),
    [
        (Frequency.MONTHLY, "9.99", "9.99", "119.88"),
        (Frequency.YEARLY, "119.88", "9.99", "119.88"),
        (Frequency.WEEKLY, "10.00", "43.33", "520.00"),  # 52 payments a year, 52 / 12 a month
        (Frequency.WEEKLY, "7.50", "32.50", "390.00"),
    ],
)
def test_costs_are_normalized_per_frequency(user, make_subscription, frequency, amount, monthly, yearly):
    cost = services.cost_of(make_subscription(amount=amount, frequency=frequency), _converter(user))

    assert (cost.monthly, cost.yearly) == (D(monthly), D(yearly))
    assert (cost.base_monthly, cost.base_yearly) == (D(monthly), D(yearly))  # already in the base currency


@pytest.mark.django_db
def test_the_spec_example_adds_up(user, make_subscription):
    _spec_example(make_subscription)

    summary = services.get_summary(user, TODAY)

    assert summary["active_count"] == 5
    assert summary["monthly_total"] == D("95.96")
    assert summary["yearly_total"] == D("1151.52")
    assert summary["currency"] == "EUR"


@pytest.mark.django_db
def test_foreign_currency_costs_are_converted_at_the_latest_rate(user, make_subscription, add_rates):
    add_rates(date(2026, 9, 25), USD="1.17")  # a Friday: still the latest rate on Sunday
    netflix = make_subscription("Netflix", "15.49", currency="USD")

    cost = services.cost_of(netflix, _converter(user))

    assert (cost.monthly, cost.yearly) == (D("15.49"), D("185.88"))  # in dollars, as billed
    assert cost.base_monthly == D("13.24")  # 15.49 / 1.17 = 13.2393…
    assert cost.base_yearly == D("158.87")  # 185.88 / 1.17 = 158.8717…, not 12 × 13.24


@pytest.mark.django_db
def test_without_a_recent_rate_a_subscription_is_left_out_of_the_totals(user, make_subscription, add_rates):
    add_rates(date(2026, 9, 10), USD="1.17")  # 17 days old: too old
    make_subscription("Netflix", "15.49", currency="USD")
    make_subscription("Spotify", "10.99")

    summary = services.get_summary(user, TODAY)

    assert summary["monthly_total"] == D("10.99")
    assert summary["unconverted_currencies"] == ["USD"]
    assert summary["active_count"] == 2  # still counted as active


# --- Schedule ---------------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("fields", "expected_date", "expected_status"),
    [
        ({"start_date": date(2026, 10, 3)}, date(2026, 10, 3), "active"),  # starts in the future
        ({"start_date": date(2026, 1, 31)}, date(2026, 9, 30), "active"),  # 31st → last day of short months
        ({"start_date": date(2026, 1, 27)}, TODAY, "active"),  # due today
        ({"is_active": False}, None, "paused"),
        ({"end_date": date(2026, 9, 26)}, None, "ended"),
        ({"end_date": date(2026, 10, 5)}, date(2026, 10, 5), "active"),  # the last payment is still ahead
    ],
)
def test_next_payment_date_and_status(make_subscription, fields, expected_date, expected_status):
    subscription = make_subscription(**fields)

    assert services.next_payment_date(subscription, TODAY) == expected_date
    assert services.status_of(subscription, TODAY) == expected_status


@pytest.mark.django_db
def test_payment_schedule_stops_at_the_end_date(make_subscription):
    subscription = make_subscription(start_date=date(2026, 1, 5), end_date=date(2026, 11, 30))

    assert services.payment_schedule(subscription, TODAY) == [date(2026, 10, 5), date(2026, 11, 5)]


@pytest.mark.django_db
def test_upcoming_payments_cover_the_next_30_days_soonest_first(user, make_subscription):
    make_subscription("Gym", "8.00", frequency=Frequency.WEEKLY, start_date=date(2026, 9, 1))  # Tuesdays
    make_subscription("Adobe", "299.88", frequency=Frequency.YEARLY, start_date=date(2025, 10, 10))
    make_subscription("Netflix", "17.99", start_date=date(2026, 1, 5))
    make_subscription("Insurance", "40.00", frequency=Frequency.YEARLY, start_date=date(2026, 3, 1))  # March
    make_subscription("Paused", "5.00", is_active=False)
    subscriptions = list(Subscription.objects.filter(user=user))

    upcoming = services.upcoming_payments(subscriptions, TODAY, _converter(user))

    assert [(payment.subscription.name, payment.date) for payment in upcoming] == [
        ("Gym", date(2026, 9, 29)),
        ("Netflix", date(2026, 10, 5)),
        ("Gym", date(2026, 10, 6)),
        ("Adobe", date(2026, 10, 10)),
        ("Gym", date(2026, 10, 13)),
        ("Gym", date(2026, 10, 20)),
    ]  # 27 Sep – 26 Oct
    assert upcoming[0].base_amount == D("8.00")


# --- Summary ----------------------------------------------------------------------------------


@pytest.mark.django_db
def test_summary_counts_and_categories(user, make_subscription, bills):
    make_subscription("Netflix", "15.00")
    make_subscription("Spotify", "5.00")
    make_subscription("Internet", "30.00", category=bills)
    make_subscription("Old gym", "25.00", end_date=date(2026, 6, 30))
    make_subscription("Paused", "99.00", is_active=False)

    summary = services.get_summary(user, TODAY)

    assert (summary["active_count"], summary["paused_count"], summary["ended_count"]) == (3, 1, 1)
    assert summary["monthly_total"] == D("50.00")  # ended and paused ones cost nothing
    assert [(c["category_name"], c["monthly_total"], c["subscription_count"], c["percentage"]) for c in summary["by_category"]] == [
        ("Bills", D("30.00"), 1, D("60.00")),
        ("Entertainment", D("20.00"), 2, D("40.00")),
    ]


@pytest.mark.django_db
def test_summary_is_one_query_plus_one_for_rates(user, make_subscription, add_rates, django_assert_num_queries):
    for index in range(5):
        make_subscription(f"Service {index}", "4.99")

    with django_assert_num_queries(1):
        services.get_summary(user, TODAY)

    add_rates(date(2026, 9, 25), USD="1.17")
    make_subscription("Netflix", "15.49", currency="USD")
    with django_assert_num_queries(2):
        services.get_summary(user, TODAY)


@pytest.mark.django_db
def test_subscriptions_of_another_user_never_count(user, other_user, make_subscription, entertainment):
    make_subscription("Mine", "10.00")
    Subscription.objects.create(
        user=other_user, category=entertainment, name="Theirs", amount=D("99.00"),
        frequency=Frequency.MONTHLY, start_date=date(2026, 1, 1), next_occurrence_date=date(2026, 1, 1),
    )

    assert services.get_summary(user, TODAY)["monthly_total"] == D("10.00")


# --- Month overview (dashboard) -----------------------------------------------------------------


@pytest.mark.django_db
def test_month_overview_bills_yearly_plans_in_their_month_only(user, make_subscription):
    make_subscription("Adobe", "299.88", frequency=Frequency.YEARLY, start_date=date(2025, 3, 14))
    make_subscription("Netflix", "17.99", start_date=date(2026, 1, 5))

    march = services.get_month_overview(user, 2026, 3, TODAY)
    april = services.get_month_overview(user, 2026, 4, TODAY)

    assert march["due_this_month"] == D("317.87")  # 299.88 + 17.99
    assert april["due_this_month"] == D("17.99")
    assert march["monthly_total"] == april["monthly_total"] == D("42.98")  # 24.99 + 17.99
    assert march["yearly_total"] == D("515.76")  # 299.88 + 215.88


@pytest.mark.django_db
def test_month_overview_counts_what_ran_during_the_month(user, make_subscription):
    make_subscription("Gym", "8.00", frequency=Frequency.WEEKLY, start_date=date(2026, 9, 1))  # 5 Tuesdays
    make_subscription("Started later", "5.00", start_date=date(2026, 9, 20))
    make_subscription("Cancelled", "12.00", start_date=date(2026, 1, 10), end_date=date(2026, 8, 10))
    make_subscription("Paused", "20.00", is_active=False)
    make_subscription("Next month", "3.00", start_date=date(2026, 10, 1))

    september = services.get_month_overview(user, 2026, 9, TODAY)

    assert september["active_count"] == 2
    assert september["due_this_month"] == D("45.00")  # 5 × 8.00 + 5.00


@pytest.mark.django_db
def test_month_overview_query_count(user, make_subscription, django_assert_num_queries):
    for index in range(5):
        make_subscription(f"Service {index}", "4.99")

    with django_assert_num_queries(1):
        services.get_month_overview(user, 2026, 9, TODAY)


# --- Smart notifications build on the recurring machinery --------------------------------------


@pytest.mark.django_db
def test_payment_reminders_include_subscriptions(user, make_subscription):
    make_subscription("Netflix", "17.99", start_date=date(2026, 1, 28))

    send_payment_reminders(user, get_preferences(user), TODAY)

    reminder = Notification.objects.get(user=user)
    assert reminder.kind == "subscription_due"
    assert reminder.body == "Netflix payment expected tomorrow."
