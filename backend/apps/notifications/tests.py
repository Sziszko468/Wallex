import io
import json
import urllib.error
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone

from apps.budgets.models import Budget
from apps.categories.models import Category, TransactionType
from apps.notifications import expo, services
from apps.notifications.models import (
    Device,
    Notification,
    NotificationKind,
    NotificationPreference,
    NotificationStatus,
)
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

# Captured at import time — the autouse `push_outbox` fixture replaces the module attribute.
REAL_SEND_PUSH_MESSAGES = expo.send_push_messages

TODAY = timezone.localdate()


@pytest.fixture
def shopping(user):
    return Category.objects.create(user=user, name="Shopping", type=TransactionType.EXPENSE)


@pytest.fixture
def salary(user):
    return Category.objects.create(user=user, name="Salary", type=TransactionType.INCOME)


@pytest.fixture
def device(user):
    return Device.objects.create(user=user, expo_push_token="ExponentPushToken[phone1]", platform="ios")


@pytest.fixture
def shopping_budget(user, shopping):
    return Budget.objects.create(
        user=user, category=shopping, amount=Decimal("100.00"), year=TODAY.year, month=TODAY.month
    )


def _post_expense(client, category, amount, on=TODAY):
    return client.post(
        reverse("transaction-list"),
        {"category": category.id, "type": "expense", "amount": amount, "date": on.isoformat()},
        format="json",
    )


def _kinds(user):
    return list(Notification.objects.filter(user=user).values_list("kind", flat=True))


# --- Budget thresholds (triggered by the API) --------------------------------


@pytest.mark.django_db
def test_budget_warning_at_80_percent_is_pushed(
    auth_client, user, shopping, shopping_budget, device, push_outbox, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        response = _post_expense(auth_client, shopping, "80.00")

    assert response.status_code == 201
    notification = Notification.objects.get(user=user)
    assert notification.kind == NotificationKind.BUDGET_WARNING
    assert notification.body == f"You've used 80% of your Shopping budget for {TODAY:%B}."
    assert notification.status == NotificationStatus.SENT
    [message] = push_outbox
    assert message["to"] == device.expo_push_token
    assert message["title"] == "Budget almost used"
    assert message["data"]["screen"] == "budgets"
    assert message["data"]["notification_id"] == notification.id


@pytest.mark.django_db
def test_below_threshold_no_notification(auth_client, user, shopping, shopping_budget, device):
    _post_expense(auth_client, shopping, "79.00")
    assert _kinds(user) == []


@pytest.mark.django_db
def test_budget_exceeded_skips_the_warning(auth_client, user, shopping, shopping_budget, device):
    _post_expense(auth_client, shopping, "150.00")

    notification = Notification.objects.get(user=user)
    assert notification.kind == NotificationKind.BUDGET_EXCEEDED
    assert notification.body == f"You've spent 150% of your Shopping budget for {TODAY:%B}."


@pytest.mark.django_db
def test_each_threshold_notifies_only_once(auth_client, user, shopping, shopping_budget, device):
    _post_expense(auth_client, shopping, "85.00")  # warning
    _post_expense(auth_client, shopping, "5.00")  # still warning range
    _post_expense(auth_client, shopping, "20.00")  # exceeded
    _post_expense(auth_client, shopping, "20.00")  # still exceeded

    assert sorted(_kinds(user)) == [NotificationKind.BUDGET_EXCEEDED, NotificationKind.BUDGET_WARNING]


@pytest.mark.django_db
def test_overall_budget(auth_client, user, shopping, device):
    Budget.objects.create(user=user, category=None, amount=Decimal("100.00"), year=TODAY.year, month=TODAY.month)

    _post_expense(auth_client, shopping, "120.00")

    assert Notification.objects.get(user=user).body.startswith("You've spent 120% of your overall budget")


@pytest.mark.django_db
def test_income_does_not_trigger_budget_checks(auth_client, user, salary, shopping_budget, device):
    Transaction.objects.create(
        user=user, category=salary, type=TransactionType.INCOME, amount=Decimal("5000.00"), date=TODAY
    )
    response = auth_client.post(
        reverse("transaction-list"),
        {"category": salary.id, "type": "income", "amount": "100.00", "date": TODAY.isoformat()},
        format="json",
    )
    assert response.status_code == 201
    assert _kinds(user) == []


@pytest.mark.django_db
def test_editing_an_expense_triggers_checks(auth_client, user, shopping, shopping_budget, device):
    transaction_id = _post_expense(auth_client, shopping, "10.00").data["id"]

    auth_client.patch(reverse("transaction-detail", args=[transaction_id]), {"amount": "95.00"}, format="json")

    assert _kinds(user) == [NotificationKind.BUDGET_WARNING]


@pytest.mark.django_db
def test_lowering_a_budget_below_spending_triggers_exceeded(auth_client, user, shopping, shopping_budget, device):
    _post_expense(auth_client, shopping, "60.00")

    auth_client.patch(reverse("budget-detail", args=[shopping_budget.id]), {"amount": "50.00"}, format="json")

    assert _kinds(user) == [NotificationKind.BUDGET_EXCEEDED]


@pytest.mark.django_db
def test_csv_import_triggers_checks(auth_client, user, shopping_budget, device):
    # "Amazon" is auto-categorized as Shopping by the importer.
    csv_file = SimpleUploadedFile(
        "import.csv",
        f"date,description,amount\n{TODAY.isoformat()},Amazon order,-90.00\n".encode(),
        content_type="text/csv",
    )

    response = auth_client.post(reverse("transaction-import-csv"), {"file": csv_file}, format="multipart")

    assert response.status_code == 200
    assert response.data["imported"] == 1
    assert _kinds(user) == [NotificationKind.BUDGET_WARNING]


@pytest.mark.django_db
def test_disabled_preference_suppresses_notification(auth_client, user, shopping, shopping_budget, device):
    NotificationPreference.objects.create(user=user, budget_warnings=False)

    _post_expense(auth_client, shopping, "85.00")

    assert _kinds(user) == []


@pytest.mark.django_db
def test_nothing_is_pushed_before_commit(auth_client, user, shopping, shopping_budget, device, push_outbox):
    # Outside django_capture_on_commit_callbacks the test transaction never commits.
    _post_expense(auth_client, shopping, "85.00")

    assert push_outbox == []
    assert Notification.objects.get(user=user).status == NotificationStatus.PENDING


# --- Delivery ----------------------------------------------------------------


def _notification(user, key="event:1"):
    return Notification.objects.create(
        user=user, kind=NotificationKind.INSIGHT, title="T", body="B", dedupe_key=key
    )


@pytest.mark.django_db
def test_no_reachable_device_marks_skipped(user, push_outbox):
    notification = _notification(user)

    services.deliver(notification)

    assert notification.status == NotificationStatus.SKIPPED
    assert push_outbox == []


@pytest.mark.django_db
def test_stale_or_inactive_devices_are_not_used(user, push_outbox):
    Device.objects.create(user=user, expo_push_token="ExponentPushToken[off]", platform="ios", is_active=False)
    Device.objects.create(
        user=user,
        expo_push_token="ExponentPushToken[old]",
        platform="android",
        last_seen_at=timezone.now() - timedelta(days=8),
    )
    notification = _notification(user)

    services.deliver(notification)

    assert notification.status == NotificationStatus.SKIPPED
    assert push_outbox == []


@pytest.mark.django_db
def test_sends_to_every_reachable_device(user, device, push_outbox):
    Device.objects.create(user=user, expo_push_token="ExponentPushToken[tablet]", platform="android")

    services.deliver(_notification(user))

    assert {m["to"] for m in push_outbox} == {"ExponentPushToken[phone1]", "ExponentPushToken[tablet]"}


@pytest.mark.django_db
def test_device_not_registered_deactivates_device(user, device, monkeypatch):
    monkeypatch.setattr(
        expo,
        "send_push_messages",
        lambda messages: [expo.PushTicket(ok=False, error="DeviceNotRegistered", message="gone")],
    )
    notification = _notification(user)

    services.deliver(notification)

    device.refresh_from_db()
    assert device.is_active is False
    assert notification.status == NotificationStatus.FAILED
    assert notification.last_error == "DeviceNotRegistered"


@pytest.mark.django_db
def test_service_outage_marks_failed_and_retry_delivers(user, device, monkeypatch, push_outbox):
    working_send = expo.send_push_messages

    def outage(messages):
        raise expo.PushServiceError("Expo push service returned HTTP 503")

    monkeypatch.setattr(expo, "send_push_messages", outage)
    notification = _notification(user)
    services.deliver(notification)
    assert notification.status == NotificationStatus.FAILED
    assert notification.attempts == 1

    monkeypatch.setattr(expo, "send_push_messages", working_send)
    Notification.objects.filter(pk=notification.pk).update(created_at=timezone.now() - timedelta(minutes=10))

    assert services.retry_undelivered() == 1
    notification.refresh_from_db()
    assert notification.status == NotificationStatus.SENT
    assert notification.attempts == 2
    assert len(push_outbox) == 1


@pytest.mark.django_db
def test_retry_gives_up_after_max_attempts(user, device):
    notification = _notification(user)
    Notification.objects.filter(pk=notification.pk).update(
        status=NotificationStatus.FAILED,
        attempts=services.MAX_DELIVERY_ATTEMPTS,
        created_at=timezone.now() - timedelta(minutes=10),
    )

    assert services.retry_undelivered() == 0


@pytest.mark.django_db
def test_retry_leaves_fresh_pending_rows_to_their_own_request(user, device):
    _notification(user)  # PENDING, created just now

    assert services.retry_undelivered() == 0


# --- Scheduled: recurring reminders & insights --------------------------------


def _rent(user, category, start, **extra):
    return RecurringTransaction.objects.create(
        user=user,
        category=category,
        name="Rent",
        type=TransactionType.EXPENSE,
        amount=Decimal("800.00"),
        frequency=Frequency.MONTHLY,
        start_date=start,
        next_occurrence_date=start,
        **extra,
    )


@pytest.mark.django_db
def test_recurring_reminder_within_window(user, shopping, device):
    _rent(user, shopping, start=date(2026, 1, 12))

    services.send_scheduled_notifications(date(2026, 9, 10))

    notification = Notification.objects.get(user=user)
    assert notification.kind == NotificationKind.RECURRING_DUE
    assert notification.body == "Rent is due in 2 days."
    assert notification.dedupe_key.endswith(":2026-09-12")


@pytest.mark.django_db
@pytest.mark.parametrize(("today", "phrase"), [(date(2026, 9, 12), "today"), (date(2026, 9, 11), "tomorrow")])
def test_recurring_reminder_phrasing(user, shopping, device, today, phrase):
    _rent(user, shopping, start=date(2026, 1, 12))

    services.send_scheduled_notifications(today)

    assert Notification.objects.get(user=user).body == f"Rent is due {phrase}."


@pytest.mark.django_db
def test_recurring_reminder_outside_window_or_inactive(user, shopping, device):
    _rent(user, shopping, start=date(2026, 1, 20))  # 10 days away
    _rent(user, shopping, start=date(2026, 1, 11), is_active=False)

    services.send_scheduled_notifications(date(2026, 9, 10))

    assert _kinds(user) == []


@pytest.mark.django_db
def test_reminder_window_follows_preference(user, shopping, device):
    NotificationPreference.objects.create(user=user, recurring_reminder_days=7)
    _rent(user, shopping, start=date(2026, 1, 16))

    services.send_scheduled_notifications(date(2026, 9, 10))

    assert _kinds(user) == [NotificationKind.RECURRING_DUE]


@pytest.mark.django_db
def test_scheduled_run_is_idempotent(user, shopping, device, push_outbox, django_capture_on_commit_callbacks):
    _rent(user, shopping, start=date(2026, 1, 12))

    with django_capture_on_commit_callbacks(execute=True):
        services.send_scheduled_notifications(date(2026, 9, 10))
        services.send_scheduled_notifications(date(2026, 9, 11))

    assert Notification.objects.filter(user=user).count() == 1
    assert len(push_outbox) == 1


@pytest.mark.django_db
def test_users_without_reachable_devices_are_skipped(user, shopping):
    _rent(user, shopping, start=date(2026, 1, 12))

    assert services.send_scheduled_notifications(date(2026, 9, 10)) == 0
    assert _kinds(user) == []


@pytest.mark.django_db
def test_important_insight_notification(user, shopping, salary, device):
    today = date(2026, 9, 20)
    Transaction.objects.create(user=user, category=salary, type="income", amount=Decimal("1000.00"), date=today)
    Transaction.objects.create(user=user, category=shopping, type="expense", amount=Decimal("1200.00"), date=today)
    # Budget alerts are notified in real time, never again as an insight.
    Budget.objects.create(user=user, category=shopping, amount=Decimal("100.00"), year=2026, month=9)

    services.send_scheduled_notifications(today)

    [notification] = Notification.objects.filter(user=user, kind=NotificationKind.INSIGHT)
    assert notification.body == "Expenses exceeded income by 20% this month."
    assert notification.dedupe_key == "insight:overspending:2026-09"


@pytest.mark.django_db
def test_insight_notifications_can_be_disabled(user, shopping, salary, device):
    NotificationPreference.objects.create(user=user, insights=False)
    today = date(2026, 9, 20)
    Transaction.objects.create(user=user, category=salary, type="income", amount=Decimal("1000.00"), date=today)
    Transaction.objects.create(user=user, category=shopping, type="expense", amount=Decimal("1200.00"), date=today)

    services.send_scheduled_notifications(today)

    assert _kinds(user) == []


@pytest.mark.django_db
def test_management_command_runs(user, device):
    out = io.StringIO()
    call_command("send_scheduled_notifications", stdout=out)
    assert "Processed 1 user(s)" in out.getvalue()


# --- Expo client -------------------------------------------------------------


class _FakeResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _message(token="ExponentPushToken[a]"):
    return {"to": token, "title": "T", "body": "B"}


def test_expo_client_parses_tickets(monkeypatch, settings):
    settings.EXPO_PUSH_ACCESS_TOKEN = "secret"
    captured = {}

    def fake_urlopen(request, timeout):
        captured["auth"] = request.get_header("Authorization")
        return _FakeResponse(
            {
                "data": [
                    {"status": "ok", "id": "abc"},
                    {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}},
                ]
            }
        )

    monkeypatch.setattr(expo.urllib.request, "urlopen", fake_urlopen)

    tickets = REAL_SEND_PUSH_MESSAGES([_message(), _message("ExponentPushToken[b]")])

    assert tickets == [
        expo.PushTicket(ok=True, ticket_id="abc"),
        expo.PushTicket(ok=False, error="DeviceNotRegistered", message="gone"),
    ]
    assert captured["auth"] == "Bearer secret"


def test_expo_client_batches_by_100(monkeypatch):
    batch_sizes = []

    def fake_urlopen(request, timeout):
        batch = json.loads(request.data)
        batch_sizes.append(len(batch))
        return _FakeResponse({"data": [{"status": "ok", "id": "x"}] * len(batch)})

    monkeypatch.setattr(expo.urllib.request, "urlopen", fake_urlopen)

    assert len(REAL_SEND_PUSH_MESSAGES([_message()] * 250)) == 250
    assert batch_sizes == [100, 100, 50]


@pytest.mark.parametrize(
    "failure",
    [
        urllib.error.HTTPError(expo.EXPO_PUSH_URL, 503, "unavailable", {}, None),
        urllib.error.URLError("offline"),
        TimeoutError(),
    ],
)
def test_expo_client_transport_errors(monkeypatch, failure):
    def fake_urlopen(request, timeout):
        raise failure

    monkeypatch.setattr(expo.urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(expo.PushServiceError):
        REAL_SEND_PUSH_MESSAGES([_message()])


def test_expo_client_request_level_error(monkeypatch):
    monkeypatch.setattr(
        expo.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeResponse({"errors": [{"code": "PUSH_TOO_MANY_EXPERIENCE_IDS"}]}),
    )

    with pytest.raises(expo.PushServiceError, match="PUSH_TOO_MANY_EXPERIENCE_IDS"):
        REAL_SEND_PUSH_MESSAGES([_message()])
