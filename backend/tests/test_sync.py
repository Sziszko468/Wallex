"""Multi-device synchronization: the web app, an iPhone and an Android phone share one account.

Each "device" below is its own login — its own JWT pair, exactly like two real clients —
talking to the same API and database. The tests prove that what one device writes the
other reads, that GET /api/sync/status/ tells every device *when* to re-read, that no
response can be served from an HTTP cache, and that a stale edit can't silently
overwrite a newer one (If-Match / 412).
"""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import URLPattern, URLResolver, get_resolver, reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from apps.budgets.models import Budget, SavingsGoal
from apps.categories.models import Category, TransactionType
from apps.common.concurrency import ConditionalWriteMixin, precondition_holds
from apps.common.openapi import CONDITIONAL_RESOURCES
from apps.transactions.models import Frequency, RecurringTransaction, Transaction
from tests.test_security import (
    _budget,
    _category,
    _recurring,
    _savings_goal,
    _subscription,
    _transaction,
)

STATUS = reverse("sync-status")
TODAY = timezone.localdate()


def _login(email: str, password: str = "testpass123") -> APIClient:
    client = APIClient()
    response = client.post(reverse("auth-login"), {"email": email, "password": password}, format="json")
    assert response.status_code == 200, response.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return client


@pytest.fixture
def web(user):
    return _login(user.email)


@pytest.fixture
def phone(user):
    return _login(user.email)


@pytest.fixture
def food(user):
    return Category.objects.create(user=user, name="Food", type=TransactionType.EXPENSE)


def _create(client, category, amount="12.50", **fields):
    body = {"category": category.id, "type": "expense", "amount": amount, "date": TODAY.isoformat(), **fields}
    response = client.post(reverse("transaction-list"), body, format="json")
    assert response.status_code == 201, response.data
    return response.data


def _ids(client) -> set[int]:
    return {row["id"] for row in client.get(reverse("transaction-list")).data["results"]}


def _version(client) -> str:
    return client.get(STATUS).data["version"]


def _detail(transaction_id: int) -> str:
    return reverse("transaction-detail", args=[transaction_id])


# --- The same data on every device -------------------------------------------------------


@pytest.mark.django_db
def test_two_logins_are_separate_sessions(web, phone):
    assert web._credentials != phone._credentials


@pytest.mark.django_db
def test_created_on_the_web_listed_on_the_phone_and_back(web, phone, food):
    from_web = _create(web, food, description="Groceries")
    from_phone = _create(phone, food, description="Coffee")

    assert _ids(phone) == _ids(web) == {from_web["id"], from_phone["id"]}
    assert phone.get(_detail(from_web["id"])).data == from_web


@pytest.mark.django_db
def test_an_edit_on_the_phone_is_what_the_web_reads(web, phone, food):
    created = _create(web, food, amount="12.50")

    edited = phone.patch(_detail(created["id"]), {"amount": "13.75"}, format="json").data
    seen_on_web = web.get(_detail(created["id"])).data

    assert seen_on_web["amount"] == "13.75"
    assert seen_on_web["updated_at"] == edited["updated_at"]
    assert parse_datetime(edited["updated_at"]) > parse_datetime(created["updated_at"])
    assert seen_on_web["created_at"] == created["created_at"]  # server-set, never changes


@pytest.mark.django_db
def test_a_deletion_on_one_device_is_gone_on_the_other(web, phone, food):
    created = _create(phone, food)

    assert web.delete(_detail(created["id"])).status_code == 204

    assert phone.get(_detail(created["id"])).status_code == 404
    assert _ids(phone) == set()


# --- GET /api/sync/status/: when to re-read ----------------------------------------------


@pytest.mark.django_db
def test_every_device_sees_the_same_version_and_it_moves_on_writes(web, phone, food):
    before = _version(web)
    assert _version(phone) == before

    _create(phone, food)

    after = _version(web)
    assert after != before
    assert _version(phone) == after


@pytest.mark.django_db
def test_status_reports_counts_and_server_timestamps(web, food):
    created = _create(web, food)

    data = web.get(STATUS).data

    assert data["resources"]["transactions"] == {"count": 1, "last_modified": created["updated_at"]}
    assert data["resources"]["categories"]["count"] == 1
    assert data["resources"]["savings_goals"] == {"count": 0, "last_modified": None}
    assert set(data) == {"version", "server_time", "resources"}


@pytest.mark.django_db
def test_status_is_one_query(auth_client, user, food, django_assert_num_queries):
    Transaction.objects.create(user=user, category=food, type="expense", amount=Decimal("5.00"), date=TODAY)

    with django_assert_num_queries(2):  # the user (JWT authentication) + the status itself
        assert auth_client.get(STATUS).status_code == 200


@pytest.mark.django_db
def test_reading_never_moves_the_version(web, food):
    """Otherwise every client would reload in an endless loop."""
    _create(web, food)
    before = _version(web)
    month = {"year": TODAY.year, "month": TODAY.month}

    for name, params in [
        ("transaction-list", {}),
        ("category-list", {}),
        ("budget-list", {}),
        ("recurringtransaction-list", {}),
        ("subscription-list", {}),
        ("subscription-summary", {}),
        ("savingsgoal-list", {}),
        ("savingsgoal-summary", {}),
        ("achievement-list", {}),  # evaluates (and stores) achievements on read
        ("notification-list", {}),
        ("analytics-dashboard", month),
        ("analytics-insights", month),
        ("auth-me", {}),
    ]:
        assert web.get(reverse(name), params).status_code == 200, name

    assert _version(web) == before


@pytest.mark.django_db
def test_other_users_writes_dont_touch_my_version(web, other_user):
    before = _version(web)

    _transaction(other_user)

    assert _version(web) == before


def _csv(content: str) -> SimpleUploadedFile:
    return SimpleUploadedFile("bank.csv", content.encode(), content_type="text/csv")


# Every kind of write the clients can make, each on data prepared by `setup`.
WRITES = {
    "create transaction": lambda c, o: c.post(
        reverse("transaction-list"),
        {"category": o["food"].id, "type": "expense", "amount": "3.00", "date": TODAY.isoformat()},
        format="json",
    ),
    "edit transaction": lambda c, o: c.patch(_detail(o["transaction"].id), {"description": "x"}, format="json"),
    "delete transaction": lambda c, o: c.delete(_detail(o["transaction"].id)),
    "import CSV": lambda c, o: c.post(
        reverse("transaction-import-csv"),
        {"file": _csv(f"date,description,amount\n{TODAY.isoformat()},Tesco,-9.99\n")},
        format="multipart",
    ),
    "create category": lambda c, o: c.post(
        reverse("category-list"), {"name": "Pets", "type": "expense"}, format="json"
    ),
    "rename category": lambda c, o: c.patch(
        reverse("category-detail", args=[o["food"].id]), {"name": "Groceries"}, format="json"
    ),
    "delete category": lambda c, o: c.delete(reverse("category-detail", args=[o["spare"].id])),
    "create budget": lambda c, o: c.post(
        reverse("budget-list"), {"category": o["food"].id, "amount": "100.00", "year": 2031, "month": 1}, format="json"
    ),
    "edit budget": lambda c, o: c.patch(
        reverse("budget-detail", args=[o["budget"].id]), {"amount": "90.00"}, format="json"
    ),
    "delete budget": lambda c, o: c.delete(reverse("budget-detail", args=[o["budget"].id])),
    "edit recurring": lambda c, o: c.patch(
        reverse("recurringtransaction-detail", args=[o["recurring"].id]), {"name": "Rent (new flat)"}, format="json"
    ),
    "create subscription": lambda c, o: c.post(
        reverse("subscription-list"),
        {
            "name": "Netflix",
            "amount": "9.99",
            "category": o["food"].id,
            "frequency": "monthly",
            "start_date": "2026-01-05",
        },
        format="json",
    ),
    "create goal": lambda c, o: c.post(
        reverse("savingsgoal-list"), {"name": "Car", "target_amount": "5000.00"}, format="json"
    ),
    "deposit": lambda c, o: c.post(
        reverse("savingsgoal-deposit", args=[o["goal"].id]), {"amount": "10.00"}, format="json"
    ),
    "withdraw": lambda c, o: c.post(
        reverse("savingsgoal-withdraw", args=[o["goal"].id]), {"amount": "10.00"}, format="json"
    ),
    "delete goal": lambda c, o: c.delete(reverse("savingsgoal-detail", args=[o["goal"].id])),
    "change base currency": lambda c, o: c.patch(reverse("auth-me"), {"base_currency": "HUF"}, format="json"),
}


@pytest.mark.django_db
@pytest.mark.parametrize("write", sorted(WRITES))
def test_every_write_moves_the_version(web, phone, user, add_rates, write):
    food = Category.objects.create(user=user, name="Food", type=TransactionType.EXPENSE)
    objects = {
        "food": food,
        "spare": Category.objects.create(user=user, name="Spare", type=TransactionType.EXPENSE),
        "transaction": Transaction.objects.create(
            user=user, category=food, type="expense", amount=Decimal("20.00"), date=TODAY - timedelta(days=1)
        ),
        "budget": Budget.objects.create(user=user, category=food, amount=Decimal("100.00"), year=2030, month=6),
        "recurring": RecurringTransaction.objects.create(
            user=user,
            category=food,
            name="Rent",
            type="expense",
            amount=Decimal("500.00"),
            frequency=Frequency.MONTHLY,
            start_date=date(2026, 1, 1),
            next_occurrence_date=date(2026, 1, 1),
        ),
        "goal": SavingsGoal.objects.create(
            user=user, name="Trip", target_amount=Decimal("1000.00"), current_amount=Decimal("50.00")
        ),
    }
    for day in (TODAY, TODAY - timedelta(days=1)):
        add_rates(day, HUF="390.00")
    before = _version(phone)

    response = WRITES[write](web, objects)

    assert 200 <= response.status_code < 300, response.data
    assert _version(phone) != before


# --- Never served from an HTTP cache -----------------------------------------------------


@pytest.mark.django_db
def test_api_responses_are_never_cacheable(web, api_client, food):
    created = _create(web, food)

    for response in [
        web.get(reverse("transaction-list")),
        web.get(_detail(created["id"])),
        web.get(STATUS),
        web.get(_detail(999999)),  # errors too
        api_client.get(reverse("transaction-list")),  # 401
        api_client.get(reverse("health-live")),
    ]:
        assert "no-store" in response["Cache-Control"], response.status_code
        assert "private" in response["Cache-Control"]


# --- If-Match: a stale edit never silently wins ------------------------------------------


def _if_match(version: str) -> dict:
    return {"HTTP_IF_MATCH": f'"{version}"'}


@pytest.mark.django_db
def test_detail_responses_carry_the_version_as_etag(web, food):
    created = _create(web, food)

    fetched = web.get(_detail(created["id"]))
    edited = web.patch(_detail(created["id"]), {"description": "x"}, format="json")

    assert fetched["ETag"] == f'"{created["updated_at"]}"'
    assert edited["ETag"] == f'"{edited.data["updated_at"]}"' != fetched["ETag"]
    assert not web.get(reverse("transaction-list")).has_header("ETag")


@pytest.mark.django_db
def test_editing_the_version_you_loaded_succeeds(web, food):
    created = _create(web, food)

    response = web.patch(_detail(created["id"]), {"amount": "20.00"}, format="json", **_if_match(created["updated_at"]))

    assert response.status_code == 200
    assert response.data["amount"] == "20.00"


@pytest.mark.django_db
def test_a_stale_edit_from_the_other_device_is_refused(web, phone, food):
    loaded_on_phone = phone.get(_detail(_create(web, food, amount="12.50")["id"])).data
    web.patch(_detail(loaded_on_phone["id"]), {"amount": "99.00"}, format="json")  # the web edits it meanwhile

    response = phone.patch(
        _detail(loaded_on_phone["id"]), {"amount": "13.00"}, format="json", **_if_match(loaded_on_phone["updated_at"])
    )

    assert response.status_code == 412
    assert "changed on another device" in response.data["detail"]
    assert response.data["current"]["amount"] == "99.00"  # what the phone should now show
    assert response.data["current"]["id"] == loaded_on_phone["id"]  # real types, not strings
    assert Transaction.objects.get(pk=loaded_on_phone["id"]).amount == Decimal("99.00")  # nothing written


@pytest.mark.django_db
def test_a_second_save_of_the_same_version_is_refused(web, phone, food):
    loaded = _create(web, food)

    first = web.patch(_detail(loaded["id"]), {"description": "web"}, format="json", **_if_match(loaded["updated_at"]))
    second = phone.patch(
        _detail(loaded["id"]), {"description": "phone"}, format="json", **_if_match(loaded["updated_at"])
    )

    assert (first.status_code, second.status_code) == (200, 412)
    assert Transaction.objects.get(pk=loaded["id"]).description == "web"


@pytest.mark.django_db
def test_a_stale_delete_is_refused(web, phone, food):
    loaded_on_phone = _create(phone, food)
    web.patch(_detail(loaded_on_phone["id"]), {"description": "keep me"}, format="json")

    response = phone.delete(_detail(loaded_on_phone["id"]), **_if_match(loaded_on_phone["updated_at"]))

    assert response.status_code == 412
    assert Transaction.objects.filter(pk=loaded_on_phone["id"]).exists()


@pytest.mark.django_db
def test_without_if_match_the_last_write_wins(web, phone, food):
    """Backwards compatible: clients that don't send the header behave as before."""
    loaded = _create(web, food)
    web.patch(_detail(loaded["id"]), {"amount": "99.00"}, format="json")

    assert phone.patch(_detail(loaded["id"]), {"amount": "13.00"}, format="json").status_code == 200


@pytest.mark.django_db
def test_an_object_deleted_elsewhere_is_404_not_412(web, phone, food):
    loaded = _create(phone, food)
    web.delete(_detail(loaded["id"]))

    response = phone.patch(_detail(loaded["id"]), {"amount": "1.00"}, format="json", **_if_match(loaded["updated_at"]))

    assert response.status_code == 404


@pytest.mark.django_db
def test_someone_elses_object_stays_404_with_if_match(web, other_user):
    theirs = _transaction(other_user)

    assert web.patch(_detail(theirs.id), {"amount": "1.00"}, format="json", HTTP_IF_MATCH="*").status_code == 404


@pytest.mark.django_db
def test_a_browser_on_another_origin_may_send_if_match(web, food, settings):
    """Found live: without this, the browser's CORS preflight blocked every conditional PATCH
    from the web dev server and the Expo web preview (native apps are not subject to CORS)."""
    origin = settings.CORS_ALLOWED_ORIGINS[0]
    created = _create(web, food)

    preflight = web.options(
        _detail(created["id"]),
        HTTP_ORIGIN=origin,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="PATCH",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization, content-type, if-match",
    )
    fetched = web.get(_detail(created["id"]), HTTP_ORIGIN=origin)

    assert preflight.status_code == 200
    assert "if-match" in preflight["Access-Control-Allow-Headers"].lower()
    assert "etag" in fetched["Access-Control-Expose-Headers"].lower()


@pytest.mark.parametrize(
    ("header", "matches"),
    [
        ("*", True),
        ('"2026-09-27T14:03:31.357564Z"', True),
        ('W/"2026-09-27T14:03:31.357564Z"', True),
        ('"2026-09-27T16:03:31.357564+02:00"', True),  # the same instant in another offset
        ('"2020-01-01T00:00:00Z", "2026-09-27T14:03:31.357564Z"', True),
        ('"2026-09-27T14:03:31.357563Z"', False),  # one microsecond off
        ('"2026-13-45T00:00:00Z"', False),
        ('"yesterday"', False),
        ("", False),
    ],
)
def test_if_match_header_parsing(header, matches):
    current = datetime(2026, 9, 27, 14, 3, 31, 357564, tzinfo=UTC)
    assert precondition_holds(header, current) is matches


EDITABLE = {
    "transaction": (_transaction, {"description": "Edited"}),
    "category": (_category, {"name": "Edited"}),
    "budget": (_budget, {"amount": "150.00"}),
    "recurringtransaction": (_recurring, {"name": "Edited"}),
    "subscription": (_subscription, {"name": "Edited"}),
    "savingsgoal": (_savings_goal, {"name": "Edited"}),
}


@pytest.mark.django_db
@pytest.mark.parametrize("resource", sorted(EDITABLE))
def test_every_editable_resource_detects_stale_edits(auth_client, user, resource):
    factory, change = EDITABLE[resource]
    obj = factory(user)
    url = reverse(f"{resource}-detail", args=[obj.pk])
    version = auth_client.get(url).data["updated_at"]

    assert auth_client.patch(url, change, format="json", **_if_match("2000-01-01T00:00:00Z")).status_code == 412
    assert auth_client.patch(url, change, format="json", **_if_match(version)).status_code == 200
    assert auth_client.delete(url, **_if_match(version)).status_code == 412  # the PATCH made a new version


def _detail_views():
    """(resource path segment, view class) for every /api/<resource>/{id}/ route."""

    def walk(patterns, prefix=""):
        for pattern in patterns:
            if isinstance(pattern, URLResolver):
                yield from walk(pattern.url_patterns, prefix + str(pattern.pattern))
            elif isinstance(pattern, URLPattern) and (pattern.name or "").endswith("-detail"):
                yield prefix + str(pattern.pattern), pattern.callback.cls

    for route, view in walk(get_resolver().url_patterns):
        if route.startswith("api/") and "format" not in route:
            yield route.split("/")[1].lstrip("^"), view


def test_every_editable_resource_is_conditional_and_documented():
    """A viewset of objects with `updated_at` must use ConditionalWriteMixin, and the OpenAPI hook must know it."""
    conditional = {resource for resource, view in _detail_views() if issubclass(view, ConditionalWriteMixin)}
    versioned = {
        resource
        for resource, view in _detail_views()
        if hasattr(view.queryset.model, "updated_at") and hasattr(view, "partial_update")
    }

    assert conditional == versioned == CONDITIONAL_RESOURCES
