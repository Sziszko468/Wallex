"""What the assistant needs from a language model — and nothing provider-specific.

The engine (engine.py) talks to an `AIProvider`: it sends the conversation so far plus the data
tools and gets back one model turn, which is either an answer or a request to call tools. Each
provider (Gemini, Claude) translates that to its own API and its errors to `AssistantError`.
Adding a provider = one subclass here, one entry in providers/__init__.py and its settings.

Nothing in this package logs question or answer text: only status codes, request ids and token counts.
"""

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from django.utils.translation import gettext_lazy as _


class AssistantError(Exception):
    """No answer this time. The message is safe to show to the user."""


UNAVAILABLE = _("The assistant is temporarily unavailable. Please try again in a moment.")
BUSY = _("The assistant is busy right now. Please try again in a minute.")


class FinishReason(StrEnum):
    STOP = "stop"  # a complete answer
    TOOL_CALLS = "tool_calls"  # the model wants tool results before it answers
    MAX_TOKENS = "max_tokens"  # cut off: the output limit was reached
    REFUSED = "refused"  # declined by the model or a safety filter
    OTHER = "other"  # anything else (malformed call, unknown reason): no usable answer


@dataclass(frozen=True)
class ToolSpec:
    """A tool the model may call. `input_schema` is a JSON Schema object."""

    name: str
    description: str
    input_schema: dict


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: object  # whatever the model sent; tools.run_tool validates it


@dataclass(frozen=True)
class ToolOutput:
    """The result of one tool call, going back to the model."""

    call_id: str
    name: str
    content: str  # JSON text
    is_error: bool = False


@dataclass(frozen=True)
class Message:
    """One entry of the conversation sent to the model.

    - user question:      role "user", `text`
    - the model's turn:   role "assistant", `text` and/or `tool_calls`; `native` is what the
                          provider needs to replay the turn exactly (Claude's thinking blocks,
                          Gemini's thought signatures) — opaque to everyone else
    - tool results:       role "user", `tool_results` (one message for all calls of a turn)
    """

    role: str
    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    tool_results: tuple[ToolOutput, ...] = ()
    native: Any = field(default=None, compare=False, repr=False)


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def __add__(self, other: "Usage") -> "Usage":
        return Usage(self.input_tokens + other.input_tokens, self.output_tokens + other.output_tokens)


@dataclass(frozen=True)
class SystemPrompt:
    stable: str  # the same for every user and request (providers may cache it)
    per_request: str  # today's date, the user's currency and language


@dataclass(frozen=True)
class ModelResponse:
    message: Message  # role "assistant"
    finish: FinishReason
    usage: Usage = Usage()


class AIProvider(ABC):
    """One language model API. `client` is the provider's SDK client; None builds the default one
    from the settings (tests pass a scripted stand-in through AI_ASSISTANT["CLIENT"])."""

    name: str

    def __init__(self, client=None):
        self._client = client

    @abstractmethod
    def generate_response(
        self,
        *,
        system: SystemPrompt,
        messages: Sequence[Message],
        tools: Sequence[ToolSpec],
        allow_tools: bool,
        timeout: float,
    ) -> ModelResponse:
        """One model call. `allow_tools=False` forbids tool calls (the answer has to be given now).
        Raises AssistantError on any API failure."""
