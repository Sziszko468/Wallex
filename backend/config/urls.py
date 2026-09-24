from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.budgets.views import BudgetViewSet
from apps.categories.views import CategoryViewSet
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
    path("api/auth/", include("apps.users.urls")),
    path("api/analytics/", include("apps.analytics.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/", include(router.urls)),
]
