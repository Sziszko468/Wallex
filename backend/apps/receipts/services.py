"""Receipt scanning: image -> OCR text -> suggested transaction fields.

Nothing here writes to the database. The result is only a *suggestion* the
mobile app shows on a confirmation screen; the transaction is created by the
normal POST /api/transactions/ once the user has checked every field. The
image is processed in memory and never stored.
"""

import io
from dataclasses import dataclass

from django.conf import settings
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.common.constants import BYTES_PER_MEGABYTE

from .ocr import OcrError, OcrUnavailableError, get_ocr_provider
from .parser import Outcome, ParsedReceipt, classify, parse_receipt_text
from .suggestions import CategorySuggestion, suggest_category

ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}  # MPO = multi-picture JPEG some phone cameras produce
MAX_PIXELS = 40_000_000  # refuse decompression bombs long before Pillow's own limit
MAX_SIDE_PX = 2400  # plenty for OCR; keeps processing time and memory bounded
JPEG_QUALITY = 90  # the normalised copy is only read by the OCR engine


class InvalidReceiptImageError(Exception):
    """The upload isn't a usable photo. The message is safe to show to the user."""


@dataclass(frozen=True)
class ReceiptScan:
    parsed: ParsedReceipt
    category: CategorySuggestion | None
    text_found: bool
    outcome: Outcome


def normalize_image(uploaded_file) -> bytes:
    """Validates the upload and returns an upright, RGB, size-bounded JPEG for any OCR provider."""
    if uploaded_file.size > settings.RECEIPT_MAX_UPLOAD_BYTES:
        limit_mb = settings.RECEIPT_MAX_UPLOAD_BYTES // BYTES_PER_MEGABYTE
        raise InvalidReceiptImageError(_("The photo is too large (max %(limit)s MB).") % {"limit": limit_mb})

    try:
        image = Image.open(uploaded_file)
        if image.format not in ACCEPTED_FORMATS:
            raise InvalidReceiptImageError(_("Please upload a JPEG or PNG photo."))
        if image.width * image.height > MAX_PIXELS:
            raise InvalidReceiptImageError(_("The photo's resolution is too high."))
        image = ImageOps.exif_transpose(image).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise InvalidReceiptImageError(_("The file is not a readable image.")) from error

    image.thumbnail((MAX_SIDE_PX, MAX_SIDE_PX))
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=JPEG_QUALITY)
    return output.getvalue()


def scan_receipt(user, uploaded_file) -> ReceiptScan:
    """Raises InvalidReceiptImageError for a bad upload and OcrUnavailableError if the engine is down."""
    image_bytes = normalize_image(uploaded_file)
    try:
        ocr_result = get_ocr_provider().extract_text(image_bytes)
    except OcrUnavailableError:
        raise  # the engine, not the photo — reported as 503 by the view
    except OcrError as error:
        raise InvalidReceiptImageError(_("The photo could not be processed. Please try another one.")) from error

    parsed = parse_receipt_text(ocr_result.text, today=timezone.localdate())
    text_found = bool(ocr_result.text.strip())
    return ReceiptScan(
        parsed=parsed,
        category=suggest_category(user, parsed.merchant.value, ocr_result.text),
        text_found=text_found,
        outcome=classify(parsed, text_found),
    )
