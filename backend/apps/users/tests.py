import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.categories.defaults import DEFAULT_CATEGORIES
from apps.categories.models import Category

User = get_user_model()


@pytest.mark.django_db
def test_register_success(api_client):
    response = api_client.post(
        reverse("auth-register"),
        {
            "email": "newuser@example.com",
            "password": "StrongPass!2024",
            "password_confirm": "StrongPass!2024",
            "first_name": "New",
            "last_name": "User",
        },
    )
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["email"] == "newuser@example.com"
    assert "password" not in response.data
    created_user = User.objects.get(email="newuser@example.com")
    assert created_user.check_password("StrongPass!2024")


@pytest.mark.django_db
def test_register_seeds_default_categories(api_client):
    response = api_client.post(
        reverse("auth-register"),
        {
            "email": "seeded@example.com",
            "password": "StrongPass!2024",
            "password_confirm": "StrongPass!2024",
        },
    )
    assert response.status_code == status.HTTP_201_CREATED
    created_user = User.objects.get(email="seeded@example.com")
    categories = Category.objects.filter(user=created_user, is_system=True)
    assert categories.count() == len(DEFAULT_CATEGORIES)


@pytest.mark.django_db
def test_register_password_mismatch(api_client):
    response = api_client.post(
        reverse("auth-register"),
        {
            "email": "mismatch@example.com",
            "password": "StrongPass!2024",
            "password_confirm": "Different!2024",
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "password_confirm" in response.data


@pytest.mark.django_db
def test_register_weak_password_rejected(api_client):
    response = api_client.post(
        reverse("auth-register"),
        {
            "email": "weak@example.com",
            "password": "12345678",
            "password_confirm": "12345678",
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "password" in response.data


@pytest.mark.django_db
def test_register_duplicate_email_rejected(api_client, user):
    response = api_client.post(
        reverse("auth-register"),
        {
            "email": user.email,
            "password": "StrongPass!2024",
            "password_confirm": "StrongPass!2024",
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "email" in response.data


@pytest.mark.django_db
def test_login_success(api_client, user):
    response = api_client.post(
        reverse("auth-login"), {"email": user.email, "password": "testpass123"}
    )
    assert response.status_code == status.HTTP_200_OK
    assert "access" in response.data
    assert "refresh" in response.data


@pytest.mark.django_db
def test_login_wrong_password_rejected(api_client, user):
    response = api_client.post(
        reverse("auth-login"), {"email": user.email, "password": "wrong-password"}
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_login_nonexistent_email_rejected(api_client):
    response = api_client.post(
        reverse("auth-login"), {"email": "ghost@example.com", "password": "whatever123"}
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_refresh_rotates_token(api_client, user):
    refresh = RefreshToken.for_user(user)
    response = api_client.post(reverse("auth-refresh"), {"refresh": str(refresh)})
    assert response.status_code == status.HTTP_200_OK
    assert "access" in response.data
    assert "refresh" in response.data
    assert response.data["refresh"] != str(refresh)


@pytest.mark.django_db
def test_refresh_invalid_token_rejected(api_client):
    response = api_client.post(reverse("auth-refresh"), {"refresh": "not-a-real-token"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_me_returns_authenticated_user(api_client, user):
    access = RefreshToken.for_user(user).access_token
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = api_client.get(reverse("auth-me"))
    assert response.status_code == status.HTTP_200_OK
    assert response.data["email"] == user.email
    assert response.data["base_currency"] == "EUR"  # every existing and new user starts in euros


@pytest.mark.django_db
def test_me_requires_authentication(api_client):
    response = api_client.get(reverse("auth-me"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_logout_blacklists_refresh_token(api_client, user):
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    logout_response = api_client.post(reverse("auth-logout"), {"refresh": str(refresh)})
    assert logout_response.status_code == status.HTTP_200_OK

    api_client.credentials()
    refresh_response = api_client.post(reverse("auth-refresh"), {"refresh": str(refresh)})
    assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_logout_requires_refresh_token(api_client, user):
    access = RefreshToken.for_user(user).access_token
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = api_client.post(reverse("auth-logout"), {})
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_register_does_not_return_tokens(api_client):
    response = api_client.post(
        reverse("auth-register"),
        {"email": "notokens@example.com", "password": "StrongPass!2024", "password_confirm": "StrongPass!2024"},
    )
    assert response.status_code == status.HTTP_201_CREATED
    assert "access" not in response.data
    assert "refresh" not in response.data


@pytest.mark.django_db
def test_rotated_refresh_token_cannot_be_reused(api_client, user):
    """A stolen refresh token stops working as soon as the real client refreshes."""
    old_refresh = str(RefreshToken.for_user(user))
    assert api_client.post(reverse("auth-refresh"), {"refresh": old_refresh}).status_code == status.HTTP_200_OK

    reuse = api_client.post(reverse("auth-refresh"), {"refresh": old_refresh})

    assert reuse.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_refresh_token_is_not_accepted_as_access_token(api_client, user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user)}")
    assert api_client.get(reverse("auth-me")).status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_login_is_by_email_and_password_only(api_client, user):
    response = api_client.post(reverse("auth-login"), {"email": user.email.upper(), "password": "wrong"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_cannot_log_out_another_users_session(api_client, user, other_user):
    """Logout may only revoke the caller's own refresh token."""
    victims_refresh = RefreshToken.for_user(other_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")

    response = api_client.post(reverse("auth-logout"), {"refresh": str(victims_refresh)})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    api_client.credentials()
    still_valid = api_client.post(reverse("auth-refresh"), {"refresh": str(victims_refresh)})
    assert still_valid.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_a_user_with_financial_data_can_be_deleted_with_everything_they_own(user):
    """Regression: PROTECT on Transaction/RecurringTransaction.category blocked the user's own cascade
    (ProtectedError), so no active user could be deleted — not by an admin, not for a GDPR request."""
    from datetime import date
    from decimal import Decimal

    from apps.budgets.models import Budget
    from apps.categories.models import Category, TransactionType
    from apps.notifications.models import Device, Notification
    from apps.transactions.models import Frequency, RecurringTransaction, Transaction

    category = Category.objects.create(user=user, name="Food", type=TransactionType.EXPENSE)
    Transaction.objects.create(user=user, category=category, type="expense", amount=Decimal("5.00"), date=date(2026, 9, 1))
    RecurringTransaction.objects.create(
        user=user, category=category, name="Box", type="expense", amount=Decimal("9.00"),
        frequency=Frequency.MONTHLY, start_date=date(2026, 9, 1), next_occurrence_date=date(2026, 9, 1),
    )
    Budget.objects.create(user=user, category=category, amount=Decimal("50.00"), year=2026, month=9)
    Device.objects.create(user=user, expo_push_token="ExponentPushToken[abc]", platform="ios")
    Notification.objects.create(user=user, kind="insight", title="t", body="b", dedupe_key="k")

    user.delete()

    for model in (Category, Transaction, RecurringTransaction, Budget, Device, Notification):
        assert not model.objects.exists(), model.__name__
