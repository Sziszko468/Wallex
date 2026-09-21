from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.budgets.models import Budget
from apps.categories.models import Category, TransactionType
from apps.transactions.models import Transaction


@pytest.mark.django_db
def test_create_category_budget(user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("300.00"), year=2026, month=9
    )
    assert budget.pk is not None


@pytest.mark.django_db
def test_create_overall_budget_without_category(user):
    budget = Budget.objects.create(
        user=user, category=None, amount=Decimal("2000.00"), year=2026, month=9
    )
    assert budget.category is None


@pytest.mark.django_db
def test_duplicate_category_budget_same_month_rejected(user, expense_category):
    Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("300.00"), year=2026, month=9
    )
    with pytest.raises(IntegrityError):
        Budget.objects.create(
            user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
        )


@pytest.mark.django_db
def test_duplicate_overall_budget_same_month_rejected(user):
    Budget.objects.create(user=user, category=None, amount=Decimal("2000.00"), year=2026, month=9)
    with pytest.raises(IntegrityError):
        Budget.objects.create(user=user, category=None, amount=Decimal("2500.00"), year=2026, month=9)


@pytest.mark.django_db
def test_category_budget_and_overall_budget_can_coexist(user, expense_category):
    Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("300.00"), year=2026, month=9
    )
    overall = Budget.objects.create(
        user=user, category=None, amount=Decimal("2000.00"), year=2026, month=9
    )
    assert overall.pk is not None


@pytest.mark.django_db
def test_budget_month_out_of_range_rejected(user, expense_category):
    with pytest.raises(IntegrityError):
        Budget.objects.create(
            user=user, category=expense_category, amount=Decimal("300.00"), year=2026, month=13
        )


@pytest.mark.django_db
def test_get_spent_amount_sums_matching_expenses(user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    Transaction.objects.create(
        user=user, category=expense_category, type=TransactionType.EXPENSE,
        amount=Decimal("200.00"), date=date(2026, 9, 5),
    )
    Transaction.objects.create(
        user=user, category=expense_category, type=TransactionType.EXPENSE,
        amount=Decimal("120.00"), date=date(2026, 9, 20),
    )

    assert budget.get_spent_amount() == Decimal("320.00")


@pytest.mark.django_db
def test_get_spent_amount_zero_when_no_transactions(user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    assert budget.get_spent_amount() == Decimal("0.00")


@pytest.mark.django_db
def test_get_spent_amount_ignores_income_transactions(user, expense_category, income_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    Transaction.objects.create(
        user=user, category=income_category, type=TransactionType.INCOME,
        amount=Decimal("1000.00"), date=date(2026, 9, 10),
    )

    assert budget.get_spent_amount() == Decimal("0.00")


@pytest.mark.django_db
def test_get_spent_amount_ignores_other_months(user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    Transaction.objects.create(
        user=user, category=expense_category, type=TransactionType.EXPENSE,
        amount=Decimal("999.00"), date=date(2026, 8, 31),
    )
    Transaction.objects.create(
        user=user, category=expense_category, type=TransactionType.EXPENSE,
        amount=Decimal("999.00"), date=date(2026, 10, 1),
    )

    assert budget.get_spent_amount() == Decimal("0.00")


@pytest.mark.django_db
def test_get_spent_amount_ignores_other_users_transactions(user, other_user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    other_category = Category.objects.create(
        user=other_user, name="Groceries", type=TransactionType.EXPENSE
    )
    Transaction.objects.create(
        user=other_user, category=other_category, type=TransactionType.EXPENSE,
        amount=Decimal("500.00"), date=date(2026, 9, 10),
    )

    assert budget.get_spent_amount() == Decimal("0.00")


@pytest.mark.django_db
def test_get_spent_amount_for_overall_budget_sums_all_categories(user, expense_category, income_category):
    other_expense_category = Category.objects.create(
        user=user, name="Transport", type=TransactionType.EXPENSE
    )
    budget = Budget.objects.create(
        user=user, category=None, amount=Decimal("2000.00"), year=2026, month=9
    )
    Transaction.objects.create(
        user=user, category=expense_category, type=TransactionType.EXPENSE,
        amount=Decimal("200.00"), date=date(2026, 9, 5),
    )
    Transaction.objects.create(
        user=user, category=other_expense_category, type=TransactionType.EXPENSE,
        amount=Decimal("50.00"), date=date(2026, 9, 6),
    )
    Transaction.objects.create(
        user=user, category=income_category, type=TransactionType.INCOME,
        amount=Decimal("1000.00"), date=date(2026, 9, 1),
    )

    assert budget.get_spent_amount() == Decimal("250.00")
