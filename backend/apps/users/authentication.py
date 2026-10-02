import uuid

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.settings import api_settings

from .models import UserSession
from .sessions import SESSION_CLAIM


class SessionJWTAuthentication(JWTAuthentication):
    """A valid signature is not enough: the token's session must still be active.

    Signing a device out (or out everywhere, or a detected token theft) therefore locks its
    access token out on the very next request instead of up to 15 minutes later. The session
    and its user come from one query — the same single query plain JWT authentication makes
    for the user — so every request costs exactly what it did before.
    """

    def get_user(self, validated_token):
        try:
            user_id = validated_token[api_settings.USER_ID_CLAIM]
            key = uuid.UUID(str(validated_token[SESSION_CLAIM]))
        except (KeyError, ValueError) as error:
            # Tokens from before sessions existed carry no `sid`: one new sign-in, then all is well.
            raise InvalidToken(_("Token is not tied to a session. Please sign in again.")) from error

        session = (
            UserSession.objects.select_related("user")
            .filter(key=key, revoked_at__isnull=True, expires_at__gt=timezone.now())
            .first()
        )
        if session is None or str(session.user_id) != str(user_id):
            raise AuthenticationFailed(_("This session has ended. Please sign in again."), code="session_ended")
        if not session.user.is_active:
            raise AuthenticationFailed(_("User is inactive"), code="user_inactive")
        return session.user
