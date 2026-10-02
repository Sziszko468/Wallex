"""Suggested first questions, picked from what data the user actually has.

A suggestion about subscriptions only appears for someone with subscriptions, a goal question
names one of their own active goals, and so on. Cheap existence checks only; no model call.
"""

from datetime import date

from django.utils.translation import gettext as _
from django.utils.translation import gettext_noop

from apps.budgets.models import Budget, SavingsGoal, SavingsGoalStatus
from apps.categories.defaults import display_name
from apps.categories.models import TransactionType
from apps.subscriptions.models import Subscription
from apps.transactions.models import Transaction

from .. import services

MAX_SUGGESTIONS = 6
# Shown to fill up the list, e.g. for a new user without data yet.
Q_TOP_CATEGORY = gettext_noop("What did I spend the most on this month?")
Q_MORE_THAN_LAST_MONTH = gettext_noop("Where did I spend more than last month?")
Q_TOP_SUBSCRIPTION = gettext_noop("Which of my subscriptions costs the most?")
Q_WITHIN_BUDGETS = gettext_noop("Am I staying within my budgets this month?")
GENERAL = [Q_TOP_CATEGORY, Q_MORE_THAN_LAST_MONTH, Q_TOP_SUBSCRIPTION, Q_WITHIN_BUDGETS]


def suggested_questions(user, today: date) -> list[str]:
    top_categories = services.get_category_expense_rows(user, today.year, today.month)
    last_month = services.month_date_range(*services.previous_month(today.year, today.month))
    spent_last_month = Transaction.objects.filter(
        user=user, type=TransactionType.EXPENSE, date__range=last_month
    ).exists()
    goal = (
        SavingsGoal.objects.filter(user=user, status=SavingsGoalStatus.ACTIVE).order_by("target_date", "name").first()
    )

    questions = []
    if top_categories:
        questions.append(_(Q_TOP_CATEGORY))
        if spent_last_month:
            questions += [_("Why did my spending change compared to last month?"), _(Q_MORE_THAN_LAST_MONTH)]
        questions.append(
            _("How much did I spend on %(category)s this month?")
            % {"category": display_name(top_categories[0]["category__name"])}
        )
    if Subscription.objects.filter(user=user, is_active=True).exists():
        questions.append(_(Q_TOP_SUBSCRIPTION))
    if goal is not None:
        questions.append(_("How am I doing with my %(goal)s savings goal?") % {"goal": goal.name})
    if Budget.objects.filter(user=user, year=today.year, month=today.month).exists():
        questions.append(_(Q_WITHIN_BUDGETS))

    for question in GENERAL:
        if len(questions) >= MAX_SUGGESTIONS:
            break
        if _(question) not in questions:
            questions.append(_(question))
    return questions[:MAX_SUGGESTIONS]
