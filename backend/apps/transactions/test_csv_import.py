from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status

from apps.categories.models import Category, TransactionType
from apps.transactions.models import Transaction


def _csv_file(content: str, name: str = "transactions.csv") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content.encode("utf-8"), content_type="text/csv")


@pytest.fixture
def food_category(user):
    return Category.objects.get_or_create(
        user=user, name="Food", type=TransactionType.EXPENSE, defaults={"color": "#10b981"}
    )[0]


@pytest.fixture
def transport_category(user):
    return Category.objects.get_or_create(
        user=user, name="Transport", type=TransactionType.EXPENSE, defaults={"color": "#3b82f6"}
    )[0]


@pytest.fixture
def entertainment_category(user):
    return Category.objects.get_or_create(
        user=user, name="Entertainment", type=TransactionType.EXPENSE, defaults={"color": "#8b5cf6"}
    )[0]


@pytest.fixture
def other_category(user):
    return Category.objects.get_or_create(
        user=user, name="Other", type=TransactionType.EXPENSE, defaults={"color": "#a855f7"}
    )[0]


@pytest.fixture
def salary_category(user):
    return Category.objects.get_or_create(
        user=user, name="Salary", type=TransactionType.INCOME, defaults={"color": "#22c55e"}
    )[0]


@pytest.mark.django_db
def test_import_requires_file(auth_client):
    response = auth_client.post(reverse("transaction-import-csv"), {}, format="multipart")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "file" in response.data


@pytest.mark.django_db
def test_import_rejects_non_csv_extension(auth_client):
    upload = SimpleUploadedFile("data.txt", b"date,description,amount\n", content_type="text/plain")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "file" in response.data


@pytest.mark.django_db
def test_import_rejects_empty_file(auth_client):
    upload = _csv_file("")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "file" in response.data


@pytest.mark.django_db
def test_import_missing_required_columns_rejected(auth_client):
    upload = _csv_file("date,amount\n2026-09-10,-42.50\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "description" in response.data["file"][0]


@pytest.mark.django_db
def test_import_unauthenticated_rejected(api_client):
    upload = _csv_file("date,description,amount\n2026-09-10,Test,-1.00\n")

    response = api_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_import_creates_transactions_and_detects_categories(
    auth_client, user, food_category, transport_category, entertainment_category
):
    csv_content = (
        "date,description,amount\n"
        "2026-09-10,Albert Heijn,-42.50\n"
        "2026-09-11,Jumbo,-18.30\n"
        "2026-09-12,Shell,-65.00\n"
        "2026-09-13,Netflix,-15.99\n"
    )
    upload = _csv_file(csv_content)

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 4
    assert response.data["skipped"] == 0
    assert response.data["failed"] == 0

    albert_heijn = Transaction.objects.get(user=user, description="Albert Heijn")
    assert albert_heijn.category == food_category
    assert albert_heijn.type == TransactionType.EXPENSE
    assert albert_heijn.amount == Decimal("42.50")

    shell = Transaction.objects.get(user=user, description="Shell")
    assert shell.category == transport_category

    netflix = Transaction.objects.get(user=user, description="Netflix")
    assert netflix.category == entertainment_category


@pytest.mark.django_db
def test_import_unmatched_expense_falls_back_to_other(auth_client, user, other_category):
    upload = _csv_file("date,description,amount\n2026-09-10,Some Random Shop,-9.99\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 1
    transaction = Transaction.objects.get(user=user, description="Some Random Shop")
    assert transaction.category == other_category


@pytest.mark.django_db
def test_import_unmatched_income_without_default_category_fails(auth_client, user):
    # No category matches "income" rules and there's no income fallback
    # (unlike "Other" for expenses) — the row must fail, not silently
    # attach to the wrong category.
    upload = _csv_file("date,description,amount\n2026-09-10,Mystery deposit,150.00\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 0
    assert response.data["failed"] == 1
    assert not Transaction.objects.filter(user=user, description="Mystery deposit").exists()


@pytest.mark.django_db
def test_import_matches_income_salary_rule(auth_client, user, salary_category):
    upload = _csv_file("date,description,amount\n2026-09-01,September Salary,3000.00\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 1
    transaction = Transaction.objects.get(user=user, description="September Salary")
    assert transaction.category == salary_category
    assert transaction.type == TransactionType.INCOME
    assert transaction.amount == Decimal("3000.00")


@pytest.mark.django_db
def test_import_invalid_date_counted_as_failed(auth_client, user, other_category):
    upload = _csv_file("date,description,amount\nnot-a-date,Coffee,-3.50\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["failed"] == 1
    assert response.data["imported"] == 0
    assert response.data["details"][0]["status"] == "failed"
    assert "date" in response.data["details"][0]["reason"].lower()


@pytest.mark.django_db
def test_import_invalid_amount_counted_as_failed(auth_client, user, other_category):
    upload = _csv_file("date,description,amount\n2026-09-10,Coffee,not-a-number\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["failed"] == 1


@pytest.mark.django_db
def test_import_zero_amount_counted_as_failed(auth_client, user, other_category):
    upload = _csv_file("date,description,amount\n2026-09-10,Coffee,0\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["failed"] == 1


@pytest.mark.django_db
def test_import_amount_with_currency_symbol_and_thousands_separator(auth_client, user, salary_category):
    upload = _csv_file('date,description,amount\n2026-09-01,Salary,"€3,000.00"\n')

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 1
    transaction = Transaction.objects.get(user=user, description="Salary")
    assert transaction.amount == Decimal("3000.00")


@pytest.mark.django_db
def test_import_accepts_ddmmyyyy_date_format(auth_client, user, other_category):
    upload = _csv_file("date,description,amount\n25/12/2026,Random Shop,-10.00\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 1
    transaction = Transaction.objects.get(user=user, description="Random Shop")
    assert transaction.date == date(2026, 12, 25)


@pytest.mark.django_db
def test_import_duplicate_within_file_counted_as_skipped(auth_client, user, other_category):
    csv_content = "date,description,amount\n2026-09-10,Random Shop,-10.00\n2026-09-10,Random Shop,-10.00\n"
    upload = _csv_file(csv_content)

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 1
    assert response.data["skipped"] == 1
    assert Transaction.objects.filter(user=user, description="Random Shop").count() == 1


@pytest.mark.django_db
def test_import_duplicate_against_existing_transaction_counted_as_skipped(auth_client, user, other_category):
    Transaction.objects.create(
        user=user,
        category=other_category,
        type=TransactionType.EXPENSE,
        amount=Decimal("10.00"),
        description="Random Shop",
        date=date(2026, 9, 10),
    )
    upload = _csv_file("date,description,amount\n2026-09-10,Random Shop,-10.00\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 0
    assert response.data["skipped"] == 1
    assert Transaction.objects.filter(user=user, description="Random Shop").count() == 1


@pytest.mark.django_db
def test_import_blank_lines_are_ignored_not_counted(auth_client, user, other_category):
    csv_content = "date,description,amount\n2026-09-10,Random Shop,-10.00\n\n\n"
    upload = _csv_file(csv_content)

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 1
    assert response.data["skipped"] == 0
    assert response.data["failed"] == 0


@pytest.mark.django_db
def test_import_summary_mixed_outcome(auth_client, user, food_category, other_category, salary_category):
    Transaction.objects.create(
        user=user,
        category=food_category,
        type=TransactionType.EXPENSE,
        amount=Decimal("5.00"),
        description="Already imported",
        date=date(2026, 9, 1),
    )
    csv_content = (
        "date,description,amount\n"
        "2026-09-02,Albert Heijn,-20.00\n"  # imported (Food)
        "2026-09-01,Already imported,-5.00\n"  # skipped (duplicate)
        "2026-09-03,Unmatched deposit,100.00\n"  # failed (no income category)
        "not-a-date,Broken row,-1.00\n"  # failed (bad date)
    )
    upload = _csv_file(csv_content)

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 1
    assert response.data["skipped"] == 1
    assert response.data["failed"] == 2
    assert len(response.data["details"]) == 3  # skipped + failed, not the imported row


@pytest.mark.django_db
def test_import_only_matches_requesting_users_own_categories(auth_client, user, other_user, food_category):
    # other_user's category should never be usable for user's import, even
    # if it happens to share the resolved category name.
    Category.objects.create(user=other_user, name="Food", type=TransactionType.EXPENSE)
    upload = _csv_file("date,description,amount\n2026-09-10,Albert Heijn,-20.00\n")

    response = auth_client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart")

    assert response.status_code == status.HTTP_200_OK
    transaction = Transaction.objects.get(user=user, description="Albert Heijn")
    assert transaction.category == food_category
    assert transaction.category.user == user


# =============================== files as Hungarian banks export them =========================


def _upload(content: bytes, name: str = "export.csv") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content, content_type="text/csv")


def _import(auth_client, content: bytes):
    return auth_client.post(reverse("transaction-import-csv"), {"file": _upload(content)}, format="multipart")


def _amounts(user) -> list[Decimal]:
    return sorted(Transaction.objects.filter(user=user).values_list("amount", flat=True))


@pytest.mark.django_db
def test_a_semicolon_file_reads_the_comma_as_the_decimal_mark(auth_client, user, food_category, salary_category):
    csv_text = "date;description;amount\n2026-09-10;Tesco;-1 234,56\n2026-09-01;Salary;3 000,00\n"

    response = _import(auth_client, csv_text.encode("utf-8"))

    assert response.data["imported"] == 2, response.data
    assert _amounts(user) == [Decimal("1234.56"), Decimal("3000.00")]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("typed", "expected"),
    [
        ("-1.234,56", "1234.56"),  # a dot groups thousands when there is also a comma
        ("-1234,5", "1234.50"),
        ("-12.5", "12.50"),  # no comma: the dot is the decimal mark
        ("-42,50 EUR", "42.50"),  # a trailing currency code
        ("-42,50 €", "42.50"),
    ],
)
def test_semicolon_amount_styles(auth_client, user, food_category, typed, expected):
    response = _import(auth_client, f"date;description;amount\n2026-09-10;Tesco;{typed}\n".encode())

    assert response.data["imported"] == 1, response.data
    assert _amounts(user) == [Decimal(expected)]


@pytest.mark.django_db
def test_comma_files_still_read_the_comma_as_thousands(auth_client, user, salary_category):
    response = _import(auth_client, b'date,description,amount\n2026-09-01,Salary,"2,500.00"\n')

    assert response.data["imported"] == 1
    assert _amounts(user) == [Decimal("2500.00")]


@pytest.mark.django_db
def test_a_currency_code_after_the_amount_is_ignored_in_comma_files_too(auth_client, user, food_category):
    response = _import(auth_client, b"date,description,amount\n2026-09-10,Tesco,-42.50 EUR\n")

    assert response.data["imported"] == 1
    assert _amounts(user) == [Decimal("42.50")]


@pytest.mark.django_db
def test_forint_amounts_with_spaces_and_the_ft_sign(auth_client, user, food_category):
    user.base_currency = "HUF"
    user.save()

    response = _import(auth_client, "Dátum;Közlemény;Összeg\n2026.09.10.;Tesco;-12 345 Ft\n".encode())

    assert response.data["imported"] == 1, response.data
    assert _amounts(user) == [Decimal("12345.00")]


@pytest.mark.django_db
def test_hungarian_headers_are_understood(auth_client, user, food_category):
    csv_text = "Könyvelés dátuma;Partner neve;Tranzakció összege\n2026.09.10.;Tesco Hipermarket;-2 500,00\n"

    response = _import(auth_client, csv_text.encode("utf-8"))

    assert response.data["imported"] == 1, response.data
    assert Transaction.objects.get(user=user).description == "Tesco Hipermarket"


@pytest.mark.django_db
def test_hungarian_headers_work_in_a_comma_file_too(auth_client, user, food_category):
    response = _import(auth_client, "Dátum,Közlemény,Összeg\n2026-09-10,Tesco,-5.00\n".encode())

    assert response.data["imported"] == 1, response.data


@pytest.mark.django_db
def test_a_tab_separated_file(auth_client, user, food_category):
    response = _import(auth_client, b"date\tdescription\tamount\n2026-09-10\tTesco\t-5.00\n")

    assert response.data["imported"] == 1, response.data


@pytest.mark.django_db
@pytest.mark.parametrize(
    "written", ["2026.09.10.", "2026.09.10", "10.09.2026.", "10.09.2026", "2026. 09. 10.", "2026-09-10", "10/09/2026"]
)
def test_every_date_style_means_the_same_day(auth_client, user, food_category, written):
    response = _import(auth_client, f"date;description;amount\n{written};Tesco;-5,00\n".encode())

    assert response.data["imported"] == 1, response.data
    assert Transaction.objects.get(user=user).date == date(2026, 9, 10)


@pytest.mark.django_db
def test_a_windows_1250_file_keeps_its_hungarian_letters(auth_client, user, food_category):
    user.language = "hu"
    user.save()
    content = "date;description;amount\n2026-09-10;Tesco Árpád ő ű;-5,00\n".encode("cp1250")

    response = _import(auth_client, content)

    assert response.data["imported"] == 1, response.data
    assert Transaction.objects.get(user=user).description == "Tesco Árpád ő ű"


@pytest.mark.django_db
def test_the_same_bytes_are_latin_1_for_an_english_account(auth_client, user, food_category):
    content = "date;description;amount\n2026-09-10;Tesco \xf5;-5,00\n".encode("latin-1")

    response = _import(auth_client, content)

    assert response.data["imported"] == 1, response.data
    assert Transaction.objects.get(user=user).description == "Tesco \xf5"


@pytest.mark.django_db
def test_a_semicolon_file_missing_a_column_is_still_refused(auth_client):
    response = _import(auth_client, b"date;description\n2026-09-10;Tesco\n")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "amount" in str(response.data["file"])


@pytest.mark.django_db
def test_an_unreadable_amount_in_a_semicolon_file_fails_only_that_row(auth_client, user, food_category):
    csv_text = "date;description;amount\n2026-09-10;Tesco;-5,00\n2026-09-11;Tesco;nem szám\n"

    response = _import(auth_client, csv_text.encode("utf-8"))

    assert (response.data["imported"], response.data["failed"]) == (1, 1)
    assert response.data["details"][0]["row"] == 3
