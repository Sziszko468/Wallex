import pytest

from .models import Category, TransactionType


@pytest.fixture
def custom_category(user):
    return Category.objects.create(user=user, name="Custom Hobby", type=TransactionType.EXPENSE)


@pytest.fixture
def system_category(user):
    return Category.objects.create(
        user=user, name="Food", type=TransactionType.EXPENSE, is_system=True
    )


@pytest.fixture
def other_user_category(other_user):
    return Category.objects.create(
        user=other_user, name="Custom Hobby", type=TransactionType.EXPENSE
    )
