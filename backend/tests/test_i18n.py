"""The API in two languages: English and Hungarian.

A request is answered in the language of its Accept-Language header; texts written outside a
request (scheduled notifications) use the user's own saved language. The catalog itself is
checked in test_translation_catalog.py — these tests check what the endpoints and rules do
with it.
"""

from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone, translation
from django.utils.dates import MONTHS
from rest_framework import status

from apps.analytics import achievements, insights
from apps.analytics.assistant import prompts, tools
from apps.analytics.insights import InsightType
from apps.analytics.models import Achievement
from apps.budgets.models import Budget, SavingsGoal
from apps.categories.defaults import DEFAULT_CATEGORIES, display_name, overall_label
from apps.categories.models import Category, TransactionType
from apps.currencies.formatting import format_money
from apps.notifications import rules
from apps.notifications.models import Device, Notification, NotificationKind, NotificationPreference
from apps.transactions.models import Frequency, RecurringTransaction, Transaction
from apps.users.models import AuditAction

User = get_user_model()
D = Decimal
HU = {"HTTP_ACCEPT_LANGUAGE": "hu"}
EN = {"HTTP_ACCEPT_LANGUAGE": "en"}
TODAY = timezone.localdate()
NBSP = " "

REGISTRATION = {"email": "ada@example.com", "password": "StrongPass!2024", "password_confirm": "StrongPass!2024"}


def _expense(user, category, amount, on):
    return Transaction.objects.create(
        user=user, category=category, type=TransactionType.EXPENSE, amount=D(amount), date=on
    )


def _income(user, category, amount, on):
    return Transaction.objects.create(
        user=user, category=category, type=TransactionType.INCOME, amount=D(amount), date=on
    )


def _category(user, name, type_=TransactionType.EXPENSE):
    return Category.objects.create(user=user, name=name, type=type_)


def _only(user):
    [notification] = Notification.objects.filter(user=user)
    return notification


@pytest.fixture
def hungarian_user(db):
    return User.objects.create_user(username="anna", email="anna@example.com", password="testpass123", language="hu")


@pytest.fixture
def hungarian_client(hungarian_user):
    from conftest import _authenticated_client

    return _authenticated_client(hungarian_user)


@pytest.fixture
def preferences(db):
    def _of(user):
        return NotificationPreference.objects.get_or_create(user=user)[0]

    return _of


# =============================== which language answers ===========================================


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("hu", "A jelszavak nem egyeznek."),
        ("hu-HU", "A jelszavak nem egyeznek."),
        ("hu-HU,hu;q=0.9,en;q=0.8", "A jelszavak nem egyeznek."),
        ("en", "Passwords do not match."),
        ("en-GB,en;q=0.9", "Passwords do not match."),
        ("de-DE,de;q=0.9", "Passwords do not match."),  # a language we don't offer: English
        ("*", "Passwords do not match."),
        ("", "Passwords do not match."),
    ],
)
def test_a_request_is_answered_in_the_language_of_its_header(api_client, header, expected):
    response = api_client.post(
        reverse("auth-register"), {**REGISTRATION, "password_confirm": "different"}, HTTP_ACCEPT_LANGUAGE=header
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert str(response.data["password_confirm"][0]) == expected


@pytest.mark.django_db
def test_without_a_header_the_answer_is_english(api_client):
    response = api_client.post(reverse("auth-register"), {**REGISTRATION, "password_confirm": "different"})

    assert str(response.data["password_confirm"][0]) == "Passwords do not match."


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("header", "language"), [("hu", "hu"), ("hu-HU,en;q=0.5", "hu"), ("en-US", "en"), ("fr", "en")]
)
def test_the_response_names_its_language(api_client, header, language):
    response = api_client.get(reverse("auth-me"), HTTP_ACCEPT_LANGUAGE=header)

    assert response["Content-Language"] == language
    assert "Accept-Language" in response["Vary"]


@pytest.mark.django_db
def test_framework_messages_are_translated_too(api_client):
    english = api_client.post(reverse("auth-login"), {}, format="json", **EN)
    hungarian = api_client.post(reverse("auth-login"), {}, format="json", **HU)

    assert str(english.data["email"][0]) == "This field is required."
    assert str(hungarian.data["email"][0]) == "Ez a mező kötelező."


@pytest.mark.django_db
def test_wrong_credentials_are_explained_in_hungarian(api_client, user):
    response = api_client.post(
        reverse("auth-login"), {"email": user.email, "password": "wrong password"}, format="json", **HU
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.data["detail"] == "Nem található aktív fiók a megadott hitelesítő adatokkal."
    assert response.data["code"] == "no_active_account"  # codes never change with the language


@pytest.mark.django_db
def test_an_unauthenticated_request_gets_a_hungarian_message(api_client):
    english = api_client.get(reverse("category-list"), **EN)
    hungarian = api_client.get(reverse("category-list"), **HU)

    assert english.status_code == hungarian.status_code == status.HTTP_401_UNAUTHORIZED
    assert str(english.data["detail"]) != str(hungarian.data["detail"])


@pytest.mark.django_db
def test_error_codes_stay_the_same_in_every_language(api_client):
    codes = {
        language: api_client.post(
            reverse("auth-refresh"), {}, format="json", HTTP_X_AUTH_TRANSPORT="cookie", HTTP_ACCEPT_LANGUAGE=language
        ).data["code"]
        for language in ("en", "hu")
    }

    assert codes == {"en": "session_ended", "hu": "session_ended"}


@pytest.mark.django_db
def test_lockout_message_is_translated_with_the_right_plural(api_client, user):
    from apps.users import lockout

    for _attempt in range(lockout.MAX_FAILURES):
        api_client.post(reverse("auth-login"), {"email": user.email, "password": "nope"}, format="json")

    english = api_client.post(reverse("auth-login"), {"email": user.email, "password": "nope"}, format="json", **EN)
    hungarian = api_client.post(reverse("auth-login"), {"email": user.email, "password": "nope"}, format="json", **HU)

    assert english.status_code == hungarian.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert english.data["detail"].startswith("Too many failed sign-in attempts.")
    assert hungarian.data["detail"].startswith("Túl sok sikertelen bejelentkezési kísérlet.")
    assert english.data["code"] == hungarian.data["code"] == "account_locked"


# =============================== the user's language =================================================


@pytest.mark.django_db
def test_a_new_account_starts_in_english(user):
    assert user.language == "en"


@pytest.mark.django_db
def test_the_profile_shows_the_language(auth_client):
    assert auth_client.get(reverse("auth-me")).data["language"] == "en"


@pytest.mark.django_db
def test_registering_in_a_language_saves_it(api_client):
    response = api_client.post(reverse("auth-register"), {**REGISTRATION, "language": "hu"}, format="json")

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["language"] == "hu"
    assert User.objects.get(email="ada@example.com").language == "hu"


@pytest.mark.django_db
def test_registering_without_a_language_uses_the_language_of_the_request(api_client):
    api_client.post(reverse("auth-register"), REGISTRATION, format="json", **HU)

    assert User.objects.get(email="ada@example.com").language == "hu"


@pytest.mark.django_db
def test_registering_in_an_unknown_request_language_defaults_to_english(api_client):
    api_client.post(reverse("auth-register"), REGISTRATION, format="json", HTTP_ACCEPT_LANGUAGE="de")

    assert User.objects.get(email="ada@example.com").language == "en"


@pytest.mark.django_db
def test_the_chosen_language_wins_over_the_request_language(api_client):
    api_client.post(reverse("auth-register"), {**REGISTRATION, "language": "en"}, format="json", **HU)

    assert User.objects.get(email="ada@example.com").language == "en"


@pytest.mark.django_db
def test_registering_in_an_unsupported_language_is_refused(api_client):
    response = api_client.post(reverse("auth-register"), {**REGISTRATION, "language": "klingon"}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "language" in response.data
    assert not User.objects.filter(email="ada@example.com").exists()


@pytest.mark.django_db
def test_the_language_can_be_changed(auth_client, user):
    response = auth_client.patch(reverse("auth-me"), {"language": "hu"}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["language"] == "hu"
    user.refresh_from_db()
    assert user.language == "hu"
    assert auth_client.get(reverse("auth-me")).data["language"] == "hu"


@pytest.mark.django_db
def test_changing_the_language_back_and_forth(auth_client, user):
    for language in ("hu", "en", "hu"):
        auth_client.patch(reverse("auth-me"), {"language": language}, format="json")
        user.refresh_from_db()
        assert user.language == language


@pytest.mark.django_db
def test_an_unsupported_language_is_refused(auth_client, user):
    response = auth_client.patch(reverse("auth-me"), {"language": "klingon"}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "language" in response.data
    user.refresh_from_db()
    assert user.language == "en"


@pytest.mark.django_db
def test_changing_the_language_does_not_touch_the_base_currency(auth_client, user):
    auth_client.patch(reverse("auth-me"), {"language": "hu"}, format="json")

    user.refresh_from_db()
    assert user.base_currency == "EUR"


@pytest.mark.django_db
def test_changing_the_language_is_not_a_currency_change_in_the_audit_log(auth_client, user):
    auth_client.patch(reverse("auth-me"), {"language": "hu"}, format="json")

    from apps.users.models import AuditEvent

    assert not AuditEvent.objects.filter(user=user, action=AuditAction.BASE_CURRENCY_CHANGED).exists()


@pytest.mark.django_db
def test_other_profile_fields_still_cannot_be_changed(auth_client, user):
    auth_client.patch(
        reverse("auth-me"), {"language": "hu", "email": "other@example.com", "first_name": "X"}, format="json"
    )

    user.refresh_from_db()
    assert user.email == "testuser@example.com"
    assert user.first_name == ""


# =============================== category names ======================================================


@pytest.mark.django_db
def test_default_categories_are_stored_in_english_whatever_the_language(api_client):
    api_client.post(reverse("auth-register"), REGISTRATION, format="json", **HU)

    names = set(Category.objects.filter(user__email="ada@example.com").values_list("name", flat=True))

    assert names == {name for name, _type, _color in DEFAULT_CATEGORIES}


@pytest.mark.django_db
def test_default_categories_are_shown_in_the_language_of_the_request(api_client):
    api_client.post(reverse("auth-register"), REGISTRATION, format="json")
    user = User.objects.get(email="ada@example.com")
    from conftest import _authenticated_client

    client = _authenticated_client(user)

    english = {row["name"] for row in client.get(reverse("category-list"), **EN).data}
    hungarian = {row["name"] for row in client.get(reverse("category-list"), **HU).data}

    assert {"Housing", "Food", "Transport", "Salary", "Other"} <= english
    assert {"Lakhatás", "Élelmiszer", "Közlekedés", "Fizetés", "Egyéb"} <= hungarian
    assert not english & {"Lakhatás", "Élelmiszer"}


@pytest.mark.django_db
def test_a_category_the_user_named_is_never_translated(auth_client, user):
    _category(user, "Pets")
    _category(user, "Kutyaeledel")

    names = {row["name"] for row in auth_client.get(reverse("category-list"), **HU).data}

    assert {"Pets", "Kutyaeledel"} <= names


@pytest.mark.django_db
def test_display_name_translates_only_the_defaults():
    with translation.override("hu"):
        assert display_name("Housing") == "Lakhatás"
        assert display_name("Overall") == "Összesen"
        assert display_name("Pets") == "Pets"
        assert display_name("housing") == "housing"  # a user's own spelling, not the default
    assert display_name("Housing") == "Housing"


@pytest.mark.django_db
def test_every_default_category_has_a_hungarian_name():
    with translation.override("hu"):
        for name, _type, _color in DEFAULT_CATEGORIES:
            assert display_name(name) != name, f"{name} has no Hungarian translation"
        assert overall_label() == "Összesen"


@pytest.mark.django_db
def test_duplicate_detection_still_uses_the_stored_name(auth_client, user):
    from apps.categories.defaults import create_default_categories

    create_default_categories(user)

    response = auth_client.post(
        reverse("category-list"), {"name": "Food", "type": "expense", "color": "#112233"}, format="json", **HU
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert str(response.data["name"][0]) == "Már van ilyen nevű és típusú kategóriád."


@pytest.mark.django_db
def test_the_dashboard_names_categories_and_the_overall_budget_in_hungarian(auth_client, user):
    from apps.categories.defaults import create_default_categories

    create_default_categories(user)
    food = Category.objects.get(user=user, name="Food")
    _expense(user, food, "30.00", date(2026, 9, 3))
    Budget.objects.create(user=user, category=None, amount=D("100.00"), year=2026, month=9)
    Budget.objects.create(user=user, category=food, amount=D("50.00"), year=2026, month=9)
    url = reverse("analytics-dashboard")

    hungarian = auth_client.get(url, {"year": 2026, "month": 9}, **HU).data
    english = auth_client.get(url, {"year": 2026, "month": 9}, **EN).data

    assert hungarian["top_spending_category"]["category_name"] == "Élelmiszer"
    assert {entry["category_name"] for entry in hungarian["budget_usage"]} == {"Összesen", "Élelmiszer"}
    assert {entry["category_name"] for entry in english["budget_usage"]} == {"Overall", "Food"}


@pytest.mark.django_db
def test_month_and_weekday_names_follow_the_language(auth_client, user):
    _expense(user, _category(user, "Food"), "10.00", date(2026, 9, 7))

    monthly = auth_client.get(reverse("analytics-monthly"), {"year": 2026}, **HU).data
    patterns = auth_client.get(reverse("analytics-spending-patterns"), {"year": 2026, "month": 9}, **HU).data
    english = auth_client.get(reverse("analytics-monthly"), {"year": 2026}, **EN).data

    assert [m["month_name"] for m in monthly["months"][:3]] == ["január", "február", "március"]
    assert [m["month_name"] for m in english["months"][:3]] == ["January", "February", "March"]
    assert [day["name"] for day in patterns["weekdays"]][:2] == ["hétfő", "kedd"]


# =============================== insights ============================================================


def _generate(user, today=date(2026, 10, 15)):
    return insights.generate_insights(user, 2026, 9, today=today)


def _messages(result, insight_type):
    return [insight.message for insight in result if insight.type == insight_type]


@pytest.fixture
def food_and_salary(user):
    return _category(user, "Food"), _category(user, "Salary", TransactionType.INCOME)


@pytest.mark.django_db
def test_insights_are_english_by_default(user, food_and_salary):
    food, _salary = food_and_salary
    _expense(user, food, "100.00", date(2026, 9, 10))

    [message] = _messages(_generate(user), InsightType.TOP_CATEGORY)

    assert message == "Highest spending category is Food (100% of this month's expenses)."


@pytest.mark.django_db
def test_top_category_insight_in_hungarian(user, hungarian):
    from apps.categories.defaults import create_default_categories

    create_default_categories(user)
    _expense(user, Category.objects.get(user=user, name="Food"), "100.00", date(2026, 9, 10))

    [message] = _messages(_generate(user), InsightType.TOP_CATEGORY)

    assert message == "A legnagyobb kiadási kategória: Élelmiszer (az e havi kiadások 100%-a)."


@pytest.mark.django_db
def test_category_change_insights_in_hungarian(user, hungarian):
    food, pets = _category(user, "Food"), _category(user, "Pets")
    _expense(user, food, "100.00", date(2026, 8, 10))
    _expense(user, food, "200.00", date(2026, 9, 10))
    _expense(user, pets, "200.00", date(2026, 8, 12))
    _expense(user, pets, "100.00", date(2026, 9, 12))

    result = _generate(user, date(2026, 10, 15))

    # "Food" is one of the default categories, so it is named in Hungarian; "Pets" stays as typed.
    assert _messages(result, InsightType.CATEGORY_INCREASE) == [
        "A(z) Élelmiszer kiadások 100%-kal nőttek az előző hónaphoz képest."
    ]
    assert _messages(result, InsightType.CATEGORY_DECREASE) == [
        "A(z) Pets kiadások 50%-kal csökkentek az előző hónaphoz képest."
    ]


@pytest.mark.django_db
def test_category_change_in_the_current_month_says_so_in_both_languages(user):
    food = _category(user, "Food")
    _expense(user, food, "100.00", date(2026, 8, 3))
    _expense(user, food, "200.00", date(2026, 9, 3))
    today = date(2026, 9, 20)

    english = _messages(_generate(user, today), InsightType.CATEGORY_INCREASE)
    with translation.override("hu"):
        hungarian = _messages(_generate(user, today), InsightType.CATEGORY_INCREASE)

    assert english == ["Food spending increased by 100% compared to the same period last month."]
    assert hungarian == ["A(z) Élelmiszer kiadások 100%-kal nőttek az előző hónap azonos időszakához képest."]


@pytest.mark.django_db
def test_budget_insights_in_hungarian(user, hungarian):
    food = _category(user, "Food")
    Budget.objects.create(user=user, category=food, amount=D("100.00"), year=2026, month=9)
    Budget.objects.create(user=user, category=None, amount=D("1000.00"), year=2026, month=9)
    _expense(user, food, "120.00", date(2026, 9, 10))

    result = _generate(user)

    assert _messages(result, InsightType.BUDGET_EXCEEDED) == [
        "A(z) Élelmiszer kiadás 20%-kal meghaladta a költségkeretét."
    ]
    assert _messages(result, InsightType.BUDGET_WARNING) == []


@pytest.mark.django_db
def test_budget_warning_insights_in_both_languages(user):
    food = _category(user, "Food")
    Budget.objects.create(user=user, category=food, amount=D("100.00"), year=2026, month=9)
    Budget.objects.create(user=user, category=None, amount=D("100.00"), year=2026, month=9)
    _expense(user, food, "85.00", date(2026, 9, 10))

    english = sorted(_messages(_generate(user), InsightType.BUDGET_WARNING))
    with translation.override("hu"):
        hungarian = sorted(_messages(_generate(user), InsightType.BUDGET_WARNING))

    assert english == ["You have used 85% of the Food budget.", "You have used 85% of your overall budget."]
    assert hungarian == [
        "A(z) Élelmiszer költségkeret 85%-át felhasználtad.",
        "Az összesített költségkereted 85%-át felhasználtad.",
    ]


@pytest.mark.django_db
def test_overall_budget_exceeded_in_hungarian(user, hungarian):
    food = _category(user, "Food")
    Budget.objects.create(user=user, category=None, amount=D("100.00"), year=2026, month=9)
    _expense(user, food, "150.00", date(2026, 9, 10))

    result = _generate(user)

    assert _messages(result, InsightType.BUDGET_EXCEEDED) == [
        "Az összes kiadás 50%-kal meghaladta az összesített havi költségkeretet."
    ]


@pytest.mark.django_db
def test_income_based_insights_in_hungarian(user, hungarian, food_and_salary):
    food, salary = food_and_salary
    _income(user, salary, "1000.00", date(2026, 9, 1))
    _expense(user, food, "1200.00", date(2026, 9, 10))
    RecurringTransaction.objects.create(
        user=user,
        category=food,
        name="Rent",
        type=TransactionType.EXPENSE,
        amount=D("600.00"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 1),
        next_occurrence_date=date(2026, 1, 1),
    )

    result = _generate(user)

    assert _messages(result, InsightType.OVERSPENDING) == [
        "Ebben a hónapban a kiadások 20%-kal meghaladták a bevételt."
    ]
    assert _messages(result, InsightType.RECURRING_SHARE) == ["Az ismétlődő kiadások a bevétel 60%-át teszik ki."]


@pytest.mark.django_db
def test_savings_insight_in_hungarian(user, hungarian, food_and_salary):
    food, salary = food_and_salary
    _income(user, salary, "1000.00", date(2026, 9, 1))
    _expense(user, food, "800.00", date(2026, 9, 10))

    assert _messages(_generate(user), InsightType.SAVINGS) == ["Ebben a hónapban a bevételed 20%-át megtakarítottad."]


@pytest.mark.django_db
def test_the_insights_endpoint_follows_the_request_language(auth_client, user, food_and_salary):
    food, salary = food_and_salary
    _income(user, salary, "1000.00", date(2026, 9, 1))
    _expense(user, food, "800.00", date(2026, 9, 10))
    url = reverse("analytics-insights")

    english = auth_client.get(url, {"year": 2026, "month": 9}, **EN).json()["insights"]
    hungarian = auth_client.get(url, {"year": 2026, "month": 9}, **HU).json()["insights"]

    assert any(item["message"] == "You saved 20% of your income this month." for item in english)
    assert any(item["message"] == "Ebben a hónapban a bevételed 20%-át megtakarítottad." for item in hungarian)
    assert [i["type"] for i in english] == [i["type"] for i in hungarian]  # only the words change


# =============================== notifications in the user's own language ======================


@pytest.mark.django_db
def test_a_budget_notification_uses_the_users_language_not_the_requests(hungarian_client, hungarian_user):
    food = _category(hungarian_user, "Food")
    Budget.objects.create(user=hungarian_user, category=food, amount=D("100.00"), year=TODAY.year, month=TODAY.month)

    hungarian_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "82.00", "date": TODAY.isoformat()},
        format="json",
        **EN,  # an English request: the notification is still written in the user's language
    )

    notification = _only(hungarian_user)
    with translation.override("hu"):
        month = str(MONTHS[TODAY.month])
    assert notification.title == "A költségkeret majdnem elfogyott"
    assert notification.body == f"{month} hónapban a(z) Élelmiszer költségkereted 82%-át felhasználtad."


@pytest.mark.django_db
def test_budget_exceeded_notification_in_hungarian(hungarian_client, hungarian_user):
    food = _category(hungarian_user, "Food")
    Budget.objects.create(user=hungarian_user, category=food, amount=D("100.00"), year=TODAY.year, month=TODAY.month)

    hungarian_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "130.00", "date": TODAY.isoformat()},
        format="json",
    )

    notification = _only(hungarian_user)
    assert notification.title == "Költségkeret túllépve"
    assert "130%-át elköltötted" in notification.body


@pytest.mark.django_db
def test_an_english_user_still_gets_english_notifications(auth_client, user):
    food = _category(user, "Food")
    Budget.objects.create(user=user, category=food, amount=D("100.00"), year=TODAY.year, month=TODAY.month)

    auth_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "130.00", "date": TODAY.isoformat()},
        format="json",
        **HU,  # a Hungarian request must not change what an English account is told
    )

    notification = _only(user)
    assert notification.title == "Budget exceeded"
    assert notification.body == f"You've spent 130% of your Food budget for {TODAY:%B}."


@pytest.mark.django_db
def test_the_overall_budget_notification_in_hungarian(hungarian_client, hungarian_user):
    food = _category(hungarian_user, "Food")
    Budget.objects.create(user=hungarian_user, category=None, amount=D("100.00"), year=TODAY.year, month=TODAY.month)

    hungarian_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "90.00", "date": TODAY.isoformat()},
        format="json",
    )

    assert "összesített költségkereted 90%-át felhasználtad" in _only(hungarian_user).body


@pytest.mark.django_db
def test_a_push_carries_the_users_language(
    hungarian_client, hungarian_user, push_outbox, django_capture_on_commit_callbacks
):
    Device.objects.create(user=hungarian_user, expo_push_token="ExponentPushToken[phone1]", platform="ios")
    food = _category(hungarian_user, "Food")
    Budget.objects.create(user=hungarian_user, category=food, amount=D("100.00"), year=TODAY.year, month=TODAY.month)

    with django_capture_on_commit_callbacks(execute=True):
        hungarian_client.post(
            reverse("transaction-list"),
            {"category": food.id, "type": "expense", "amount": "130.00", "date": TODAY.isoformat()},
            format="json",
            **EN,
        )

    assert [message["title"] for message in push_outbox] == ["Költségkeret túllépve"]


@pytest.mark.django_db
def test_a_goal_milestone_in_hungarian_uses_hungarian_money(hungarian_client, hungarian_user):
    goal = SavingsGoal.objects.create(user=hungarian_user, name="Japán út", target_amount=D("1500.00"))

    hungarian_client.post(reverse("savingsgoal-deposit", args=[goal.pk]), {"amount": "400.00"}, format="json")

    notification = _only(hungarian_user)
    assert notification.title == "Megtakarítási cél előrehaladása"
    assert notification.body == f"Még 1{NBSP}100{NBSP}€ hiányzik a(z) Japán út célodhoz (26% megtakarítva)."


@pytest.mark.django_db
def test_reaching_a_goal_in_hungarian(hungarian_client, hungarian_user):
    goal = SavingsGoal.objects.create(user=hungarian_user, name="Laptop", target_amount=D("1000.00"))

    hungarian_client.post(reverse("savingsgoal-deposit", args=[goal.pk]), {"amount": "1000.00"}, format="json")

    notification = _only(hungarian_user)
    assert notification.title == "Megtakarítási cél elérve"
    assert notification.body == f"Elérted a(z) Laptop célodat: 1{NBSP}000{NBSP}€."


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("today", "expected"),
    [
        (date(2026, 9, 28), "A(z) Netflix fizetése ma várható."),
        (date(2026, 9, 27), "A(z) Netflix fizetése holnap várható."),
        (date(2026, 9, 26), "A(z) Netflix fizetése 2 nap múlva várható."),
    ],
)
def test_subscription_reminders_in_hungarian(hungarian_user, preferences, today, expected):
    from apps.subscriptions.models import Subscription

    entertainment = _category(hungarian_user, "Entertainment")
    Subscription.objects.create(
        user=hungarian_user,
        category=entertainment,
        name="Netflix",
        amount=D("17.99"),
        frequency=Frequency.MONTHLY,
        start_date=date(2026, 1, 28),
        next_occurrence_date=date(2026, 1, 28),
    )
    prefs = preferences(hungarian_user)
    prefs.recurring_reminder_days = 3
    prefs.save()

    rules.send_payment_reminders(hungarian_user, prefs, today)

    notification = _only(hungarian_user)
    assert notification.title == "Előfizetés kifizetése"
    assert notification.body == expected


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("today", "expected_english", "expected_hungarian"),
    [
        (date(2026, 9, 28), "Rent is due today.", "A(z) Rent ma esedékes."),
        (date(2026, 9, 27), "Rent is due tomorrow.", "A(z) Rent holnap esedékes."),
        (date(2026, 9, 26), "Rent is due in 2 days.", "A(z) Rent 2 nap múlva esedékes."),
    ],
)
def test_recurring_reminders_in_both_languages(
    user, hungarian_user, preferences, today, expected_english, expected_hungarian
):
    for owner in (user, hungarian_user):
        category = _category(owner, "Housing")
        RecurringTransaction.objects.create(
            user=owner,
            category=category,
            name="Rent",
            type=TransactionType.EXPENSE,
            amount=D("800.00"),
            frequency=Frequency.MONTHLY,
            start_date=date(2026, 1, 28),
            next_occurrence_date=date(2026, 1, 28),
        )
        prefs = preferences(owner)
        prefs.recurring_reminder_days = 3
        prefs.save()
        rules.send_payment_reminders(owner, prefs, today)

    assert _only(user).body == expected_english
    assert _only(hungarian_user).body == expected_hungarian
    assert _only(hungarian_user).title == "Közelgő fizetés"


@pytest.mark.django_db
def test_the_monthly_summary_in_hungarian(hungarian_user, preferences):
    food, salary = _category(hungarian_user, "Food"), _category(hungarian_user, "Salary", TransactionType.INCOME)
    _expense(hungarian_user, food, "1000.00", date(2026, 7, 10))
    _expense(hungarian_user, food, "920.50", date(2026, 8, 10))
    _income(hungarian_user, salary, "2000.00", date(2026, 8, 1))

    rules.send_monthly_summary(hungarian_user, preferences(hungarian_user), date(2026, 9, 1))

    notification = _only(hungarian_user)
    assert notification.title == "Összefoglaló – augusztus"
    assert notification.body == (
        f"augusztus: költés 920,50{NBSP}€, bevétel 2{NBSP}000{NBSP}€. A költés 8%-kal alacsonyabb volt, mint július hónapban."
    )


@pytest.mark.django_db
def test_the_monthly_summary_without_income_in_hungarian(hungarian_user, preferences):
    _expense(hungarian_user, _category(hungarian_user, "Food"), "80.00", date(2026, 8, 10))

    rules.send_monthly_summary(hungarian_user, preferences(hungarian_user), date(2026, 9, 1))

    assert _only(hungarian_user).body == f"augusztus: költés 80{NBSP}€."


@pytest.mark.django_db
def test_the_monthly_summary_with_higher_and_equal_spending_in_hungarian(hungarian_user, preferences):
    food = _category(hungarian_user, "Food")
    _expense(hungarian_user, food, "100.00", date(2026, 7, 10))
    _expense(hungarian_user, food, "150.00", date(2026, 8, 10))

    rules.send_monthly_summary(hungarian_user, preferences(hungarian_user), date(2026, 9, 1))

    assert _only(hungarian_user).body.endswith("A költés 50%-kal magasabb volt, mint július hónapban.")


@pytest.mark.django_db
def test_the_monthly_summary_with_unchanged_spending_in_hungarian(hungarian_user, preferences):
    food = _category(hungarian_user, "Food")
    _expense(hungarian_user, food, "100.00", date(2026, 7, 10))
    _expense(hungarian_user, food, "100.00", date(2026, 8, 10))

    rules.send_monthly_summary(hungarian_user, preferences(hungarian_user), date(2026, 9, 1))

    assert _only(hungarian_user).body.endswith("A költés nagyjából ugyanannyi volt, mint július hónapban.")


@pytest.mark.django_db
def test_a_scheduled_run_writes_each_user_in_their_own_language(user, hungarian_user):
    for owner in (user, hungarian_user):
        _expense(owner, _category(owner, "Food"), "80.00", date(2026, 8, 10))

    rules.run_scheduled_rules(date(2026, 9, 1))

    assert _only(user).title == "Your August summary"
    assert _only(hungarian_user).title == "Összefoglaló – augusztus"


@pytest.mark.django_db
def test_an_important_insight_notification_in_hungarian(hungarian_user, preferences):
    today = date(2026, 9, 20)
    _income(hungarian_user, _category(hungarian_user, "Salary", TransactionType.INCOME), "1000.00", today)
    _expense(hungarian_user, _category(hungarian_user, "Food"), "1200.00", today)

    rules.send_insight_notifications(hungarian_user, preferences(hungarian_user), today)

    notification = _only(hungarian_user)
    assert notification.title == "Pénzügyi meglátás"
    assert notification.body == "Ebben a hónapban a kiadások 20%-kal meghaladták a bevételt."


@pytest.mark.django_db
def test_unusual_spending_in_hungarian(hungarian_user, preferences):
    shopping, housing = _category(hungarian_user, "Shopping"), _category(hungarian_user, "Housing")
    for month in (6, 7, 8):
        _expense(hungarian_user, shopping, "100.00", date(2026, month, 5))
        _expense(hungarian_user, housing, "500.00", date(2026, month, 20))
    _expense(hungarian_user, shopping, "121.00", date(2026, 9, 5))
    _expense(hungarian_user, shopping, "10.00", date(2026, 9, 6))

    rules.send_unusual_spending(hungarian_user, preferences(hungarian_user), date(2026, 9, 15))

    notification = _only(hungarian_user)
    assert notification.title == "Szokatlan költés"
    assert notification.body == (
        "A(z) Vásárlás kiadásaid 31%-kal nőttek a megszokott költéshez képest a hónap eddigi részében."
    )


@pytest.mark.django_db
def test_the_language_override_does_not_leak_out_of_a_rule(hungarian_user, preferences):
    _expense(hungarian_user, _category(hungarian_user, "Food"), "80.00", date(2026, 8, 10))

    with translation.override("en"):
        rules.send_monthly_summary(hungarian_user, preferences(hungarian_user), date(2026, 9, 1))
        assert translation.get_language() == "en"


@pytest.mark.django_db
def test_the_notification_inbox_keeps_the_language_it_was_written_in(hungarian_client, hungarian_user, preferences):
    _expense(hungarian_user, _category(hungarian_user, "Food"), "80.00", date(2026, 8, 10))
    rules.send_monthly_summary(hungarian_user, preferences(hungarian_user), date(2026, 9, 1))

    rows = hungarian_client.get(reverse("notification-list"), **EN).json()["results"]

    assert rows[0]["title"] == "Összefoglaló – augusztus"
    assert rows[0]["kind"] == NotificationKind.MONTHLY_SUMMARY


# =============================== achievements ===========================================================


@pytest.mark.django_db
def test_achievements_in_hungarian(auth_client):
    english = {row["code"]: row for row in auth_client.get(reverse("achievement-list"), **EN).json()}
    hungarian = {row["code"]: row for row in auth_client.get(reverse("achievement-list"), **HU).json()}

    assert english["first_transaction"]["title"] == "First Transaction"
    assert hungarian["first_transaction"]["title"] == "Első tranzakció"
    assert hungarian["first_transaction"]["description"] == "Rögzítsd az első tranzakciódat."
    assert hungarian["saved_1000"]["title"] == "1 000 € megtakarítva"
    assert hungarian["stayed_under_budget"]["description"].startswith("Zárj le egy hónapot")
    assert english.keys() == hungarian.keys()
    assert hungarian["first_transaction"]["code"] == english["first_transaction"]["code"]


@pytest.mark.django_db
def test_every_catalog_achievement_has_a_hungarian_name_and_description():
    assert Achievement.objects.exists()
    with translation.override("hu"):
        for achievement in Achievement.objects.all():
            assert translation.gettext(achievement.name) != achievement.name, achievement.code
            assert translation.gettext(achievement.description) != achievement.description, achievement.code


@pytest.mark.django_db
def test_a_kept_budget_achievement_names_the_category(user):
    from apps.analytics.models import UserAchievement

    achievement = Achievement.objects.get(code="stayed_under_budget")
    record = UserAchievement(
        user=user, achievement=achievement, context={"category_name": "Food", "year": 2026, "month": 8}
    )

    english = achievements.title_and_detail(record)
    with translation.override("hu"):
        hungarian = achievements.title_and_detail(record)

    assert english == ("Stayed Under Food Budget", "August 2026")
    assert hungarian == ("Élelmiszer költségkeret betartva", "augusztus 2026")


@pytest.mark.django_db
def test_a_kept_overall_budget_achievement_in_hungarian(user):
    from apps.analytics.models import UserAchievement

    achievement = Achievement.objects.get(code="stayed_under_budget")
    record = UserAchievement(
        user=user, achievement=achievement, context={"category_name": "Overall", "year": 2026, "month": 8}
    )

    with translation.override("hu"):
        assert achievements.title_and_detail(record)[0] == "Összesen költségkeret betartva"


@pytest.mark.django_db
def test_a_completed_goal_achievement_keeps_the_goal_name(user):
    from apps.analytics.models import UserAchievement

    achievement = Achievement.objects.get(code="goal_completed")
    record = UserAchievement(user=user, achievement=achievement, context={"goal_name": "Japán út"})

    with translation.override("hu"):
        assert achievements.title_and_detail(record) == ("Teljesített megtakarítási cél", "Japán út")


# =============================== the assistant ===========================================================


@pytest.mark.django_db
def test_suggested_questions_in_hungarian(auth_client, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "ENABLED": True}

    english = auth_client.get("/api/assistant/", **EN).json()["suggested_questions"]
    hungarian = auth_client.get("/api/assistant/", **HU).json()["suggested_questions"]

    assert english[0] == "What did I spend the most on this month?"
    assert hungarian == [
        "Mire költöttem a legtöbbet ebben a hónapban?",
        "Mire költöttem többet, mint előző hónapban?",
        "Melyik előfizetésem kerül a legtöbbe?",
        "Tartom a költségkereteimet ebben a hónapban?",
    ]


@pytest.mark.django_db
def test_data_driven_suggestions_in_hungarian(auth_client, user, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "ENABLED": True}
    from apps.categories.defaults import create_default_categories

    create_default_categories(user)
    _expense(user, Category.objects.get(user=user, name="Food"), "10.00", TODAY)
    SavingsGoal.objects.create(user=user, name="Japán út", target_amount=D("3000.00"))

    questions = auth_client.get("/api/assistant/", **HU).json()["suggested_questions"]

    assert "Mennyit költöttem ebben a hónapban erre: Élelmiszer?" in questions
    assert "Hogy állok a(z) Japán út megtakarítási céllal?" in questions


@pytest.mark.django_db
def test_the_prompt_names_the_users_language(user, hungarian_user):
    english = prompts.system_blocks(user, date(2026, 9, 28))[1]["text"]
    hungarian = prompts.system_blocks(hungarian_user, date(2026, 9, 28))[1]["text"]

    assert "interface language is English" in english
    assert "interface language is Hungarian" in hungarian
    assert (
        prompts.system_blocks(user, date(2026, 9, 28))[0] == prompts.system_blocks(hungarian_user, date(2026, 9, 28))[0]
    )


@pytest.mark.django_db
def test_assistant_sources_are_described_in_the_reader_language():
    source = {"tool": "get_month_comparison", "arguments": {"year": 2026, "month": 9}}

    english = tools.describe_source(source)
    with translation.override("hu"):
        hungarian = tools.describe_source(source)

    assert english[0] == "Month comparison"
    assert hungarian[0] == "Hónapok összehasonlítása"
    assert "September" in english[1]
    assert "szeptember" in hungarian[1]  # the period is named in the reader's language, too


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("tool", "expected"),
    [
        ("get_monthly_spending", "Havi kiadások"),
        ("get_category_spending", "Kiadások kategóriánként"),
        ("get_merchant_spending", "Kiadások kereskedőnként"),
        ("get_budget_status", "Költségkeretek"),
        ("get_subscription_costs", "Előfizetések"),
        ("get_savings_progress", "Megtakarítási célok"),
    ],
)
def test_every_assistant_source_label_is_translated(tool, expected):
    with translation.override("hu"):
        assert tools.describe_source({"tool": tool, "arguments": {}})[0] == expected


# =============================== money in texts ============================================================


@pytest.mark.parametrize(
    ("amount", "currency", "expected"),
    [
        ("1234.50", "EUR", "€1,234.50"),
        ("150", "EUR", "€150"),
        ("12.99", "USD", "$12.99"),
        ("15000", "HUF", "15,000 Ft"),
        ("8.20", "CHF", "CHF 8.20"),
        ("-5", "EUR", "-€5"),
        ("0.5", "GBP", "£0.50"),
        ("1600", "JPY", "¥1,600"),
    ],
)
def test_money_in_english_texts(amount, currency, expected):
    with translation.override("en"):
        assert format_money(D(amount), currency) == expected


@pytest.mark.parametrize(
    ("amount", "currency", "expected"),
    [
        ("1234.50", "EUR", f"1{NBSP}234,50{NBSP}€"),
        ("150", "EUR", f"150{NBSP}€"),
        ("12.99", "USD", f"12,99{NBSP}$"),
        ("15000", "HUF", f"15{NBSP}000{NBSP}Ft"),
        ("8.20", "CHF", f"8,20{NBSP}CHF"),
        ("-5", "EUR", f"-5{NBSP}€"),
        ("0.5", "GBP", f"0,50{NBSP}£"),
        ("1600", "JPY", f"1{NBSP}600{NBSP}¥"),
        ("1234567.89", "EUR", f"1{NBSP}234{NBSP}567,89{NBSP}€"),
    ],
)
def test_money_in_hungarian_texts(amount, currency, expected):
    with translation.override("hu"):
        assert format_money(D(amount), currency) == expected


# =============================== messages of the other endpoints ===========================================


@pytest.mark.django_db
def test_validation_messages_of_the_data_endpoints_in_hungarian(auth_client, user):
    from apps.categories.defaults import create_default_categories

    create_default_categories(user)
    salary = Category.objects.get(user=user, name="Salary")

    response = auth_client.post(
        reverse("transaction-list"),
        {"category": salary.id, "type": "expense", "amount": "10.00", "date": "2026-09-01"},
        format="json",
        **HU,
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert str(response.data["type"][0]) == "A tranzakció típusának egyeznie kell a kiválasztott kategória típusával."


@pytest.mark.django_db
def test_decimal_precision_message_in_hungarian(auth_client, user):
    food = _category(user, "Food")

    response = auth_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "1500.50", "currency": "HUF", "date": "2026-09-01"},
        format="json",
        **HU,
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert str(response.data["amount"][0]) == "HUF összegben nem lehetnek tizedesjegyek."


@pytest.mark.django_db
def test_budget_messages_in_hungarian(auth_client, user):
    salary = _category(user, "Salary", TransactionType.INCOME)

    response = auth_client.post(
        reverse("budget-list"),
        {"category": salary.id, "amount": "50.00", "year": 2026, "month": 9},
        format="json",
        **HU,
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert str(response.data["category"][0]) == "Költségkeret csak kiadási kategóriákhoz állítható be."


@pytest.mark.django_db
def test_duplicate_budget_message_in_hungarian(auth_client, user):
    food = _category(user, "Food")
    Budget.objects.create(user=user, category=food, amount=D("50.00"), year=2026, month=9)

    response = auth_client.post(
        reverse("budget-list"), {"category": food.id, "amount": "70.00", "year": 2026, "month": 9}, format="json", **HU
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Ehhez a kategóriához és hónaphoz már van költségkeret." in [
        str(m) for m in response.data["non_field_errors"]
    ]


@pytest.mark.django_db
def test_savings_goal_messages_in_hungarian(auth_client, user):
    goal = SavingsGoal.objects.create(
        user=user, name="Japán út", target_amount=D("1500.00"), current_amount=D("100.00")
    )

    response = auth_client.post(
        reverse("savingsgoal-withdraw", args=[goal.pk]), {"amount": "400.00"}, format="json", **HU
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Legfeljebb a megtakarított összeget" in str(response.data["amount"][0])


@pytest.mark.django_db
def test_category_in_use_message_in_hungarian(auth_client, user):
    food = _category(user, "Pets")
    _expense(user, food, "5.00", date(2026, 9, 1))

    response = auth_client.delete(reverse("category-detail", args=[food.id]), **HU)

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.data["detail"] == "Ezt a kategóriát meglévő tranzakciók használják, ezért nem törölhető."


@pytest.mark.django_db
def test_conflict_message_in_hungarian(auth_client, user):
    food = _category(user, "Pets")
    transaction = _expense(user, food, "5.00", date(2026, 9, 1))

    response = auth_client.patch(
        reverse("transaction-detail", args=[transaction.id]),
        {"description": "x"},
        format="json",
        HTTP_IF_MATCH='"2000-01-01T00:00:00Z"',
        **HU,
    )

    assert response.status_code == status.HTTP_412_PRECONDITION_FAILED
    assert response.data["detail"].startswith("Ezt az elemet egy másik eszközön módosították")
    assert response.data["detail"].code == "precondition_failed"  # the code never changes with the language
    assert response.data["current"]["id"] == transaction.id  # the server's version comes back, untranslated


@pytest.mark.django_db
def test_csv_import_errors_in_hungarian(auth_client):
    from django.core.files.uploadedfile import SimpleUploadedFile

    empty = SimpleUploadedFile("empty.csv", b"", content_type="text/csv")
    wrong = SimpleUploadedFile("wrong.csv", b"foo,bar\n1,2\n", content_type="text/csv")

    empty_response = auth_client.post(reverse("transaction-import-csv"), {"file": empty}, format="multipart", **HU)
    wrong_response = auth_client.post(reverse("transaction-import-csv"), {"file": wrong}, format="multipart", **HU)

    assert "A feltöltött fájl üres." in str(empty_response.data)
    assert "Hiányzó kötelező oszlop(ok)" in str(wrong_response.data)


@pytest.mark.django_db
def test_csv_row_reasons_in_hungarian(auth_client, user):
    from django.core.files.uploadedfile import SimpleUploadedFile

    _category(user, "Food")
    csv_text = (
        b"date,description,amount\n"
        b"2026-09-10,Albert Heijn,-42.50\n"
        b"2026-09-10,Albert Heijn,-42.50\n"
        b"nope,Shop,-1\n"
        b"2026-09-11,Shop,0\n"
        b"2026-09-12,,-3\n"
        b"2026-09-13,Mystery income,5\n"
    )

    response = auth_client.post(
        reverse("transaction-import-csv"),
        {"file": SimpleUploadedFile("t.csv", csv_text, content_type="text/csv")},
        format="multipart",
        **HU,
    )

    reasons = [row["reason"] for row in response.data["details"]]
    assert "Egy meglévő tranzakció másolata." in reasons
    assert any(reason.startswith("Ismeretlen dátum:") for reason in reasons)
    assert "Az összeg nem lehet nulla." in reasons
    assert "Hiányzik a dátum, a leírás vagy az összeg." in reasons
    assert "Nem sikerült kategóriát találni ehhez: „Mystery income”." in reasons


@pytest.mark.django_db
def test_security_events_are_described_in_hungarian(api_client, user):
    from conftest import _authenticated_client

    api_client.post(reverse("auth-login"), {"email": user.email, "password": "testpass123"}, format="json")
    client = _authenticated_client(user)

    english = client.get(reverse("auth-security-events"), **EN).json()["results"]
    hungarian = client.get(reverse("auth-security-events"), **HU).json()["results"]

    assert english[0]["description"] == "Signed in"
    assert hungarian[0]["description"] == "Bejelentkezés"
    assert english[0]["action"] == hungarian[0]["action"] == AuditAction.LOGIN_SUCCEEDED


@pytest.mark.django_db
def test_every_audit_action_has_a_hungarian_description():
    with translation.override("en"):
        english = {action: str(action.label) for action in AuditAction}
    with translation.override("hu"):
        hungarian = {action: str(action.label) for action in AuditAction}

    assert [action for action in AuditAction if hungarian[action] == english[action]] == []


@pytest.mark.django_db
def test_two_factor_messages_in_hungarian(auth_client, user):
    user.set_password("StrongPass!2024")
    user.save()

    response = auth_client.post(reverse("auth-2fa-confirm"), {"code": "123456"}, format="json", **HU)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Előbb indítsd el a beállítást." in str(response.data)


@pytest.mark.django_db
def test_password_change_messages_in_hungarian(auth_client, user):
    response = auth_client.post(
        reverse("auth-password"),
        {"current_password": "wrong", "new_password": "AnotherStrong!2024"},
        format="json",
        **HU,
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert str(response.data["current_password"][0]) == "Hibás jelszó."


@pytest.mark.django_db
def test_logout_message_in_hungarian(auth_client):
    response = auth_client.post(reverse("auth-logout"), {}, format="json", **HU)

    assert response.data["detail"] == "Sikeres kijelentkezés."


@pytest.mark.django_db
def test_exchange_rate_message_in_hungarian(auth_client, user):
    food = _category(user, "Food")

    response = auth_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "10.00", "currency": "USD", "date": "2019-03-04"},
        format="json",
        **HU,
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "2019-03-04 napra nincs elérhető USD árfolyam." in str(response.data["exchange_rate"][0])


@pytest.mark.django_db
def test_the_overall_label_of_budget_usage_follows_the_language(user):
    from apps.analytics import services

    Budget.objects.create(user=user, category=None, amount=D("100.00"), year=2026, month=9)

    english = services.get_budget_usage(user, 2026, 9, today=date(2026, 9, 10))[0]["category_name"]
    with translation.override("hu"):
        hungarian = services.get_budget_usage(user, 2026, 9, today=date(2026, 9, 10))[0]["category_name"]

    assert (english, hungarian) == ("Overall", "Összesen")


# =============================== texts that were once written without gettext ===============================


@pytest.mark.django_db
def test_the_default_categories_cannot_be_copied_under_their_translated_name(auth_client, user):
    from apps.categories.defaults import create_default_categories

    create_default_categories(user)
    body = {"name": "Élelmiszer", "type": "expense", "color": "#112233"}

    in_english = auth_client.post(reverse("category-list"), body, format="json", **EN)
    in_hungarian = auth_client.post(reverse("category-list"), body, format="json", **HU)

    assert in_english.status_code == status.HTTP_201_CREATED  # a plain word in English
    assert in_hungarian.status_code == status.HTTP_400_BAD_REQUEST  # but a copy of "Food" in Hungarian


@pytest.mark.django_db
def test_a_default_category_is_listed_under_one_name_per_language(auth_client, user):
    from apps.categories.defaults import create_default_categories

    create_default_categories(user)
    [food] = [
        row
        for row in auth_client.get(reverse("category-list"), **HU).data
        if row["is_system"] and row["name"] == "Élelmiszer"
    ]

    assert food["type"] == "expense"
    assert Category.objects.get(pk=food["id"]).name == "Food"  # the stored name never changes


@pytest.mark.django_db
def test_the_hex_color_message_in_hungarian(auth_client):
    response = auth_client.post(
        reverse("category-list"), {"name": "Pets", "type": "expense", "color": "red"}, format="json", **HU
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert str(response.data["color"][0]) == "A színnek hexadecimális kódnak kell lennie, pl. #6366F1."


@pytest.mark.django_db
def test_csv_upload_messages_in_hungarian(auth_client):
    from django.core.files.uploadedfile import SimpleUploadedFile

    wrong_type = SimpleUploadedFile("notes.txt", b"date,description,amount\n", content_type="text/plain")

    missing = auth_client.post(reverse("transaction-import-csv"), {}, format="multipart", **HU)
    refused = auth_client.post(reverse("transaction-import-csv"), {"file": wrong_type}, format="multipart", **HU)

    assert str(missing.data["file"][0]) == "Ez a mező kötelező."
    assert str(refused.data["file"][0]) == "Kérjük, .csv fájlt tölts fel."


@pytest.mark.django_db
def test_an_oversized_csv_is_refused_in_hungarian(auth_client, settings):
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.CSV_IMPORT_MAX_BYTES = 10
    big = SimpleUploadedFile("t.csv", b"date,description,amount\n" * 5, content_type="text/csv")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": big}, format="multipart", **HU)

    assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    assert str(response.data["file"][0]) == "A fájl túl nagy (legfeljebb 1 MB)."


@pytest.mark.django_db
def test_the_receipt_upload_messages_in_hungarian(auth_client):
    response = auth_client.post(reverse("receipt-scan"), {}, format="multipart", **HU)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert str(response.data["image"][0]) == "Ez a mező kötelező."


@pytest.mark.django_db
def test_csv_rows_with_decimals_in_a_whole_number_currency_in_hungarian(auth_client, user):
    from django.core.files.uploadedfile import SimpleUploadedFile

    user.base_currency = "HUF"
    user.save()
    _category(user, "Food")
    csv_text = b"date,description,amount\n2026-09-10,Albert Heijn,-42.50\n"

    response = auth_client.post(
        reverse("transaction-import-csv"),
        {"file": SimpleUploadedFile("t.csv", csv_text, content_type="text/csv")},
        format="multipart",
        **HU,
    )

    assert [row["reason"] for row in response.data["details"]] == ["HUF összegben nem lehetnek tizedesjegyek."]


@pytest.mark.django_db
def test_the_security_events_filter_message_in_hungarian(auth_client):
    response = auth_client.get(reverse("auth-security-events"), {"category": "nonsense"}, **HU)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert str(response.data["category"][0]).startswith("A(z) „nonsense” nem egyike ezeknek:")


@pytest.mark.django_db
def test_turning_off_two_factor_that_is_off_in_hungarian(auth_client):
    response = auth_client.post(
        reverse("auth-2fa-disable"), {"password": "testpass123", "code": "123456"}, format="json", **HU
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "A kétlépcsős azonosítás ki van kapcsolva." in str(response.data)


@pytest.mark.django_db
def test_the_not_enough_data_sentence_reaches_the_model_in_the_users_language(user, hungarian_user):
    english = prompts.system_blocks(user, date(2026, 9, 28))
    hungarian = prompts.system_blocks(hungarian_user, date(2026, 9, 28))

    assert 'The "not enough data" sentence is: "There isn\'t enough data available."' in english[1]["text"]
    assert 'The "not enough data" sentence is: "Nem áll rendelkezésre elegendő adat."' in hungarian[1]["text"]
    assert english[0] == hungarian[0]  # the cached block stays identical for everyone
    assert "Nem áll rendelkezésre" not in english[0]["text"]
