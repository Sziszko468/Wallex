from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.transactions.views import TransactionViewSet

router = DefaultRouter()
router.register("transactions", TransactionViewSet, basename="transaction")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.users.urls")),
    path("api/", include(router.urls)),
]
