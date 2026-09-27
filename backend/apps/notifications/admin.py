from django.contrib import admin

from .models import Device, Notification, NotificationPreference


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "platform", "name", "is_active", "last_seen_at")
    list_filter = ("platform", "is_active")
    search_fields = ("user__email", "name")


class ReadFilter(admin.SimpleListFilter):
    title = "read"
    parameter_name = "read"

    def lookups(self, request, model_admin):
        return [("yes", "Read"), ("no", "Unread")]

    def queryset(self, request, queryset):
        if self.value() in ("yes", "no"):
            return queryset.filter(read_at__isnull=self.value() == "no")
        return queryset


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "title", "is_read", "status", "attempts", "created_at", "sent_at")
    list_filter = ("kind", ReadFilter, "status")
    search_fields = ("user__email", "title", "dedupe_key")
    ordering = ("-created_at",)
    list_select_related = ("user",)

    @admin.display(boolean=True, description="read")
    def is_read(self, notification):
        return notification.is_read


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "budget_warnings",
        "budget_exceeded",
        "subscription_reminders",
        "recurring_reminders",
        "savings_goals",
        "unusual_spending",
        "monthly_summary",
        "insights",
        "recurring_reminder_days",
    )
    search_fields = ("user__email",)
