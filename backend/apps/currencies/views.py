from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .openapi import CONVERT_SCHEMA
from .rates import MissingExchangeRateError, convert
from .serializers import ConversionSerializer, ConvertQuerySerializer


@CONVERT_SCHEMA
class ConvertView(APIView):
    """GET /api/currencies/convert/ — read-only preview; the transaction endpoints do the real conversion."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = ConvertQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        amount, currency, day = (query.validated_data[key] for key in ("amount", "currency", "date"))
        base_currency = request.user.base_currency

        try:
            conversion = convert(amount, currency, base_currency, day)
        except MissingExchangeRateError as error:
            return Response({"exchange_rate": [str(error)]}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            ConversionSerializer(
                {
                    "amount": amount,
                    "currency": currency,
                    "base_currency": base_currency,
                    "exchange_rate": conversion.exchange_rate,
                    "base_amount": conversion.base_amount,
                    "rate_date": conversion.rate_date,
                }
            ).data
        )
