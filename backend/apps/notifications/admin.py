from django.contrib import admin

from .models import Device, Notification, NotificationPreference


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "platform", "name", "is_active", "last_seen_at")
    list_filter = ("platform", "is_active")
    search_fields = ("user__email", "name")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "title", "status", "attempts", "created_at", "sent_at")
    list_filter = ("kind", "status")
    search_fields = ("user__email", "title", "dedupe_key")
    ordering = ("-created_at",)


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "budget_warnings",
        "budget_exceeded",
        "recurring_reminders",
        "insights",
        "recurring_reminder_days",
    )
    search_fields = ("user__email",)
