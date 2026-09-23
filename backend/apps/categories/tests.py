import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.categories.defaults import DEFAULT_CATEGORIES, create_default_categories
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


@pytest.mark.django_db
def test_create_default_categories_seeds_expected_set(user):
    create_default_categories(user)

    categories = Category.objects.filter(user=user, is_system=True)
    assert categories.count() == len(DEFAULT_CATEGORIES)
    for name, category_type, color in DEFAULT_CATEGORIES:
        assert categories.filter(name=name, type=category_type, color=color).exists()
