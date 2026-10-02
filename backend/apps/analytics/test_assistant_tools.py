"""The assistant's tools: the only financial data the model ever sees."""

import json
from datetime import date
from decimal import Decimal

import pytest

from apps.analytics.assistant import tools
from apps.analytics.assistant.tools import TOOL_DEFINITIONS, TOOLS, describe_source, run_tool
from apps.budgets.models import Budget, SavingsGoal, SavingsGoalStatus
from apps.categories.models import Category, TransactionType
from apps.subscriptions.models import Subscription
from apps.transactions.models import Frequency, Transaction

TODAY = date(2026, 9, 15)
SEP = {"year": 2026, "month": 9}
AUG = {"year": 2026, "month": 8}

REQUIRED_TOOLS = {
    "get_monthly_spending",
    "get_category_spending",
    "get_merchant_spending",
    "get_budget_status",
    "get_subscription_costs",
    "get_savings_progress",
    "get_month_comparison",
}


def _expense(user, category, amount, day, description=""):
    return Transaction.objects.create(
        user=user, category=category, type=category.type, amount=Decimal(amount), date=day, description=description
    )


@pytest.fixture
def finances(user, food_category, transport_category, salary_category):
    for category, amount, day, description in [
        (salary_category, "2000.00", date(2026, 9, 1), "Employer"),
        (food_category, "120.00", date(2026, 9, 3), "Tesco"),
        (food_category, "30.50", date(2026, 9, 10), "Pizza Place"),
        (transport_category, "45.00", date(2026, 9, 12), "MOL"),
        (salary_category, "2000.00", date(2026, 8, 1), "Employer"),
        (food_category, "100.00", date(2026, 8, 4), "Tesco"),
        (transport_category, "80.00", date(2026, 8, 20), "MOL"),  # after the 15th: not in a month-to-date comparison
    ]:
        _expense(user, category, amount, day, description)
    Budget.objects.create(user=user, category=food_category, amount=Decimal("200.00"), **SEP)
    Budget.objects.create(user=user, category=None, amount=Decimal("150.00"), **SEP)  # overall: 195.50 spent
    for name, amount, frequency in [
        ("Netflix", "17.99", Frequency.MONTHLY),
        ("Gym", "360.00", Frequency.YEARLY),
        ("Spotify", "11.99", Frequency.MONTHLY),
    ]:
        Subscription.objects.create(
            user=user,
            category=food_category,
            name=name,
            amount=Decimal(amount),
            frequency=frequency,
            start_date=date(2026, 1, 5),
            next_occurrence_date=date(2026, 1, 5),
        )
    SavingsGoal.objects.create(
        user=user,
        name="Japan trip",
        target_amount=Decimal("3000.00"),
        current_amount=Decimal("750.00"),
        target_date=date(2027, 3, 15),
    )
    return {"food": food_category, "transport": transport_category}


def run(user, name, **arguments) -> dict:
    result = run_tool(user, name, arguments, TODAY)
    assert not result.is_error, result.content
    return json.loads(result.content)


def _keys(node):
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            yield from _keys(value)
    elif isinstance(node, list):
        for item in node:
            yield from _keys(item)


# --- The tool set ----------------------------------------------------------------------------


def test_the_seven_tools_are_defined_for_the_model():
    assert set(TOOLS) == REQUIRED_TOOLS
    for definition in TOOL_DEFINITIONS:
        assert set(definition) == {"name", "description", "input_schema"}
        assert definition["description"].count("Call this") == 1  # says *when* to use it
        schema = definition["input_schema"]
        assert schema["type"] == "object" and schema["additionalProperties"] is False


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("name", "arguments"),
    [
        ("get_monthly_spending", SEP),
        ("get_category_spending", SEP),
        ("get_merchant_spending", SEP),
        ("get_budget_status", SEP),
        ("get_subscription_costs", {}),
        ("get_savings_progress", {}),
        ("get_month_comparison", SEP),
    ],
)
def test_results_hold_aggregates_only_no_ids_or_personal_data(user, finances, name, arguments):
    result = run_tool(user, name, arguments, TODAY)
    data = json.loads(result.content)

    assert data["has_data"] is True
    assert not [key for key in _keys(data) if key == "id" or key.endswith("_id")]
    assert user.email not in result.content and user.username not in result.content
    assert result.source == {"tool": name, "arguments": arguments}


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("name", "arguments"),
    [
        ("get_monthly_spending", SEP),
        ("get_category_spending", SEP),
        ("get_merchant_spending", SEP),
        ("get_budget_status", SEP),
        ("get_subscription_costs", {}),
        ("get_savings_progress", {}),
        ("get_month_comparison", SEP),
    ],
)
def test_another_users_data_never_appears(user, other_user, finances, name, arguments):
    theirs = Category.objects.create(user=other_user, name="Their secret category", type=TransactionType.EXPENSE)
    _expense(other_user, theirs, "7777.77", date(2026, 9, 5), "Their secret shop")
    _expense(other_user, theirs, "7777.77", date(2026, 8, 5), "Their secret shop")
    Budget.objects.create(user=other_user, category=theirs, amount=Decimal("7777.77"), **SEP)
    Subscription.objects.create(
        user=other_user,
        category=theirs,
        name="Their secret subscription",
        amount=Decimal("7777.77"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )
    SavingsGoal.objects.create(user=other_user, name="Their secret goal", target_amount=Decimal("7777.77"))

    content = run_tool(user, name, arguments, TODAY).content

    assert "secret" not in content and "7777" not in content and "15555" not in content


# --- Each tool --------------------------------------------------------------------------------


@pytest.mark.django_db
def test_monthly_spending(user, finances):
    data = run(user, "get_monthly_spending", **SEP)

    assert data["period"] == {
        "label": "September 2026",
        "from": "2026-09-01",
        "to": "2026-09-30",
        "state": "in_progress",
        "data_until": "2026-09-15",
    }
    assert data["currency"] == "EUR"
    assert (data["total_expenses"], data["total_income"], data["balance"]) == ("195.50", "2000.00", "1804.50")
    assert data["transaction_count"] == 4
    assert data["top_expense_categories"] == [
        {"category": "Food", "amount": "150.50", "share_percentage": 76.98},
        {"category": "Transport", "amount": "45.00", "share_percentage": 23.02},
    ]


@pytest.mark.django_db
def test_a_month_without_transactions_has_no_data(user, finances):
    data = run(user, "get_monthly_spending", year=2026, month=6)

    assert data["has_data"] is False
    assert data["note"] == "No transactions are recorded for June 2026."
    assert "total_expenses" not in data  # no zeros the model could quote as facts


@pytest.mark.django_db
@pytest.mark.parametrize(
    "name", ["get_monthly_spending", "get_category_spending", "get_budget_status", "get_month_comparison"]
)
def test_a_future_month_has_no_data(user, finances, name):
    data = run(user, name, year=2026, month=11)

    assert data["has_data"] is False
    assert data["note"] == "November 2026 hasn't started yet, so there is no data for it."


@pytest.mark.django_db
def test_category_spending_lists_every_category(user, finances):
    Category.objects.create(user=user, name="Restaurants", type=TransactionType.EXPENSE)

    data = run(user, "get_category_spending", **SEP)

    assert data["total_expenses"] == "195.50"
    assert [row["category"] for row in data["categories"]] == ["Food", "Transport"]
    assert data["expense_categories_without_spending"] == ["Restaurants"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("requested", "expected"), [("FOOD", "Food"), ("food and drinks", "Food"), ("transp", "Transport")]
)
def test_category_lookup_is_case_insensitive_and_partial(user, finances, requested, expected):
    data = run(user, "get_category_spending", category=requested, **SEP)

    assert [row["category"] for row in data["matching_categories"]] == [expected]


@pytest.mark.django_db
def test_a_category_without_spending_matches_with_zero(user, finances):
    Category.objects.create(user=user, name="Éttermek", type=TransactionType.EXPENSE)

    data = run(user, "get_category_spending", category="ettermek", **SEP)

    assert data["matching_categories"] == [{"category": "Éttermek", "amount": "0.00", "share_percentage": 0.0}]
    assert data["has_data"] is True


@pytest.mark.django_db
def test_an_unknown_category_is_reported_not_substituted(user, finances):
    data = run(user, "get_category_spending", category="restaurants", **SEP)

    assert data["has_data"] is False
    assert data["matching_categories"] == []
    assert 'no expense category matching "restaurants"' in data["note"]


@pytest.mark.django_db
def test_merchant_spending(user, finances):
    data = run(user, "get_merchant_spending", **SEP)

    assert [row["merchant"] for row in data["merchants"]] == ["Tesco", "MOL", "Pizza Place"]
    tesco = data["merchants"][0]
    assert tesco == {
        "merchant": "Tesco",
        "total": "120.00",
        "payments": 1,
        "average_payment": "120.00",
        "share_percentage": 61.38,
        "previous_month_total": "100.00",
        "change_percentage": 20.0,
        "last_payment_date": "2026-09-03",
    }


@pytest.mark.django_db
def test_merchant_lookup(user, finances):
    assert [row["merchant"] for row in run(user, "get_merchant_spending", merchant="pizza", **SEP)["merchants"]] == [
        "Pizza Place"
    ]

    missing = run(user, "get_merchant_spending", merchant="Lidl", **SEP)
    assert missing["has_data"] is False and missing["merchants"] == []


@pytest.mark.django_db
def test_budget_status(user, finances):
    data = run(user, "get_budget_status", **SEP)

    assert data["month_elapsed_percentage"] == 50.0
    assert {
        row["budget"]: (row["covers"], row["spent"], row["remaining"], row["status"]) for row in data["budgets"]
    } == {
        "Food": ("a category", "150.50", "49.50", "ahead_of_pace"),
        "Overall": ("all expenses", "195.50", "-45.50", "over_budget"),
    }


@pytest.mark.django_db
def test_no_budgets_means_no_data(user, finances):
    data = run(user, "get_budget_status", **AUG)

    assert data == {
        "period": {"label": "August 2026", "from": "2026-08-01", "to": "2026-08-31", "state": "complete"},
        "currency": "EUR",
        "has_data": False,
        "note": "No budgets are set for August 2026.",
    }


@pytest.mark.django_db
def test_subscription_costs_most_expensive_first(user, finances):
    Subscription.objects.filter(name="Spotify").update(is_active=False)

    data = run(user, "get_subscription_costs")

    assert [(row["name"], row["status"], row["monthly_cost_in_base_currency"]) for row in data["subscriptions"]] == [
        ("Gym", "active", "30.00"),
        ("Netflix", "active", "17.99"),
        ("Spotify", "paused", "11.99"),
    ]
    assert (data["active_count"], data["paused_count"]) == (2, 1)
    assert (data["active_monthly_total"], data["active_yearly_total"]) == ("47.99", "575.88")
    assert data["subscriptions"][0]["billed"] == "yearly"


@pytest.mark.django_db
def test_no_subscriptions_means_no_data(user):
    data = run(user, "get_subscription_costs")

    assert data == {
        "as_of": "2026-09-15",
        "currency": "EUR",
        "has_data": False,
        "note": "The user has no subscriptions recorded.",
    }


@pytest.mark.django_db
def test_savings_progress_finds_the_goal_by_how_the_user_says_it(user, finances):
    SavingsGoal.objects.create(
        user=user, name="Laptop", target_amount=Decimal("1500.00"), status=SavingsGoalStatus.ARCHIVED
    )

    data = run(user, "get_savings_progress", goal="Japan Trip savings goal")

    assert data["goals"] == [
        {
            "name": "Japan trip",
            "status": "active",
            "currency": "EUR",
            "saved": "750.00",
            "target": "3000.00",
            "progress_percentage": 25.0,
            "still_needed": "2250.00",
            "target_date": "2027-03-15",
            "days_left": 181,
            "monthly_saving_needed": "375.00",
            "saved_in_base_currency": "750.00",
            "target_in_base_currency": "3000.00",
        }
    ]
    assert data["totals_of_goals_not_archived"]["saved"] == "750.00"


@pytest.mark.django_db
def test_an_unknown_goal_lists_the_existing_ones(user, finances):
    data = run(user, "get_savings_progress", goal="New car")

    assert data["has_data"] is False
    assert data["note"] == 'The user has no savings goal matching "New car". Their goals: "Japan trip".'


@pytest.mark.django_db
def test_the_current_month_is_compared_month_to_date(user, finances):
    data = run(user, "get_month_comparison", **SEP)

    assert data["month_to_date"] is True
    assert (data["current_period"]["from"], data["current_period"]["to"]) == ("2026-09-01", "2026-09-15")
    assert (data["compared_period"]["from"], data["compared_period"]["to"]) == ("2026-08-01", "2026-08-15")
    assert data["difference"]["total_expenses"] == "95.50"  # 195.50 vs 100.00 (the 80.00 on Aug 20 is later)
    assert data["percentage_change"]["total_expenses"] == 95.5
    assert data["expense_categories"] == [
        {"category": "Food", "current": "150.50", "compared": "100.00", "change": "50.50", "change_percentage": 50.5},
        {"category": "Transport", "current": "45.00", "compared": "0.00", "change": "45.00", "change_percentage": None},
    ]
    assert "still in progress" in data["note"]


@pytest.mark.django_db
def test_a_past_month_is_compared_in_full(user, finances):
    Transaction.objects.create(
        user=user, category=finances["food"], type="expense", amount=Decimal("50.00"), date=date(2026, 7, 9)
    )

    data = run(user, "get_month_comparison", **AUG)

    assert data["month_to_date"] is False
    assert data["current_period"]["total_expenses"] == "180.00"
    assert data["difference"]["total_expenses"] == "130.00"
    assert [row["category"] for row in data["expense_categories"]] == ["Transport", "Food"]  # largest increase first


@pytest.mark.django_db
def test_comparison_without_the_earlier_month_has_no_data(user, finances):
    data = run(user, "get_month_comparison", against="previous_year", **SEP)

    assert data["has_data"] is False
    assert data["note"] == "No transactions are recorded for September 2025, so there is nothing to compare."
    assert "difference" not in data


# --- Bad calls become error results -----------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("name", "arguments", "problem"),
    [
        (
            "get_monthly_spending",
            {"year": 2026, "month": 13},
            {"invalid_arguments": {"month": ["Ensure this value is less than or equal to 12."]}},
        ),
        ("get_monthly_spending", {"month": 9}, {"invalid_arguments": {"year": ["This field is required."]}}),
        (
            "get_month_comparison",
            {**SEP, "against": "last_week"},
            {"invalid_arguments": {"against": ['"last_week" is not a valid choice.']}},
        ),
        ("get_monthly_spending", ["2026", "9"], "Arguments must be a JSON object."),
        ("delete_everything", {}, "Unknown tool 'delete_everything'. Available tools: " + ", ".join(TOOLS) + "."),
    ],
)
def test_invalid_calls_are_errors_for_the_model(user, name, arguments, problem):
    result = run_tool(user, name, arguments, TODAY)

    assert result.is_error and result.source is None
    assert json.loads(result.content) == {"error": problem}


@pytest.mark.django_db
def test_a_failing_tool_is_reported_not_raised(user, monkeypatch, caplog):
    def broken(*args, **kwargs):
        raise RuntimeError("database gone")

    monkeypatch.setattr(tools.services, "get_month_summary", broken)

    result = run_tool(user, "get_monthly_spending", SEP, TODAY)

    assert result.is_error
    assert json.loads(result.content) == {"error": "The data could not be loaded right now."}
    assert "Assistant tool get_monthly_spending failed" in caplog.text


# --- What the apps show under an answer -------------------------------------------------------


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ({"tool": "get_monthly_spending", "arguments": SEP}, ("Monthly spending", "September 2026")),
        (
            {"tool": "get_category_spending", "arguments": {**SEP, "category": "Food"}},
            ("Spending by category", "September 2026 · Food"),
        ),
        ({"tool": "get_month_comparison", "arguments": SEP}, ("Month comparison", "September 2026 vs August 2026")),
        (
            {"tool": "get_month_comparison", "arguments": {**SEP, "against": "previous_year"}},
            ("Month comparison", "September 2026 vs September 2025"),
        ),
        ({"tool": "get_savings_progress", "arguments": {"goal": "Japan trip"}}, ("Savings goals", "Japan trip")),
        ({"tool": "get_subscription_costs", "arguments": {}}, ("Subscriptions", None)),
        ({"tool": "a_removed_tool", "arguments": {}}, ("a_removed_tool", None)),
    ],
)
def test_describe_source(source, expected):
    assert describe_source(source) == expected
