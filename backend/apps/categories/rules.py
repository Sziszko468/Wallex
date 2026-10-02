"""Keyword rules that map free text (a bank-statement description, a receipt's
merchant line) to one of the default category names.

Shared by the CSV import and the receipt scanner. Deliberately a flat,
hardcoded table: a per-user, DB-backed rule editor is the natural later step
(the "auto-categorization" roadmap item).
"""

import unicodedata

from .models import TransactionType

# keyword(s) -> category name, matched case- and accent-insensitively as a
# substring of the text padded with spaces; first match wins. Keywords that
# are also common word fragments are written with surrounding spaces (" bp ").
EXPENSE_CATEGORY_RULES: list[tuple[tuple[str, ...], str]] = [
    (
        (
            "albert heijn",
            "jumbo",
            "lidl",
            "aldi",
            "tesco",
            "supermarket",
            "grocery",
            "spar",
            "auchan",
            "penny",
            " cba ",
            "coop",
            "pekseg",
            "bakery",
        ),
        "Food",
    ),
    (
        (
            "shell",
            " bp ",
            "esso",
            "uber",
            "taxi",
            "parking",
            "metro",
            "ns.nl",
            "fuel",
            " mol ",
            " omv ",
            " bkv ",
            " mav ",
            "volanbusz",
            "benzinkut",
            "parkolas",
        ),
        "Transport",
    ),
    (
        ("netflix", "spotify", "disney", "hbo", "cinema", "pathe", "steam", "playstation", "mozi"),
        "Entertainment",
    ),
    (("rent", "mortgage", "huur", "alberlet"), "Housing"),
    (
        (
            "kpn",
            "ziggo",
            "vodafone",
            "t-mobile",
            "electricity",
            "energie",
            "water bill",
            "gas bill",
            "internet",
            "phone bill",
            "telekom",
            "yettel",
            " eon ",
            "mvm",
        ),
        "Bills",
    ),
    (
        (
            "pharmacy",
            "apotheek",
            "doctor",
            "huisarts",
            "hospital",
            "dentist",
            "tandarts",
            "gyogyszertar",
            "patika",
            "benu",
        ),
        "Health",
    ),
    (
        (
            "amazon",
            "zalando",
            "bol.com",
            "h&m",
            "ikea",
            "mediamarkt",
            "rossmann",
            "muller",
            " dm ",
            "decathlon",
            "pepco",
        ),
        "Shopping",
    ),
    (("booking.com", "airbnb", "ryanair", "klm", "transavia", "hotel", "flight", "wizz"), "Travel"),
]

INCOME_CATEGORY_RULES: list[tuple[tuple[str, ...], str]] = [
    (("salary", "payroll", "salaris", "fizetes", "munkaber"), "Salary"),
]


def normalize_text(text: str) -> str:
    """Lowercase without accents ("Gyógyszertár" -> "gyogyszertar"), so OCR output
    that drops or garbles accents still matches."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def match_category_name(text: str, transaction_type: str) -> str | None:
    """Default-category name whose keywords appear in `text`, or None."""
    padded = f" {normalize_text(text)} "
    rules = EXPENSE_CATEGORY_RULES if transaction_type == TransactionType.EXPENSE else INCOME_CATEGORY_RULES
    for keywords, category_name in rules:
        if any(keyword in padded for keyword in keywords):
            return category_name
    return None
