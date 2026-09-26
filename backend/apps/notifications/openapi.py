"""OpenAPI documentation for push devices and notification preferences."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view

from apps.common.openapi import validation_error

from .serializers import DeviceSerializer, NotificationPreferenceSerializer

_PUSH_PAYLOAD = """**Mobile only** — the web client never registers a device. Delivery goes through the Expo push service.

Every push carries `data` with `kind`, `notification_id` and the `screen` to open on tap:

| `kind` | Sent when | At most once per | `data.screen` |
|---|---|---|---|
| `budget_warning` | An expense or budget change brings a budget to ≥ 80 % (and ≤ 100 %) | budget | `budgets` |
| `budget_exceeded` | … above 100 % (the warning is skipped if both happen at once) | budget | `budgets` |
| `recurring_due` | An active recurring expense is due within `recurring_reminder_days` | recurring item + date | `recurring` |
| `insight` | An `alert` insight other than a budget one (e.g. `overspending`) | insight + month | `dashboard` |

Devices that haven't re-registered for longer than the refresh-token lifetime (7 days) are not sent to."""

_DEVICE_EXAMPLE = {
    "id": 4,
    "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "platform": "android",
    "name": "Pixel 8",
    "is_active": True,
    "last_seen_at": "2026-09-26T09:50:01.957921Z",
    "created_at": "2026-09-26T09:50:01.993330Z",
}

DEVICE_VIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=["Notifications"],
        summary="List push devices",
        description=f"The user's registered app installations, most recently seen first. Not paginated.\n\n{_PUSH_PAYLOAD}",
        responses={200: DeviceSerializer(many=True)},
    ),
    create=extend_schema(
        tags=["Notifications"],
        summary="Register this device for push",
        description=(
            "Call on every signed-in app start (after the OS granted notification permission). "
            "**Idempotent on the token:** an already registered token is updated (`200`) — refreshing "
            "`last_seen_at` and re-activating it — instead of creating a duplicate. A token registered by "
            "another account moves to the caller (same phone, different user)."
        ),
        responses={
            201: OpenApiResponse(DeviceSerializer, description="New device registered."),
            200: OpenApiResponse(DeviceSerializer, description="Token already known: updated."),
            400: validation_error(
                ("Invalid token", {"expo_push_token": ["Not a valid Expo push token."]}),
                ("Unknown platform", {"platform": ['"windows" is not a valid choice.']}),
            ),
        },
        examples=[
            OpenApiExample(
                "Register",
                request_only=True,
                value={"expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", "platform": "android", "name": "Pixel 8"},
            ),
            OpenApiExample("Registered", response_only=True, status_codes=["201"], value=_DEVICE_EXAMPLE),
        ],
    ),
    destroy=extend_schema(
        tags=["Notifications"],
        summary="Unregister a device",
        description="Stops push to that installation. The app calls it on logout and when push is switched off.",
        responses={204: OpenApiResponse(description="Removed.")},
    ),
)

_PREFERENCES_EXAMPLE = {
    "budget_warnings": True,
    "budget_exceeded": True,
    "recurring_reminders": True,
    "insights": True,
    "recurring_reminder_days": 2,
    "updated_at": "2026-09-26T09:49:57.384766Z",
}

NOTIFICATION_PREFERENCES_SCHEMA = extend_schema_view(
    get=extend_schema(
        tags=["Notifications"],
        summary="Get notification preferences",
        description=(
            "Which push notifications the user wants; applies to all of their devices. "
            "Created with the defaults (everything on, reminders 2 days ahead) on first access."
        ),
        responses={
            200: OpenApiResponse(
                NotificationPreferenceSerializer,
                examples=[OpenApiExample("Defaults", value=_PREFERENCES_EXAMPLE)],
            )
        },
    ),
    patch=extend_schema(
        tags=["Notifications"],
        summary="Update notification preferences",
        description="Changes any subset of the switches.",
        responses={
            200: NotificationPreferenceSerializer,
            400: validation_error(
                ("Out of range", {"recurring_reminder_days": ["Ensure this value is less than or equal to 7."]}),
                ("Not a boolean", {"insights": ["Must be a valid boolean."]}),
            ),
        },
        examples=[OpenApiExample("Turn off insights", request_only=True, value={"insights": False})],
    ),
)
