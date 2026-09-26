import logging

from rest_framework import permissions, status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from django.conf import settings

from apps.common.uploads import declared_body_exceeds, file_too_large

from .ocr import OcrUnavailableError
from .openapi import RECEIPT_SCAN_SCHEMA
from .services import InvalidReceiptImageError, scan_receipt

logger = logging.getLogger(__name__)


def _field(extracted, value=None):
    return {
        "value": value if value is not None else extracted.value,
        "confidence": extracted.confidence.value,
    }


@RECEIPT_SCAN_SCHEMA
class ReceiptScanView(APIView):
    """POST /api/receipts/scan/ — multipart `image`. Returns suggested fields; never saves anything."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]
    # OCR is CPU-heavy: limit how often one user can run it.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "receipt_scan"

    def post(self, request):
        if declared_body_exceeds(request, settings.RECEIPT_MAX_UPLOAD_BYTES):
            return file_too_large("image", settings.RECEIPT_MAX_UPLOAD_BYTES, noun="photo")

        image = request.FILES.get("image")
        if image is None:
            return Response({"image": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            scan = scan_receipt(request.user, image)
        except InvalidReceiptImageError as error:
            return Response({"image": [str(error)]}, status=status.HTTP_400_BAD_REQUEST)
        except OcrUnavailableError:
            logger.exception("Receipt OCR engine unavailable")
            return Response(
                {"detail": "Receipt scanning is temporarily unavailable. Please add the transaction manually."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        parsed = scan.parsed
        return Response(
            {
                "merchant": _field(parsed.merchant),
                # Decimal/date as strings, like every other money/date field in the API.
                "amount": _field(parsed.amount, str(parsed.amount.value) if parsed.amount.value is not None else None),
                "date": _field(parsed.date, parsed.date.value.isoformat() if parsed.date.value else None),
                "category": (
                    {
                        "id": scan.category.category.id,
                        "name": scan.category.category.name,
                        "source": scan.category.source.value,
                    }
                    if scan.category
                    else None
                ),
                "text_found": scan.text_found,
            }
        )
