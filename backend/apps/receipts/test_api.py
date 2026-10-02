import io
import shutil
from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image, ImageDraw, ImageFont
from rest_framework import status
from rest_framework.throttling import ScopedRateThrottle

from apps.categories.models import Category, TransactionType
from apps.receipts.conftest import make_image
from apps.receipts.ocr import OcrError, OcrUnavailableError
from apps.transactions.models import Transaction

RECEIPT_TEXT = "TESCO Global Zrt.\nKENYER 549\nOSSZESEN 2 056 Ft\n2026.09.24. 14:05"


@pytest.fixture
def food(user):
    return Category.objects.create(user=user, name="Food", type=TransactionType.EXPENSE)


def _scan(client, image):
    return client.post(reverse("receipt-scan"), {"image": image}, format="multipart")


@pytest.mark.django_db
def test_requires_authentication(api_client, receipt_image):
    assert _scan(api_client, receipt_image).status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_scan_returns_suggestion_and_saves_nothing(auth_client, food, fake_ocr, receipt_image):
    fake_ocr.text = RECEIPT_TEXT

    response = _scan(auth_client, receipt_image)

    assert response.status_code == status.HTTP_200_OK
    assert response.data == {
        "merchant": {"value": "TESCO Global Zrt", "confidence": "high"},
        "amount": {"value": "2056.00", "confidence": "high"},
        "date": {"value": "2026-09-24", "confidence": "high"},
        "currency": {"value": "HUF", "confidence": "high"},
        "unsupported_currency": None,
        "items": [{"name": "KENYER", "amount": "549.00"}],
        "category": {"id": food.id, "name": "Food", "source": "rules"},
        "text_found": True,
        "outcome": "complete",
    }
    assert not Transaction.objects.exists()


@pytest.mark.django_db
def test_nothing_recognized_returns_empty_fields_for_manual_entry(auth_client, fake_ocr, receipt_image):
    fake_ocr.text = ""

    response = _scan(auth_client, receipt_image)

    assert response.status_code == status.HTTP_200_OK
    assert response.data["text_found"] is False
    assert response.data["merchant"]["value"] is None
    assert response.data["amount"] == {"value": None, "confidence": "low"}
    assert response.data["category"] is None


@pytest.mark.django_db
def test_category_from_the_users_history_beats_rules(auth_client, user, food, fake_ocr, receipt_image):
    household = Category.objects.create(user=user, name="Household", type=TransactionType.EXPENSE)
    Transaction.objects.create(
        user=user,
        category=household,
        type=TransactionType.EXPENSE,
        amount=Decimal("10.00"),
        date=date(2026, 9, 1),
        description="tesco global zrt",
    )
    fake_ocr.text = RECEIPT_TEXT

    response = _scan(auth_client, receipt_image)

    assert response.data["category"] == {"id": household.id, "name": "Household", "source": "history"}


@pytest.mark.django_db
def test_other_users_history_is_not_used(auth_client, other_user, food, fake_ocr, receipt_image):
    theirs = Category.objects.create(user=other_user, name="Groceries", type=TransactionType.EXPENSE)
    Transaction.objects.create(
        user=other_user,
        category=theirs,
        type=TransactionType.EXPENSE,
        amount=Decimal("10.00"),
        date=date(2026, 9, 1),
        description="TESCO Global Zrt",
    )
    fake_ocr.text = RECEIPT_TEXT

    response = _scan(auth_client, receipt_image)

    assert response.data["category"]["id"] == food.id


@pytest.mark.django_db
def test_nothing_recognized_is_unreadable(auth_client, fake_ocr, receipt_image):
    fake_ocr.text = "   "

    data = _scan(auth_client, receipt_image).data

    assert (data["outcome"], data["items"], data["currency"]) == (
        "unreadable",
        [],
        {"value": None, "confidence": "low"},
    )


@pytest.mark.django_db
def test_text_without_a_total_or_date_is_unsupported(auth_client, fake_ocr, receipt_image):
    fake_ocr.text = "Soup of the day\nChef's special\nWelcome!"

    response = _scan(auth_client, receipt_image)

    assert response.status_code == status.HTTP_200_OK  # the scan worked; the photo just isn't a receipt
    assert response.data["outcome"] == "unsupported"
    assert not Transaction.objects.exists()


@pytest.mark.django_db
def test_a_receipt_in_an_unsupported_currency(auth_client, fake_ocr, receipt_image):
    fake_ocr.text = "Albert Supermarket\nRohlik 12,90 Kč\nCELKEM 125,90 Kč\n24.09.2026"

    data = _scan(auth_client, receipt_image).data

    assert data["currency"] == {"value": None, "confidence": "low"}
    assert data["unsupported_currency"] == "CZK"
    assert data["amount"] == {"value": "125.90", "confidence": "high"}
    assert data["items"] == [{"name": "Rohlik", "amount": "12.90"}]
    assert data["outcome"] == "incomplete"


@pytest.mark.django_db
def test_missing_fields_make_the_scan_incomplete(auth_client, fake_ocr, receipt_image):
    fake_ocr.text = "OSSZESEN 2 056 Ft"  # no merchant, no date

    data = _scan(auth_client, receipt_image).data

    assert (data["merchant"]["value"], data["date"]["value"], data["amount"]["value"]) == (None, None, "2056.00")
    assert data["outcome"] == "incomplete"


@pytest.mark.django_db
def test_no_matching_category(auth_client, fake_ocr, receipt_image):
    fake_ocr.text = "Corner Coffee\nTOTAL 3.50"
    assert _scan(auth_client, receipt_image).data["category"] is None


@pytest.mark.django_db
def test_missing_image(auth_client):
    response = auth_client.post(reverse("receipt-scan"), {}, format="multipart")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "image" in response.data


@pytest.mark.django_db
def test_not_an_image(auth_client, fake_ocr):
    upload = SimpleUploadedFile("receipt.jpg", b"definitely not a jpeg", content_type="image/jpeg")

    response = _scan(auth_client, upload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["image"] == ["The file is not a readable image."]
    assert fake_ocr.received == []


@pytest.mark.django_db
def test_unsupported_image_format(auth_client, fake_ocr):
    response = _scan(auth_client, make_image(fmt="GIF"))
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_too_large_upload(auth_client, fake_ocr, settings, receipt_image):
    settings.RECEIPT_MAX_UPLOAD_BYTES = 100
    response = _scan(auth_client, receipt_image)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "too large" in response.data["image"][0]


@pytest.mark.django_db
def test_provider_gets_an_upright_bounded_jpeg(auth_client, fake_ocr):
    # EXIF orientation 6 = "rotate 90° clockwise to display": a portrait photo stored sideways.
    _scan(auth_client, make_image(fmt="PNG", size=(5000, 1000), exif_orientation=6))

    [received] = fake_ocr.received
    image = Image.open(io.BytesIO(received))
    assert image.format == "JPEG"
    assert max(image.size) <= 2400


@pytest.mark.django_db
def test_engine_down_returns_503(auth_client, fake_ocr, receipt_image):
    fake_ocr.error = OcrUnavailableError("tesseract crashed")

    response = _scan(auth_client, receipt_image)

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert "manually" in response.data["detail"]


@pytest.mark.django_db
def test_image_the_engine_cannot_process_returns_400(auth_client, fake_ocr, receipt_image):
    fake_ocr.error = OcrError("bad image")
    assert _scan(auth_client, receipt_image).status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_scans_are_rate_limited(auth_client, fake_ocr, monkeypatch):
    # DRF reads the rates once at import time, so patch the class attribute directly.
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"receipt_scan": "2/hour"})

    codes = [_scan(auth_client, make_image()).status_code for _ in range(3)]

    assert codes == [200, 200, 429]


# --- Real engine ---------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.skipif(shutil.which("tesseract") is None, reason="Tesseract binary not installed")
def test_real_tesseract_reads_a_printed_receipt(auth_client, food):
    lines = ["SPAR Magyarorszag Kft.", "KENYER 1 DB 549", "TEJ 1L 389", "OSSZESEN: 938 Ft", "2026.09.24. 14:05"]
    image = Image.new("RGB", (900, 70 * len(lines) + 80), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=36)
    for index, line in enumerate(lines):
        draw.text((40, 40 + index * 70), line, fill="black", font=font)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)

    response = _scan(auth_client, SimpleUploadedFile("r.jpg", buffer.getvalue(), content_type="image/jpeg"))

    assert response.status_code == status.HTTP_200_OK
    assert response.data["merchant"]["value"].startswith("SPAR")
    assert response.data["amount"]["value"] == "938.00"
    assert response.data["date"]["value"] == "2026-09-24"
    assert response.data["currency"]["value"] == "HUF"
    assert [item["amount"] for item in response.data["items"]] == ["549.00", "389.00"]
    assert response.data["category"]["name"] == "Food"
    assert response.data["outcome"] == "complete"
