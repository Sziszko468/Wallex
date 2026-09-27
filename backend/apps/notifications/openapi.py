"""OpenAPI documentation for notifications: the in-app inbox, push devices and preferences."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view

from apps.common.openapi import error_response, validation_error

from .serializers import (
    DeviceSerializer,
    MarkAllReadSerializer,
    NotificationPreferenceSerializer,
    NotificationSerializer,
    UnreadCountSerializer,
)

_KINDS = """Every notification is decided and written by the server — the apps only show `title` and `body`.

| `kind` | Created when | At most once per | `related_object.type` | `data.screen` |
|---|---|---|---|---|
| `budget_warning` | An expense or budget change brings a budget to ≥ 80 % (and ≤ 100 %) | budget | `budget` | `budgets` |
| `budget_exceeded` | … above 100 % (the warning is skipped if both happen at once) | budget | `budget` | `budgets` |
| `subscription_due` | A subscription payment is due within `recurring_reminder_days` | payment | `subscription` | `subscriptions` |
| `recurring_due` | Any other recurring expense is due within `recurring_reminder_days` | payment | `recurring_transaction` | `recurring` |
| `savings_goal` | Money added (or the target lowered) takes a goal past 25, 50, 75, 90 or 100 % | goal + milestone | `savings_goal` | `savings_goals` |
| `unusual_spending` | A category is ≥ 20 % above its usual level for this point of the month (3-month baseline) | category + month | `category` | `transactions` |
| `monthly_summary` | In the first 7 days of a month: last month's spending and income | month | — | `dashboard` |
| `insight` | An `alert` insight other than a budget one (e.g. `overspending`) | insight + month | `category` or — | `dashboard` |

Budget and savings notifications are created by the request that changed the data; the others by the
hourly `send_scheduled_notifications` job. A kind switched off in the preferences isn't created at all."""

_PUSH = """**Push (mobile only)** — the web client never registers a device. Every notification is also pushed
through the Expo push service to the user's devices; the push `data` carries `kind`, `notification_id`,
`screen` and that screen's ids. Devices that haven't re-registered for longer than the refresh-token
lifetime (7 days) are not sent to."""

_NOTIFICATION_EXAMPLE = {
    "id": 42,
    "kind": "budget_warning",
    "title": "Budget almost used",
    "body": "You've used 82% of your Food budget for September.",
    "is_read": False,
    "read_at": None,
    "related_object": {"type": "budget", "id": 12},
    "data": {"screen": "budgets", "budget_id": 12, "year": 2026, "month": 9},
    "created_at": "2026-09-27T08:15:02.113240Z",
}

_SUMMARY_EXAMPLE = {
    "id": 41,
    "kind": "monthly_summary",
    "title": "Your August summary",
    "body": "You spent €1,234.56 and earned €2,000 in August. Spending was 8% lower than in July.",
    "is_read": True,
    "read_at": "2026-09-01T07:02:44.101000Z",
    "related_object": None,
    "data": {"screen": "dashboard", "year": 2026, "month": 8},
    "created_at": "2026-09-01T06:00:03.527781Z",
}

NOTIFICATION_VIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=["Notifications"],
        summary="List notifications",
        description=(
            "The user's in-app notifications, newest first, **paginated** (`count`, `next`, `previous`, "
            f"`results`). Filter with `is_read` (`true` / `false`; any other value is ignored) and `kind`.\n\n{_KINDS}\n\n{_PUSH}"
        ),
        responses={
            200: OpenApiResponse(NotificationSerializer(many=True), description="One page of notifications."),
            400: validation_error(
                ("Unknown kind", {"kind": ["Select a valid choice. foo is not one of the available choices."]}),
                description="`kind` is not a notification kind.",
            ),
            404: error_response("`page` is past the last page.", ("Past the end", {"detail": "Invalid page."})),
        },
        examples=[
            OpenApiExample(
                "Page",
                response_only=True,
                value={"count": 2, "next": None, "previous": None, "results": [_NOTIFICATION_EXAMPLE, _SUMMARY_EXAMPLE]},
            )
        ],
    ),
    retrieve=extend_schema(
        tags=["Notifications"],
        summary="Get a notification",
        responses={200: NotificationSerializer},
        examples=[OpenApiExample("Budget warning", response_only=True, value=_NOTIFICATION_EXAMPLE)],
    ),
    partial_update=extend_schema(
        tags=["Notifications"],
        summary="Mark a notification read or unread",
        description=(
            "`is_read` is the only field that can change; others are ignored. Marking a notification read "
            "again keeps its first `read_at`."
        ),
        responses={
            200: NotificationSerializer,
            400: validation_error(("Not a boolean", {"is_read": ["Must be a valid boolean."]})),
        },
        examples=[
            OpenApiExample("Mark read", request_only=True, value={"is_read": True}),
            OpenApiExample("Mark unread", request_only=True, value={"is_read": False}),
        ],
    ),
)

UNREAD_COUNT_SCHEMA = extend_schema(
    tags=["Notifications"],
    summary="Count unread notifications",
    description="For the badge on the notifications icon. Cheap: poll it on app start and when the app returns to the foreground.",
    responses={200: OpenApiResponse(UnreadCountSerializer, examples=[OpenApiExample("Three unread", value={"unread_count": 3})])},
    filters=False,
)

MARK_ALL_READ_SCHEMA = extend_schema(
    tags=["Notifications"],
    summary="Mark every notification read",
    description="Idempotent: calling it again reports `marked: 0`.",
    request=None,
    responses={200: OpenApiResponse(MarkAllReadSerializer, examples=[OpenApiExample("Marked", value={"marked": 3})])},
    filters=False,
)

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
        description=f"The user's registered app installations, most recently seen first. Not paginated.\n\n{_PUSH}",
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
    "subscription_reminders": True,
    "recurring_reminders": True,
    "savings_goals": True,
    "unusual_spending": True,
    "monthly_summary": True,
    "insights": True,
    "recurring_reminder_days": 2,
    "updated_at": "2026-09-26T09:49:57.384766Z",
}

NOTIFICATION_PREFERENCES_SCHEMA = extend_schema_view(
    get=extend_schema(
        tags=["Notifications"],
        summary="Get notification preferences",
        description=(
            "One switch per notification `kind`; a switched-off kind is not created at all — neither in the "
            "app nor as a push. Applies to all of the user's devices. Created with the defaults (everything "
            "on, reminders 2 days ahead) on first access."
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
        examples=[OpenApiExample("Turn off the monthly summary", request_only=True, value={"monthly_summary": False})],
    ),
)
