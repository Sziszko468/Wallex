from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications import services


class Command(BaseCommand):
    help = (
        "Sends upcoming-payment reminders and important insight notifications, then retries "
        "undelivered pushes. Idempotent (every event is deduplicated), so it is safe to run "
        "hourly from cron or the host's scheduler."
    )

    def handle(self, *args, **options):
        users = services.send_scheduled_notifications(timezone.localdate())
        retried = services.retry_undelivered()
        self.stdout.write(
            self.style.SUCCESS(f"Processed {users} user(s); retried {retried} undelivered notification(s).")
        )
