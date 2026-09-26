import django_filters
from rest_framework.filters import OrderingFilter

from apps.categories.models import Category

from .models import Transaction


class TransactionFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    category_name = django_filters.CharFilter(field_name="category__name", lookup_expr="iexact")

    class Meta:
        model = Transaction
        fields = ["type", "category"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.request is not None:
            self.filters["category"].queryset = Category.objects.filter(user=self.request.user)


class StableOrderingFilter(OrderingFilter):
    """Always ends the ordering with the primary key, so every order is a total order.

    Page-number pagination slices the result with LIMIT/OFFSET. With only
    `-date` (what the clients send), transactions on the same date come back in
    an arbitrary order on each query, so page boundaries repeat some rows and
    skip others. The id tie-breaker makes every page slice the same sequence.
    """

    def get_ordering(self, request, queryset, view):
        ordering = list(super().get_ordering(request, queryset, view) or [])
        if not any(field.lstrip("-") in ("id", "pk") for field in ordering):
            ordering.append("-id")
        return ordering
