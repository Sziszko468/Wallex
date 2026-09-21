import pytest

from apps.categories.models import Category, TransactionType


@pytest.fixture
def food_category(user):
    return Category.objects.create(user=user, name="Food", type=TransactionType.EXPENSE)


@pytest.fixture
def transport_category(user):
    return Category.objects.create(user=user, name="Transport", type=TransactionType.EXPENSE)


@pytest.fixture
def salary_category(user):
    return Category.objects.create(user=user, name="Salary", type=TransactionType.INCOME)
