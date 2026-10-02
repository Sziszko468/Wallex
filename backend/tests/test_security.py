"""Cross-cutting security guarantees, checked for EVERY API endpoint.

The per-app tests cover each endpoint's own rules. These tests read the URL
configuration itself, so a new endpoint that forgets authentication or user
scoping fails here even if nobody wrote a test for it.
"""

import re
from datetime import date
from decimal import Decimal

import pytest
from django.urls import URLPattern, URLResolver, get_resolver, reverse

from apps.analytics.models import AssistantConversation, AssistantMessage
from apps.budgets.models import Budget, SavingsGoal
from apps.categories.models import Category, TransactionType
from apps.notifications.models import Device, Notification, NotificationKind
from apps.subscriptions.models import Subscription
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

# Endpoints that must work without a token. Health probes and the API docs return no user data.
PUBLIC_ROUTES = {
    "auth-register",
    "auth-login",
    "auth-login-verify",
    "auth-refresh",
    "health-live",
    "health-ready",
    "api-schema",
    "api-docs",
}


def _api_routes():
    """(route_regex_string, url_name) for every concrete /api/ endpoint, format-suffix variants excluded."""

    def walk(patterns, prefix=""):
        for pattern in patterns:
            if isinstance(pattern, URLResolver):
                yield from walk(pattern.url_patterns, prefix + str(pattern.pattern))
            elif isinstance(pattern, URLPattern):
                yield prefix + str(pattern.pattern), pattern.name

    for route, name in walk(get_resolver().url_patterns):
        if route.startswith("api/") and "format" not in route:
            yield route, name


def _concrete_path(route: str) -> str:
    path = route.replace("^", "").replace("$", "")
    path = re.sub(r"\(\?P<pk>[^)]*\)", "999999", path)
    return "/" + path


PROTECTED_ROUTES = sorted({(route, name) for route, name in _api_routes() if name not in PUBLIC_ROUTES})


@pytest.mark.django_db
@pytest.mark.parametrize(("route", "name"), PROTECTED_ROUTES, ids=[name for _, name in PROTECTED_ROUTES])
def test_every_non_public_endpoint_requires_authentication(api_client, route, name):
    path = _concrete_path(route)

    statuses = {method: getattr(api_client, method)(path).status_code for method in ("get", "post", "patch", "delete")}

    # Every method is either refused for missing credentials or not offered at all — never served.
    assert all(code in (401, 405) for code in statuses.values()), statuses
    assert 401 in statuses.values(), statuses


def test_public_routes_still_exist():
    """Guards the allowlist above against typos / renamed routes silently widening it."""
    names = {name for _, name in _api_routes()}
    assert names >= PUBLIC_ROUTES


# --- User isolation: another user's objects -----------------------------------------


def _category(user):
    return Category.objects.create(user=user, name="Theirs", type=TransactionType.EXPENSE)


def _transaction(user):
    return Transaction.objects.create(
        user=user,
        category=_category(user),
        type=TransactionType.EXPENSE,
        amount=Decimal("10.00"),
        date=date(2026, 9, 1),
    )


def _budget(user):
    return Budget.objects.create(user=user, category=_category(user), amount=Decimal("100.00"), year=2026, month=9)


def _recurring(user):
    return RecurringTransaction.objects.create(
        user=user,
        category=_category(user),
        name="Rent",
        type=TransactionType.EXPENSE,
        amount=Decimal("500.00"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )


def _savings_goal(user):
    return SavingsGoal.objects.create(
        user=user, name="Japan trip", target_amount=Decimal("3000.00"), current_amount=Decimal("100.00")
    )


def _subscription(user):
    return Subscription.objects.create(
        user=user,
        category=_category(user),
        name="Netflix",
        amount=Decimal("17.99"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 5),
        next_occurrence_date=date(2026, 1, 5),
    )


def _device(user):
    return Device.objects.create(user=user, expo_push_token="ExponentPushToken[theirs]", platform="ios")


def _session(user):
    from apps.users.sessions import start_session

    return start_session(user)[0]


def _notification(user):
    return Notification.objects.create(
        user=user, kind=NotificationKind.INSIGHT, title="Financial insight", body="Theirs.", dedupe_key="theirs"
    )


def _assistant_conversation(user):
    conversation = AssistantConversation.objects.create(user=user, title="Their question")
    AssistantMessage.objects.create(conversation=conversation, role="user", content="Their question")
    return conversation


# url name prefix -> factory for an object owned by the given user
OWNED_RESOURCES = {
    "category": _category,
    "transaction": _transaction,
    "budget": _budget,
    "savingsgoal": _savings_goal,
    "recurringtransaction": _recurring,
    "subscription": _subscription,
    "device": _device,
    "notification": _notification,
    "session": _session,
    "assistantconversation": _assistant_conversation,
}
# Deleting a notification would let its event notify again (see NotificationViewSet).
UNDELETABLE = {"notification"}


def test_every_detail_endpoint_is_in_the_isolation_matrix():
    """A new `<resource>-detail` route must be added to OWNED_RESOURCES to be covered below."""
    detail_routes = {name.removesuffix("-detail") for _, name in _api_routes() if name.endswith("-detail")}
    assert detail_routes == set(OWNED_RESOURCES)


@pytest.mark.django_db
@pytest.mark.parametrize("resource", sorted(OWNED_RESOURCES))
def test_other_users_objects_are_invisible_and_untouchable(auth_client, other_user, resource):
    obj = OWNED_RESOURCES[resource](other_user)
    detail = reverse(f"{resource}-detail", args=[obj.pk])

    # 404, not 403: the API must not even confirm that the object exists.
    assert auth_client.get(detail).status_code in (404, 405)
    assert auth_client.patch(detail, {"amount": "1.00", "name": "hacked"}, format="json").status_code in (404, 405)
    # Resources that offer no DELETE at all refuse it before any lookup.
    assert auth_client.delete(detail).status_code == (405 if resource in UNDELETABLE else 404)

    obj.refresh_from_db()  # still there, unchanged
    listing = auth_client.get(reverse(f"{resource}-list"))
    rows = listing.data["results"] if isinstance(listing.data, dict) else listing.data
    assert obj.pk not in {row["id"] for row in rows}


OBJECT_ACTIONS = sorted(name for route, name in _api_routes() if "(?P<pk>" in route and not name.endswith("-detail"))


def test_object_actions_belong_to_isolated_resources():
    """An action on one object (`/api/<resource>/{id}/<action>/`) must be on a resource of the matrix."""
    assert {name.split("-")[0] for name in OBJECT_ACTIONS} <= set(OWNED_RESOURCES)


@pytest.mark.django_db
@pytest.mark.parametrize("name", OBJECT_ACTIONS)
def test_object_actions_on_other_users_objects_are_not_found(auth_client, other_user, name):
    obj = OWNED_RESOURCES[name.split("-")[0]](other_user)
    before = {field.name: getattr(obj, field.name) for field in obj._meta.concrete_fields}

    response = auth_client.post(reverse(name, args=[obj.pk]), {"amount": "1.00"}, format="json")

    assert response.status_code == 404
    obj.refresh_from_db()
    assert {field.name: getattr(obj, field.name) for field in obj._meta.concrete_fields} == before


@pytest.mark.django_db
def test_analytics_never_include_other_users_money(auth_client, other_user):
    _transaction(other_user)
    Transaction.objects.filter(user=other_user).update(date=date(2026, 9, 5))
    params = {"year": 2026, "month": 9}

    assert auth_client.get(reverse("analytics-dashboard"), params).data["total_expenses"] == "0.00"
    assert auth_client.get(reverse("analytics-categories"), params).data["categories"] == []
    assert auth_client.get(reverse("analytics-insights"), params).data["insights"] == []
    monthly = auth_client.get(reverse("analytics-monthly"), {"year": 2026}).data["months"]
    assert {month["expenses"] for month in monthly} == {"0.00"}


# --- User isolation: indirect routes (filters, mass assignment, foreign keys) ------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    "resource",
    ["category", "transaction", "budget", "savingsgoal", "recurringtransaction", "subscription", "notification"],
)
def test_owner_cannot_be_changed_by_mass_assignment(auth_client, user, other_user, resource):
    obj = OWNED_RESOURCES[resource](user)

    auth_client.patch(reverse(f"{resource}-detail", args=[obj.pk]), {"user": other_user.pk}, format="json")

    obj.refresh_from_db()
    assert obj.user_id == user.pk


@pytest.mark.django_db
@pytest.mark.parametrize("resource", ["transaction", "budget", "recurringtransaction", "subscription"])
def test_cannot_point_own_object_at_another_users_category(auth_client, user, other_user, resource):
    obj = OWNED_RESOURCES[resource](user)
    foreign_category = _category(other_user)

    response = auth_client.patch(
        reverse(f"{resource}-detail", args=[obj.pk]), {"category": foreign_category.pk}, format="json"
    )

    assert response.status_code == 400
    obj.refresh_from_db()
    assert obj.category.user_id == user.pk


@pytest.mark.django_db
def test_filtering_by_another_users_category_reveals_nothing(auth_client, other_user):
    theirs = _transaction(other_user)

    response = auth_client.get(reverse("transaction-list"), {"category": theirs.category_id})

    # Rejected as an invalid choice — never answered with their rows.
    assert response.status_code == 400 or response.data["results"] == []


@pytest.mark.django_db
def test_user_query_parameter_is_ignored(auth_client, other_user):
    _transaction(other_user)

    response = auth_client.get(reverse("transaction-list"), {"user": other_user.pk, "user_id": other_user.pk})

    assert response.data["results"] == []


@pytest.mark.django_db
def test_notification_preferences_are_per_user(auth_client, other_auth_client, other_user):
    auth_client.patch(reverse("notification-preferences"), {"insights": False}, format="json")

    theirs = other_auth_client.get(reverse("notification-preferences")).data

    assert theirs["insights"] is True


# --- CSRF / injection ---------------------------------------------------------------


@pytest.mark.django_db
def test_api_ignores_session_cookies_so_csrf_cannot_apply(api_client, user):
    """The API authenticates only with the Authorization header. A browser's session
    cookie (e.g. from the Django admin) must not authenticate API calls — otherwise
    a malicious site could make the browser send state-changing requests."""
    api_client.force_login(user)  # session cookie, like a logged-in admin

    assert api_client.get(reverse("category-list")).status_code == 401
    assert api_client.post(reverse("category-list"), {"name": "x", "type": "expense"}).status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize(
    "params",
    [
        {"search": "' OR 1=1 --"},
        {"search": "%' UNION SELECT password FROM users_user --"},
        {"ordering": "amount; DROP TABLE transactions_transaction"},
        {"ordering": "user__password"},
        {"category_name": "x' OR 'a'='a"},
        {"date_from": "2026-01-01' OR '1'='1"},
    ],
)
def test_query_parameters_cannot_inject_sql_or_leak_rows(auth_client, other_user, params):
    _transaction(other_user)

    response = auth_client.get(reverse("transaction-list"), params)

    assert response.status_code in (200, 400)
    if response.status_code == 200:
        assert response.data["results"] == []
    assert Transaction.objects.count() == 1  # nothing dropped


@pytest.mark.django_db
def test_markup_is_stored_verbatim_as_data(auth_client, user):
    """The API stores text as-is (it doesn't render HTML); clients must render it as text.
    See web/src/security/xss.test.tsx for the rendering side."""
    category = _category(user)
    payload = '<img src=x onerror="alert(document.cookie)">'

    response = auth_client.post(
        reverse("transaction-list"),
        {"category": category.pk, "type": "expense", "amount": "1.00", "date": "2026-09-01", "description": payload},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["description"] == payload
    assert response["Content-Type"].startswith("application/json")
