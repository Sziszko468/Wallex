from django.contrib import admin

from .models import Budget, SavingsGoal


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ("user", "category", "year", "month", "amount")
    list_filter = ("year", "month")
    search_fields = ("user__email",)
    ordering = ("-year", "-month")


@admin.register(SavingsGoal)
class SavingsGoalAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "current_amount", "target_amount", "currency", "target_date", "status")
    list_filter = ("status", "currency")
    search_fields = ("name", "user__email")
    ordering = ("name",)
