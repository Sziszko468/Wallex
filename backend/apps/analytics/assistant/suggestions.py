"""Suggested first questions, picked from what data the user actually has.

A suggestion about subscriptions only appears for someone with subscriptions, a goal question
names one of their own active goals, and so on. Cheap existence checks only; no model call.
"""

from datetime import date

from apps.budgets.models import Budget, SavingsGoal, SavingsGoalStatus
from apps.categories.models import TransactionType
from apps.subscriptions.models import Subscription
from apps.transactions.models import Transaction

from .. import services

MAX_SUGGESTIONS = 6
# Shown to fill up the list, e.g. for a new user without data yet.
GENERAL = [
    "What did I spend the most on this month?",
    "Where did I spend more than last month?",
    "Which of my subscriptions costs the most?",
    "Am I staying within my budgets this month?",
]


def suggested_questions(user, today: date) -> list[str]:
    top_categories = services.get_category_expense_rows(user, today.year, today.month)
    last_month = services.month_date_range(*services.previous_month(today.year, today.month))
    spent_last_month = Transaction.objects.filter(
        user=user, type=TransactionType.EXPENSE, date__range=last_month
    ).exists()
    goal = SavingsGoal.objects.filter(user=user, status=SavingsGoalStatus.ACTIVE).order_by("target_date", "name").first()

    questions = []
    if top_categories:
        questions.append("What did I spend the most on this month?")
        if spent_last_month:
            questions += ["Why did my spending change compared to last month?", "Where did I spend more than last month?"]
        questions.append(f"How much did I spend on {top_categories[0]['category__name']} this month?")
    if Subscription.objects.filter(user=user, is_active=True).exists():
        questions.append("Which of my subscriptions costs the most?")
    if goal is not None:
        questions.append(f"How am I doing with my {goal.name} savings goal?")
    if Budget.objects.filter(user=user, year=today.year, month=today.month).exists():
        questions.append("Am I staying within my budgets this month?")

    for question in GENERAL:
        if len(questions) >= MAX_SUGGESTIONS:
            break
        if question not in questions:
            questions.append(question)
    return questions[:MAX_SUGGESTIONS]
