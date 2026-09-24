"""Minimal client for the Expo push service (https://docs.expo.dev/push-notifications/sending-notifications/).

Uses only the standard library so no extra HTTP dependency is needed for a
single POST endpoint.
"""

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass

from django.conf import settings

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_MESSAGES_PER_REQUEST = 100
REQUEST_TIMEOUT_SECONDS = 10

EXPO_PUSH_TOKEN_PATTERN = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$")

DEVICE_NOT_REGISTERED = "DeviceNotRegistered"


class PushServiceError(Exception):
    """The whole request failed (network, HTTP error, malformed response) — safe to retry later."""


@dataclass(frozen=True)
class PushTicket:
    ok: bool
    ticket_id: str | None = None
    error: str | None = None
    message: str = ""


def is_expo_push_token(value: str) -> bool:
    return bool(EXPO_PUSH_TOKEN_PATTERN.match(value))


def _to_ticket(item: dict) -> PushTicket:
    if item.get("status") == "ok":
        return PushTicket(ok=True, ticket_id=item.get("id"))
    details = item.get("details") or {}
    return PushTicket(ok=False, error=details.get("error"), message=item.get("message", ""))


def _send_batch(messages: list[dict]) -> list[PushTicket]:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if settings.EXPO_PUSH_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.EXPO_PUSH_ACCESS_TOKEN}"
    request = urllib.request.Request(
        EXPO_PUSH_URL, data=json.dumps(messages).encode(), headers=headers, method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise PushServiceError(f"Expo push service returned HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        raise PushServiceError(f"Could not reach the Expo push service: {error}") from error

    if payload.get("errors"):
        codes = ", ".join(str(err.get("code", "UNKNOWN")) for err in payload["errors"])
        raise PushServiceError(f"Expo push service rejected the request: {codes}")

    tickets = payload.get("data")
    if not isinstance(tickets, list) or len(tickets) != len(messages):
        raise PushServiceError("Unexpected response from the Expo push service")
    return [_to_ticket(item) for item in tickets]


def send_push_messages(messages: list[dict]) -> list[PushTicket]:
    """Sends the messages and returns one ticket per message, in the same order."""
    tickets: list[PushTicket] = []
    for start in range(0, len(messages), MAX_MESSAGES_PER_REQUEST):
        tickets.extend(_send_batch(messages[start : start + MAX_MESSAGES_PER_REQUEST]))
    return tickets
