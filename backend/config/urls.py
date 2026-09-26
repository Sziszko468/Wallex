from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from apps.budgets.views import BudgetViewSet
from apps.categories.views import CategoryViewSet
from apps.common.health import LivenessView, ReadinessView
from apps.notifications.views import DeviceViewSet
from apps.transactions.views import RecurringTransactionViewSet, TransactionViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("transactions", TransactionViewSet, basename="transaction")
router.register("budgets", BudgetViewSet, basename="budget")
router.register(
    "recurring-transactions", RecurringTransactionViewSet, basename="recurringtransaction"
)
router.register("devices", DeviceViewSet, basename="device")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", LivenessView.as_view(), name="health-live"),
    path("api/health/ready/", ReadinessView.as_view(), name="health-ready"),
    path("api/auth/", include("apps.users.urls")),
    path("api/analytics/", include("apps.analytics.urls")),
    path("api/currencies/", include("apps.currencies.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/receipts/", include("apps.receipts.urls")),
    path("api/", include(router.urls)),
]

if settings.API_DOCS_ENABLED:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="api-schema"),
        path("api/docs/", SpectacularSwaggerView.as_view(url_name="api-schema"), name="api-docs"),
    ]
