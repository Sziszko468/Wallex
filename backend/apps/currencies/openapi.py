"""OpenAPI documentation for the currency endpoints."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema

from apps.common.openapi import validation_error

from .serializers import ConversionSerializer, ConvertQuerySerializer

CONVERT_SCHEMA = extend_schema(
    tags=["Currencies"],
    summary="Preview a currency conversion",
    description=(
        "What a transaction of `amount` `currency` on `date` would be worth in the user's base currency — "
        "the same rate and `base_amount` that `POST /api/transactions/` would store. Nothing is saved; "
        "clients use it to show the converted value while the user types.\n\n"
        "Rates are the ECB euro reference rates of that date, or of the last publication before it "
        "(weekends, holidays) if it is at most 7 days older. Without such a rate the answer is `400`."
    ),
    parameters=[ConvertQuerySerializer],
    responses={
        200: OpenApiResponse(
            ConversionSerializer,
            description="The conversion.",
            examples=[
                OpenApiExample(
                    "Forint to euro",
                    value={
                        "amount": "15000.00",
                        "currency": "HUF",
                        "base_currency": "EUR",
                        "exchange_rate": "0.0025650891",
                        "base_amount": "38.48",
                        "rate_date": "2026-09-25",
                    },
                ),
                OpenApiExample(
                    "Already in the base currency",
                    value={
                        "amount": "12.50",
                        "currency": "EUR",
                        "base_currency": "EUR",
                        "exchange_rate": "1.0000000000",
                        "base_amount": "12.50",
                        "rate_date": None,
                    },
                ),
            ],
        ),
        400: validation_error(
            ("No rate for the date", {"exchange_rate": ["No HUF exchange rate is available for 2026-09-26."]}),
            ("Fractional forints", {"amount": ["HUF amounts can't have decimals."]}),
            ("Unknown currency", {"currency": ['"XYZ" is not a valid choice.']}),
            ("Missing amount", {"amount": ["This field is required."]}),
        ),
    },
)
