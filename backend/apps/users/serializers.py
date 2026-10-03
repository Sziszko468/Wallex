from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.categories.defaults import create_default_categories
from apps.common.i18n import DEFAULT_CURRENCY_OF_LANGUAGE, active_language
from apps.currencies.rates import ConversionError
from apps.currencies.services import change_base_currency

from .models import AUDIT_CATEGORIES, AuditCategory, AuditEvent, UserSession

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    # max_length: the email is also stored as `username` (max 150 characters).
    email = serializers.EmailField(max_length=150, help_text="Login name. Stored lower-cased; unique.")
    password = serializers.CharField(
        write_only=True,
        required=True,
        help_text="12–128 characters, not a common password, not only digits, not similar to the email or name.",
    )
    password_confirm = serializers.CharField(write_only=True, required=True, help_text="Must equal `password`.")
    language = serializers.ChoiceField(
        choices=settings.LANGUAGES,
        required=False,
        help_text=(
            "Interface language of the new account. Defaults to the language of the request (`Accept-Language`). "
            "A Hungarian account starts with HUF as its base currency, any other with EUR; it can be changed later."
        ),
    )

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "language", "password", "password_confirm")
        extra_kwargs = {
            "first_name": {"help_text": "Optional. Shown in the apps' greeting."},
            "last_name": {"help_text": "Optional."},
        }

    def validate_email(self, value: str) -> str:
        # One account per address, whatever the letter case.
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(_("A user with this email already exists."))
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": _("Passwords do not match.")})

        temp_user = User(
            email=attrs.get("email", ""),
            username=attrs.get("email", ""),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
        )
        try:
            validate_password(attrs["password"], user=temp_user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc

        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        validated_data.setdefault("language", active_language())
        base_currency = DEFAULT_CURRENCY_OF_LANGUAGE.get(
            validated_data["language"], User._meta.get_field("base_currency").default
        )
        user = User(username=validated_data["email"], base_currency=base_currency, **validated_data)
        user.set_password(password)
        with transaction.atomic():
            user.save()
            create_default_categories(user)
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "date_joined", "base_currency", "language")
        read_only_fields = ("id", "email", "first_name", "last_name", "date_joined")
        extra_kwargs = {
            "date_joined": {"help_text": "Registration time (UTC)."},
            "language": {
                "help_text": (
                    "Interface language (`en` or `hu`). The apps keep it in step with the language the user picks; "
                    "notifications and the assistant use it too."
                )
            },
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
        language = validated_data.get("language")
        if language is not None and language != instance.language:
            instance.language = language
            instance.save(update_fields=["language"])
        return instance


def check_new_password(password: str, user) -> None:
    """The password policy (AUTH_PASSWORD_VALIDATORS) as a DRF validation error."""
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc


# --- Signing in ----------------------------------------------------------------------------


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254, help_text="Case-insensitive.")
    password = serializers.CharField(write_only=True, max_length=4096, trim_whitespace=False)


class MfaLoginSerializer(serializers.Serializer):
    mfa_token = serializers.CharField(max_length=512, help_text="From the `POST /api/auth/login/` answer.")
    code = serializers.CharField(
        max_length=32, help_text="6-digit code from the authenticator app, or an unused recovery code."
    )


class RefreshRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(
        required=False,
        help_text="The current refresh token (apps). Browsers leave it out: theirs is in an HttpOnly cookie.",
    )


# --- Account security -------------------------------------------------------------------------


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, max_length=4096, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, max_length=4096, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError(_("Wrong password."))
        return value

    def validate_new_password(self, value):
        check_new_password(value, self.context["request"].user)
        return value

    def validate(self, attrs):
        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError({"new_password": [_("Choose a password you haven't used here.")]})
        return attrs


class PasswordConfirmationSerializer(serializers.Serializer):
    """Sensitive changes need the password again, so a borrowed signed-in device isn't enough."""

    password = serializers.CharField(write_only=True, max_length=4096, trim_whitespace=False)

    def validate_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError(_("Wrong password."))
        return value


class MfaCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32, help_text="6-digit code from the authenticator app.")


class PasswordAndCodeSerializer(PasswordConfirmationSerializer):
    code = serializers.CharField(max_length=32, help_text="Authenticator code or an unused recovery code.")


class SessionSerializer(serializers.ModelSerializer):
    current = serializers.SerializerMethodField(help_text="The session this request was made with.")

    class Meta:
        model = UserSession
        fields = ["id", "platform", "user_agent", "ip_address", "created_at", "last_used_at", "expires_at", "current"]
        extra_kwargs = {
            "platform": {"help_text": "`web`, `ios`, `android` or `unknown`."},
            "user_agent": {"help_text": "Browser or app, as it identified itself."},
            "ip_address": {"help_text": "Address of the last token refresh."},
            "created_at": {"help_text": "When the user signed in on this device."},
            "last_used_at": {"help_text": "Last token refresh (at most ~15 minutes behind real use)."},
            "expires_at": {"help_text": "After this the device must sign in again."},
        }

    def get_current(self, session) -> bool:
        return str(session.key) == str(self.context.get("current_session_key"))


class AuditEventSerializer(serializers.ModelSerializer):
    description = serializers.CharField(source="get_action_display", help_text="Human-readable action.")
    category = serializers.SerializerMethodField(help_text="`login`, `account` or `data`.")

    class Meta:
        model = AuditEvent
        fields = ["id", "action", "description", "category", "ip_address", "user_agent", "metadata", "created_at"]
        extra_kwargs = {
            "metadata": {"help_text": 'Details of the event, e.g. `{"method": "totp"}` or the deleted object.'},
        }

    @extend_schema_field(serializers.ChoiceField(choices=AuditCategory.choices))
    def get_category(self, event) -> str:
        return next(category for category, actions in AUDIT_CATEGORIES.items() if event.action in actions)
