from django.contrib import admin

from .models import ExchangeRate


@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ("date", "currency", "rate")
    list_filter = ("currency",)
    date_hierarchy = "date"
    ordering = ("-date", "currency")
