from django.conf import settings
from django.utils.module_loading import import_string

from .base import OcrError, OcrProvider, OcrResult, OcrUnavailableError

__all__ = ["OcrError", "OcrProvider", "OcrResult", "OcrUnavailableError", "get_ocr_provider"]


def get_ocr_provider() -> OcrProvider:
    """The configured engine, e.g. "apps.receipts.ocr.tesseract.TesseractOcrProvider"."""
    return import_string(settings.RECEIPT_OCR_PROVIDER)()
