from django.core.exceptions import ValidationError


class MaximumLengthValidator:
    """Long passphrases are welcome, but not unbounded ones: hashing a multi-megabyte
    "password" on every sign-in attempt would be a cheap way to load the server."""

    def __init__(self, max_length: int = 128):
        self.max_length = max_length

    def validate(self, password, user=None):
        if len(password) > self.max_length:
            raise ValidationError(
                f"This password is too long. It must contain at most {self.max_length} characters.",
                code="password_too_long",
            )

    def get_help_text(self):
        return f"Your password must contain at most {self.max_length} characters."
