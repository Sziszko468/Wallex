"""The language model: Claude, through the official Anthropic SDK.

Everything provider-specific lives here — building the client, the request parameters, and
turning the SDK's errors into one AssistantError the rest of the app understands. Nothing here
logs question or answer text: only status codes, request ids and token counts.
"""

import logging

import anthropic
from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger(__name__)

# Beta flag of `fallbacks: "default"` (server-side re-run on the recommended fallback model).
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AssistantError(Exception):
    """No answer this time. The message is safe to show to the user."""


UNAVAILABLE = "The assistant is temporarily unavailable. Please try again in a moment."
BUSY = "The assistant is busy right now. Please try again in a minute."


def anthropic_client() -> anthropic.Anthropic:
    """The default AI_ASSISTANT["CLIENT"]. One retry: the user is waiting for the answer."""
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, max_retries=1)


def get_client():
    return import_string(settings.AI_ASSISTANT["CLIENT"])()


def create_message(client, *, system: list[dict], messages: list[dict], tools: list[dict], allow_tools: bool, timeout: float):
    """One model call. Returns the SDK's message; raises AssistantError on any API failure."""
    config = settings.AI_ASSISTANT
    params = {
        "model": config["MODEL"],
        "max_tokens": config["MAX_TOKENS"],
        "system": system,
        "messages": messages,
        # Always the same list (a changed tool list would invalidate the prompt cache);
        # "none" forbids further calls when the answer has to be given now.
        "tools": tools,
        "tool_choice": {"type": "auto" if allow_tools else "none"},
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": config["EFFORT"]},
        # Caches the growing conversation between tool rounds; the system prompt has its own breakpoint.
        "cache_control": {"type": "ephemeral"},
    }
    if config["FALLBACKS"]:
        params.update(betas=[FALLBACK_BETA], fallbacks="default")

    try:
        response = client.with_options(timeout=timeout).beta.messages.create(**params)
    except anthropic.RateLimitError as error:
        logger.warning("Assistant: rate limited by the model API (request id %s)", error.request_id)
        raise AssistantError(BUSY) from error
    except anthropic.APIStatusError as error:
        # 5xx / overloaded are Anthropic's side and pass; any other 4xx is a problem of ours
        # (key, model name, request shape) that needs fixing.
        level = logging.WARNING if error.status_code >= 500 else logging.ERROR
        logger.log(level, "Assistant: model API answered %s (request id %s)", error.status_code, error.request_id)
        raise AssistantError(UNAVAILABLE) from error
    except anthropic.APIConnectionError as error:  # network failure or timeout
        logger.warning("Assistant: model API unreachable (%s)", type(error).__name__)
        raise AssistantError(UNAVAILABLE) from error
    except anthropic.AnthropicError as error:  # e.g. missing credentials
        logger.error("Assistant: model client error (%s)", type(error).__name__)
        raise AssistantError(UNAVAILABLE) from error

    usage = response.usage
    logger.info(
        "Assistant: %s answered (stop=%s, input=%s, cache read=%s, output=%s)",
        response.model,
        response.stop_reason,
        usage.input_tokens,
        usage.cache_read_input_tokens,
        usage.output_tokens,
    )
    return response
