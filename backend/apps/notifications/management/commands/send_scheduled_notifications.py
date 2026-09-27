from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications import rules, services


class Command(BaseCommand):
    help = (
        "Runs the scheduled notification rules for every active user (payment reminders, unusual "
        "spending, monthly summary, important insights), then retries undelivered pushes. "
        "Idempotent (every event is deduplicated), so it is safe to run hourly from cron or the "
        "host's scheduler."
    )

    def handle(self, *args, **options):
        users = rules.run_scheduled_rules(timezone.localdate())
        retried = services.retry_undelivered()
        self.stdout.write(
            self.style.SUCCESS(f"Processed {users} user(s); retried {retried} undelivered notification(s).")
        )
