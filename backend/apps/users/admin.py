from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from . import sessions
from .models import AuditEvent, RevokeReason, TotpDevice, User, UserSession


@admin.register(User)
class SpendlyUserAdmin(UserAdmin):
    fieldsets = (*UserAdmin.fieldsets, ("Preferences", {"fields": ("base_currency",)}))
    # Read-only here: changing it must go through the API, which converts the user's data.
    readonly_fields = ("base_currency",)


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "platform", "ip_address", "created_at", "last_used_at", "revoked_at", "revoked_reason")
    list_filter = ("platform", "revoked_reason")
    search_fields = ("user__email", "ip_address")
    readonly_fields = [field.name for field in UserSession._meta.fields]
    actions = ["revoke_sessions"]

    def has_add_permission(self, request):
        return False

    @admin.action(description="Sign the selected sessions out")
    def revoke_sessions(self, request, queryset):
        count = sum(sessions.revoke(session, RevokeReason.REVOKED) for session in queryset)
        self.message_user(request, f"{count} session(s) signed out.")


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    """Read-only: the audit log is append-only, also for administrators."""

    list_display = ("created_at", "action", "user", "email", "ip_address")
    list_filter = ("action",)
    search_fields = ("user__email", "email", "ip_address")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(TotpDevice)
class TotpDeviceAdmin(admin.ModelAdmin):
    """Lets support turn off 2FA for a user who lost both the phone and the recovery codes
    (after verifying their identity). The secret itself is never shown."""

    list_display = ("user", "confirmed_at", "created_at")
    search_fields = ("user__email",)
    exclude = ("encrypted_secret", "last_used_step")
    readonly_fields = ("user", "confirmed_at", "created_at")

    def has_add_permission(self, request):
        return False
