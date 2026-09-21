from .models import Category, TransactionType

DEFAULT_CATEGORIES = [
    ("Housing", TransactionType.EXPENSE),
    ("Food", TransactionType.EXPENSE),
    ("Transport", TransactionType.EXPENSE),
    ("Shopping", TransactionType.EXPENSE),
    ("Entertainment", TransactionType.EXPENSE),
    ("Health", TransactionType.EXPENSE),
    ("Bills", TransactionType.EXPENSE),
    ("Travel", TransactionType.EXPENSE),
    ("Salary", TransactionType.INCOME),
    ("Other", TransactionType.EXPENSE),
]


def create_default_categories(user):
    Category.objects.bulk_create(
        [
            Category(user=user, name=name, type=category_type, is_system=True)
            for name, category_type in DEFAULT_CATEGORIES
        ]
    )
