from rest_framework import serializers

from apps.categories.models import Category

from .models import RecurringTransaction, Transaction


class TransactionSerializer(serializers.ModelSerializer):
    # Optional idempotency key (see Transaction.client_id); settable on create only.
    client_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="Optional idempotency key (UUID) chosen by the client. Only settable on create.",
    )

    class Meta:
        model = Transaction
        fields = [
            "id",
            "amount",
            "type",
            "category",
            "description",
            "date",
            "client_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "amount": {"help_text": "Positive, max 2 decimals (decimal string, e.g. `\"45.90\"`)."},
            "type": {"help_text": "Must equal the category's type."},
            "category": {"help_text": "Id of one of the user's categories."},
            "description": {"help_text": "Optional free text, max 255 characters."},
            "date": {"help_text": "Booking date (`YYYY-MM-DD`)."},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(user=request.user)
        if self.instance is not None:
            self.fields["client_id"].read_only = True

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        tx_type = attrs.get("type", getattr(self.instance, "type", None))
        if category is not None and tx_type is not None and category.type != tx_type:
            raise serializers.ValidationError(
                {"type": "Transaction type must match the selected category's type."}
            )
        return attrs


class RecurringTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringTransaction
        fields = [
            "id",
            "name",
            "category",
            "type",
            "amount",
            "frequency",
            "start_date",
            "end_date",
            "next_occurrence_date",
            "is_active",
            "description",
            "created_at",
            "updated_at",
        ]
        # next_occurrence_date is internal scheduling state, not a user input:
        # it's derived from start_date on create, and re-derived only when
        # start_date itself changes (see update() below). A future
        # generation job will be the other thing that ever advances it.
        read_only_fields = ["id", "next_occurrence_date", "created_at", "updated_at"]
        extra_kwargs = {
            "name": {"help_text": "Short label, e.g. `Rent`."},
            "category": {"help_text": "Id of one of the user's categories; its type must equal `type`."},
            "amount": {"help_text": "Amount per occurrence: positive, max 2 decimals."},
            "frequency": {"help_text": "How often it repeats, counted from `start_date`."},
            "start_date": {"help_text": "First occurrence."},
            "end_date": {"help_text": "Last possible occurrence (inclusive); `null` = no end."},
            "next_occurrence_date": {"help_text": "Scheduling state: starts at `start_date`, reset when `start_date` changes."},
            "is_active": {"help_text": "`false` pauses reminders and excludes the template from insights."},
            "description": {"help_text": "Optional free text."},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(user=request.user)

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        tx_type = attrs.get("type", getattr(self.instance, "type", None))
        if category is not None and tx_type is not None and category.type != tx_type:
            raise serializers.ValidationError(
                {"type": "Recurring transaction type must match the selected category's type."}
            )

        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if end_date is not None and start_date is not None and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "End date must be on or after the start date."}
            )

        return attrs

    def create(self, validated_data):
        validated_data["next_occurrence_date"] = validated_data["start_date"]
        return super().create(validated_data)

    def update(self, instance, validated_data):
        new_start_date = validated_data.get("start_date")
        if new_start_date is not None and new_start_date != instance.start_date:
            validated_data["next_occurrence_date"] = new_start_date
        return super().update(instance, validated_data)
