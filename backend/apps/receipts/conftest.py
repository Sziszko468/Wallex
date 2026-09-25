import io

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.receipts.ocr import OcrResult, OcrUnavailableError


class FakeOcrProvider:
    """Stands in for a real engine; tests set the text it "reads" (or an error it raises)."""

    text = ""
    error: Exception | None = None
    received: list[bytes] = []

    def extract_text(self, image_bytes: bytes) -> OcrResult:
        FakeOcrProvider.received.append(image_bytes)
        if FakeOcrProvider.error:
            raise FakeOcrProvider.error
        return OcrResult(text=FakeOcrProvider.text, confidence=90.0)


@pytest.fixture
def fake_ocr(settings):
    settings.RECEIPT_OCR_PROVIDER = "apps.receipts.conftest.FakeOcrProvider"
    FakeOcrProvider.text = ""
    FakeOcrProvider.error = None
    FakeOcrProvider.received = []
    yield FakeOcrProvider


@pytest.fixture(autouse=True)
def reset_throttle_counts():
    cache.clear()


def make_image(fmt="JPEG", size=(600, 900), exif_orientation=None) -> SimpleUploadedFile:
    image = Image.new("RGB", size, "white")
    buffer = io.BytesIO()
    save_kwargs = {}
    if exif_orientation:
        exif = Image.Exif()
        exif[0x0112] = exif_orientation
        save_kwargs["exif"] = exif
    image.save(buffer, format=fmt, **save_kwargs)
    return SimpleUploadedFile(f"receipt.{fmt.lower()}", buffer.getvalue(), content_type=f"image/{fmt.lower()}")


@pytest.fixture
def receipt_image():
    return make_image()


__all__ = ["FakeOcrProvider", "OcrUnavailableError", "make_image"]
