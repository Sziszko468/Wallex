from django.contrib import admin

from .models import Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "user", "is_system", "created_at")
    list_filter = ("type", "is_system")
    search_fields = ("name", "user__email")
    ordering = ("name",)
