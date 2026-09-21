from rest_framework import serializers

from apps.categories.models import Category

from .models import Transaction


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            "id",
            "amount",
            "type",
            "category",
            "description",
            "date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["category"].queryset = Category.objects.filter(user=request.user)

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        tx_type = attrs.get("type", getattr(self.instance, "type", None))
        if category is not None and tx_type is not None and category.type != tx_type:
            raise serializers.ValidationError(
                {"type": "Transaction type must match the selected category's type."}
            )
        return attrs
