import django_filters

from .models import Notification, NotificationKind


class NotificationFilter(django_filters.FilterSet):
    is_read = django_filters.BooleanFilter(method="filter_is_read", label="`false`: unread only, `true`: read only.")
    kind = django_filters.ChoiceFilter(choices=NotificationKind.choices, label="Only this kind of notification.")

    class Meta:
        model = Notification
        fields = ["is_read", "kind"]

    def filter_is_read(self, queryset, name, value):
        return queryset.filter(read_at__isnull=not value)
