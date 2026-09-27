"""The achievement catalog. A new achievement on an existing rule (say, a 100-day streak or
€5,000 saved) is one more row here — no code change."""

from decimal import Decimal

from django.db import migrations

CATALOG = [
    # code, name, description, icon, category, rule, unit, target, target currency
    ("first_transaction", "First Transaction", "Record your first transaction.", "🧾",
     "tracking", "first_transaction", "count", "1", None),
    ("streak_7", "7 Day Tracking Streak", "Record transactions on 7 days in a row.", "🔥",
     "tracking", "tracking_streak", "days", "7", None),
    ("streak_30", "30 Day Tracking Streak", "Record transactions on 30 days in a row.", "🔥",
     "tracking", "tracking_streak", "days", "30", None),
    ("saved_100", "First €100 Saved", "Have €100 in your savings goals.", "💰",
     "saving", "savings_total", "money", "100", "EUR"),
    ("saved_1000", "€1,000 Saved", "Have €1,000 in your savings goals.", "🏆",
     "saving", "savings_total", "money", "1000", "EUR"),
    ("goal_completed", "Completed Savings Goal", "Reach the target of a savings goal.", "🏁",
     "saving", "goal_completed", "count", "1", None),
    ("stayed_under_budget", "Stayed Under Budget", "Finish a month without going over a budget.", "🎯",
     "budgeting", "budget_kept", "count", "1", None),
]


def seed(apps, schema_editor):
    Achievement = apps.get_model("analytics", "Achievement")
    for order, (code, name, description, icon, category, rule, unit, target, currency) in enumerate(CATALOG, 1):
        Achievement.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "description": description,
                "icon": icon,
                "category": category,
                "rule": rule,
                "unit": unit,
                "target": Decimal(target),
                "target_currency": currency,
                "sort_order": order * 10,
            },
        )


def unseed(apps, schema_editor):
    apps.get_model("analytics", "Achievement").objects.filter(code__in=[row[0] for row in CATALOG]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("analytics", "0001_achievements"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
