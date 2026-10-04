"""Insight cards and follow-up questions: deterministic, built from the tool results — no model."""

import pytest

from apps.analytics.assistant import cards

CURRENCY = "EUR"


def monthly(**overrides):
    return {
        "has_data": True,
        "currency": CURRENCY,
        "period": {"label": "September 2026"},
        "total_expenses": "1085.10",
        "top_expense_categories": [
            {"category": "Food", "amount": "412.30", "share_percentage": 38.0},
            {"category": "Transport", "amount": "90.00", "share_percentage": 8.3},
        ],
        **overrides,
    }


def comparison(**overrides):
    return {
        "has_data": True,
        "currency": CURRENCY,
        "against": "previous_month",
        "compared_period": {"label": "August 2026"},
        "difference": {"total_expenses": "165.20"},
        "percentage_change": {"total_expenses": 18.0},
        "expense_categories": [
            {"category": "Shopping", "change": "120.00", "change_percentage": 40.0},
            {"category": "Food", "change": "-10.00", "change_percentage": -2.0},
        ],
        **overrides,
    }


def budgets(*rows):
    return {"has_data": True, "currency": CURRENCY, "budgets": list(rows)}


def budget(name, usage, status="on_track"):
    return {"budget": name, "usage_percentage": usage, "status": status}


def build(name, data, arguments=None):
    return cards.build_cards([(name, arguments or {}, data)])


def types_of(result):
    return [card["type"] for card in result]


# --- Cards from each tool -------------------------------------------------------------------------------


def test_monthly_spending_gives_the_total_and_the_largest_category():
    assert build("get_monthly_spending", monthly()) == [
        {
            "type": "total_spending",
            "amount": "1085.10",
            "currency": "EUR",
            "percentage": None,
            "subject": "September 2026",
            "count": None,
        },
        {
            "type": "largest_category",
            "amount": "412.30",
            "currency": "EUR",
            "percentage": 38.0,
            "subject": "Food",
            "count": None,
        },
    ]


def test_monthly_spending_without_categories_gives_only_the_total():
    assert types_of(build("get_monthly_spending", monthly(top_expense_categories=[]))) == ["total_spending"]


def test_a_looked_up_category_gives_its_own_card():
    data = {
        "has_data": True,
        "currency": CURRENCY,
        "requested_category": "food",
        "matching_categories": [{"category": "Food", "amount": "412.30", "share_percentage": 38.0}],
        "categories": [],
    }

    [card] = build("get_category_spending", data, {"category": "food"})

    assert (card["type"], card["subject"], card["amount"], card["percentage"]) == (
        "category_spending",
        "Food",
        "412.30",
        38.0,
    )


def test_category_spending_without_a_lookup_gives_the_largest_category():
    data = {
        "has_data": True,
        "currency": CURRENCY,
        "categories": [{"category": "Rent", "amount": "900.00", "share_percentage": 60.0}],
    }

    assert [(c["type"], c["subject"]) for c in build("get_category_spending", data)] == [("largest_category", "Rent")]


def test_merchant_spending_gives_the_top_merchant():
    data = {
        "has_data": True,
        "currency": CURRENCY,
        "merchants": [{"merchant": "Tesco", "total": "120.50", "share_percentage": 11.1}],
    }

    [card] = build("get_merchant_spending", data)

    assert (card["type"], card["subject"], card["amount"]) == ("top_merchant", "Tesco", "120.50")


def test_an_exceeded_budget_is_the_card_even_when_others_are_fine():
    data = budgets(budget("Food", 120.0, "over_budget"), budget("Fun", 40.0), budget("Travel", 130.5, "over_budget"))

    [card] = build("get_budget_status", data)

    assert (card["type"], card["subject"], card["count"], card["percentage"]) == (
        "over_budget",
        "Food, Travel",
        2,
        130.5,
    )


def test_without_an_exceeded_budget_the_closest_one_is_the_card():
    [card] = build("get_budget_status", budgets(budget("Food", 55.0), budget("Fun", 92.5, "ahead_of_pace")))

    assert (card["type"], card["subject"], card["percentage"]) == ("closest_budget", "Fun", 92.5)


def test_subscriptions_give_the_monthly_total_and_how_many_are_active():
    data = {"has_data": True, "currency": CURRENCY, "active_monthly_total": "54.97", "active_count": 4}

    [card] = build("get_subscription_costs", data)

    assert (card["type"], card["amount"], card["count"]) == ("subscriptions_cost", "54.97", 4)


def test_savings_progress_prefers_an_active_goal_in_its_own_currency():
    data = {
        "has_data": True,
        "currency": CURRENCY,
        "goals": [
            {"name": "Old", "status": "completed", "saved": "1.00", "currency": "EUR", "progress_percentage": 100.0},
            {"name": "Japan", "status": "active", "saved": "900.00", "currency": "USD", "progress_percentage": 30.0},
        ],
    }

    [card] = build("get_savings_progress", data)

    assert (card["subject"], card["amount"], card["currency"], card["percentage"]) == ("Japan", "900.00", "USD", 30.0)


def test_a_month_comparison_gives_the_change_and_the_biggest_increase():
    result = build("get_month_comparison", comparison())

    assert [(c["type"], c["subject"], c["amount"], c["percentage"]) for c in result] == [
        ("spending_change", "August 2026", "165.20", 18.0),
        ("biggest_increase", "Shopping", "120.00", 40.0),
    ]


def test_a_year_comparison_has_its_own_card_and_no_increase_card_when_nothing_increased():
    data = comparison(
        against="previous_year",
        expense_categories=[{"category": "Food", "change": "-10.00", "change_percentage": -2.0}],
    )

    assert types_of(build("get_month_comparison", data)) == ["spending_change_year"]


# --- Which calls give cards --------------------------------------------------------------------------------


@pytest.mark.parametrize("data", [None, {}, {"has_data": False, "note": "No transactions."}])
def test_no_data_gives_no_card(data):
    assert build("get_monthly_spending", data) == []


def test_unknown_tools_give_no_card():
    assert build("get_the_moon", monthly()) == []


def test_at_most_three_cards_and_none_twice():
    results = [
        ("get_monthly_spending", {}, monthly()),
        ("get_monthly_spending", {}, monthly()),  # asked again: the same cards, listed once
        ("get_month_comparison", {}, comparison()),
    ]

    result = cards.build_cards(results)

    assert types_of(result) == ["total_spending", "largest_category", "spending_change"]  # the 4th is cut


# --- What the apps show ----------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("percentage", "tone"), [(18.0, "warning"), (-4.5, "positive"), (0.0, "neutral"), (None, "neutral")]
)
def test_a_spending_change_is_coloured_by_its_direction(percentage, tone):
    card = cards._card(cards.SPENDING_CHANGE, percentage=percentage, subject="August 2026")

    assert cards.describe(card)["tone"] == tone


@pytest.mark.parametrize(
    ("card", "tone"),
    [
        (cards._card(cards.BIGGEST_INCREASE, subject="Shopping"), "warning"),
        (cards._card(cards.OVER_BUDGET, subject="Food", count=1), "warning"),
        (cards._card(cards.CLOSEST_BUDGET, percentage=79.9, subject="Food"), "neutral"),
        (cards._card(cards.CLOSEST_BUDGET, percentage=80.0, subject="Food"), "warning"),
        (cards._card(cards.LARGEST_CATEGORY, subject="Food"), "neutral"),
    ],
)
def test_tones(card, tone):
    assert cards.describe(card)["tone"] == tone


def test_describe_adds_label_detail_and_tone_in_english():
    described = cards.describe(
        cards._card(cards.SPENDING_CHANGE, amount="165.20", currency="EUR", percentage=18.0, subject="August 2026")
    )

    assert described == {
        "type": "spending_change",
        "label": "Spending vs previous month",
        "detail": "August 2026",
        "amount": "165.20",
        "currency": "EUR",
        "percentage": 18.0,
        "tone": "warning",
    }


def test_details_say_how_many_there_are():
    assert cards.describe(cards._card(cards.SUBSCRIPTIONS_COST, count=1))["detail"] == "1 active subscription"
    assert cards.describe(cards._card(cards.SUBSCRIPTIONS_COST, count=4))["detail"] == "4 active subscriptions"
    assert cards.describe(cards._card(cards.OVER_BUDGET, subject="Food, Fun", count=2))["detail"] == (
        "Food, Fun (2 budgets)"
    )
    assert cards.describe(cards._card(cards.OVER_BUDGET, subject="Food", count=1))["detail"] == "Food"


def test_every_card_type_has_a_label():
    assert {card_type for card_type, _ in cards.CARD_TYPES} == set(cards.LABELS)
    assert all(str(label) for label in cards.LABELS.values())


# --- Follow-up questions -------------------------------------------------------------------------------------


def test_follow_ups_after_the_monthly_spending_name_the_largest_category():
    built = build("get_monthly_spending", monthly())

    questions = cards.follow_up_questions(["get_monthly_spending"], built, "What did I spend the most on?")

    assert questions == [
        "How much did I spend on Food last month?",
        "How does that compare to the previous month?",
        "What are my biggest expense categories?",
    ]


def test_follow_ups_follow_the_latest_topic_first():
    questions = cards.follow_up_questions(["get_monthly_spending", "get_budget_status"], [], "Anything?")

    assert questions[:2] == ["Which budget am I closest to exceeding?", "How much budget do I have left?"]


def test_the_question_just_asked_is_never_offered_again():
    questions = cards.follow_up_questions(["get_budget_status"], [], "  Which budget am I closest to exceeding? ")

    assert "Which budget am I closest to exceeding?" not in questions
    assert len(questions) == cards.MAX_FOLLOW_UPS


def test_an_answer_without_data_still_offers_questions():
    assert cards.follow_up_questions([], [], "Tell me a joke") == [
        "Give me a summary of my finances this month.",
        "Which category did I spend the most on?",
        "Am I staying within my budgets this month?",
    ]


@pytest.mark.parametrize("tool", sorted(cards.FOLLOW_UPS))
def test_every_tool_has_follow_ups(tool):
    assert len(cards.follow_up_questions([tool], [], "x")) == cards.MAX_FOLLOW_UPS
