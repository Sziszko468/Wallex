from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.currencies.models import Currency

ZERO = Decimal("0.00")


class AchievementRule(models.TextChoices):
    """How an achievement is evaluated (see achievements.py). Several achievements can share a
    rule with different targets: a 7-day and a 30-day streak are both `tracking_streak`."""

    FIRST_TRANSACTION = "first_transaction", "First transaction recorded"
    TRACKING_STREAK = "tracking_streak", "Transactions recorded on consecutive days"
    SAVINGS_TOTAL = "savings_total", "Money saved in savings goals"
    BUDGET_KEPT = "budget_kept", "A finished month ended within a budget"
    GOAL_COMPLETED = "goal_completed", "A savings goal reached its target"


class AchievementCategory(models.TextChoices):
    TRACKING = "tracking", "Tracking"
    SAVING = "saving", "Saving"
    BUDGETING = "budgeting", "Budgeting"


class AchievementUnit(models.TextChoices):
    COUNT = "count", "Count"
    DAYS = "days", "Days"
    MONEY = "money", "Money"


class Achievement(models.Model):
    """One entry of the achievement catalog — the same for every user, seeded by a migration."""

    code = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=255)
    icon = models.CharField(max_length=8, help_text="An emoji.")
    category = models.CharField(max_length=20, choices=AchievementCategory.choices)
    rule = models.CharField(max_length=30, choices=AchievementRule.choices)
    unit = models.CharField(max_length=10, choices=AchievementUnit.choices)
    # The value the rule's progress has to reach: 7 days, 1000 euros, 1 transaction…
    target = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(1)])
    # Money achievements only: the currency `target` is in (progress is converted into it).
    target_currency = models.CharField(max_length=3, choices=Currency.choices, null=True, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.CheckConstraint(condition=models.Q(target__gt=0), name="achievement_target_positive"),
            models.CheckConstraint(
                condition=models.Q(unit="money", target_currency__isnull=False)
                | (~models.Q(unit="money") & models.Q(target_currency__isnull=True)),
                name="achievement_currency_only_for_money",
            ),
        ]

    def __str__(self):
        return f"{self.icon} {self.name}"


class UserAchievement(models.Model):
    """A user's progress on one achievement, and when it was unlocked. Unlocking is permanent."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="achievements")
    achievement = models.ForeignKey(Achievement, on_delete=models.PROTECT, related_name="user_achievements")
    # In the achievement's unit (euros for a € target); frozen at the target once unlocked.
    progress = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    unlocked_at = models.DateTimeField(null=True, blank=True)
    # When the user was shown the unlock; null = still "new".
    seen_at = models.DateTimeField(null=True, blank=True)
    # What it was earned with, kept for display and notifications,
    # e.g. {"category_name": "Food", "year": 2026, "month": 8} or {"goal_name": "Japan trip"}.
    context = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["achievement__sort_order", "achievement_id"]
        constraints = [
            models.UniqueConstraint(fields=["user", "achievement"], name="unique_user_achievement"),
            models.CheckConstraint(condition=models.Q(progress__gte=0), name="user_achievement_progress_not_negative"),
        ]

    @property
    def is_unlocked(self) -> bool:
        return self.unlocked_at is not None

    def __str__(self):
        state = "unlocked" if self.is_unlocked else f"{self.progress}/{self.achievement.target}"
        return f"{self.user} · {self.achievement.name} ({state})"


# --- AI finance assistant ----------------------------------------------------------------------


class AssistantConversation(models.Model):
    """A chat with the finance assistant. Shared by every device of the user (web, iOS, Android)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assistant_conversations")
    # The first question, shortened — what the history list shows.
    title = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [models.Index(fields=["user", "-updated_at"], name="assistant_conv_user_idx")]

    def __str__(self):
        return f"{self.user} · {self.title}"


class AssistantRole(models.TextChoices):
    USER = "user", "User"
    ASSISTANT = "assistant", "Assistant"


class AssistantMessage(models.Model):
    """One question or answer. Only the text is kept — never the financial data the tools returned
    (each question fetches fresh figures), just which tools an answer was based on."""

    conversation = models.ForeignKey(AssistantConversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=AssistantRole.choices)
    content = models.TextField()
    # Assistant answers: the backend tools the answer is based on, e.g.
    # [{"tool": "get_category_spending", "arguments": {"year": 2026, "month": 9}}].
    sources = models.JSONField(default=list, blank=True)
    # Assistant answers: the insight cards computed from those tools' figures (data only; the apps
    # get them with a label, see assistant/cards.py) and the questions offered next.
    insights = models.JSONField(default=list, blank=True)
    suggested_questions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.role}: {self.content[:50]}"
