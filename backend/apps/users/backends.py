from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

UserModel = get_user_model()


class CaseInsensitiveEmailBackend(ModelBackend):
    """Email login regardless of letter case ("Anna@X.com" == "anna@x.com")."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        email = kwargs.get(UserModel.USERNAME_FIELD, username)
        if email is None or password is None:
            return None
        try:
            user = UserModel._default_manager.get(email__iexact=email.strip())
        except UserModel.DoesNotExist:
            # Hash anyway, so the response time doesn't reveal whether the account exists.
            UserModel().set_password(password)
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
