"""Where the refresh token travels: in the JSON body (mobile apps) or in an HttpOnly cookie (browsers).

A browser client sends `X-Auth-Transport: cookie`. Its refresh token is then set as an
HttpOnly, SameSite=Strict cookie scoped to /api/auth/ and never appears in a response body,
so JavaScript — including an injected script — can't read or steal it. The access token
lives only in the page's memory.

CSRF: the cookie is only read when that custom header is present. A cross-site form can't
send custom headers, and a cross-origin script would need a CORS preflight, which only the
allow-listed origins pass. SameSite=Strict keeps other sites from sending the cookie at all.

The mobile apps keep the refresh token in the Keychain / Keystore and send it in the body.
"""

from http import HTTPStatus

from django.conf import settings
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

TRANSPORT_HEADER = "X-Auth-Transport"
COOKIE_TRANSPORT = "cookie"


def uses_cookie(request) -> bool:
    return request.headers.get(TRANSPORT_HEADER, "").strip().lower() == COOKIE_TRANSPORT


def refresh_token_of(request) -> str | None:
    body = request.data.get("refresh") if hasattr(request.data, "get") else None
    if body:
        return str(body)
    if uses_cookie(request):
        return request.COOKIES.get(settings.AUTH_REFRESH_COOKIE["NAME"]) or None
    return None


def set_refresh_cookie(response: Response, refresh: RefreshToken) -> None:
    config = settings.AUTH_REFRESH_COOKIE
    response.set_cookie(
        config["NAME"],
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=config["PATH"],
        secure=config["SECURE"],
        httponly=True,
        samesite=config["SAMESITE"],
    )


def clear_refresh_cookie(response: Response) -> None:
    config = settings.AUTH_REFRESH_COOKIE
    response.delete_cookie(config["NAME"], path=config["PATH"], samesite=config["SAMESITE"])


def token_response(request, refresh: RefreshToken, status: int = HTTPStatus.OK) -> Response:
    """{"access", "refresh"} for apps; {"access"} + the HttpOnly cookie for browsers."""
    data = {"access": str(refresh.access_token)}
    if not uses_cookie(request):
        data["refresh"] = str(refresh)
        return Response(data, status=status)
    response = Response(data, status=status)
    set_refresh_cookie(response, refresh)
    return response
