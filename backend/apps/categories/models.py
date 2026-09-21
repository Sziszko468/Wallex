from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models


class TransactionType(models.TextChoices):
    INCOME = "income", "Income"
    EXPENSE = "expense", "Expense"


hex_color_validator = RegexValidator(
    regex=r"^#[0-9A-Fa-f]{6}$",
    message="Color must be a hex code, e.g. #6366F1.",
)


class Category(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="categories"
    )
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=TransactionType.choices)
    color = models.CharField(max_length=7, default="#6366F1", validators=[hex_color_validator])
    icon = models.CharField(max_length=50, blank=True, default="")
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name", "type"], name="unique_category_per_user_name_type"
            ),
        ]
        indexes = [
            models.Index(fields=["user", "type"], name="category_user_type_idx"),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"
