from django.utils.translation import gettext
from django.utils.translation import gettext_noop as _

from .models import Category, TransactionType

# Stored in English — the stable name rules and imports match on — and shown in the reader's
# language through `display_name`. The `_` marks the names for translation.
# A distinct color per default category so category charts (pie/bar breakdowns)
# are visually distinguishable out of the box, before a user customizes anything.
DEFAULT_CATEGORIES = [
    (_("Housing"), TransactionType.EXPENSE, "#f59e0b"),
    (_("Food"), TransactionType.EXPENSE, "#10b981"),
    (_("Transport"), TransactionType.EXPENSE, "#3b82f6"),
    (_("Shopping"), TransactionType.EXPENSE, "#ec4899"),
    (_("Entertainment"), TransactionType.EXPENSE, "#8b5cf6"),
    (_("Health"), TransactionType.EXPENSE, "#ef4444"),
    (_("Bills"), TransactionType.EXPENSE, "#6b7280"),
    (_("Travel"), TransactionType.EXPENSE, "#06b6d4"),
    (_("Salary"), TransactionType.INCOME, "#22c55e"),
    (_("Other"), TransactionType.EXPENSE, "#a855f7"),
]

# Shown for a budget that covers every category.
OVERALL_LABEL = _("Overall")

DEFAULT_NAMES = frozenset(name for name, _type, _color in DEFAULT_CATEGORIES)
TRANSLATED_NAMES = DEFAULT_NAMES | {OVERALL_LABEL}


def display_name(name: str) -> str:
    """A default category (or "Overall") in the active language; a category the user named as typed."""
    return gettext(name) if name in TRANSLATED_NAMES else name


def overall_label() -> str:
    """The name of the budget that spans every category, in the active language."""
    return gettext(OVERALL_LABEL)


def create_default_categories(user):
    Category.objects.bulk_create(
        [
            Category(user=user, name=name, type=category_type, is_system=True, color=color)
            for name, category_type, color in DEFAULT_CATEGORIES
        ]
    )
