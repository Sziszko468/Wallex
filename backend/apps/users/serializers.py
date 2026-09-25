from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from apps.categories.defaults import create_default_categories

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    # max_length: the email is also stored as `username` (max 150 characters).
    email = serializers.EmailField(max_length=150)
    password = serializers.CharField(write_only=True, required=True)
    password_confirm = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "password", "password_confirm")

    def validate_email(self, value: str) -> str:
        # One account per address, whatever the letter case.
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        temp_user = User(
            email=attrs.get("email", ""),
            username=attrs.get("email", ""),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
        )
        try:
            validate_password(attrs["password"], user=temp_user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})

        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        user = User(username=validated_data["email"], **validated_data)
        user.set_password(password)
        with transaction.atomic():
            user.save()
            create_default_categories(user)
        return user


class SafeTokenRefreshSerializer(TokenRefreshSerializer):
    """simplejwt looks the token's user up with .get() — a deleted user would be a 500."""

    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except User.DoesNotExist as error:
            raise AuthenticationFailed(
                "No active account found for the given token.", "no_active_account"
            ) from error


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "date_joined")
        read_only_fields = fields
