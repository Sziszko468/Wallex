from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.budgets.models import Budget
from apps.categories.models import Category, TransactionType


@pytest.fixture
def expense_category(user):
    return Category.objects.create(user=user, name="Groceries", type=TransactionType.EXPENSE)


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
