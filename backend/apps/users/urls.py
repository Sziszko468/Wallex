from django.urls import path
from rest_framework.routers import SimpleRouter

from .account_views import (
    DataExportView,
    DeleteAccountView,
    LogoutAllView,
    MfaConfirmView,
    MfaDisableView,
    MfaSetupView,
    MfaStatusView,
    PasswordChangeView,
    RecoveryCodesView,
    SecurityEventsView,
    SessionViewSet,
)
from .views import LoginView, LogoutView, MeView, MfaLoginView, RefreshView, RegisterView

router = SimpleRouter()
router.register("sessions", SessionViewSet, basename="session")

urlpatterns = [
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("login/verify/", MfaLoginView.as_view(), name="auth-login-verify"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("logout-all/", LogoutAllView.as_view(), name="auth-logout-all"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("password/", PasswordChangeView.as_view(), name="auth-password"),
    path("2fa/", MfaStatusView.as_view(), name="auth-2fa"),
    path("2fa/setup/", MfaSetupView.as_view(), name="auth-2fa-setup"),
    path("2fa/confirm/", MfaConfirmView.as_view(), name="auth-2fa-confirm"),
    path("2fa/disable/", MfaDisableView.as_view(), name="auth-2fa-disable"),
    path("2fa/recovery-codes/", RecoveryCodesView.as_view(), name="auth-2fa-recovery-codes"),
    path("export/", DataExportView.as_view(), name="auth-export"),
    path("delete-account/", DeleteAccountView.as_view(), name="auth-delete-account"),
    path("security-events/", SecurityEventsView.as_view(), name="auth-security-events"),
    *router.urls,
]
