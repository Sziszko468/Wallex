import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

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
