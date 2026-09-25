"""Security audit — file uploads (CSV import, receipt photos): size limits, malformed
input, and resource exhaustion must end in a clean 4xx, never a 500 or a hung worker."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status

from apps.categories.models import Category, TransactionType
from apps.transactions.models import Transaction

HEADER = "date,description,amount\n"


@pytest.fixture
def other_category(user):
    return Category.objects.create(user=user, name="Other", type=TransactionType.EXPENSE)


def _csv(body: bytes | str, name="import.csv"):
    content = body.encode() if isinstance(body, str) else body
    return SimpleUploadedFile(name, content, content_type="text/csv")


def _import(client, upload, **extra):
    return client.post(reverse("transaction-import-csv"), {"file": upload}, format="multipart", **extra)


# --- CSV import -------------------------------------------------------------------


@pytest.mark.django_db
def test_csv_larger_than_the_limit_is_refused(auth_client, settings, other_category):
    settings.CSV_IMPORT_MAX_BYTES = 1024
    big = HEADER + "".join(f"2026-09-{(i % 28) + 1:02d},Shop {i},-1.00\n" for i in range(100))

    response = _import(auth_client, _csv(big))

    assert response.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
    assert "file" in response.data
    assert not Transaction.objects.exists()


@pytest.mark.django_db
def test_declared_oversized_body_is_refused_before_it_is_read(auth_client):
    """A client announcing a huge body gets 413 immediately — the upload is never buffered."""
    response = _import(auth_client, _csv(HEADER), CONTENT_LENGTH=str(500 * 1024 * 1024))

    assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE


@pytest.mark.django_db
def test_too_many_rows_is_refused_as_a_whole(auth_client, settings, other_category):
    settings.CSV_IMPORT_MAX_ROWS = 50
    rows = HEADER + "".join(f"2026-09-01,Shop {i},-1.00\n" for i in range(51))

    response = _import(auth_client, _csv(rows))

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "50" in response.data["file"][0]
    assert not Transaction.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "content",
    [
        HEADER.encode() + b"2026-09-01,Sh\x00op,-1.00\n",  # NUL byte
        HEADER.encode() + b'2026-09-01,"' + b"x" * 200_000 + b'",-1.00\n',  # field beyond csv's limit
        b"\x89PNG\r\n\x1a\n" + bytes(range(256)) * 10,  # binary masquerading as .csv
    ],
    ids=["nul-byte", "giant-field", "binary"],
)
def test_malformed_csv_is_a_clean_400(auth_client, content):
    response = _import(auth_client, _csv(content))

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "file" in response.data


@pytest.mark.django_db
def test_overlong_description_fails_that_row_not_the_request(auth_client, other_category):
    content = HEADER + f"2026-09-01,{'x' * 300},-1.00\n2026-09-02,Fine,-2.00\n"

    response = _import(auth_client, _csv(content))

    assert response.status_code == status.HTTP_200_OK
    assert response.data["imported"] == 1
    assert response.data["failed"] == 1
    assert "255" in response.data["details"][0]["reason"]


@pytest.mark.django_db
def test_spreadsheet_formula_text_is_stored_as_plain_text(auth_client, other_category):
    """Descriptions like '=HYPERLINK(...)' are data, never evaluated by the server
    (a future CSV export must escape them — see docs/security-audit.md)."""
    content = HEADER + '2026-09-01,"=HYPERLINK(""http://evil"",""x"")",-1.00\n'

    response = _import(auth_client, _csv(content))

    assert response.status_code == status.HTTP_200_OK
    assert Transaction.objects.get().description.startswith("=HYPERLINK")


# --- Receipt photos ----------------------------------------------------------------


@pytest.mark.django_db
def test_declared_oversized_receipt_is_refused_before_it_is_read(auth_client):
    image = SimpleUploadedFile("r.jpg", b"\xff\xd8\xff", content_type="image/jpeg")

    response = auth_client.post(
        reverse("receipt-scan"), {"image": image}, format="multipart", CONTENT_LENGTH=str(500 * 1024 * 1024)
    )

    assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
