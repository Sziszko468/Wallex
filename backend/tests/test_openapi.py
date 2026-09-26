"""The OpenAPI document is the API's contract: generated, valid, complete, committed — and true.

"True" matters most. Real responses from every endpoint — successes and errors — are
validated against the generated schema *strictly*: a field the docs don't mention, a
missing field, a wrong type or an undocumented status code fails the test. The docs
can't drift from the code without a red build.
"""

from datetime import date
from decimal import Decimal
from io import StringIO
from pathlib import Path
from typing import Any

import pytest
import yaml
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse
from jsonschema import Draft7Validator
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.budgets.models import Budget
from apps.categories.defaults import create_default_categories
from apps.categories.models import Category, TransactionType
from apps.common import health
from apps.receipts.conftest import FakeOcrProvider, make_image
from apps.receipts.ocr import OcrUnavailableError
from apps.transactions.models import Frequency, RecurringTransaction, Transaction

COMMITTED_SCHEMA = Path(settings.BASE_DIR) / "openapi.yaml"
REGENERATE = "docker compose exec backend python manage.py spectacular --file openapi.yaml"
TAG_NAMES = {tag["name"] for tag in settings.SPECTACULAR_SETTINGS["TAGS"]}


def _generate_yaml() -> str:
    output = StringIO()
    call_command("spectacular", "--validate", "--fail-on-warn", stdout=output)
    return output.getvalue()


def _to_json_schema(node: Any) -> Any:
    """OpenAPI 3.0 → JSON Schema: `nullable` becomes a null alternative, and documented objects are
    closed (`additionalProperties: false`) so undocumented response fields are caught."""
    if isinstance(node, list):
        return [_to_json_schema(item) for item in node]
    if not isinstance(node, dict):
        return node
    node = {key: _to_json_schema(value) for key, value in node.items()}
    if node.get("type") == "object" and "properties" in node and "additionalProperties" not in node:
        node["additionalProperties"] = False
    if node.pop("nullable", False) is True:
        node = {"anyOf": [node, {"type": "null"}]}
    return node


@pytest.fixture(scope="module")
def generated_yaml() -> str:
    return _generate_yaml()


@pytest.fixture(scope="module")
def schema(generated_yaml) -> dict:
    return yaml.safe_load(generated_yaml)


@pytest.fixture(scope="module")
def components(schema) -> dict:
    return _to_json_schema(schema["components"])


@pytest.fixture
def check(schema, components):
    """check(path_template, method, response): the response is documented and matches its schema."""

    def _check(path: str, method: str, response: Response) -> None:
        operation = schema["paths"][path][method]
        documented = operation["responses"]
        code = str(response.status_code)
        assert code in documented, f"{method.upper()} {path} answered undocumented {code}: {response.content[:300]!r}"

        content = documented[code].get("content")
        if content is None:
            assert not response.content, f"{method.upper()} {path} {code} is documented without a body"
            return

        body_schema = _to_json_schema(content["application/json"]["schema"])
        validator = Draft7Validator({"allOf": [body_schema], "components": components})
        errors = [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in validator.iter_errors(response.json())]
        assert not errors, f"{method.upper()} {path} {code} doesn't match the docs:\n" + "\n".join(errors)

    return _check


# --- The document itself ------------------------------------------------------------------


def test_committed_schema_is_up_to_date(generated_yaml):
    committed = COMMITTED_SCHEMA.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert committed == generated_yaml.replace("\r\n", "\n"), f"backend/openapi.yaml is stale — run: {REGENERATE}"


def _operations(schema):
    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            yield path, method, operation


def test_every_operation_is_fully_documented(schema):
    problems = []
    for path, method, operation in _operations(schema):
        name = f"{method.upper()} {path}"
        responses = operation["responses"]
        if not operation.get("summary"):
            problems.append(f"{name}: no summary")
        if len(operation.get("tags", [])) != 1 or operation["tags"][0] not in TAG_NAMES:
            problems.append(f"{name}: needs exactly one tag from SPECTACULAR_SETTINGS['TAGS']")
        if not any(code.startswith("2") for code in responses):
            problems.append(f"{name}: no success response")
        takes_input = "requestBody" in operation or any(p["in"] == "query" for p in operation.get("parameters", []))
        if takes_input and "400" not in responses:
            problems.append(f"{name}: accepts input but documents no 400")
        if "400" in responses and not responses["400"]["content"]["application/json"].get("examples"):
            problems.append(f"{name}: 400 without examples of the validation messages")
        if any("jwtAuth" in requirement for requirement in operation.get("security", [])) and "401" not in responses:
            problems.append(f"{name}: requires a token but documents no 401")
        if "{id}" in path and "404" not in responses:
            problems.append(f"{name}: object URL without a 404")
    assert not problems, "\n".join(problems)


def test_every_api_route_is_in_the_schema(schema):
    from tests.test_security import _api_routes

    documented = {path for path in schema["paths"]}
    routes = {
        "/" + route.replace("^", "").replace("$", "").replace("(?P<pk>[^/.]+)", "{id}").replace("(?P<pk>\\d+)", "{id}")
        for route, name in _api_routes()
        if name not in ("api-schema", "api-docs") and not name.startswith("api-root")
    }
    assert routes - documented == set()


def test_docs_are_served(api_client):
    assert api_client.get(reverse("api-docs")).status_code == 200
    response = api_client.get(reverse("api-schema"), HTTP_AUTHORIZATION="Bearer garbage")
    assert response.status_code == 200
    assert b"openapi: 3.0" in response.content


# --- Contract: real responses match the docs ------------------------------------------------

AUG = {"year": 2026, "month": 8}


@pytest.fixture
def ledger(user):
    """A July and an August with enough data for every analytics field and insight type."""
    make = lambda name, kind: Category.objects.create(user=user, name=name, type=kind)  # noqa: E731
    food, transport, housing = (make(n, TransactionType.EXPENSE) for n in ("Food", "Transport", "Housing"))
    salary = make("Salary", TransactionType.INCOME)
    for when, category, amount in [
        (date(2026, 7, 5), food, "100.00"),
        (date(2026, 7, 6), transport, "80.00"),
        (date(2026, 7, 1), salary, "1000.00"),
        (date(2026, 8, 5), food, "150.00"),
        (date(2026, 8, 6), transport, "20.00"),
        (date(2026, 8, 1), salary, "1000.00"),
    ]:
        Transaction.objects.create(
            user=user, category=category, type=category.type, amount=Decimal(amount), date=when, description="Test"
        )
    Budget.objects.create(user=user, category=food, amount=Decimal("100.00"), **AUG)  # exceeded
    Budget.objects.create(user=user, category=None, amount=Decimal("200.00"), **AUG)  # overall, 85 % used
    RecurringTransaction.objects.create(
        user=user, category=housing, name="Rent", type=TransactionType.EXPENSE, amount=Decimal("600.00"),
        frequency=Frequency.MONTHLY, start_date=date(2026, 1, 1), next_occurrence_date=date(2026, 1, 1),
    )
    return {"food": food, "transport": transport, "housing": housing, "salary": salary}


@pytest.mark.django_db
def test_authentication_contract(api_client, check, monkeypatch):
    creds = {"email": "ada@example.com", "password": "a-long-passphrase"}
    register = {**creds, "password_confirm": creds["password"], "first_name": "Ada", "last_name": "Lovelace"}

    check("/api/auth/register/", "post", api_client.post(reverse("auth-register"), register, format="json"))
    check("/api/auth/register/", "post", api_client.post(reverse("auth-register"), register, format="json"))  # 400
    check("/api/auth/login/", "post", api_client.post(reverse("auth-login"), {**creds, "password": "wrong"}, format="json"))
    check("/api/auth/login/", "post", api_client.post(reverse("auth-login"), {}, format="json"))
    login = api_client.post(reverse("auth-login"), creds, format="json")
    check("/api/auth/login/", "post", login)

    old_refresh = login.json()["refresh"]
    refreshed = api_client.post(reverse("auth-refresh"), {"refresh": old_refresh}, format="json")
    check("/api/auth/refresh/", "post", refreshed)
    check("/api/auth/refresh/", "post", api_client.post(reverse("auth-refresh"), {"refresh": old_refresh}, format="json"))

    check("/api/auth/me/", "get", api_client.get(reverse("auth-me")))  # 401
    api_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-jwt")
    check("/api/auth/me/", "get", api_client.get(reverse("auth-me")))  # 401 with token details
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {refreshed.json()['access']}")
    check("/api/auth/me/", "get", api_client.get(reverse("auth-me")))
    check("/api/auth/logout/", "post", api_client.post(reverse("auth-logout"), {}, format="json"))
    check("/api/auth/logout/", "post", api_client.post(reverse("auth-logout"), {"refresh": refreshed.json()["refresh"]}, format="json"))

    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "auth_login": "1/hour"})
    api_client.post(reverse("auth-login"), creds, format="json")
    throttled = api_client.post(reverse("auth-login"), creds, format="json")
    assert throttled.status_code == 429
    check("/api/auth/login/", "post", throttled)


@pytest.mark.django_db
def test_categories_contract(user, auth_client, other_auth_client, check):
    create_default_categories(user)
    system = Category.objects.filter(user=user, is_system=True).first()

    check("/api/categories/", "get", auth_client.get("/api/categories/"))
    created = auth_client.post("/api/categories/", {"name": "Gym", "type": "expense", "color": "#16A34A"}, format="json")
    check("/api/categories/", "post", created)
    check("/api/categories/", "post", auth_client.post("/api/categories/", {"name": "gym", "type": "expense"}, format="json"))
    url = f"/api/categories/{created.json()['id']}/"
    check("/api/categories/{id}/", "get", auth_client.get(url))
    check("/api/categories/{id}/", "patch", auth_client.patch(url, {"icon": "dumbbell"}, format="json"))
    check("/api/categories/{id}/", "get", other_auth_client.get(url))  # 404
    check("/api/categories/{id}/", "patch", auth_client.patch(f"/api/categories/{system.id}/", {"name": "X"}, format="json"))
    Transaction.objects.create(
        user=user, category_id=created.json()["id"], type="expense", amount=Decimal("5.00"), date=date(2026, 8, 1)
    )
    check("/api/categories/{id}/", "delete", auth_client.delete(url))  # 409
    unused = auth_client.post("/api/categories/", {"name": "Unused", "type": "income"}, format="json").json()
    check("/api/categories/{id}/", "delete", auth_client.delete(f"/api/categories/{unused['id']}/"))


@pytest.mark.django_db
def test_transactions_contract(auth_client, ledger, check):
    food = ledger["food"].id
    check("/api/transactions/", "get", auth_client.get("/api/transactions/", {"type": "expense", "page_size": 2}))
    check("/api/transactions/", "get", auth_client.get("/api/transactions/", {"date_from": "nope"}))
    check("/api/transactions/", "get", auth_client.get("/api/transactions/", {"page": 99}))  # 404 invalid page

    body = {"amount": "12.30", "type": "expense", "category": food, "date": "2026-08-20", "description": "Lunch"}
    offline = {**body, "client_id": "3f2b7c1e-8a4d-4f6b-9c2e-1d5a7b9e0f13"}
    created = auth_client.post("/api/transactions/", offline, format="json")
    check("/api/transactions/", "post", created)
    check("/api/transactions/", "post", auth_client.post("/api/transactions/", offline, format="json"))  # 200 replay
    check("/api/transactions/", "post", auth_client.post("/api/transactions/", {**body, "type": "income", "amount": "0"}, format="json"))

    url = f"/api/transactions/{created.json()['id']}/"
    check("/api/transactions/{id}/", "get", auth_client.get(url))
    check("/api/transactions/{id}/", "put", auth_client.put(url, {**body, "amount": "13.00"}, format="json"))
    check("/api/transactions/{id}/", "patch", auth_client.patch(url, {"description": "Team lunch"}, format="json"))
    check("/api/transactions/{id}/", "patch", auth_client.patch(url, {"amount": "1.234"}, format="json"))
    check("/api/transactions/{id}/", "delete", auth_client.delete(url))
    check("/api/transactions/{id}/", "get", auth_client.get(url))  # 404


def _csv(content: str, name: str = "bank.csv") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content.encode(), content_type="text/csv")


@pytest.mark.django_db
def test_csv_import_contract(auth_client, ledger, check):
    good = "date,description,amount\n2026-08-10,Lidl,-23.40\n2026-08-11,Mystery,15.00\n2026-08-12,Bad,abc\n"
    post = lambda upload: auth_client.post("/api/transactions/import/", {"file": upload}, format="multipart")  # noqa: E731

    check("/api/transactions/import/", "post", post(_csv(good)))
    check("/api/transactions/import/", "post", post(_csv("when,what\n1,2\n")))
    check("/api/transactions/import/", "post", post(_csv(good, name="bank.txt")))
    check("/api/transactions/import/", "post", post(_csv("date,description,amount\n" + "x" * (2 * 1024 * 1024 + 70_000))))


@pytest.mark.django_db
def test_budgets_contract(auth_client, ledger, check):
    check("/api/budgets/", "get", auth_client.get("/api/budgets/"))
    body = {"category": ledger["transport"].id, "amount": "50.00", **AUG}
    created = auth_client.post("/api/budgets/", body, format="json")
    check("/api/budgets/", "post", created)
    check("/api/budgets/", "post", auth_client.post("/api/budgets/", body, format="json"))  # duplicate
    url = f"/api/budgets/{created.json()['id']}/"
    check("/api/budgets/{id}/", "get", auth_client.get(url))
    check("/api/budgets/{id}/", "patch", auth_client.patch(url, {"amount": "10.00"}, format="json"))  # over budget
    check("/api/budgets/{id}/", "patch", auth_client.patch(url, {"category": ledger["salary"].id}, format="json"))
    check("/api/budgets/{id}/", "delete", auth_client.delete(url))


@pytest.mark.django_db
def test_recurring_transactions_contract(auth_client, ledger, check):
    check("/api/recurring-transactions/", "get", auth_client.get("/api/recurring-transactions/"))
    body = {
        "name": "Gym", "category": ledger["food"].id, "type": "expense", "amount": "45.90",
        "frequency": "weekly", "start_date": "2026-10-01", "end_date": "2027-10-01",
    }
    created = auth_client.post("/api/recurring-transactions/", body, format="json")
    check("/api/recurring-transactions/", "post", created)
    check("/api/recurring-transactions/", "post", auth_client.post("/api/recurring-transactions/", {**body, "end_date": "2026-01-01"}, format="json"))
    url = f"/api/recurring-transactions/{created.json()['id']}/"
    check("/api/recurring-transactions/{id}/", "get", auth_client.get(url))
    check("/api/recurring-transactions/{id}/", "patch", auth_client.patch(url, {"is_active": False, "end_date": None}, format="json"))
    check("/api/recurring-transactions/{id}/", "delete", auth_client.delete(url))


@pytest.mark.django_db
def test_analytics_and_insights_contract(auth_client, ledger, check):
    for path in ["dashboard", "categories", "comparison", "insights"]:
        response = auth_client.get(f"/api/analytics/{path}/", AUG)
        check(f"/api/analytics/{path}/", "get", response)
        check(f"/api/analytics/{path}/", "get", auth_client.get(f"/api/analytics/{path}/", {"year": 1999, "month": 13}))
    check("/api/analytics/monthly/", "get", auth_client.get("/api/analytics/monthly/", {"year": 2026}))
    check("/api/analytics/dashboard/", "get", auth_client.get("/api/analytics/dashboard/", {"year": 2030, "month": 1}))  # empty

    insights = auth_client.get("/api/analytics/insights/", AUG).json()["insights"]
    # The fixture is built to exercise every type the docs describe (nullable fields included).
    assert {i["type"] for i in insights} == {
        "budget_exceeded", "budget_warning", "savings", "category_increase", "category_decrease",
        "recurring_share", "top_category",
    }


@pytest.mark.django_db
def test_receipt_scanning_contract(auth_client, ledger, check, settings):
    settings.RECEIPT_OCR_PROVIDER = "apps.receipts.conftest.FakeOcrProvider"
    FakeOcrProvider.error = None
    scan = lambda image: auth_client.post("/api/receipts/scan/", {"image": image}, format="multipart")  # noqa: E731

    FakeOcrProvider.text = "TESCO Global Zrt.\nKENYER 549\nOSSZESEN 2 056 Ft\n2026.09.24. 14:05"
    check("/api/receipts/scan/", "post", scan(make_image()))
    FakeOcrProvider.text = ""
    check("/api/receipts/scan/", "post", scan(make_image()))  # nothing found: nulls
    check("/api/receipts/scan/", "post", auth_client.post("/api/receipts/scan/", {}, format="multipart"))
    check("/api/receipts/scan/", "post", scan(SimpleUploadedFile("x.jpg", b"not an image", content_type="image/jpeg")))
    FakeOcrProvider.error = OcrUnavailableError("engine missing")
    check("/api/receipts/scan/", "post", scan(make_image()))
    FakeOcrProvider.error = None


@pytest.mark.django_db
def test_notifications_contract(auth_client, check):
    device = {"expo_push_token": "ExponentPushToken[abcdefghijklmnopqrstuv]", "platform": "ios", "name": "iPhone"}
    created = auth_client.post("/api/devices/", device, format="json")
    check("/api/devices/", "post", created)
    check("/api/devices/", "post", auth_client.post("/api/devices/", device, format="json"))  # 200 re-register
    check("/api/devices/", "post", auth_client.post("/api/devices/", {"expo_push_token": "x", "platform": "web"}, format="json"))
    check("/api/devices/", "get", auth_client.get("/api/devices/"))
    check("/api/devices/{id}/", "delete", auth_client.delete(f"/api/devices/{created.json()['id']}/"))

    check("/api/notifications/preferences/", "get", auth_client.get("/api/notifications/preferences/"))
    check("/api/notifications/preferences/", "patch", auth_client.patch("/api/notifications/preferences/", {"insights": False}, format="json"))
    check("/api/notifications/preferences/", "patch", auth_client.patch("/api/notifications/preferences/", {"recurring_reminder_days": 9}, format="json"))


@pytest.mark.django_db
def test_health_contract(api_client, check, monkeypatch):
    check("/api/health/", "get", api_client.get("/api/health/"))
    check("/api/health/ready/", "get", api_client.get("/api/health/ready/"))

    def broken() -> None:
        raise RuntimeError("down")

    monkeypatch.setitem(health.CHECKS, "database", broken)
    check("/api/health/ready/", "get", api_client.get("/api/health/ready/"))
