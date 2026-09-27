"""/api/notifications/ — the in-app inbox — and the extended preferences."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.budgets.models import Budget

from . import services
from .models import Notification, NotificationKind

LIST = reverse("notification-list")
UNREAD_COUNT = reverse("notification-unread-count")
MARK_ALL_READ = reverse("notification-mark-all-read")
PREFERENCES = reverse("notification-preferences")


def _detail(notification) -> str:
    return reverse("notification-detail", args=[notification.pk])


@pytest.fixture
def make_notification():
    counter = iter(range(1, 1000))

    def _make(user, kind=NotificationKind.INSIGHT, read=False, **fields):
        return Notification.objects.create(
            user=user,
            kind=kind,
            title=fields.pop("title", "Financial insight"),
            body=fields.pop("body", "Expenses exceeded income by 20% this month."),
            dedupe_key=f"event:{next(counter)}",
            read_at=timezone.now() if read else None,
            **fields,
        )

    return _make


@pytest.mark.django_db
def test_list_is_paginated_newest_first_and_only_own(auth_client, user, other_user, make_notification):
    older = make_notification(user)
    Notification.objects.filter(pk=older.pk).update(created_at=timezone.now() - timedelta(days=1))
    newer = make_notification(user, kind=NotificationKind.MONTHLY_SUMMARY)
    make_notification(other_user)

    response = auth_client.get(LIST)

    assert response.status_code == 200
    assert response.data["count"] == 2
    assert [row["id"] for row in response.data["results"]] == [newer.id, older.id]


@pytest.mark.django_db
def test_entry_shape_with_a_related_object(auth_client, user, make_notification):
    budget = Budget.objects.create(user=user, amount=Decimal("100.00"), year=2026, month=9)
    notification = services.notify(
        user,
        NotificationKind.BUDGET_WARNING,
        title="Budget almost used",
        body="You've used 82% of your overall budget for September.",
        dedupe_key="budget_warning:1",
        related=(Budget, budget.id),
        data={"screen": "budgets", "budget_id": budget.id},
    )

    row = auth_client.get(_detail(notification)).data

    assert row == {
        "id": notification.id,
        "kind": "budget_warning",
        "title": "Budget almost used",
        "body": "You've used 82% of your overall budget for September.",
        "is_read": False,
        "read_at": None,
        "related_object": {"type": "budget", "id": budget.id},
        "data": {"screen": "budgets", "budget_id": budget.id},
        "created_at": row["created_at"],
    }


@pytest.mark.django_db
def test_related_object_is_null_without_one_and_survives_deletion(auth_client, user, make_notification):
    summary = make_notification(user, kind=NotificationKind.MONTHLY_SUMMARY)
    budget = Budget.objects.create(user=user, amount=Decimal("100.00"), year=2026, month=9)
    warning = services.notify(
        user, NotificationKind.BUDGET_WARNING, title="t", body="b", dedupe_key="k", related=(Budget, budget.id)
    )
    budget_id = budget.id
    budget.delete()

    assert auth_client.get(_detail(summary)).data["related_object"] is None
    assert auth_client.get(_detail(warning)).data["related_object"] == {"type": "budget", "id": budget_id}


@pytest.mark.django_db
def test_filters(auth_client, user, make_notification):
    unread = make_notification(user)
    read = make_notification(user, read=True)
    summary = make_notification(user, kind=NotificationKind.MONTHLY_SUMMARY)

    def ids(params):
        return {row["id"] for row in auth_client.get(LIST, params).data["results"]}

    assert ids({"is_read": "false"}) == {unread.id, summary.id}
    assert ids({"is_read": "true"}) == {read.id}
    assert ids({"kind": "monthly_summary"}) == {summary.id}
    assert ids({"kind": "insight", "is_read": "false"}) == {unread.id}


@pytest.mark.django_db
def test_invalid_kind_is_rejected(auth_client):
    response = auth_client.get(LIST, {"kind": "spam"})

    assert response.status_code == 400
    assert set(response.data) == {"kind"}


@pytest.mark.django_db
def test_list_query_count_does_not_grow(auth_client, user, make_notification, django_assert_num_queries):
    for month in range(1, 13):
        budget = Budget.objects.create(user=user, amount=Decimal("100.00"), year=2026, month=month)
        services.notify(
            user, NotificationKind.BUDGET_WARNING, title="t", body="b", dedupe_key=f"b:{month}", related=(Budget, budget.id)
        )
    for _ in range(3):
        make_notification(user)

    # The user (JWT), the count and the page: content types are joined, not loaded per row.
    with django_assert_num_queries(3):
        response = auth_client.get(LIST)
    assert response.data["count"] == 15


@pytest.mark.django_db
def test_mark_read_and_unread(auth_client, make_notification, user):
    notification = make_notification(user)

    read = auth_client.patch(_detail(notification), {"is_read": True}, format="json")
    assert read.status_code == 200
    assert read.data["is_read"] is True
    first_read_at = read.data["read_at"]
    assert first_read_at is not None

    again = auth_client.patch(_detail(notification), {"is_read": True}, format="json")
    assert again.data["read_at"] == first_read_at  # the first time it was read is kept

    unread = auth_client.patch(_detail(notification), {"is_read": False}, format="json")
    assert (unread.data["is_read"], unread.data["read_at"]) == (False, None)


@pytest.mark.django_db
def test_only_the_read_state_can_change(auth_client, make_notification, user):
    notification = make_notification(user)

    response = auth_client.patch(
        _detail(notification), {"is_read": True, "title": "Hacked", "body": "x", "kind": "budget_exceeded"}, format="json"
    )

    assert response.status_code == 200
    notification.refresh_from_db()
    assert (notification.title, notification.kind) == ("Financial insight", NotificationKind.INSIGHT)
    assert notification.is_read


@pytest.mark.django_db
def test_invalid_read_state(auth_client, make_notification, user):
    response = auth_client.patch(_detail(make_notification(user)), {"is_read": "perhaps"}, format="json")

    assert response.status_code == 400
    assert "is_read" in response.data


@pytest.mark.django_db
def test_notifications_are_created_only_by_the_server(auth_client, make_notification, user):
    notification = make_notification(user)

    assert auth_client.post(LIST, {"kind": "insight", "title": "t", "body": "b"}, format="json").status_code == 405
    assert auth_client.put(_detail(notification), {"is_read": True}, format="json").status_code == 405
    # No delete: the row also stops the same event from notifying again.
    assert auth_client.delete(_detail(notification)).status_code == 405


@pytest.mark.django_db
def test_unread_count_and_mark_all_read(auth_client, user, other_user, make_notification):
    for _ in range(3):
        make_notification(user)
    make_notification(user, read=True)
    theirs = make_notification(other_user)

    assert auth_client.get(UNREAD_COUNT).data == {"unread_count": 3}
    assert auth_client.post(MARK_ALL_READ).data == {"marked": 3}
    assert auth_client.get(UNREAD_COUNT).data == {"unread_count": 0}
    assert auth_client.post(MARK_ALL_READ).data == {"marked": 0}

    theirs.refresh_from_db()
    assert not theirs.is_read


@pytest.mark.django_db
def test_other_users_notifications_are_not_found(auth_client, other_user, make_notification):
    theirs = make_notification(other_user)

    assert auth_client.get(_detail(theirs)).status_code == 404
    assert auth_client.patch(_detail(theirs), {"is_read": True}, format="json").status_code == 404
    theirs.refresh_from_db()
    assert not theirs.is_read


@pytest.mark.django_db
def test_a_new_expense_reaches_the_inbox(auth_client, user):
    from apps.categories.models import Category

    food = Category.objects.create(user=user, name="Food", type="expense")
    today = timezone.localdate()
    budget = Budget.objects.create(user=user, category=food, amount=Decimal("100.00"), year=today.year, month=today.month)

    auth_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "120.00", "date": today.isoformat()},
        format="json",
    )

    [row] = auth_client.get(LIST).data["results"]
    assert (row["kind"], row["title"], row["is_read"]) == ("budget_exceeded", "Budget exceeded", False)
    assert row["related_object"] == {"type": "budget", "id": budget.id}
    assert auth_client.get(UNREAD_COUNT).data == {"unread_count": 1}


# --- Preferences ------------------------------------------------------------


@pytest.mark.django_db
def test_new_preferences_default_to_on(auth_client):
    data = auth_client.get(PREFERENCES).data

    for field in ("subscription_reminders", "savings_goals", "unusual_spending", "monthly_summary"):
        assert data[field] is True


@pytest.mark.django_db
def test_update_new_preferences(auth_client, user):
    response = auth_client.patch(PREFERENCES, {"monthly_summary": False, "unusual_spending": False}, format="json")

    assert response.status_code == 200
    preferences = services.get_preferences(user)
    assert (preferences.monthly_summary, preferences.unusual_spending, preferences.savings_goals) == (False, False, True)
