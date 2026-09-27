from django.contrib import admin

from .models import RecurringTransaction, Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("date", "user", "category", "type", "amount", "currency", "base_amount")
    list_filter = ("type", "currency", "category")
    # Computed by the database from amount × exchange_rate.
    readonly_fields = ("base_amount",)
    search_fields = ("description", "user__email")
    ordering = ("-date",)
    date_hierarchy = "date"


@admin.register(RecurringTransaction)
class RecurringTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "user",
        "category",
        "type",
        "amount",
        "currency",
        "frequency",
        "is_active",
        "is_subscription",
        "next_occurrence_date",
    )
    list_filter = ("frequency", "is_active", "is_subscription", "type", "currency")
    search_fields = ("name", "user__email")
    ordering = ("next_occurrence_date",)
