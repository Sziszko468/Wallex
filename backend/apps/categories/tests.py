import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.categories.models import Category, TransactionType


@pytest.mark.django_db
def test_create_category(user):
    category = Category.objects.create(user=user, name="Groceries", type=TransactionType.EXPENSE)
    assert category.pk is not None
    assert str(category) == "Groceries (Expense)"


@pytest.mark.django_db
def test_category_unique_per_user_name_type(user):
    Category.objects.create(user=user, name="Groceries", type=TransactionType.EXPENSE)
    with pytest.raises(IntegrityError):
        Category.objects.create(user=user, name="Groceries", type=TransactionType.EXPENSE)


@pytest.mark.django_db
def test_category_same_name_different_type_allowed(user):
    Category.objects.create(user=user, name="Bonus", type=TransactionType.EXPENSE)
    category = Category.objects.create(user=user, name="Bonus", type=TransactionType.INCOME)
    assert category.pk is not None


@pytest.mark.django_db
def test_category_invalid_color_rejected(user):
    category = Category(user=user, name="Rent", type=TransactionType.EXPENSE, color="not-a-color")
    with pytest.raises(ValidationError):
        category.full_clean()
