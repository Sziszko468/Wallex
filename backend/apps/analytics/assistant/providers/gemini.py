"""Google Gemini, through the official `google-genai` SDK (the `gemini` provider).

Stateless on purpose: every call carries the whole conversation (the server owns the history),
and `generateContent` — unlike Gemini's stateful Interactions API — keeps nothing on Google's
side. The API key is read from the settings (GEMINI_API_KEY) and never leaves the server.
"""

import json
import logging
from collections.abc import Sequence
from http import HTTPStatus

from django.conf import settings
from google import genai
from google.genai import errors, types

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

MILLISECONDS = 1000
# One retry, only for Google-side failures: the user is waiting, and a 429 would just fail again.
RETRY = types.HttpRetryOptions(attempts=2, http_status_codes=[500, 502, 503, 504])
# AI_ASSISTANT["EFFORT"] -> how many thinking tokens the model may spend. Anything else sends no
# thinking setting (the model's own default), e.g. EFFORT= for a model without thinking levels.
THINKING_LEVELS = {
    "minimal": types.ThinkingLevel.MINIMAL,
    "low": types.ThinkingLevel.LOW,
    "medium": types.ThinkingLevel.MEDIUM,
    "high": types.ThinkingLevel.HIGH,
}
# Declined by a safety filter or a policy: the user gets the polite refusal, never partial text.
REFUSED_FINISH_REASONS = {
    types.FinishReason.SAFETY,
    types.FinishReason.BLOCKLIST,
    types.FinishReason.PROHIBITED_CONTENT,
    types.FinishReason.SPII,
    types.FinishReason.RECITATION,
}
# Gemini may omit the id of a function call; we then make one up (never sent back to Gemini).
SYNTHETIC_ID_PREFIX = "call-"


def gemini_client() -> genai.Client:
    """The default client (swappable through AI_ASSISTANT["CLIENT"])."""
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def _function_response(output) -> types.Part:
    # Tool results are always JSON objects; errors already look like {"error": ...}.
    body = json.loads(output.content)
    call_id = None if output.call_id.startswith(SYNTHETIC_ID_PREFIX) else output.call_id
    return types.Part(function_response=types.FunctionResponse(id=call_id, name=output.name, response=body))


def _wire_message(message: Message) -> types.Content:
    if message.tool_results:
        return types.Content(role="user", parts=[_function_response(output) for output in message.tool_results])
    if message.native is not None:
        # The model's own turn goes back unchanged: Gemini 3 refuses a function call whose
        # thought signature is missing.
        return message.native
    role = "model" if message.role == "assistant" else "user"
    return types.Content(role=role, parts=[types.Part(text=message.text)])


class GeminiProvider(AIProvider):
    name = "gemini"

    @property
    def client(self):
        if self._client is None:
            self._client = gemini_client()
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
        mode = types.FunctionCallingConfigMode.AUTO if allow_tools else types.FunctionCallingConfigMode.NONE
        thinking = THINKING_LEVELS.get(str(config["EFFORT"]).lower())
        request_config = types.GenerateContentConfig(
            system_instruction=f"{system.stable}\n\n{system.per_request}",
            max_output_tokens=config["MAX_TOKENS"],
            # Always the same list; NONE forbids further calls when the answer has to be given now.
            tools=[
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=tool.name, description=tool.description, parameters_json_schema=tool.input_schema
                        )
                        for tool in tools
                    ]
                )
            ],
            tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode=mode)),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),  # tools run in engine.py
            thinking_config=types.ThinkingConfig(thinking_level=thinking) if thinking else None,
            http_options=types.HttpOptions(timeout=int(timeout * MILLISECONDS), retry_options=RETRY),
        )

        try:
            response = self.client.models.generate_content(
                model=config["MODEL"], contents=[_wire_message(message) for message in messages], config=request_config
            )
        except errors.APIError as error:
            self._log_api_error(error)
            raise AssistantError(BUSY if error.code == HTTPStatus.TOO_MANY_REQUESTS else UNAVAILABLE) from error
        except Exception as error:  # timeouts, connection and credential problems of the SDK
            logger.warning("Assistant: model API unreachable or misconfigured (%s)", type(error).__name__)
            raise AssistantError(UNAVAILABLE) from error

        return self._to_response(response)

    @staticmethod
    def _log_api_error(error: errors.APIError) -> None:
        # 5xx and 429 are Google's side and pass; any other 4xx is a problem of ours (key, model name,
        # request shape) that needs fixing. The message is not logged: it can echo the request.
        passes = error.code == HTTPStatus.TOO_MANY_REQUESTS or error.code >= HTTPStatus.INTERNAL_SERVER_ERROR
        logger.log(
            logging.WARNING if passes else logging.ERROR,
            "Assistant: model API answered %s %s",
            error.code,
            error.status,
        )

    @staticmethod
    def _to_response(response) -> ModelResponse:
        usage = Usage()
        if (metadata := response.usage_metadata) is not None:
            usage = Usage(
                input_tokens=(metadata.prompt_token_count or 0) + (metadata.tool_use_prompt_token_count or 0),
                # Thinking tokens are billed as output.
                output_tokens=(metadata.candidates_token_count or 0) + (metadata.thoughts_token_count or 0),
            )

        candidate = response.candidates[0] if response.candidates else None
        blocked = response.prompt_feedback is not None and response.prompt_feedback.block_reason is not None
        if candidate is None:
            finish = FinishReason.REFUSED if blocked else FinishReason.OTHER
            logger.info("Assistant: Gemini sent no answer (blocked=%s)", blocked)
            return ModelResponse(Message("assistant"), finish, usage)

        parts = candidate.content.parts if candidate.content and candidate.content.parts else []
        text = "".join(part.text for part in parts if part.text and not part.thought).strip()
        calls = tuple(
            ToolCall(
                id=part.function_call.id or f"{SYNTHETIC_ID_PREFIX}{index}",
                name=part.function_call.name or "",
                arguments=dict(part.function_call.args or {}),
            )
            for index, part in enumerate(part for part in parts if part.function_call)
        )

        reason = candidate.finish_reason
        if reason in REFUSED_FINISH_REASONS:
            finish = FinishReason.REFUSED
        elif reason == types.FinishReason.MAX_TOKENS:
            finish = FinishReason.MAX_TOKENS
        elif calls and reason in (None, types.FinishReason.STOP):
            finish = FinishReason.TOOL_CALLS
        elif reason in (None, types.FinishReason.STOP):
            finish = FinishReason.STOP
        else:  # MALFORMED_FUNCTION_CALL, OTHER, …
            finish = FinishReason.OTHER

        logger.info(
            "Assistant: %s answered (finish=%s, input=%s, output=%s)",
            response.model_version,
            reason,
            usage.input_tokens,
            usage.output_tokens,
        )
        return ModelResponse(Message("assistant", text=text, tool_calls=calls, native=candidate.content), finish, usage)
