from django.db import migrations


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("transactions", "0005_recurring_currency_subscription"),
    ]

    operations = [
        # A proxy: no table, only the recurring transactions with is_subscription=True.
        migrations.CreateModel(
            name="Subscription",
            fields=[],
            options={
                "ordering": ["-is_active", "name", "id"],
                "proxy": True,
                "indexes": [],
                "constraints": [],
            },
            bases=("transactions.recurringtransaction",),
        ),
    ]
