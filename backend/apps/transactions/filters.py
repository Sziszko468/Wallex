import django_filters

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
