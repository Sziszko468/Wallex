from datetime import date
from decimal import Decimal

import pytest

from apps.categories.models import Category, TransactionType
from apps.transactions.models import Frequency

from .models import Subscription


@pytest.fixture
def entertainment(user):
    return Category.objects.create(user=user, name="Entertainment", type=TransactionType.EXPENSE)


@pytest.fixture
def bills(user):
    return Category.objects.create(user=user, name="Bills", type=TransactionType.EXPENSE)


@pytest.fixture
def salary(user):
    return Category.objects.create(user=user, name="Salary", type=TransactionType.INCOME)


@pytest.fixture
def make_subscription(user, entertainment):
    """make_subscription("Netflix", "15.49", currency="USD", …): saved through the proxy model."""

    def _make(name="Netflix", amount="9.99", **fields):
        start = fields.pop("start_date", date(2026, 1, 5))
        values = {
            "user": user,
            "category": entertainment,
            "name": name,
            "amount": Decimal(amount),
            "frequency": Frequency.MONTHLY,
            "start_date": start,
            "next_occurrence_date": start,
            **fields,
        }
        return Subscription.objects.create(**values)

    return _make
