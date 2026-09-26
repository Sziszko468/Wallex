"""OpenAPI documentation for the receipt-scanning endpoint."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import serializers

from apps.common.openapi import error_response, throttled, upload_too_large, validation_error

from .parser import Confidence
from .suggestions import SuggestionSource

CONFIDENCE_CHOICES = [(item.value, item.value) for item in Confidence]
SOURCE_CHOICES = [(item.value, item.value) for item in SuggestionSource]

_CONFIDENCE_HELP = "`high`: found by a specific rule (e.g. the TOTAL line). `low`: best guess — ask the user to check."


class ReceiptImageSerializer(serializers.Serializer):
    image = serializers.ImageField(help_text="Receipt photo: JPEG, PNG or WebP, max 10 MB. Processed in memory, never stored.")


class ScannedTextSerializer(serializers.Serializer):
    value = serializers.CharField(allow_null=True, help_text="`null` if nothing usable was found.")
    confidence = serializers.ChoiceField(choices=CONFIDENCE_CHOICES, help_text=_CONFIDENCE_HELP)


class ScannedAmountSerializer(serializers.Serializer):
    value = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, help_text="The receipt total; `null` if not found."
    )
    confidence = serializers.ChoiceField(choices=CONFIDENCE_CHOICES, help_text=_CONFIDENCE_HELP)


class ScannedDateSerializer(serializers.Serializer):
    value = serializers.DateField(allow_null=True, help_text="Purchase date; `null` if not found.")
    confidence = serializers.ChoiceField(choices=CONFIDENCE_CHOICES, help_text=_CONFIDENCE_HELP)


class SuggestedCategorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    source = serializers.ChoiceField(
        choices=SOURCE_CHOICES,
        help_text="`history`: the category the user chose last time for this merchant. `rules`: keyword rules.",
    )


class ReceiptScanSerializer(serializers.Serializer):
    merchant = ScannedTextSerializer()
    amount = ScannedAmountSerializer()
    date = ScannedDateSerializer()
    category = SuggestedCategorySerializer(allow_null=True, help_text="Suggested expense category, if any.")
    text_found = serializers.BooleanField(help_text="`false` if the photo contained no readable text at all.")


RECEIPT_SCAN_SCHEMA = extend_schema(
    tags=["Receipt Scanning"],
    summary="Scan a receipt photo",
    description=(
        "Reads a receipt photo with OCR (English and Hungarian) and **suggests** the merchant, total, date "
        "and an expense category. Nothing is saved: show the suggestions to the user, let them confirm "
        "or correct them, then create the transaction with `POST /api/transactions/`.\n\n"
        "Each field comes with a confidence; fields that couldn't be read are `null`. "
        "The photo is processed in memory and discarded. Limited to 30 scans per hour per user."
    ),
    request={"multipart/form-data": ReceiptImageSerializer},
    responses={
        200: OpenApiResponse(
            ReceiptScanSerializer,
            description="Suggestions (possibly partial).",
            examples=[
                OpenApiExample(
                    "Grocery receipt",
                    value={
                        "merchant": {"value": "SPAR Magyarorszag Kft", "confidence": "high"},
                        "amount": {"value": "1358.00", "confidence": "high"},
                        "date": {"value": "2026-09-20", "confidence": "high"},
                        "category": {"id": 2, "name": "Food", "source": "rules"},
                        "text_found": True,
                    },
                ),
                OpenApiExample(
                    "Unreadable photo",
                    value={
                        "merchant": {"value": None, "confidence": "low"},
                        "amount": {"value": None, "confidence": "low"},
                        "date": {"value": None, "confidence": "low"},
                        "category": None,
                        "text_found": False,
                    },
                ),
            ],
        ),
        400: validation_error(
            ("No image", {"image": ["This field is required."]}),
            ("Not an image", {"image": ["The file is not a readable image."]}),
            ("Unsupported format", {"image": ["Please upload a JPEG or PNG photo."]}),
            ("Resolution too high", {"image": ["The photo's resolution is too high."]}),
        ),
        413: upload_too_large("image", 10, noun="photo"),
        429: throttled("30 scans per hour per user"),
        503: error_response(
            "The OCR engine is unavailable. Let the user enter the transaction manually.",
            (
                "OCR down",
                {"detail": "Receipt scanning is temporarily unavailable. Please add the transaction manually."},
            ),
        ),
    },
)
