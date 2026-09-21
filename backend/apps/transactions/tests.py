from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.categories.models import TransactionType
from apps.transactions.models import Frequency, RecurringTransaction, Transaction


@pytest.mark.django_db
def test_create_transaction(user, expense_category):
    transaction = Transaction.objects.create(
        user=user,
        category=expense_category,
        type=TransactionType.EXPENSE,
        amount=Decimal("49.99"),
        date=date.today(),
    )
    assert transaction.pk is not None
    assert transaction.amount == Decimal("49.99")


@pytest.mark.django_db
def test_transaction_amount_must_be_positive(user, expense_category):
    with pytest.raises(IntegrityError):
        Transaction.objects.create(
            user=user,
            category=expense_category,
            type=TransactionType.EXPENSE,
            amount=Decimal("-10.00"),
            date=date.today(),
        )


@pytest.mark.django_db
def test_transaction_type_must_match_category_type(user, expense_category):
    transaction = Transaction(
        user=user,
        category=expense_category,
        type=TransactionType.INCOME,
        amount=Decimal("10.00"),
        date=date.today(),
    )
    with pytest.raises(ValidationError):
        transaction.full_clean()


@pytest.mark.django_db
def test_transaction_links_to_recurring_transaction(user, expense_category):
    recurring = RecurringTransaction.objects.create(
        user=user,
        category=expense_category,
        name="Netflix",
        type=TransactionType.EXPENSE,
        amount=Decimal("15.99"),
        frequency=Frequency.MONTHLY,
        start_date=date.today(),
        next_occurrence_date=date.today() + timedelta(days=30),
    )
    transaction = Transaction.objects.create(
        user=user,
        category=expense_category,
        recurring_transaction=recurring,
        type=TransactionType.EXPENSE,
        amount=Decimal("15.99"),
        date=date.today(),
    )
    assert recurring.generated_transactions.count() == 1
    assert recurring.generated_transactions.first() == transaction


@pytest.mark.django_db
def test_recurring_transaction_amount_must_be_positive(user, expense_category):
    with pytest.raises(IntegrityError):
        RecurringTransaction.objects.create(
            user=user,
            category=expense_category,
            name="Broken",
            type=TransactionType.EXPENSE,
            amount=Decimal("0"),
            frequency=Frequency.MONTHLY,
            start_date=date.today(),
            next_occurrence_date=date.today(),
        )


@pytest.mark.django_db
def test_recurring_transaction_end_date_before_start_date_rejected(user, expense_category):
    with pytest.raises(IntegrityError):
        RecurringTransaction.objects.create(
            user=user,
            category=expense_category,
            name="Insurance",
            type=TransactionType.EXPENSE,
            amount=Decimal("100.00"),
            frequency=Frequency.YEARLY,
            start_date=date.today(),
            end_date=date.today() - timedelta(days=1),
            next_occurrence_date=date.today(),
        )
