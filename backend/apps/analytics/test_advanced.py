"""Trends, comparisons, merchants, spending patterns and budget variance."""

from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status

from apps.analytics import merchants, patterns, services, trends
from apps.budgets.models import Budget
from apps.categories.models import Category, TransactionType
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

D = Decimal


def _tx(user, category, amount, day, description="", currency="EUR", rate="1", **extra):
    return Transaction.objects.create(
        user=user,
        category=category,
        type=category.type,
        amount=D(amount),
        date=day,
        description=description,
        currency=currency,
        exchange_rate=D(rate),
        **extra,
    )


@pytest.fixture
def housing(user):
    return Category.objects.create(user=user, name="Housing", type=TransactionType.EXPENSE)


# --- Trends ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_monthly_trend_crosses_the_year_boundary(user, food_category, salary_category):
    _tx(user, food_category, "100.00", date(2025, 12, 5))  # baseline month, before the window
    _tx(user, food_category, "200.00", date(2026, 1, 5))
    _tx(user, food_category, "300.00", date(2026, 3, 5))
    _tx(user, salary_category, "1000.00", date(2026, 3, 1))

    result = trends.get_trends(user, 2026, 3, months=3)

    assert [(m["year"], m["month"], m["expenses"]) for m in result["months"]] == [
        (2026, 1, D("200.00")),
        (2026, 2, D("0.00")),
        (2026, 3, D("300.00")),
    ]
    assert [m["expenses_change_percentage"] for m in result["months"]] == [D("100.00"), D("-100.00"), None]
    assert result["months"][2]["income"] == D("1000.00")
    assert result["months"][2]["balance"] == D("700.00")
    assert result["average_monthly_expenses"] == D("166.67")


@pytest.mark.django_db
def test_category_trends_give_the_latest_change(user, food_category, transport_category, salary_category):
    _tx(user, food_category, "280.00", date(2026, 8, 10))
    _tx(user, food_category, "320.00", date(2026, 9, 10))
    _tx(user, transport_category, "50.00", date(2026, 8, 11))
    _tx(user, salary_category, "3000.00", date(2026, 9, 1))  # income is not a spending category

    categories = trends.get_trends(user, 2026, 9, months=2)["categories"]

    assert [c["category_name"] for c in categories] == ["Food", "Transport"]
    food, transport = categories
    assert food["amounts"] == [D("280.00"), D("320.00")]
    assert (food["change_amount"], food["change_percentage"]) == (D("40.00"), D("14.29"))
    assert (food["total"], food["average"]) == (D("600.00"), D("300.00"))
    assert (transport["change_amount"], transport["change_percentage"]) == (D("-50.00"), D("-100.00"))


@pytest.mark.django_db
def test_trends_add_up_base_amounts(user, food_category):
    _tx(user, food_category, "15000", date(2026, 9, 10), currency="HUF", rate="0.0025")
    _tx(user, food_category, "12.50", date(2026, 9, 11))

    result = trends.get_trends(user, 2026, 9, months=2)

    assert result["months"][-1]["expenses"] == D("50.00")
    assert result["categories"][0]["amounts"] == [D("0.00"), D("50.00")]


@pytest.mark.django_db
def test_a_category_spent_on_only_before_the_window_is_left_out(user, food_category):
    _tx(user, food_category, "99.00", date(2026, 6, 1))

    assert trends.get_trends(user, 2026, 9, months=3)["categories"] == []


@pytest.mark.django_db
def test_trends_are_one_query_whatever_the_volume(user, django_assert_num_queries):
    for index in range(5):
        category = Category.objects.create(user=user, name=f"C{index}", type=TransactionType.EXPENSE)
        for month in range(4, 10):
            _tx(user, category, "10.00", date(2026, month, 3))

    with django_assert_num_queries(1):
        result = trends.get_trends(user, 2026, 9, months=6)

    assert len(result["categories"]) == 5


@pytest.mark.django_db
def test_trends_endpoint(auth_client, user, other_user, food_category):
    _tx(user, food_category, "320.00", date(2026, 9, 10))
    other_food = Category.objects.create(user=other_user, name="Food", type=TransactionType.EXPENSE)
    _tx(other_user, other_food, "999.00", date(2026, 9, 10))

    data = auth_client.get(reverse("analytics-trends"), {"year": 2026, "month": 9}).json()

    assert len(data["months"]) == 6  # default window
    assert data["months"][-1] == {
        "year": 2026,
        "month": 9,
        "month_name": "September",
        "income": "0.00",
        "expenses": "320.00",
        "balance": "-320.00",
        "expenses_change_percentage": None,
    }
    assert data["categories"][0]["amounts"] == ["0.00"] * 5 + ["320.00"]  # money stays a string


@pytest.mark.django_db
@pytest.mark.parametrize("months", ["1", "25", "abc"])
def test_trends_window_is_validated(auth_client, months):
    response = auth_client.get(reverse("analytics-trends"), {"months": months})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "months" in response.json()


# --- Month-over-month and year-over-year ----------------------------------------------------


@pytest.mark.django_db
def test_year_over_year_comparison(auth_client, user, food_category):
    _tx(user, food_category, "100.00", date(2025, 9, 10))
    _tx(user, food_category, "999.00", date(2026, 8, 10))  # the previous month is not what we compare with
    _tx(user, food_category, "150.00", date(2026, 9, 10))

    data = auth_client.get(
        reverse("analytics-comparison"), {"year": 2026, "month": 9, "against": "previous_year"}
    ).json()

    assert data["against"] == "previous_year"
    assert (data["previous_month"]["year"], data["previous_month"]["month"]) == (2025, 9)
    assert data["difference"]["total_expenses"] == "50.00"
    assert data["percentage_difference"]["total_expenses"] == 50.0
    assert data["categories"] == [
        {
            "category_id": food_category.id,
            "category_name": "Food",
            "current_amount": "150.00",
            "previous_amount": "100.00",
            "change_amount": "50.00",
            "change_percentage": 50.0,
        }
    ]


@pytest.mark.django_db
def test_month_over_month_categories(auth_client, user, food_category, transport_category):
    _tx(user, food_category, "280.00", date(2026, 8, 10))
    _tx(user, food_category, "320.00", date(2026, 9, 10))
    _tx(user, transport_category, "40.00", date(2026, 8, 12))  # nothing this month

    data = auth_client.get(reverse("analytics-comparison"), {"year": 2026, "month": 9}).json()

    assert data["against"] == "previous_month"
    assert [(c["category_name"], c["current_amount"], c["change_percentage"]) for c in data["categories"]] == [
        ("Food", "320.00", 14.29),
        ("Transport", "0.00", -100.0),
    ]


@pytest.mark.django_db
def test_unknown_comparison_is_rejected(auth_client):
    response = auth_client.get(reverse("analytics-comparison"), {"against": "week"})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "against" in response.json()


# --- Merchants ---------------------------------------------------------------------------


@pytest.fixture
def shopping_month(user, food_category, transport_category, salary_category):
    """September: Albert Heijn 420 (4×, three spellings), Jumbo 210, Shell 180, 90 without a description."""
    for amount, spelling in [
        ("100.00", "Albert Heijn"),
        ("120.00", "Albert Heijn"),
        ("100.00", " ALBERT HEIJN "),
        ("100.00", "albert heijn"),
    ]:
        _tx(user, food_category, amount, date(2026, 9, 5), description=spelling)
    _tx(user, food_category, "210.00", date(2026, 9, 12), description="Jumbo")
    _tx(user, transport_category, "180.00", date(2026, 9, 20), description="Shell")
    _tx(user, food_category, "90.00", date(2026, 9, 21))
    _tx(user, salary_category, "3000.00", date(2026, 9, 1), description="Employer")  # income: no merchant
    _tx(user, food_category, "380.00", date(2026, 8, 5), description="Albert Heijn")


@pytest.mark.django_db
def test_merchants_are_grouped_ignoring_case_and_spaces(user, shopping_month):
    result = merchants.get_merchants(user, 2026, 9)

    assert result["total_expenses"] == D("900.00")
    assert [(m["merchant"], m["total"]) for m in result["merchants"]] == [
        ("Albert Heijn", D("420.00")),
        ("Jumbo", D("210.00")),
        ("Shell", D("180.00")),
    ]
    heijn = result["merchants"][0]
    assert (heijn["transaction_count"], heijn["average"], heijn["share_percentage"]) == (4, D("105.00"), D("46.67"))
    assert (heijn["previous_total"], heijn["change_percentage"]) == (D("380.00"), D("10.53"))
    assert heijn["last_date"] == date(2026, 9, 5)
    jumbo = result["merchants"][1]
    assert (jumbo["previous_total"], jumbo["change_percentage"]) == (D("0.00"), None)


@pytest.mark.django_db
def test_merchant_totals_use_base_amounts(user, food_category):
    _tx(user, food_category, "15000", date(2026, 9, 5), description="Spar", currency="HUF", rate="0.0025")

    [spar] = merchants.get_merchants(user, 2026, 9)["merchants"]

    assert spar["total"] == D("37.50")


@pytest.mark.django_db
def test_merchants_are_three_queries_whatever_the_volume(user, food_category, django_assert_num_queries):
    for index in range(20):
        _tx(user, food_category, "10.00", date(2026, 9, 5), description=f"Shop {index}")
        _tx(user, food_category, "5.00", date(2026, 8, 5), description=f"Shop {index}")

    with django_assert_num_queries(3):
        result = merchants.get_merchants(user, 2026, 9, limit=15)

    assert len(result["merchants"]) == 15


@pytest.mark.django_db
def test_merchants_endpoint(auth_client, shopping_month):
    data = auth_client.get(reverse("analytics-merchants"), {"year": 2026, "month": 9, "limit": 2}).json()

    assert [m["merchant"] for m in data["merchants"]] == ["Albert Heijn", "Jumbo"]
    assert data["merchants"][0]["total"] == "420.00"
    assert data["merchants"][0]["last_date"] == "2026-09-05"


@pytest.mark.django_db
@pytest.mark.parametrize("limit", ["0", "51"])
def test_merchant_limit_is_validated(auth_client, limit):
    response = auth_client.get(reverse("analytics-merchants"), {"limit": limit})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "limit" in response.json()


@pytest.mark.django_db
def test_other_users_merchants_are_invisible(auth_client, other_user):
    theirs = Category.objects.create(user=other_user, name="Food", type=TransactionType.EXPENSE)
    _tx(other_user, theirs, "50.00", date(2026, 9, 5), description="Their shop")

    data = auth_client.get(reverse("analytics-merchants"), {"year": 2026, "month": 9}).json()

    assert data["merchants"] == []
    assert data["total_expenses"] == "0.00"


# --- Spending patterns ---------------------------------------------------------------------

OCTOBER_15 = date(2026, 10, 15)  # "today" for a finished September


@pytest.mark.django_db
def test_average_daily_and_weekday_spending(user, food_category, transport_category):
    # September 2026 starts on a Tuesday: 5 Tuesdays and Wednesdays, 4 of every other weekday.
    _tx(user, food_category, "40.00", date(2026, 9, 7))  # Monday
    _tx(user, food_category, "20.00", date(2026, 9, 14))  # Monday
    _tx(user, transport_category, "30.00", date(2026, 9, 1))  # Tuesday

    result = patterns.get_spending_patterns(user, 2026, 9, today=OCTOBER_15)

    assert result["days_counted"] == 30
    assert result["total_expenses"] == D("90.00")
    assert result["average_daily_spending"] == D("3.00")
    monday, tuesday, *_, sunday = result["weekdays"]
    assert (monday["name"], monday["total"], monday["transaction_count"], monday["days"]) == (
        "Monday",
        D("60.00"),
        2,
        4,
    )
    assert monday["average_per_day"] == D("15.00")
    assert (tuesday["total"], tuesday["days"], tuesday["average_per_day"]) == (D("30.00"), 5, D("6.00"))
    assert (sunday["total"], sunday["average_per_day"]) == (D("0.00"), D("0.00"))


@pytest.mark.django_db
def test_the_current_month_counts_only_the_days_so_far(user, food_category):
    _tx(user, food_category, "50.00", date(2026, 9, 3))
    _tx(user, food_category, "70.00", date(2026, 9, 28))  # entered ahead of time

    result = patterns.get_spending_patterns(user, 2026, 9, today=date(2026, 9, 10))

    assert result["days_counted"] == 10
    assert result["total_expenses"] == D("50.00")
    assert result["average_daily_spending"] == D("5.00")


@pytest.mark.django_db
def test_a_future_month_has_no_days_yet(user, django_assert_num_queries):
    with django_assert_num_queries(1):  # only the recurring commitments
        result = patterns.get_spending_patterns(user, 2026, 11, today=OCTOBER_15)

    assert (result["days_counted"], result["average_daily_spending"], result["fixed_percentage"]) == (0, None, None)
    assert {weekday["average_per_day"] for weekday in result["weekdays"]} == {None}


@pytest.mark.django_db
def test_fixed_expenses_are_the_ones_a_recurring_template_accounts_for(user, food_category, housing):
    rent = RecurringTransaction.objects.create(
        user=user,
        category=housing,
        name="Rent",
        type=TransactionType.EXPENSE,
        amount=D("600.00"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )
    RecurringTransaction.objects.create(  # ended before September: matches nothing
        user=user,
        category=food_category,
        name="Meal kit",
        type=TransactionType.EXPENSE,
        amount=D("45.00"),
        frequency=Frequency.WEEKLY,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 8, 31),
        next_occurrence_date=date(2026, 1, 1),
    )
    _tx(user, housing, "600.00", date(2026, 9, 3))  # same category and amount: fixed
    _tx(user, housing, "35.00", date(2026, 9, 4), recurring_transaction=rent)  # linked: fixed
    _tx(user, housing, "599.00", date(2026, 9, 5))  # different amount: variable
    _tx(user, food_category, "600.00", date(2026, 9, 6))  # different category: variable
    _tx(user, food_category, "45.00", date(2026, 9, 7))  # template already ended: variable

    result = patterns.get_spending_patterns(user, 2026, 9, today=OCTOBER_15)

    assert result["fixed_expenses"] == D("635.00")
    assert result["variable_expenses"] == D("1244.00")
    assert result["fixed_percentage"] == D("33.79")  # 635 / 1879
    assert result["recurring_commitments"] == D("600.00")


@pytest.mark.django_db
def test_patterns_are_two_queries_whatever_the_volume(user, food_category, housing, django_assert_num_queries):
    RecurringTransaction.objects.create(
        user=user,
        category=housing,
        name="Rent",
        type=TransactionType.EXPENSE,
        amount=D("600.00"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )
    for day in range(1, 31):
        _tx(user, food_category, "10.00", date(2026, 9, day))

    with django_assert_num_queries(2):
        patterns.get_spending_patterns(user, 2026, 9, today=OCTOBER_15)


@pytest.mark.django_db
def test_spending_patterns_endpoint(auth_client, user, food_category):
    _tx(user, food_category, "40.00", date(2026, 8, 3))

    data = auth_client.get(reverse("analytics-spending-patterns"), {"year": 2026, "month": 8}).json()

    assert data["days_counted"] == 31
    assert data["average_daily_spending"] == "1.29"
    assert [weekday["weekday"] for weekday in data["weekdays"]] == [1, 2, 3, 4, 5, 6, 7]
    assert data["weekdays"][0] == {
        "weekday": 1,
        "name": "Monday",
        "total": "40.00",
        "transaction_count": 1,
        "days": 5,
        "average_per_day": "8.00",
    }


# --- Budget variance ---------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("spent", "expected_status", "variance"),
    [
        ("120.00", "on_track", D("-60.00")),
        ("200.00", "ahead_of_pace", D("-33.33")),
        ("320.00", "over_budget", D("6.67")),
    ],
)
def test_budget_variance_keeps_pace_with_the_month(user, food_category, spent, expected_status, variance):
    Budget.objects.create(user=user, category=food_category, amount=D("300.00"), year=2026, month=9)
    _tx(user, food_category, spent, date(2026, 9, 2))

    [usage] = services.get_budget_usage(user, 2026, 9, today=date(2026, 9, 15))

    assert usage["expected_to_date"] == D("150.00")  # half of September has passed
    assert usage["status"] == expected_status
    assert usage["variance_percentage"] == variance


@pytest.mark.django_db
@pytest.mark.parametrize(("today", "expected"), [(date(2026, 10, 1), D("300.00")), (date(2026, 8, 31), D("0.00"))])
def test_budget_expected_to_date_for_past_and_future_months(user, food_category, today, expected):
    Budget.objects.create(user=user, category=food_category, amount=D("300.00"), year=2026, month=9)

    [usage] = services.get_budget_usage(user, 2026, 9, today=today)

    assert usage["expected_to_date"] == expected


@pytest.mark.django_db
def test_dashboard_shows_budget_variance(auth_client, user, food_category):
    Budget.objects.create(user=user, category=food_category, amount=D("100.00"), year=2025, month=1)
    _tx(user, food_category, "120.00", date(2025, 1, 10))

    [usage] = auth_client.get(reverse("analytics-dashboard"), {"year": 2025, "month": 1}).json()["budget_usage"]

    assert (usage["variance_percentage"], usage["expected_to_date"], usage["status"]) == (20.0, "100.00", "over_budget")
