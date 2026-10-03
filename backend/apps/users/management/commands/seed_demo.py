"""Demo data: a signed-up user with months of realistic transactions, budgets, subscriptions, goals.

For trying the app, for screenshots and for reviewers. Everything goes through the real API views
(in process), so notifications, achievements and the other side effects happen exactly as they do
for a person using the app. Development only: it refuses to run with DEBUG off unless forced.
"""

import random
import secrets
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.analytics.services import shift_month
from apps.categories.defaults import create_default_categories
from apps.categories.models import Category
from apps.users.models import AuditEvent

DEFAULT_EMAIL = "demo@example.com"
DEFAULT_MONTHS = 9
SEED = 7  # the same data every run

MONTHLY_SALARY = Decimal("3000.00")
RENT = Decimal("950.00")
FREELANCE_INCOME = Decimal("800.00")
FIRST_DAY_FOR_SPENDING, LAST_DAY_FOR_SPENDING = 3, 27  # kept inside every month

# category -> (transactions a month, lowest amount, highest amount, merchants)
SPENDING = {
    "Food": (9, 12, 55, ["Albert Heijn", "Lidl", "Bakery Jansen", "Farmers market", "Tesco"]),
    "Transport": (3, 8, 70, ["Metro pass", "Fuel station", "Taxi", "Train ticket"]),
    "Shopping": (2, 20, 90, ["Zara", "IKEA", "Amazon", "Bookshop"]),
    "Entertainment": (2, 12, 45, ["Cinema", "Concert tickets", "Board game cafe"]),
    "Health": (1, 15, 60, ["Pharmacy", "Dentist"]),
    "Bills": (2, 30, 70, ["Electricity", "Internet", "Water"]),
}
TRAVEL_MONTHS_AGO = (2, 5)  # a trip in these months: (lowest, highest) amount and merchants below
TRAVEL_RANGE = (180, 320)
TRAVEL_MERCHANTS = ["Airline tickets", "Hotel booking"]

# Budgets of the last finished month: some near the limit, one exceeded, so the insights have something to say.
BUDGETS = {
    "Housing": "1000.00",
    "Food": "420.00",
    "Transport": "110.00",
    "Shopping": "135.00",
    "Entertainment": "55.00",
    "Bills": "95.00",
}
OVERALL_BUDGET = "2200.00"
SUBSCRIPTIONS = [
    ("Netflix", "13.99", "Entertainment"),
    ("Spotify", "10.99", "Entertainment"),
    ("Gym", "29.00", "Health"),
]
SAVINGS_GOALS = [  # (name, target, saved, months until the deadline or None)
    ("Japan trip", "3000.00", "1250.00", 6),
    ("Emergency fund", "5000.00", "2100.00", None),
    ("New laptop", "1400.00", "1400.00", None),
]


class Command(BaseCommand):
    help = "Creates a demo account with months of data (development only). Prints its sign-in details."

    def add_arguments(self, parser):
        parser.add_argument("--email", default=DEFAULT_EMAIL)
        parser.add_argument("--password", help="Default: a random one, printed at the end.")
        parser.add_argument("--language", choices=[code for code, _ in settings.LANGUAGES], default="en")
        parser.add_argument("--months", type=int, default=DEFAULT_MONTHS, help="How many months of history.")
        parser.add_argument("--reset", action="store_true", help="Delete the account first if it exists.")
        parser.add_argument("--force", action="store_true", help="Allow it with DEBUG off.")

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError("seed_demo creates a throwaway account: it only runs in development (DEBUG).")
        user_model = get_user_model()
        email = options["email"]
        if user_model.objects.filter(email__iexact=email).exists():
            if not options["reset"]:
                raise CommandError(f"{email} already exists. Use --reset to replace it.")
            # Its login history goes first: an audit row would otherwise keep the old address around.
            AuditEvent.objects.filter(email__iexact=email).delete()
            user_model.objects.filter(email__iexact=email).delete()

        password = options["password"] or secrets.token_urlsafe(12)
        user = user_model.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name="Anna",
            last_name="Kovács",
            language=options["language"],
        )
        create_default_categories(user)
        client = APIClient()
        client.force_authenticate(user)  # the views run as the demo user, nothing is signed in for real
        _Seeder(client, user, random.Random(SEED)).run(options["months"])

        self.stdout.write(self.style.SUCCESS(f"Demo account ready: {email} / {password}"))


class _Seeder:
    def __init__(self, client: APIClient, user, rng: random.Random):
        self.client = client
        self.rng = rng
        self.categories = {category.name: category.id for category in Category.objects.filter(user=user)}
        self.today = timezone.localdate()

    def post(self, url: str, payload: dict) -> None:
        response = self.client.post(url, payload, format="json")
        if response.status_code not in (200, 201):
            raise CommandError(f"{url} refused the demo data: {response.status_code} {response.data}")

    def transaction(self, category: str, kind: str, amount: Decimal | float, day: date, description: str) -> None:
        self.post(
            "/api/transactions/",
            {
                "category": self.categories[category],
                "type": kind,
                "amount": f"{Decimal(str(amount)):.2f}",
                "date": day.isoformat(),
                "description": description,
            },
        )

    def run(self, months: int) -> None:
        for months_ago in range(months - 1, -1, -1):
            self.month_of_transactions(*shift_month(self.today.year, self.today.month, -months_ago), months_ago)
        last_year, last_month = shift_month(self.today.year, self.today.month, -1)
        self.budgets(last_year, last_month)
        self.subscriptions_and_recurring()
        self.savings_goals()

    def month_of_transactions(self, year: int, month: int, months_ago: int) -> None:
        self.transaction("Salary", "income", MONTHLY_SALARY, date(year, month, 1), "Salary")
        self.transaction("Housing", "expense", RENT, date(year, month, 2), "Rent")
        for category, (count, low, high, merchants) in SPENDING.items():
            for _ in range(count):
                day = date(year, month, self.rng.randint(FIRST_DAY_FOR_SPENDING, LAST_DAY_FOR_SPENDING))
                self.transaction(
                    category, "expense", round(self.rng.uniform(low, high), 2), day, self.rng.choice(merchants)
                )
        if months_ago in TRAVEL_MONTHS_AGO:
            amount = round(self.rng.uniform(*TRAVEL_RANGE), 2)
            self.transaction("Travel", "expense", amount, date(year, month, 14), self.rng.choice(TRAVEL_MERCHANTS))
        if months_ago == 1:
            self.transaction("Salary", "income", FREELANCE_INCOME, date(year, month, 12), "Freelance project")

    def budgets(self, year: int, month: int) -> None:
        for category, amount in BUDGETS.items():
            self.post(
                "/api/budgets/", {"category": self.categories[category], "amount": amount, "year": year, "month": month}
            )
        self.post("/api/budgets/", {"category": None, "amount": OVERALL_BUDGET, "year": year, "month": month})

    def subscriptions_and_recurring(self) -> None:
        start = self.today.replace(day=1)
        for name, amount, category in SUBSCRIPTIONS:
            self.post(
                "/api/subscriptions/",
                {
                    "name": name,
                    "amount": amount,
                    "category": self.categories[category],
                    "frequency": "monthly",
                    "start_date": start.isoformat(),
                },
            )
        for name, category, kind, amount in (
            ("Rent", "Housing", "expense", RENT),
            ("Salary", "Salary", "income", MONTHLY_SALARY),
        ):
            self.post(
                "/api/recurring-transactions/",
                {
                    "name": name,
                    "category": self.categories[category],
                    "type": kind,
                    "amount": f"{amount:.2f}",
                    "frequency": "monthly",
                    "start_date": start.isoformat(),
                },
            )

    def savings_goals(self) -> None:
        for name, target, saved, months_left in SAVINGS_GOALS:
            payload = {"name": name, "target_amount": target, "current_amount": saved}
            if months_left:
                year, month = shift_month(self.today.year, self.today.month, months_left)
                payload["target_date"] = date(year, month, 1).isoformat()
            self.post("/api/savings-goals/", payload)
