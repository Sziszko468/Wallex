from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.notifications.models import Device, NotificationPreference

TOKEN = "ExponentPushToken[abc123-XYZ_]"
OTHER_TOKEN = "ExpoPushToken[def456]"


def _register(client, token=TOKEN, platform="ios", name="iPhone"):
    return client.post(
        reverse("device-list"),
        {"expo_push_token": token, "platform": platform, "name": name},
        format="json",
    )


# --- Devices -----------------------------------------------------------------


@pytest.mark.django_db
def test_device_endpoints_require_authentication(api_client):
    assert _register(api_client).status_code == status.HTTP_401_UNAUTHORIZED
    assert api_client.get(reverse("device-list")).status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_register_device(auth_client, user):
    response = _register(auth_client)

    assert response.status_code == status.HTTP_201_CREATED
    device = Device.objects.get()
    assert device.user == user
    assert device.platform == "ios"
    assert response.data["id"] == device.id
    assert response.data["is_active"] is True


@pytest.mark.django_db
def test_registering_again_refreshes_instead_of_duplicating(auth_client):
    _register(auth_client)
    Device.objects.update(is_active=False, last_seen_at=timezone.now() - timedelta(days=30))

    response = _register(auth_client, name="Renamed")

    assert response.status_code == status.HTTP_200_OK
    device = Device.objects.get()
    assert device.is_active is True
    assert device.name == "Renamed"
    assert timezone.now() - device.last_seen_at < timedelta(minutes=1)


@pytest.mark.django_db
def test_token_moves_to_the_user_who_registers_it_last(auth_client, other_auth_client, other_user):
    _register(auth_client)

    response = _register(other_auth_client)

    assert response.status_code == status.HTTP_200_OK
    assert Device.objects.get().user == other_user


@pytest.mark.django_db
@pytest.mark.parametrize("token", ["", "not-a-token", "ExponentPushToken[]", "ExponentPushToken[a b]"])
def test_invalid_token_rejected(auth_client, token):
    response = _register(auth_client, token=token)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "expo_push_token" in response.data


@pytest.mark.django_db
def test_web_platform_rejected(auth_client):
    response = _register(auth_client, platform="web")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "platform" in response.data


@pytest.mark.django_db
def test_list_only_own_devices(auth_client, other_auth_client):
    _register(auth_client)
    _register(other_auth_client, token=OTHER_TOKEN)

    response = auth_client.get(reverse("device-list"))

    assert response.status_code == status.HTTP_200_OK
    assert [d["expo_push_token"] for d in response.data] == [TOKEN]


@pytest.mark.django_db
def test_unregister_own_device(auth_client):
    device_id = _register(auth_client).data["id"]

    response = auth_client.delete(reverse("device-detail", args=[device_id]))

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Device.objects.exists()


@pytest.mark.django_db
def test_cannot_unregister_someone_elses_device(auth_client, other_auth_client):
    device_id = _register(other_auth_client).data["id"]

    response = auth_client.delete(reverse("device-detail", args=[device_id]))

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert Device.objects.exists()


# --- Preferences -------------------------------------------------------------


@pytest.mark.django_db
def test_preferences_default_to_everything_on(auth_client, user):
    response = auth_client.get(reverse("notification-preferences"))

    assert response.status_code == status.HTTP_200_OK
    assert response.data["budget_warnings"] is True
    assert response.data["budget_exceeded"] is True
    assert response.data["recurring_reminders"] is True
    assert response.data["insights"] is True
    assert response.data["recurring_reminder_days"] == 2
    assert NotificationPreference.objects.filter(user=user).exists()


@pytest.mark.django_db
def test_update_preferences(auth_client, user):
    response = auth_client.patch(
        reverse("notification-preferences"),
        {"insights": False, "recurring_reminder_days": 5},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    preferences = NotificationPreference.objects.get(user=user)
    assert preferences.insights is False
    assert preferences.recurring_reminder_days == 5
    assert preferences.budget_warnings is True


@pytest.mark.django_db
@pytest.mark.parametrize("days", [0, 8])
def test_reminder_days_out_of_range_rejected(auth_client, days):
    response = auth_client.patch(
        reverse("notification-preferences"), {"recurring_reminder_days": days}, format="json"
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_preferences_put_not_allowed(auth_client):
    response = auth_client.put(reverse("notification-preferences"), {}, format="json")
    assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.django_db
def test_preferences_require_authentication(api_client):
    response = api_client.get(reverse("notification-preferences"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
