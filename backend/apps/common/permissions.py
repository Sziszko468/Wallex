from rest_framework.permissions import BasePermission


class IsOwner(BasePermission):
    # Defense in depth on top of a user-scoped get_queryset(); only bites if that scoping is ever missing.
    def has_object_permission(self, request, view, obj):
        return obj.user_id == request.user.id
