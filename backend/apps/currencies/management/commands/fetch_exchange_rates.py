from django.core.management.base import BaseCommand, CommandError

from apps.currencies import ecb, services


class Command(BaseCommand):
    help = (
        "Downloads the ECB euro reference rates of the supported currencies and stores them. "
        "Idempotent: run it daily after 16:00 CET, and once with --period all to load the history."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--period",
            choices=list(ecb.PERIOD_URLS),
            default="latest",
            help="latest: the last publication (default); 90d: the last 90 days; all: everything since 1999.",
        )

    def handle(self, *args, **options):
        try:
            rates = ecb.fetch(options["period"])
        except ecb.EcbError as error:
            raise CommandError(str(error)) from error

        stored = services.store_rates(rates)
        days = sorted({rate.day for rate in rates})
        self.stdout.write(
            self.style.SUCCESS(f"Stored {stored} rate(s) for {len(days)} day(s), {days[0]} to {days[-1]}.")
        )
