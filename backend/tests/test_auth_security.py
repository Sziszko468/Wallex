"""Security audit — authentication, account handling and brute-force protection."""

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
PASSWORD = "StrongPass!2024"


@pytest.fixture(autouse=True)
def fresh_throttle_counters():
    cache.clear()
    yield
    cache.clear()


def _register(client, email, password=PASSWORD):
    return client.post(
        reverse("auth-register"), {"email": email, "password": password, "password_confirm": password}
    )


# --- Accounts ---------------------------------------------------------------


@pytest.mark.django_db
def test_email_is_case_insensitive_one_account_per_address(api_client):
    assert _register(api_client, "anna@example.com").status_code == status.HTTP_201_CREATED

    duplicate = _register(api_client, "Anna@Example.COM")

    assert duplicate.status_code == status.HTTP_400_BAD_REQUEST
    assert "email" in duplicate.data
    assert User.objects.count() == 1


@pytest.mark.django_db
def test_email_is_stored_normalized_and_login_ignores_case(api_client):
    _register(api_client, "  Anna@Example.com ")
    assert User.objects.get().email == "anna@example.com"

    response = api_client.post(reverse("auth-login"), {"email": "ANNA@example.com", "password": PASSWORD})

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_overlong_email_is_a_validation_error_not_a_crash(api_client):
    response = _register(api_client, f"{'a' * 140}@example.com")  # > 150 chars

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "email" in response.data


@pytest.mark.django_db
def test_privilege_fields_cannot_be_set_at_registration(api_client):
    response = api_client.post(
        reverse("auth-register"),
        {
            "email": "sneaky@example.com",
            "password": PASSWORD,
            "password_confirm": PASSWORD,
            "is_staff": True,
            "is_superuser": True,
            "is_active": False,
        },
    )

    assert response.status_code == status.HTTP_201_CREATED
    user = User.objects.get(email="sneaky@example.com")
    assert (user.is_staff, user.is_superuser, user.is_active) == (False, False, True)


@pytest.mark.django_db
def test_password_is_hashed_and_never_returned(api_client, auth_client):
    response = _register(api_client, "hash@example.com")

    user = User.objects.get(email="hash@example.com")
    assert user.password.startswith(("pbkdf2_", "argon2"))
    assert PASSWORD not in user.password
    assert "password" not in response.data
    assert "password" not in auth_client.get(reverse("auth-me")).data


@pytest.mark.django_db
@pytest.mark.parametrize("weak", ["short1!", "password123", "12345678901", "hash@example.com"])
def test_weak_passwords_rejected(api_client, weak):
    response = _register(api_client, "hash@example.com", password=weak)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "password" in response.data


# --- Tokens -----------------------------------------------------------------


@pytest.mark.django_db
def test_refresh_for_a_deleted_user_is_rejected_not_a_server_error(api_client, user):
    refresh = str(RefreshToken.for_user(user))
    user.delete()

    response = api_client.post(reverse("auth-refresh"), {"refresh": refresh})

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_deactivated_user_cannot_refresh_or_use_access_token(api_client, user):
    refresh = RefreshToken.for_user(user)
    user.is_active = False
    user.save()

    assert api_client.post(reverse("auth-refresh"), {"refresh": str(refresh)}).status_code == 401
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    assert api_client.get(reverse("auth-me")).status_code == 401


@pytest.mark.django_db
def test_tampered_token_is_rejected(api_client, user):
    access = str(RefreshToken.for_user(user).access_token)
    header, payload, signature = access.split(".")
    tampered = f"{header}.{payload}.{signature[:-2]}xx"

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tampered}")

    assert api_client.get(reverse("auth-me")).status_code == 401


@pytest.mark.django_db
def test_unsigned_alg_none_token_is_rejected(api_client, user):
    import base64
    import json

    def b64(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    token = f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64({'token_type': 'access', 'user_id': str(user.pk), 'exp': 9999999999, 'jti': 'x'})}."
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    assert api_client.get(reverse("auth-me")).status_code == 401


# --- Brute force --------------------------------------------------------------


@pytest.mark.django_db
def test_login_attempts_are_rate_limited(api_client, user):
    codes = [
        api_client.post(reverse("auth-login"), {"email": user.email, "password": f"wrong-{i}"}).status_code
        for i in range(12)
    ]

    assert codes[:10] == [401] * 10
    assert codes[-1] == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
def test_registration_is_rate_limited(api_client):
    codes = [_register(api_client, f"bulk{i}@example.com").status_code for i in range(12)]

    assert codes[-1] == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
def test_token_refresh_is_rate_limited(api_client):
    codes = [api_client.post(reverse("auth-refresh"), {"refresh": "garbage"}).status_code for _ in range(35)]

    assert codes[-1] == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
def test_authenticated_api_use_has_a_ceiling(auth_client, settings, monkeypatch):
    from rest_framework.throttling import UserRateThrottle

    monkeypatch.setattr(UserRateThrottle, "THROTTLE_RATES", {"user": "3/minute"})

    codes = [auth_client.get(reverse("category-list")).status_code for _ in range(4)]

    assert codes == [200, 200, 200, 429]


@pytest.mark.django_db
def test_spoofed_forwarded_for_header_does_not_reset_the_login_limit(api_client, user):
    """Without a trusted proxy count, DRF would identify clients by X-Forwarded-For,
    which any attacker can rotate to dodge the limit."""
    codes = [
        api_client.post(
            reverse("auth-login"),
            {"email": user.email, "password": "wrong"},
            HTTP_X_FORWARDED_FOR=f"10.0.0.{i}",
        ).status_code
        for i in range(12)
    ]

    assert codes[-1] == status.HTTP_429_TOO_MANY_REQUESTS
