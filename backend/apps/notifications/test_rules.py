"""The smart notification rules (apps/notifications/rules.py): what each one decides and writes."""

import logging
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from django.utils import timezone

from apps.budgets.models import Budget, SavingsGoal, SavingsGoalStatus
from apps.categories.models import Category, TransactionType
from apps.subscriptions.models import Subscription
from apps.transactions.models import Frequency, RecurringTransaction, Transaction
from apps.users.models import User

from . import rules, services
from .models import Notification, NotificationKind, NotificationPreference

D = Decimal
TODAY = timezone.localdate()


def _category(user, name, type_=TransactionType.EXPENSE):
    return Category.objects.create(user=user, name=name, type=type_)


def _expense(user, category, amount, on):
    Transaction.objects.create(user=user, category=category, type=TransactionType.EXPENSE, amount=D(amount), date=on)


def _income(user, category, amount, on):
    Transaction.objects.create(user=user, category=category, type=TransactionType.INCOME, amount=D(amount), date=on)


def _related(notification):
    return (notification.content_type.model_class(), notification.object_id) if notification.content_type else None


def _only(user):
    [notification] = Notification.objects.filter(user=user)
    return notification


@pytest.fixture
def entertainment(user):
    return _category(user, "Entertainment")


@pytest.fixture
def preferences(user):
    return services.get_preferences(user)


# --- notify() and the related object ----------------------------------------


@pytest.mark.django_db
def test_notify_stores_the_related_object(user):
    budget = Budget.objects.create(user=user, amount=D("100.00"), year=2026, month=9)

    notification = services.notify(
        user, NotificationKind.BUDGET_WARNING, title="t", body="b", dedupe_key="k", related=(Budget, budget.id)
    )

    notification.refresh_from_db()
    assert notification.related_object == budget
    assert notification.is_read is False


@pytest.mark.django_db
def test_a_subscription_keeps_its_own_type(user, entertainment):
    """Subscription is a proxy of RecurringTransaction; the notification must still say "subscription"."""
    subscription = Subscription.objects.create(
        user=user, category=entertainment, name="Netflix", amount=D("17.99"),
        frequency=Frequency.MONTHLY, start_date=date(2026, 1, 5), next_occurrence_date=date(2026, 1, 5),
    )

    notification = services.notify(
        user, NotificationKind.SUBSCRIPTION_DUE, title="t", body="b", dedupe_key="k", related=(Subscription, subscription.id)
    )

    assert notification.content_type == ContentType.objects.get_for_model(Subscription, for_concrete_model=False)


@pytest.mark.django_db
def test_only_known_models_can_be_related(user):
    with pytest.raises(ValueError, match="can't be the related object"):
        services.notify(user, NotificationKind.INSIGHT, title="t", body="b", dedupe_key="k", related=(User, user.id))


@pytest.mark.django_db
def test_budget_notifications_point_at_the_budget(auth_client, user):
    food = _category(user, "Food")
    budget = Budget.objects.create(user=user, category=food, amount=D("100.00"), year=TODAY.year, month=TODAY.month)

    auth_client.post(
        reverse("transaction-list"),
        {"category": food.id, "type": "expense", "amount": "82.00", "date": TODAY.isoformat()},
        format="json",
    )

    notification = _only(user)
    assert notification.body == f"You've used 82% of your Food budget for {TODAY:%B}."
    assert _related(notification) == (Budget, budget.id)


# --- Subscription and recurring payment reminders ---------------------------


def _subscription(user, category, name="Netflix", start=date(2026, 1, 28), **fields):
    return Subscription.objects.create(
        user=user, category=category, name=name, amount=D("17.99"), frequency=Frequency.MONTHLY,
        start_date=start, next_occurrence_date=start, **fields,
    )


def _rent(user, category, start=date(2026, 1, 28)):
    return RecurringTransaction.objects.create(
        user=user, category=category, name="Rent", type=TransactionType.EXPENSE, amount=D("800.00"),
        frequency=Frequency.MONTHLY, start_date=start, next_occurrence_date=start,
    )


@pytest.mark.django_db
def test_subscription_payment_reminder(user, entertainment, preferences):
    netflix = _subscription(user, entertainment)

    rules.send_payment_reminders(user, preferences, date(2026, 9, 27))

    notification = _only(user)
    assert notification.kind == NotificationKind.SUBSCRIPTION_DUE
    assert notification.title == "Subscription payment"
    assert notification.body == "Netflix payment expected tomorrow."
    assert _related(notification) == (Subscription, netflix.id)
    assert notification.data == {"screen": "subscriptions", "subscription_id": netflix.id, "date": "2026-09-28"}


@pytest.mark.django_db
def test_subscriptions_and_other_recurring_expenses_have_separate_switches(user, entertainment, preferences):
    _subscription(user, entertainment)
    rent = _rent(user, entertainment)
    preferences.subscription_reminders = False

    rules.send_payment_reminders(user, preferences, date(2026, 9, 27))

    notification = _only(user)
    assert notification.kind == NotificationKind.RECURRING_DUE
    assert notification.body == "Rent is due tomorrow."
    assert _related(notification) == (RecurringTransaction, rent.id)


@pytest.mark.django_db
def test_paused_subscription_is_not_reminded(user, entertainment, preferences):
    _subscription(user, entertainment, is_active=False)

    rules.send_payment_reminders(user, preferences, date(2026, 9, 27))

    assert not Notification.objects.exists()


@pytest.mark.django_db
def test_one_reminder_per_payment_even_after_becoming_a_subscription(user, entertainment, preferences):
    rent = _rent(user, entertainment)
    rules.send_payment_reminders(user, preferences, date(2026, 9, 26))
    RecurringTransaction.objects.filter(pk=rent.pk).update(is_subscription=True)

    rules.send_payment_reminders(user, preferences, date(2026, 9, 27))

    assert _only(user).kind == NotificationKind.RECURRING_DUE


# --- Savings goal progress --------------------------------------------------


@pytest.fixture
def goal(user):
    return SavingsGoal.objects.create(user=user, name="Japan trip", target_amount=D("1500.00"))


def _deposit(client, goal, amount):
    return client.post(reverse("savingsgoal-deposit", args=[goal.pk]), {"amount": amount}, format="json")


@pytest.mark.django_db
def test_crossing_a_milestone_says_how_much_is_left(auth_client, user, goal):
    _deposit(auth_client, goal, "400.00")  # 26.67 %

    notification = _only(user)
    assert notification.kind == NotificationKind.SAVINGS_GOAL
    assert notification.title == "Savings goal progress"
    assert notification.body == "You are €1,100 away from your Japan trip goal (26% saved)."
    assert notification.dedupe_key == f"savings_goal:{goal.id}:25"
    assert _related(notification) == (SavingsGoal, goal.id)
    assert notification.data == {"screen": "savings_goals", "savings_goal_id": goal.id}


@pytest.mark.django_db
def test_a_big_deposit_notifies_only_the_highest_milestone(auth_client, user, goal):
    _deposit(auth_client, goal, "1350.00")  # 0 → 90 %

    assert _only(user).body == "You are €150 away from your Japan trip goal (90% saved)."


@pytest.mark.django_db
def test_reaching_the_goal(auth_client, user, goal):
    _deposit(auth_client, goal, "1400.00")
    _deposit(auth_client, goal, "100.00")

    reached = Notification.objects.filter(user=user).latest("id")
    assert reached.title == "Savings goal reached"
    assert reached.body == "You reached your Japan trip goal of €1,500."
    assert Notification.objects.filter(user=user).count() == 2  # 90 %, then 100 %


@pytest.mark.django_db
def test_goal_amounts_use_the_goal_currency(auth_client, user):
    goal = SavingsGoal.objects.create(user=user, name="Laptop", target_amount=D("400000"), currency="HUF")

    _deposit(auth_client, goal, "200000")

    assert _only(user).body == "You are 200,000 Ft away from your Laptop goal (50% saved)."


@pytest.mark.django_db
def test_a_milestone_is_celebrated_once(auth_client, user, goal):
    _deposit(auth_client, goal, "800.00")  # 53 % → 50 %
    auth_client.post(reverse("savingsgoal-withdraw", args=[goal.pk]), {"amount": "100.00"}, format="json")
    _deposit(auth_client, goal, "100.00")  # back above 50 %

    assert Notification.objects.filter(user=user).count() == 1


@pytest.mark.django_db
def test_withdrawing_or_raising_the_target_is_no_news(auth_client, user, goal):
    _deposit(auth_client, goal, "1000.00")  # 66 % → 50 %
    auth_client.post(reverse("savingsgoal-withdraw", args=[goal.pk]), {"amount": "700.00"}, format="json")
    auth_client.patch(reverse("savingsgoal-detail", args=[goal.pk]), {"target_amount": "5000.00"}, format="json")

    assert Notification.objects.filter(user=user).count() == 1


@pytest.mark.django_db
def test_lowering_the_target_can_cross_a_milestone(auth_client, user, goal):
    _deposit(auth_client, goal, "300.00")  # 20 %: nothing yet

    auth_client.patch(reverse("savingsgoal-detail", args=[goal.pk]), {"target_amount": "400.00"}, format="json")

    assert _only(user).body == "You are €100 away from your Japan trip goal (75% saved)."


@pytest.mark.django_db
def test_new_goals_and_archived_goals_are_quiet(auth_client, user, goal):
    auth_client.post(reverse("savingsgoal-list"), {"name": "Car", "target_amount": "100.00", "current_amount": "60.00"}, format="json")
    goal.status = SavingsGoalStatus.ARCHIVED
    goal.save()

    rules.check_savings_goal(user, goal, previous_progress=D(0))

    assert not Notification.objects.exists()


@pytest.mark.django_db
def test_savings_notifications_can_be_switched_off(auth_client, user, goal):
    NotificationPreference.objects.create(user=user, savings_goals=False)

    _deposit(auth_client, goal, "1500.00")

    assert not Notification.objects.exists()


# --- Unusual spending -------------------------------------------------------


UNUSUAL_DAY = date(2026, 9, 15)


@pytest.fixture
def shopping_history(user):
    """June–August: 100.00 of shopping by the 5th and 500.00 rent on the 20th."""
    shopping, housing = _category(user, "Shopping"), _category(user, "Housing")
    for month in (6, 7, 8):
        _expense(user, shopping, "100.00", date(2026, month, 5))
        _expense(user, housing, "500.00", date(2026, month, 20))
    return shopping


@pytest.mark.django_db
def test_unusual_spending_notification(user, shopping_history, preferences):
    _expense(user, shopping_history, "121.00", date(2026, 9, 5))
    _expense(user, shopping_history, "10.00", date(2026, 9, 6))

    rules.send_unusual_spending(user, preferences, UNUSUAL_DAY)
    rules.send_unusual_spending(user, preferences, UNUSUAL_DAY + timedelta(days=1))  # once a month

    notification = _only(user)
    assert notification.kind == NotificationKind.UNUSUAL_SPENDING
    assert notification.title == "Unusual spending"
    assert notification.body == (
        "Your Shopping expenses increased by 31% compared to your usual spending so far this month."
    )
    assert _related(notification) == (Category, shopping_history.id)
    assert notification.dedupe_key == f"unusual_spending:{shopping_history.id}:2026-09"


@pytest.mark.django_db
def test_unusual_spending_at_most_three_per_run(user, shopping_history, preferences):
    for index in range(5):
        category = _category(user, f"Hobby {index}")
        for month in (6, 7, 8):
            _expense(user, category, "100.00", date(2026, month, 2))
        _expense(user, category, "200.00", date(2026, 9, 2))

    rules.send_unusual_spending(user, preferences, UNUSUAL_DAY)
    assert Notification.objects.count() == 3
    rules.send_unusual_spending(user, preferences, UNUSUAL_DAY)  # the next run takes the rest
    assert Notification.objects.count() == 5


@pytest.mark.django_db
def test_unusual_spending_can_be_switched_off(user, shopping_history, preferences):
    _expense(user, shopping_history, "300.00", date(2026, 9, 5))
    preferences.unusual_spending = False

    rules.send_unusual_spending(user, preferences, UNUSUAL_DAY)

    assert not Notification.objects.exists()


# --- Monthly summary --------------------------------------------------------


@pytest.fixture
def two_months(user):
    """July: 1,000.00 spent. August: 920.50 spent, 2,000.00 earned."""
    food, salary = _category(user, "Food"), _category(user, "Salary", TransactionType.INCOME)
    _expense(user, food, "1000.00", date(2026, 7, 10))
    _expense(user, food, "920.50", date(2026, 8, 10))
    _income(user, salary, "2000.00", date(2026, 8, 1))
    return food


@pytest.mark.django_db
def test_monthly_summary(user, two_months, preferences):
    rules.send_monthly_summary(user, preferences, date(2026, 9, 1))

    notification = _only(user)
    assert notification.kind == NotificationKind.MONTHLY_SUMMARY
    assert notification.title == "Your August summary"
    assert notification.body == (
        "You spent €920.50 and earned €2,000 in August. Spending was 8% lower than in July."
    )
    assert notification.related_object is None
    assert notification.data == {"screen": "dashboard", "year": 2026, "month": 8}


@pytest.mark.django_db
def test_monthly_summary_without_income_or_earlier_month(user, preferences):
    _expense(user, _category(user, "Food"), "80.00", date(2026, 8, 10))

    rules.send_monthly_summary(user, preferences, date(2026, 9, 2))

    assert _only(user).body == "You spent €80 in August."


@pytest.mark.django_db
def test_monthly_summary_higher_spending_in_the_base_currency(user, preferences):
    user.base_currency = "HUF"
    user.save()
    food = _category(user, "Food")
    _expense(user, food, "100000", date(2026, 7, 10))
    _expense(user, food, "125000", date(2026, 8, 10))

    rules.send_monthly_summary(user, preferences, date(2026, 9, 3))

    assert _only(user).body == "You spent 125,000 Ft in August. Spending was 25% higher than in July."


@pytest.mark.django_db
def test_monthly_summary_once_and_only_early_in_the_month(user, two_months, preferences, django_assert_num_queries):
    rules.send_monthly_summary(user, preferences, date(2026, 9, 8))  # too late
    assert not Notification.objects.exists()

    rules.send_monthly_summary(user, preferences, date(2026, 9, 1))
    with django_assert_num_queries(1):  # already sent: the summaries aren't even computed
        rules.send_monthly_summary(user, preferences, date(2026, 9, 2))
    assert Notification.objects.count() == 1


@pytest.mark.django_db
def test_no_summary_for_a_month_without_transactions(user, preferences):
    rules.send_monthly_summary(user, preferences, date(2026, 9, 1))

    assert not Notification.objects.exists()


# --- Important insights ----------------------------------------------------


@pytest.mark.django_db
def test_insight_notification(user, preferences):
    today = date(2026, 9, 20)
    _income(user, _category(user, "Salary", TransactionType.INCOME), "1000.00", today)
    _expense(user, _category(user, "Food"), "1200.00", today)

    rules.send_insight_notifications(user, preferences, today)

    notification = _only(user)
    assert notification.title == "Financial insight"
    assert notification.body == "Expenses exceeded income by 20% this month."
    assert notification.related_object is None


# --- The scheduled run ------------------------------------------------------


@pytest.mark.django_db
def test_scheduled_run_covers_every_rule(user, two_months):
    _subscription(user, two_months, start=date(2026, 1, 2))

    rules.run_scheduled_rules(date(2026, 9, 1))

    assert set(Notification.objects.values_list("kind", flat=True)) == {
        NotificationKind.SUBSCRIPTION_DUE,
        NotificationKind.MONTHLY_SUMMARY,
    }


@pytest.mark.django_db
def test_scheduled_run_skips_inactive_users(user, two_months):
    user.is_active = False
    user.save()

    assert rules.run_scheduled_rules(date(2026, 9, 1)) == 0
    assert not Notification.objects.exists()


@pytest.mark.django_db
def test_one_users_failure_does_not_stop_the_others(user, other_user, two_months, monkeypatch, caplog):
    other_food = _category(other_user, "Food")
    _expense(other_user, other_food, "50.00", date(2026, 8, 3))
    real_rule = rules.send_payment_reminders

    def broken_for_first_user(target, preferences, today):
        if target.pk == user.pk:
            raise RuntimeError("unexpected data")
        real_rule(target, preferences, today)

    monkeypatch.setattr(rules, "SCHEDULED_RULES", (broken_for_first_user, rules.send_monthly_summary))

    with caplog.at_level(logging.ERROR, logger="apps.notifications.rules"):
        assert rules.run_scheduled_rules(date(2026, 9, 1)) == 1

    assert _only(other_user).kind == NotificationKind.MONTHLY_SUMMARY
    assert f"failed for user {user.pk}" in caplog.text
