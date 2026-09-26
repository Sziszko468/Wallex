from datetime import date
from decimal import Decimal

import pytest

from apps.analytics import services
from apps.budgets.models import Budget
from apps.categories.models import Category, TransactionType
from apps.transactions.models import Transaction


def _expense(user, category, amount, day):
    return Transaction.objects.create(
        user=user, category=category, type=TransactionType.EXPENSE,
        amount=Decimal(amount), date=date(2026, 9, day),
    )


def _income(user, category, amount, day):
    return Transaction.objects.create(
        user=user, category=category, type=TransactionType.INCOME,
        amount=Decimal(amount), date=date(2026, 9, day),
    )


@pytest.mark.django_db
def test_get_month_summary_basic(user, food_category, salary_category):
    _expense(user, food_category, "200.00", 5)
    _expense(user, food_category, "120.00", 20)
    _income(user, salary_category, "3000.00", 1)

    summary = services.get_month_summary(user, 2026, 9)

    assert summary["total_income"] == Decimal("3000.00")
    assert summary["total_expenses"] == Decimal("320.00")
    assert summary["balance"] == Decimal("2680.00")
    assert summary["transaction_count"] == 3


@pytest.mark.django_db
def test_get_month_summary_no_transactions_returns_zeros(user):
    summary = services.get_month_summary(user, 2026, 9)

    assert summary["total_income"] == Decimal("0.00")
    assert summary["total_expenses"] == Decimal("0.00")
    assert summary["balance"] == Decimal("0.00")
    assert summary["transaction_count"] == 0


@pytest.mark.django_db
def test_get_month_summary_uses_single_query(django_assert_num_queries, user, food_category):
    _expense(user, food_category, "50.00", 5)
    with django_assert_num_queries(1):
        services.get_month_summary(user, 2026, 9)


@pytest.mark.django_db
def test_get_category_breakdown_percentages(user, food_category, transport_category):
    _expense(user, food_category, "300.00", 5)
    _expense(user, transport_category, "100.00", 6)

    breakdown = services.get_category_breakdown(user, 2026, 9)

    assert breakdown[0]["category_name"] == "Food"
    assert breakdown[0]["amount"] == Decimal("300.00")
    assert breakdown[0]["percentage"] == Decimal("75.00")
    assert breakdown[1]["category_name"] == "Transport"
    assert breakdown[1]["percentage"] == Decimal("25.00")


@pytest.mark.django_db
def test_get_category_breakdown_empty_when_no_expenses(user):
    assert services.get_category_breakdown(user, 2026, 9) == []


@pytest.mark.django_db
def test_get_category_breakdown_ignores_other_months(user, food_category):
    _expense(user, food_category, "999.00", 5)
    breakdown = services.get_category_breakdown(user, 2026, 8)
    assert breakdown == []


@pytest.mark.django_db
def test_get_top_spending_category_returns_highest(user, food_category, transport_category):
    _expense(user, food_category, "300.00", 5)
    _expense(user, transport_category, "100.00", 6)

    rows = services.get_category_expense_rows(user, 2026, 9)
    top = services.get_top_spending_category(rows)

    assert top["category_name"] == "Food"
    assert top["amount"] == Decimal("300.00")


@pytest.mark.django_db
def test_get_top_spending_category_none_when_no_expenses(user):
    assert services.get_top_spending_category([]) is None


@pytest.mark.django_db
def test_get_budget_usage_category_specific(user, food_category):
    Budget.objects.create(user=user, category=food_category, amount=Decimal("400.00"), year=2026, month=9)
    _expense(user, food_category, "200.00", 5)
    _expense(user, food_category, "120.00", 20)

    usage = services.get_budget_usage(user, 2026, 9)

    assert len(usage) == 1
    assert usage[0]["spent_amount"] == Decimal("320.00")
    assert usage[0]["remaining_amount"] == Decimal("80.00")
    assert usage[0]["usage_percentage"] == Decimal("80.00")


@pytest.mark.django_db
def test_get_budget_usage_zero_spent(user, food_category):
    Budget.objects.create(user=user, category=food_category, amount=Decimal("400.00"), year=2026, month=9)

    usage = services.get_budget_usage(user, 2026, 9)

    assert usage[0]["spent_amount"] == Decimal("0.00")
    assert usage[0]["remaining_amount"] == Decimal("400.00")
    assert usage[0]["usage_percentage"] == Decimal("0.00")


@pytest.mark.django_db
def test_get_budget_usage_overall_budget_sums_all_categories(user, food_category, transport_category, salary_category):
    Budget.objects.create(user=user, category=None, amount=Decimal("500.00"), year=2026, month=9)
    _expense(user, food_category, "200.00", 5)
    _expense(user, transport_category, "50.00", 6)
    _income(user, salary_category, "3000.00", 1)

    usage = services.get_budget_usage(user, 2026, 9)

    assert usage[0]["category_name"] == "Overall"
    assert usage[0]["spent_amount"] == Decimal("250.00")


@pytest.mark.django_db
def test_get_dashboard_empty_state_for_new_user(user):
    dashboard = services.get_dashboard(user, 2026, 9)

    assert dashboard["total_income"] == Decimal("0.00")
    assert dashboard["total_expenses"] == Decimal("0.00")
    assert dashboard["balance"] == Decimal("0.00")
    assert dashboard["transaction_count"] == 0
    assert dashboard["top_spending_category"] is None
    assert dashboard["budget_usage"] == []


@pytest.mark.django_db
def test_get_dashboard_query_count_constant_regardless_of_volume(django_assert_num_queries, user):
    categories = [
        Category.objects.create(user=user, name=f"Cat{i}", type=TransactionType.EXPENSE) for i in range(5)
    ]
    for category in categories:
        Budget.objects.create(user=user, category=category, amount=Decimal("100.00"), year=2026, month=9)
        for day in range(1, 6):
            _expense(user, category, "10.00", day)

    with django_assert_num_queries(3):
        services.get_dashboard(user, 2026, 9)


@pytest.mark.django_db
def test_get_monthly_analytics_returns_all_12_months(user, food_category):
    _expense(user, food_category, "100.00", 5)

    months = services.get_monthly_analytics(user, 2026)

    assert len(months) == 12
    assert [m["month_name"] for m in months][:3] == ["January", "February", "March"]


@pytest.mark.django_db
def test_get_monthly_analytics_fills_zero_for_months_without_data(user, food_category):
    _expense(user, food_category, "100.00", 5)

    months = services.get_monthly_analytics(user, 2026)
    august = next(m for m in months if m["month"] == 8)
    september = next(m for m in months if m["month"] == 9)

    assert august["income"] == Decimal("0.00")
    assert august["expenses"] == Decimal("0.00")
    assert september["expenses"] == Decimal("100.00")


@pytest.mark.django_db
def test_get_monthly_analytics_uses_single_query(django_assert_num_queries, user, food_category):
    _expense(user, food_category, "100.00", 5)
    with django_assert_num_queries(1):
        services.get_monthly_analytics(user, 2026)


@pytest.mark.django_db
def test_get_comparison_basic_difference(user, food_category):
    _expense(user, food_category, "100.00", 5)  # September
    Transaction.objects.create(
        user=user, category=food_category, type=TransactionType.EXPENSE,
        amount=Decimal("80.00"), date=date(2026, 8, 5),
    )

    comparison = services.get_comparison(user, 2026, 9)

    assert comparison["current_month"]["total_expenses"] == Decimal("100.00")
    assert comparison["previous_month"]["total_expenses"] == Decimal("80.00")
    assert comparison["difference"]["total_expenses"] == Decimal("20.00")
    assert comparison["percentage_difference"]["total_expenses"] == Decimal("25.00")


@pytest.mark.django_db
def test_get_comparison_percentage_none_when_previous_month_is_zero(user, food_category):
    _expense(user, food_category, "100.00", 5)

    comparison = services.get_comparison(user, 2026, 9)

    assert comparison["previous_month"]["total_expenses"] == Decimal("0.00")
    assert comparison["difference"]["total_expenses"] == Decimal("100.00")
    assert comparison["percentage_difference"]["total_expenses"] is None


@pytest.mark.django_db
def test_get_comparison_both_months_zero(user):
    comparison = services.get_comparison(user, 2026, 9)

    assert comparison["difference"]["total_expenses"] == Decimal("0.00")
    assert comparison["percentage_difference"]["total_expenses"] is None


@pytest.mark.django_db
def test_get_comparison_january_wraps_to_previous_december(user, food_category):
    Transaction.objects.create(
        user=user, category=food_category, type=TransactionType.EXPENSE,
        amount=Decimal("60.00"), date=date(2025, 12, 15),
    )

    comparison = services.get_comparison(user, 2026, 1)

    assert comparison["previous_month"]["year"] == 2025
    assert comparison["previous_month"]["month"] == 12
    assert comparison["previous_month"]["total_expenses"] == Decimal("60.00")


@pytest.mark.django_db
def test_get_comparison_uses_three_queries(django_assert_num_queries, user, food_category):
    _expense(user, food_category, "100.00", 5)
    # Two month summaries + one query for every category of both months.
    with django_assert_num_queries(3):
        services.get_comparison(user, 2026, 9)
