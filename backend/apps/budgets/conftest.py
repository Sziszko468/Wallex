import pytest

from apps.categories.models import Category, TransactionType


@pytest.fixture
def expense_category(user):
    return Category.objects.create(user=user, name="Groceries", type=TransactionType.EXPENSE)


@pytest.fixture
def income_category(user):
    return Category.objects.create(user=user, name="Salary", type=TransactionType.INCOME)


@pytest.fixture
def other_user_expense_category(other_user):
    return Category.objects.create(
        user=other_user, name="Groceries", type=TransactionType.EXPENSE
    )
