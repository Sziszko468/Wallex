from datetime import timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.users.models import AuditEvent, UserSession

# How long security records are kept. Failed sign-ins for addresses without an account are
# only useful for the 15-minute lockout and short investigations.
AUDIT_RETENTION = timedelta(days=365)
ANONYMOUS_ATTEMPT_RETENTION = timedelta(days=30)
ENDED_SESSION_RETENTION = timedelta(days=90)


class Command(BaseCommand):
    help = (
        "Deletes security records past their retention: audit events after 365 days (sign-in "
        "attempts for unknown addresses after 30), ended sessions after 90 days, and expired JWT "
        "bookkeeping rows. Run daily from cron."
    )

    def handle(self, *args, **options):
        now = timezone.now()
        events, _ = AuditEvent.objects.filter(
            Q(created_at__lt=now - AUDIT_RETENTION)
            | Q(user__isnull=True, created_at__lt=now - ANONYMOUS_ATTEMPT_RETENTION)
        ).delete()
        ended, _ = UserSession.objects.filter(
            Q(revoked_at__lt=now - ENDED_SESSION_RETENTION) | Q(expires_at__lt=now - ENDED_SESSION_RETENTION)
        ).delete()
        call_command("flushexpiredtokens", verbosity=0)
        self.stdout.write(self.style.SUCCESS(f"Deleted {events} audit event(s) and {ended} ended session(s)."))
