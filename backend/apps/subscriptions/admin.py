from django.contrib import admin

from apps.transactions.admin import RecurringTransactionAdmin

from .models import Subscription


@admin.register(Subscription)
class SubscriptionAdmin(RecurringTransactionAdmin):
    list_display = (
        "name",
        "user",
        "category",
        "amount",
        "currency",
        "frequency",
        "is_active",
        "start_date",
        "end_date",
    )
    list_filter = ("frequency", "is_active", "currency")
    search_fields = ("name", "merchant", "user__email")
    ordering = ("name",)
