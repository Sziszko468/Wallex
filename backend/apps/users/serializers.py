from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from apps.categories.defaults import create_default_categories
from apps.currencies.rates import ConversionError
from apps.currencies.services import change_base_currency

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    # max_length: the email is also stored as `username` (max 150 characters).
    email = serializers.EmailField(max_length=150, help_text="Login name. Stored lower-cased; unique.")
    password = serializers.CharField(
        write_only=True, required=True, help_text="At least 8 characters, not common, not only digits."
    )
    password_confirm = serializers.CharField(write_only=True, required=True, help_text="Must equal `password`.")

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "password", "password_confirm")
        extra_kwargs = {
            "first_name": {"help_text": "Optional. Shown in the apps' greeting."},
            "last_name": {"help_text": "Optional."},
        }

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
        fields = ("id", "email", "first_name", "last_name", "date_joined", "base_currency")
        read_only_fields = ("id", "email", "first_name", "last_name", "date_joined")
        extra_kwargs = {
            "date_joined": {"help_text": "Registration time (UTC)."},
            "base_currency": {
                "help_text": (
                    "Currency of every total and budget. Changing it converts the user's data "
                    "(see `PATCH /api/auth/me/`)."
                )
            },
        }

    def update(self, instance, validated_data):
        new_base = validated_data.get("base_currency")
        if new_base is not None:
            try:
                change_base_currency(instance, new_base)
            except ConversionError as error:
                raise serializers.ValidationError({"base_currency": [str(error)]}) from error
        return instance
