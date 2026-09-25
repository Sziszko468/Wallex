from django.urls import path

from .views import ReceiptScanView

urlpatterns = [
    path("scan/", ReceiptScanView.as_view(), name="receipt-scan"),
]
