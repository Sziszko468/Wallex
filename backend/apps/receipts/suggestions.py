from dataclasses import dataclass
from enum import StrEnum

from apps.categories.models import Category, TransactionType
from apps.categories.rules import match_category_name
from apps.transactions.models import Transaction


class SuggestionSource(StrEnum):
    HISTORY = "history"  # the category this user chose last time for the same merchant
    RULES = "rules"  # keyword rules (apps/categories/rules.py)


@dataclass(frozen=True)
class CategorySuggestion:
    category: Category
    source: SuggestionSource


def suggest_category(user, merchant: str | None, receipt_text: str) -> CategorySuggestion | None:
    """Best expense category for a scanned receipt, or None to let the user pick. At most 2 queries."""
    categories = {category.id: category for category in Category.objects.filter(user=user, type=TransactionType.EXPENSE)}
    if not categories:
        return None

    # The user's own past decision beats any generic rule.
    if merchant:
        previous_category_id = (
            Transaction.objects.filter(user=user, type=TransactionType.EXPENSE, description__iexact=merchant)
            .order_by("-date", "-created_at")
            .values_list("category_id", flat=True)
            .first()
        )
        if previous_category_id in categories:
            return CategorySuggestion(categories[previous_category_id], SuggestionSource.HISTORY)

    by_name = {category.name.lower(): category for category in categories.values()}
    for text in (merchant or "", receipt_text):
        name = match_category_name(text, TransactionType.EXPENSE)
        if name and name.lower() in by_name:
            return CategorySuggestion(by_name[name.lower()], SuggestionSource.RULES)
    return None
