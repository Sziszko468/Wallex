from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status

from apps.budgets.models import Budget
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

from .models import Category, TransactionType


@pytest.mark.django_db
def test_list_includes_system_and_custom_categories(auth_client, system_category, custom_category):
    response = auth_client.get(reverse("category-list"))

    assert response.status_code == status.HTTP_200_OK
    names = {item["name"] for item in response.data}
    assert {system_category.name, custom_category.name} <= names


@pytest.mark.django_db
def test_list_only_returns_own_categories(auth_client, custom_category, other_user_category):
    response = auth_client.get(reverse("category-list"))

    assert response.status_code == status.HTTP_200_OK
    ids = {item["id"] for item in response.data}
    assert custom_category.id in ids
    assert other_user_category.id not in ids


@pytest.mark.django_db
def test_list_unauthenticated_rejected(api_client):
    response = api_client.get(reverse("category-list"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_retrieve_own_category(auth_client, custom_category):
    response = auth_client.get(reverse("category-detail", args=[custom_category.id]))
    assert response.status_code == status.HTTP_200_OK
    assert response.data["id"] == custom_category.id


@pytest.mark.django_db
def test_retrieve_other_users_category_returns_404(auth_client, other_user_category):
    response = auth_client.get(reverse("category-detail", args=[other_user_category.id]))
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_create_custom_category_success(auth_client, user):
    payload = {"name": "Pets", "type": "expense"}
    response = auth_client.post(reverse("category-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    category = Category.objects.get(id=response.data["id"])
    assert category.user == user
    assert category.is_system is False


@pytest.mark.django_db
def test_create_category_ignores_client_supplied_is_system(auth_client):
    payload = {"name": "Pets", "type": "expense", "is_system": True}
    response = auth_client.post(reverse("category-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    category = Category.objects.get(id=response.data["id"])
    assert category.is_system is False


@pytest.mark.django_db
def test_create_category_unauthenticated_rejected(api_client):
    response = api_client.post(reverse("category-list"), {"name": "Pets", "type": "expense"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_create_duplicate_category_name_and_type_rejected(auth_client, custom_category):
    payload = {"name": custom_category.name, "type": custom_category.type}
    response = auth_client.post(reverse("category-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "name" in response.data


@pytest.mark.django_db
def test_create_duplicate_category_name_case_insensitive_rejected(auth_client, custom_category):
    payload = {"name": custom_category.name.upper(), "type": custom_category.type}
    response = auth_client.post(reverse("category-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "name" in response.data


@pytest.mark.django_db
def test_create_category_same_name_different_type_allowed(auth_client, custom_category):
    other_type = "income" if custom_category.type == "expense" else "expense"
    payload = {"name": custom_category.name, "type": other_type}
    response = auth_client.post(reverse("category-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_create_category_blank_name_rejected(auth_client):
    response = auth_client.post(reverse("category-list"), {"name": "   ", "type": "expense"})
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "name" in response.data


@pytest.mark.django_db
def test_create_category_invalid_color_rejected(auth_client):
    payload = {"name": "Pets", "type": "expense", "color": "not-a-color"}
    response = auth_client.post(reverse("category-list"), payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "color" in response.data


@pytest.mark.django_db
def test_patch_custom_category_success(auth_client, custom_category):
    response = auth_client.patch(
        reverse("category-detail", args=[custom_category.id]), {"name": "Renamed"}
    )
    assert response.status_code == status.HTTP_200_OK
    custom_category.refresh_from_db()
    assert custom_category.name == "Renamed"


@pytest.mark.django_db
def test_patch_system_category_rejected(auth_client, system_category):
    response = auth_client.patch(
        reverse("category-detail", args=[system_category.id]), {"name": "Renamed"}
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    system_category.refresh_from_db()
    assert system_category.name == "Food"


@pytest.mark.django_db
def test_patch_other_users_category_returns_404(auth_client, other_user_category):
    response = auth_client.patch(
        reverse("category-detail", args=[other_user_category.id]), {"name": "Hacked"}
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_put_method_not_allowed(auth_client, custom_category):
    response = auth_client.put(
        reverse("category-detail", args=[custom_category.id]),
        {"name": "Replaced", "type": "expense"},
    )
    assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.django_db
def test_delete_custom_category_success(auth_client, custom_category):
    response = auth_client.delete(reverse("category-detail", args=[custom_category.id]))
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Category.objects.filter(id=custom_category.id).exists()


@pytest.mark.django_db
def test_delete_system_category_rejected(auth_client, system_category):
    response = auth_client.delete(reverse("category-detail", args=[system_category.id]))
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert Category.objects.filter(id=system_category.id).exists()


@pytest.mark.django_db
def test_delete_other_users_category_returns_404(auth_client, other_user_category):
    response = auth_client.delete(reverse("category-detail", args=[other_user_category.id]))
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert Category.objects.filter(id=other_user_category.id).exists()


@pytest.mark.django_db
def test_delete_category_used_by_transaction_returns_409(auth_client, user, custom_category):
    Transaction.objects.create(
        user=user,
        category=custom_category,
        type=custom_category.type,
        amount=Decimal("10.00"),
        date=date.today(),
    )

    response = auth_client.delete(reverse("category-detail", args=[custom_category.id]))

    assert response.status_code == status.HTTP_409_CONFLICT
    assert Category.objects.filter(id=custom_category.id).exists()


def _used_by(kind, user, category):
    if kind == "transaction":
        Transaction.objects.create(user=user, category=category, type=category.type, amount=Decimal("5.00"), date=date(2026, 9, 1))
    elif kind == "recurring":
        RecurringTransaction.objects.create(
            user=user, category=category, name="Gym", type=category.type, amount=Decimal("5.00"),
            frequency=Frequency.MONTHLY, start_date=date(2026, 9, 1), next_occurrence_date=date(2026, 9, 1),
        )
    else:
        Budget.objects.create(user=user, category=category, amount=Decimal("50.00"), year=2026, month=9)


@pytest.mark.django_db
@pytest.mark.parametrize("usage", ["transaction", "recurring", "budget"])
def test_type_of_a_category_in_use_cannot_change(auth_client, user, usage):
    """Regression: switching expense→income left existing rows with the old type (and budgets on an income category)."""
    category = Category.objects.create(user=user, name="Gym", type=TransactionType.EXPENSE)
    _used_by(usage, user, category)

    response = auth_client.patch(reverse("category-detail", args=[category.id]), {"type": "income"}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "type" in response.data
    category.refresh_from_db()
    assert category.type == TransactionType.EXPENSE


@pytest.mark.django_db
def test_type_of_an_unused_category_can_change_and_other_fields_of_a_used_one_too(auth_client, user):
    unused = Category.objects.create(user=user, name="Misc", type=TransactionType.EXPENSE)
    used = Category.objects.create(user=user, name="Gym", type=TransactionType.EXPENSE)
    _used_by("transaction", user, used)

    assert auth_client.patch(reverse("category-detail", args=[unused.id]), {"type": "income"}, format="json").status_code == 200
    renamed = auth_client.patch(reverse("category-detail", args=[used.id]), {"name": "Fitness", "type": "expense"}, format="json")
    assert renamed.status_code == 200
    assert renamed.data["name"] == "Fitness"
