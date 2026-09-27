from django.contrib import admin

from .models import Achievement, UserAchievement


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("sort_order", "icon", "name", "code", "rule", "target", "target_currency")
    list_display_links = ("name",)
    ordering = ("sort_order",)


@admin.register(UserAchievement)
class UserAchievementAdmin(admin.ModelAdmin):
    list_display = ("user", "achievement", "progress", "unlocked_at", "seen_at")
    list_filter = ("achievement",)
    search_fields = ("user__email",)
    # Computed by apps.analytics.achievements.evaluate(); editing by hand would only be overwritten.
    readonly_fields = ("user", "achievement", "progress", "unlocked_at", "context", "updated_at")
