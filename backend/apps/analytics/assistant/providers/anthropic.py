"""Claude, through the official Anthropic SDK (the `anthropic` provider).

Everything Claude-specific lives here: the request parameters (adaptive thinking, effort, prompt
caching, server-side fallbacks), the message format, and turning the SDK's errors into one
AssistantError.
"""

import logging
from collections.abc import Sequence
from http import HTTPStatus

import anthropic
from django.conf import settings

from .base import (
    BUSY,
    UNAVAILABLE,
    AIProvider,
    AssistantError,
    FinishReason,
    Message,
    ModelResponse,
    SystemPrompt,
    ToolCall,
    ToolSpec,
    Usage,
)

logger = logging.getLogger(__name__)

# Beta flag of `fallbacks: "default"` (server-side re-run on the recommended fallback model).
FALLBACK_BETA = "server-side-fallback-2026-07-01"


def anthropic_client() -> anthropic.Anthropic:
    """The default client. One retry: the user is waiting for the answer."""
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, max_retries=1)


def _wire_message(message: Message) -> dict:
    if message.tool_results:
        # All results of one model turn go back in one message.
        return {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": output.call_id,
                    "content": output.content,
                    "is_error": output.is_error,
                }
                for output in message.tool_results
            ],
        }
    # The model's own turn goes back unchanged (thinking blocks included) when we have it.
    return {"role": message.role, "content": message.native if message.native is not None else message.text}


class AnthropicProvider(AIProvider):
    name = "anthropic"

    @property
    def client(self):
        if self._client is None:
            self._client = anthropic_client()
        return self._client

    def generate_response(
        self,
        *,
        system: SystemPrompt,
        messages: Sequence[Message],
        tools: Sequence[ToolSpec],
        allow_tools: bool,
        timeout: float,
    ) -> ModelResponse:
        config = settings.AI_ASSISTANT
        params = {
            "model": config["MODEL"],
            "max_tokens": config["MAX_TOKENS"],
            "system": [
                # Cache breakpoint: tools + this block are the same for everyone.
                {"type": "text", "text": system.stable, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": system.per_request},
            ],
            "messages": [_wire_message(message) for message in messages],
            # Always the same list (a changed tool list would invalidate the prompt cache);
            # "none" forbids further calls when the answer has to be given now.
            "tools": [
                {"name": tool.name, "description": tool.description, "input_schema": tool.input_schema}
                for tool in tools
            ],
            "tool_choice": {"type": "auto" if allow_tools else "none"},
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": config["EFFORT"]},
            # Caches the growing conversation between tool rounds; the system prompt has its own breakpoint.
            "cache_control": {"type": "ephemeral"},
        }
        if config["FALLBACKS"]:
            params.update(betas=[FALLBACK_BETA], fallbacks="default")

        try:
            response = self.client.with_options(timeout=timeout).beta.messages.create(**params)
        except anthropic.RateLimitError as error:
            logger.warning("Assistant: rate limited by the model API (request id %s)", error.request_id)
            raise AssistantError(BUSY) from error
        except anthropic.APIStatusError as error:
            # 5xx / overloaded are Anthropic's side and pass; any other 4xx is a problem of ours
            # (key, model name, request shape) that needs fixing.
            level = logging.WARNING if error.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR else logging.ERROR
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
        return self._to_response(response)

    @staticmethod
    def _to_response(response) -> ModelResponse:
        text = "\n\n".join(block.text for block in response.content if block.type == "text").strip()
        calls = tuple(
            ToolCall(id=block.id, name=block.name, arguments=block.input)
            for block in response.content
            if block.type == "tool_use"
        )
        if response.stop_reason == "refusal":
            finish = FinishReason.REFUSED
        elif response.stop_reason == "max_tokens":
            finish = FinishReason.MAX_TOKENS
        elif calls:
            finish = FinishReason.TOOL_CALLS
        elif response.stop_reason in ("end_turn", "stop_sequence"):
            finish = FinishReason.STOP
        else:
            finish = FinishReason.OTHER

        usage = response.usage
        return ModelResponse(
            message=Message("assistant", text=text, tool_calls=calls, native=response.content),
            finish=finish,
            usage=Usage(
                input_tokens=(usage.input_tokens or 0)
                + (usage.cache_read_input_tokens or 0)
                + (usage.cache_creation_input_tokens or 0),
                output_tokens=usage.output_tokens or 0,
            ),
        )
