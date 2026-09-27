from rest_framework import serializers


class ResourceStateSerializer(serializers.Serializer):
    count = serializers.IntegerField(help_text="How many of these objects the user has.")
    last_modified = serializers.DateTimeField(
        allow_null=True, help_text="When the last one was created or changed (server clock); `null` while there are none."
    )


class SyncResourcesSerializer(serializers.Serializer):
    transactions = ResourceStateSerializer()
    categories = ResourceStateSerializer()
    budgets = ResourceStateSerializer()
    recurring_transactions = ResourceStateSerializer(help_text="Subscriptions included.")
    savings_goals = ResourceStateSerializer()


class SyncStatusSerializer(serializers.Serializer):
    version = serializers.CharField(
        help_text="Fingerprint of all the user's data. Reload your views when it differs from the last one you saw."
    )
    server_time = serializers.DateTimeField(help_text="The server's clock, for display (\"synced 2 min ago\").")
    resources = SyncResourcesSerializer()
