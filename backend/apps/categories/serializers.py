from rest_framework import serializers

from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "type", "color", "icon", "is_system", "created_at", "updated_at"]
        read_only_fields = ["id", "is_system", "created_at", "updated_at"]
        extra_kwargs = {
            "name": {"help_text": "Unique per user and type, ignoring letter case."},
            "type": {"help_text": "Transactions in this category must have the same type."},
            "color": {"help_text": "Hex colour `#RRGGBB`, used in charts. Default `#6366F1`."},
            "icon": {"help_text": "Optional icon name for the clients."},
            "is_system": {"help_text": "True for the 10 defaults created at registration: they can't be changed or deleted."},
        }

    def validate_type(self, value: str) -> str:
        # Transactions, recurring items and budgets store or assume the category's type;
        # switching it under them would leave them inconsistent.
        category = self.instance
        if category is not None and value != category.type and (
            category.transactions.exists()
            or category.recurring_transactions.exists()
            or category.budgets.exists()
        ):
            raise serializers.ValidationError(
                "This category is already in use, so its type can't change. Create a new category instead."
            )
        return value

    def validate(self, attrs):
        request = self.context["request"]
        name = attrs.get("name", getattr(self.instance, "name", None))
        category_type = attrs.get("type", getattr(self.instance, "type", None))
        queryset = Category.objects.filter(user=request.user, name__iexact=name, type=category_type)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                {"name": "You already have a category with this name and type."}
            )
        return attrs
