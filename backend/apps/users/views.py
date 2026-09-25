from rest_framework import generics, permissions, status
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import RegisterSerializer, UserSerializer


# Public auth endpoints are rate-limited per client IP against brute force and
# credential stuffing (rates: DEFAULT_THROTTLE_RATES in settings).
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_register"


class LoginView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"


class RefreshView(TokenRefreshView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_refresh"


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            token = RefreshToken(refresh_token)
        except TokenError:
            return Response(
                {"detail": "Invalid or expired refresh token."}, status=status.HTTP_400_BAD_REQUEST
            )
        # Only the caller's own session can be revoked; same response as an
        # invalid token, so it doesn't reveal whose token it was.
        if str(token.get("user_id")) != str(request.user.pk):
            return Response(
                {"detail": "Invalid or expired refresh token."}, status=status.HTTP_400_BAD_REQUEST
            )
        token.blacklist()
        return Response({"detail": "Logged out successfully."}, status=status.HTTP_200_OK)
