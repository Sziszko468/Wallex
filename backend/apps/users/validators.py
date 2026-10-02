from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

DEFAULT_MAX_LENGTH = 128  # settings.AUTH_PASSWORD_VALIDATORS passes the real limit


class MaximumLengthValidator:
    """Long passphrases are welcome, but not unbounded ones: hashing a multi-megabyte
    "password" on every sign-in attempt would be a cheap way to load the server."""

    def __init__(self, max_length: int = DEFAULT_MAX_LENGTH):
        self.max_length = max_length

    def validate(self, password, user=None):
        if len(password) > self.max_length:
            raise ValidationError(
                _("This password is too long. It must contain at most %(max_length)s characters.")
                % {"max_length": self.max_length},
                code="password_too_long",
            )

    def get_help_text(self):
        return _("Your password must contain at most %(max_length)s characters.") % {"max_length": self.max_length}
