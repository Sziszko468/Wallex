"""What an answer rests on, as small cards and follow-up questions the apps can show.

Both are deterministic: cards come from the figures the data tools returned for this answer
(computed by the services, not by the model), follow-ups from which tools the answer used. The
model never writes either, so a card can't disagree with the data and costs no extra model call.

A stored card holds data only — `{"type", "amount", "currency", "percentage", "subject", "count"}`;
`describe` adds what the apps show (label, detail, tone) in the reader's language.
"""

from collections.abc import Callable, Iterable
from decimal import Decimal

from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy, gettext_noop, ngettext

MAX_CARDS = 3
MAX_FOLLOW_UPS = 3

TOTAL_SPENDING = "total_spending"
LARGEST_CATEGORY = "largest_category"
CATEGORY_SPENDING = "category_spending"
TOP_MERCHANT = "top_merchant"
SPENDING_CHANGE = "spending_change"
SPENDING_CHANGE_YEAR = "spending_change_year"
BIGGEST_INCREASE = "biggest_increase"
OVER_BUDGET = "over_budget"
CLOSEST_BUDGET = "closest_budget"
SUBSCRIPTIONS_COST = "subscriptions_cost"
GOAL_PROGRESS = "goal_progress"

LABELS = {
    TOTAL_SPENDING: gettext_lazy("Total spending"),
    LARGEST_CATEGORY: gettext_lazy("Largest category"),
    CATEGORY_SPENDING: gettext_lazy("Category spending"),
    TOP_MERCHANT: gettext_lazy("Top merchant"),
    SPENDING_CHANGE: gettext_lazy("Spending vs previous month"),
    SPENDING_CHANGE_YEAR: gettext_lazy("Spending vs same month last year"),
    BIGGEST_INCREASE: gettext_lazy("Biggest increase"),
    OVER_BUDGET: gettext_lazy("Over budget"),
    CLOSEST_BUDGET: gettext_lazy("Closest to its limit"),
    SUBSCRIPTIONS_COST: gettext_lazy("Subscriptions per month"),
    GOAL_PROGRESS: gettext_lazy("Savings goal"),
}
CARD_TYPES = [(card_type, card_type) for card_type in LABELS]
TONES = ["neutral", "positive", "warning"]
TONE_CHOICES = [(tone, tone) for tone in TONES]
# Budgets this close to their limit (or over it) are worth a warning.
BUDGET_WARNING_PERCENT = 80


def _card(card_type: str, *, amount=None, currency=None, percentage=None, subject=None, count=None) -> dict:
    return {
        "type": card_type,
        "amount": amount,
        "currency": currency,
        "percentage": percentage,
        "subject": subject,
        "count": count,
    }


# --- Builders: (tool arguments, tool result) -> cards ----------------------------------------------


def _monthly_spending(arguments: dict, data: dict) -> list[dict]:
    currency = data["currency"]
    cards = [_card(TOTAL_SPENDING, amount=data["total_expenses"], currency=currency, subject=data["period"]["label"])]
    if top := (data["top_expense_categories"] or [None])[0]:
        cards.append(
            _card(
                LARGEST_CATEGORY,
                amount=top["amount"],
                currency=currency,
                percentage=top["share_percentage"],
                subject=top["category"],
            )
        )
    return cards


def _category_spending(arguments: dict, data: dict) -> list[dict]:
    currency = data["currency"]
    if data.get("requested_category"):
        return [
            _card(
                CATEGORY_SPENDING,
                amount=row["amount"],
                currency=currency,
                percentage=row["share_percentage"],
                subject=row["category"],
            )
            for row in data["matching_categories"]
        ]
    rows = data["categories"]
    if not rows:
        return []
    top = rows[0]
    return [
        _card(
            LARGEST_CATEGORY,
            amount=top["amount"],
            currency=currency,
            percentage=top["share_percentage"],
            subject=top["category"],
        )
    ]


def _merchant_spending(arguments: dict, data: dict) -> list[dict]:
    top = data["merchants"][0]
    return [
        _card(
            TOP_MERCHANT,
            amount=top["total"],
            currency=data["currency"],
            percentage=top["share_percentage"],
            subject=top["merchant"],
        )
    ]


def _budget_status(arguments: dict, data: dict) -> list[dict]:
    budgets = data["budgets"]
    over = [budget for budget in budgets if budget["status"] == "over_budget"]
    if over:
        worst = max(over, key=lambda budget: budget["usage_percentage"] or 0)
        return [
            _card(
                OVER_BUDGET,
                percentage=worst["usage_percentage"],
                subject=", ".join(budget["budget"] for budget in over),
                count=len(over),
            )
        ]
    closest = max(budgets, key=lambda budget: budget["usage_percentage"] or 0)
    return [_card(CLOSEST_BUDGET, percentage=closest["usage_percentage"], subject=closest["budget"])]


def _subscription_costs(arguments: dict, data: dict) -> list[dict]:
    return [
        _card(
            SUBSCRIPTIONS_COST,
            amount=data["active_monthly_total"],
            currency=data["currency"],
            count=data["active_count"],
        )
    ]


def _savings_progress(arguments: dict, data: dict) -> list[dict]:
    goals = data["goals"]
    goal = next((goal for goal in goals if goal["status"] == "active"), goals[0]) if goals else None
    if goal is None:
        return []
    return [
        _card(
            GOAL_PROGRESS,
            amount=goal["saved"],
            currency=goal["currency"],
            percentage=goal["progress_percentage"],
            subject=goal["name"],
        )
    ]


def _month_comparison(arguments: dict, data: dict) -> list[dict]:
    currency = data["currency"]
    by_year = data["against"] == "previous_year"
    cards = [
        _card(
            SPENDING_CHANGE_YEAR if by_year else SPENDING_CHANGE,
            amount=data["difference"]["total_expenses"],
            currency=currency,
            percentage=data["percentage_change"]["total_expenses"],
            subject=data["compared_period"]["label"],
        )
    ]
    increased = [row for row in data["expense_categories"] if Decimal(row["change"]) > 0]
    if increased:
        top = increased[0]  # the tool lists the largest increase first
        cards.append(
            _card(
                BIGGEST_INCREASE,
                amount=top["change"],
                currency=currency,
                percentage=top["change_percentage"],
                subject=top["category"],
            )
        )
    return cards


BUILDERS: dict[str, Callable[[dict, dict], list[dict]]] = {
    "get_monthly_spending": _monthly_spending,
    "get_category_spending": _category_spending,
    "get_merchant_spending": _merchant_spending,
    "get_budget_status": _budget_status,
    "get_subscription_costs": _subscription_costs,
    "get_savings_progress": _savings_progress,
    "get_month_comparison": _month_comparison,
}


def build_cards(results: Iterable[tuple[str, dict, dict | None]]) -> list[dict]:
    """Cards for the tool calls an answer made: (tool name, arguments, result data) in call order.
    Calls without data (errors, "no data") give no card; at most MAX_CARDS, no card twice."""
    cards: list[dict] = []
    for name, arguments, data in results:
        builder = BUILDERS.get(name)
        if builder is None or not data or not data.get("has_data"):
            continue
        for card in builder(arguments, data):
            if all((card["type"], card["subject"]) != (other["type"], other["subject"]) for other in cards):
                cards.append(card)
    return cards[:MAX_CARDS]


# --- What the apps show ------------------------------------------------------------------------


def _tone(card: dict) -> str:
    card_type, percentage = card["type"], card["percentage"] or 0
    if card_type in (SPENDING_CHANGE, SPENDING_CHANGE_YEAR):
        return "warning" if percentage > 0 else "positive" if percentage < 0 else "neutral"
    if card_type in (BIGGEST_INCREASE, OVER_BUDGET):
        return "warning"
    if card_type == CLOSEST_BUDGET:
        return "warning" if percentage >= BUDGET_WARNING_PERCENT else "neutral"
    return "neutral"


def _detail(card: dict) -> str | None:
    card_type, subject, count = card["type"], card["subject"], card["count"]
    if card_type == SUBSCRIPTIONS_COST:
        return ngettext("%(count)d active subscription", "%(count)d active subscriptions", count) % {"count": count}
    if card_type == OVER_BUDGET and count and count > 1:
        return _("%(budgets)s (%(count)d budgets)") % {"budgets": subject, "count": count}
    return subject


def describe(card: dict) -> dict:
    """A stored card plus its label, detail and tone, in the active language."""
    return {
        "type": card["type"],
        "label": str(LABELS[card["type"]]),
        "detail": _detail(card),
        "amount": card["amount"],
        "currency": card["currency"],
        "percentage": card["percentage"],
        "tone": _tone(card),
    }


# --- Follow-up questions --------------------------------------------------------------------------

Q_COMPARE = gettext_noop("How does that compare to the previous month?")
Q_BIGGEST_CATEGORIES = gettext_noop("What are my biggest expense categories?")
Q_REDUCE = gettext_noop("Where could I reduce my spending?")
Q_SUMMARY = gettext_noop("Give me a summary of my finances this month.")
Q_INCREASED = gettext_noop("Which category increased the most?")
Q_CLOSEST_BUDGET = gettext_noop("Which budget am I closest to exceeding?")
Q_BUDGET_LEFT = gettext_noop("How much budget do I have left?")
Q_YEARLY_SUBSCRIPTIONS = gettext_noop("How much do my subscriptions cost per year?")
Q_SUBSCRIPTION_SHARE = gettext_noop("How much of my monthly expenses are subscriptions?")
Q_PRICIEST_SUBSCRIPTION = gettext_noop("Which of my subscriptions costs the most?")
Q_SAVE_PER_MONTH = gettext_noop("How much do I need to save per month to reach my goals?")
Q_GOALS_ON_TRACK = gettext_noop("Am I on track with my savings goals?")
Q_TOP_CATEGORY = gettext_noop("Which category did I spend the most on?")
Q_WITHIN_BUDGETS = gettext_noop("Am I staying within my budgets this month?")

FOLLOW_UPS = {
    "get_monthly_spending": [Q_COMPARE, Q_BIGGEST_CATEGORIES, Q_REDUCE],
    "get_category_spending": [Q_COMPARE, Q_REDUCE, Q_BIGGEST_CATEGORIES],
    "get_merchant_spending": [Q_TOP_CATEGORY, Q_COMPARE, Q_REDUCE],
    "get_budget_status": [Q_CLOSEST_BUDGET, Q_BUDGET_LEFT, Q_REDUCE],
    "get_subscription_costs": [Q_YEARLY_SUBSCRIPTIONS, Q_SUBSCRIPTION_SHARE, Q_PRICIEST_SUBSCRIPTION],
    "get_savings_progress": [Q_SAVE_PER_MONTH, Q_GOALS_ON_TRACK, Q_SUMMARY],
    "get_month_comparison": [Q_INCREASED, Q_REDUCE, Q_SUMMARY],
}
# After an answer that used no data (a refusal, small talk).
GENERAL_FOLLOW_UPS = [Q_SUMMARY, Q_TOP_CATEGORY, Q_WITHIN_BUDGETS]


def follow_up_questions(tools_used: list[str], cards: list[dict], asked: str) -> list[str]:
    """Up to MAX_FOLLOW_UPS questions the user could ask next, in the active language: first the ones
    about what the answer was about (a category it named, then its most recent topic), never the
    question just asked."""
    questions: list[str] = []
    category = next((card["subject"] for card in cards if card["type"] in (LARGEST_CATEGORY, CATEGORY_SPENDING)), None)
    if category and any(name in tools_used for name in ("get_monthly_spending", "get_category_spending")):
        questions.append(_("How much did I spend on %(category)s last month?") % {"category": category})
    for name in reversed(tools_used):
        questions += [_(question) for question in FOLLOW_UPS.get(name, [])]
    questions += [_(question) for question in GENERAL_FOLLOW_UPS]

    unique = [question for question in dict.fromkeys(questions) if question != asked.strip()]
    return unique[:MAX_FOLLOW_UPS]
