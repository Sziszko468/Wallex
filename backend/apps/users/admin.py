from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class SpendlyUserAdmin(UserAdmin):
    fieldsets = (*UserAdmin.fieldsets, ("Preferences", {"fields": ("base_currency",)}))
    # Read-only here: changing it must go through the API, which converts the user's data.
    readonly_fields = ("base_currency",)
