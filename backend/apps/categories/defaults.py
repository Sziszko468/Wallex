from .models import Category, TransactionType

# A distinct color per default category so category charts (pie/bar breakdowns)
# are visually distinguishable out of the box, before a user customizes anything.
DEFAULT_CATEGORIES = [
    ("Housing", TransactionType.EXPENSE, "#f59e0b"),
    ("Food", TransactionType.EXPENSE, "#10b981"),
    ("Transport", TransactionType.EXPENSE, "#3b82f6"),
    ("Shopping", TransactionType.EXPENSE, "#ec4899"),
    ("Entertainment", TransactionType.EXPENSE, "#8b5cf6"),
    ("Health", TransactionType.EXPENSE, "#ef4444"),
    ("Bills", TransactionType.EXPENSE, "#6b7280"),
    ("Travel", TransactionType.EXPENSE, "#06b6d4"),
    ("Salary", TransactionType.INCOME, "#22c55e"),
    ("Other", TransactionType.EXPENSE, "#a855f7"),
]


def create_default_categories(user):
    Category.objects.bulk_create(
        [
            Category(user=user, name=name, type=category_type, is_system=True, color=color)
            for name, category_type, color in DEFAULT_CATEGORIES
        ]
    )
