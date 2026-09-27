from django.db import migrations, models
from django.db.models import OuterRef, Subquery


def bill_in_base_currency(apps, schema_editor):
    """Until now a recurring amount was in the user's base currency: make that its billing currency."""
    RecurringTransaction = apps.get_model("transactions", "RecurringTransaction")
    User = apps.get_model("users", "User")
    RecurringTransaction.objects.update(
        currency=Subquery(User.objects.filter(pk=OuterRef("user_id")).values("base_currency")[:1])
    )


class Migration(migrations.Migration):

    dependencies = [
        ("transactions", "0004_transaction_currency"),
        ("users", "0004_user_base_currency"),
    ]

    operations = [
        migrations.AddField(
            model_name="recurringtransaction",
            name="currency",
            field=models.CharField(
                choices=[
                    ("EUR", "Euro"),
                    ("HUF", "Hungarian forint"),
                    ("USD", "US dollar"),
                    ("GBP", "British pound"),
                    ("JPY", "Japanese yen"),
                    ("CHF", "Swiss franc"),
                ],
                default="EUR",
                max_length=3,
            ),
        ),
        migrations.AddField(
            model_name="recurringtransaction",
            name="merchant",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="recurringtransaction",
            name="is_subscription",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(bill_in_base_currency, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="recurringtransaction",
            constraint=models.CheckConstraint(
                condition=models.Q(("is_subscription", False), ("type", "expense"), _connector="OR"),
                name="recurring_subscription_is_expense",
            ),
        ),
    ]
