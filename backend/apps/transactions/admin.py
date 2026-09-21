from django.contrib import admin

from .models import RecurringTransaction, Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("date", "user", "category", "type", "amount")
    list_filter = ("type", "category")
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
        "frequency",
        "is_active",
        "next_occurrence_date",
    )
    list_filter = ("frequency", "is_active", "type")
    search_fields = ("name", "user__email")
    ordering = ("next_occurrence_date",)
