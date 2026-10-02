"""The texts of the achievement catalog, marked for translation.

The catalog itself is data (the rows seeded by migration 0002_seed_achievements), so
`makemessages` can't see its names and descriptions. They are listed here once so it can; the
serializer then translates what the database holds at read time with `gettext(achievement.name)`.
A test checks that every catalog row has a Hungarian translation.
"""

from django.utils.translation import gettext_noop as _

CATALOG_TEXTS = (
    _("First Transaction"),
    _("Record your first transaction."),
    _("7 Day Tracking Streak"),
    _("Record transactions on 7 days in a row."),
    _("30 Day Tracking Streak"),
    _("Record transactions on 30 days in a row."),
    _("First €100 Saved"),
    _("Have €100 in your savings goals."),
    _("€1,000 Saved"),
    _("Have €1,000 in your savings goals."),
    _("Completed Savings Goal"),
    _("Reach the target of a savings goal."),
    _("Stayed Under Budget"),
    _("Finish a month without going over a budget."),
)
