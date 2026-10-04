import copy
import json
from types import SimpleNamespace

import pytest
from anthropic.types.beta import BetaMessage, BetaTextBlock, BetaToolUseBlock, BetaUsage
from google.genai import types as genai_types

from apps.analytics.assistant import providers
from apps.analytics.assistant.providers import AIProvider, FinishReason, Message, ModelResponse, ToolCall, Usage
from apps.categories.models import Category, TransactionType


@pytest.fixture
def food_category(user):
    return Category.objects.create(user=user, name="Food", type=TransactionType.EXPENSE)


@pytest.fixture
def transport_category(user):
    return Category.objects.create(user=user, name="Transport", type=TransactionType.EXPENSE)


@pytest.fixture
def salary_category(user):
    return Category.objects.create(user=user, name="Salary", type=TransactionType.INCOME)


# --- AI assistant: a stand-in for the Anthropic client ------------------------------------------


class FakeAnthropic:
    """Replaces anthropic.Anthropic in tests (AI_ASSISTANT["CLIENT"]): returns scripted responses —
    real SDK message objects — one per model call, and records every request.

    `script` items are BetaMessages (see `text_reply` / `tool_call_reply`) or exceptions to raise.
    """

    script: list = []
    requests: list[dict] = []
    timeouts: list[float] = []

    def __init__(self):
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def with_options(self, *, timeout: float):
        FakeAnthropic.timeouts.append(timeout)
        return self

    def _create(self, **params):
        FakeAnthropic.requests.append(copy.deepcopy(params))
        if not FakeAnthropic.script:
            raise AssertionError("The model was called more often than the test scripted.")
        reply = FakeAnthropic.script.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def _message(content: list, stop_reason: str) -> BetaMessage:
    return BetaMessage(
        id="msg_test",
        type="message",
        role="assistant",
        model="claude-opus-5",
        content=content,
        stop_reason=stop_reason,
        stop_sequence=None,
        usage=BetaUsage(input_tokens=100, output_tokens=20),
    )


def text_reply(text: str, stop_reason: str = "end_turn") -> BetaMessage:
    return _message([BetaTextBlock(type="text", text=text)] if text else [], stop_reason)


def tool_call_reply(*calls: tuple[str, dict]) -> BetaMessage:
    """One model turn calling tools: tool_call_reply(("get_monthly_spending", {"year": 2026, "month": 9}))."""
    blocks = [
        BetaToolUseBlock(type="tool_use", id=f"toolu_{index}", name=name, input=arguments)
        for index, (name, arguments) in enumerate(calls)
    ]
    return _message(blocks, "tool_use")


@pytest.fixture
def fake_model(settings):
    """The assistant enabled with the Claude provider, answering from FakeAnthropic.script."""
    settings.AI_ASSISTANT = {
        **settings.AI_ASSISTANT,
        "PROVIDER": "anthropic",
        "ENABLED": True,
        "CLIENT": "apps.analytics.conftest.FakeAnthropic",
        "MODEL": "claude-opus-5",
        "EFFORT": "medium",
    }
    FakeAnthropic.script = []
    FakeAnthropic.requests = []
    FakeAnthropic.timeouts = []
    return FakeAnthropic


def sent_tool_results(request: dict) -> list[dict]:
    """The tool_result blocks of the last message of a recorded request, with parsed JSON content."""
    return [
        {**block, "content": json.loads(block["content"])}
        for block in request["messages"][-1]["content"]
        if isinstance(block, dict) and block.get("type") == "tool_result"
    ]


# --- AI assistant: a stand-in for the Gemini client ---------------------------------------------


class FakeGemini:
    """Replaces google.genai.Client in tests (AI_ASSISTANT["CLIENT"]): returns scripted responses —
    real SDK response objects — one per model call, and records every request.

    `script` items are GenerateContentResponses (see `gemini_text` / `gemini_tool_calls`) or exceptions.
    """

    script: list = []
    requests: list[dict] = []

    def __init__(self):
        self.models = SimpleNamespace(generate_content=self._generate_content)

    def _generate_content(self, *, model, contents, config):
        FakeGemini.requests.append({"model": model, "contents": copy.deepcopy(contents), "config": config})
        if not FakeGemini.script:
            raise AssertionError("The model was called more often than the test scripted.")
        reply = FakeGemini.script.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def _gemini_response(parts, finish_reason, prompt_tokens=100, output_tokens=20, thought_tokens=0):
    content = genai_types.Content(role="model", parts=parts) if parts is not None else None
    return genai_types.GenerateContentResponse(
        candidates=[genai_types.Candidate(content=content, finish_reason=finish_reason)],
        usage_metadata=genai_types.GenerateContentResponseUsageMetadata(
            prompt_token_count=prompt_tokens, candidates_token_count=output_tokens, thoughts_token_count=thought_tokens
        ),
        model_version="gemini-test",
    )


def gemini_text(text: str, finish_reason=genai_types.FinishReason.STOP, **tokens):
    return _gemini_response([genai_types.Part(text=text)] if text else [], finish_reason, **tokens)


def gemini_tool_calls(*calls: tuple[str, dict], with_ids: bool = True):
    """One Gemini turn calling tools. The first call carries a thought signature, like Gemini 3 sends."""
    parts = [
        genai_types.Part(
            function_call=genai_types.FunctionCall(id=f"fc_{index}" if with_ids else None, name=name, args=arguments),
            thought_signature=b"signature-of-the-turn" if index == 0 else None,
        )
        for index, (name, arguments) in enumerate(calls)
    ]
    return _gemini_response(parts, genai_types.FinishReason.STOP)


def gemini_blocked(reason=genai_types.BlockedReason.SAFETY):
    return genai_types.GenerateContentResponse(
        candidates=None, prompt_feedback=genai_types.GenerateContentResponsePromptFeedback(block_reason=reason)
    )


@pytest.fixture
def fake_gemini(settings):
    """The assistant enabled with the Gemini provider, answering from FakeGemini.script."""
    settings.AI_ASSISTANT = {
        **settings.AI_ASSISTANT,
        "PROVIDER": "gemini",
        "ENABLED": True,
        "CLIENT": "apps.analytics.conftest.FakeGemini",
        "MODEL": "gemini-test-model",
        "EFFORT": "low",
    }
    FakeGemini.script = []
    FakeGemini.requests = []
    return FakeGemini


# --- AI assistant: a stand-in for a whole provider (the engine knows nothing about SDKs) ------------


class FakeProvider(AIProvider):
    """A provider answering from `script` — ModelResponses (see `reply` / `tool_reply`) or exceptions —
    and recording every call. Registered as the "fake" provider by the `fake_provider` fixture."""

    name = "fake"
    script: list = []
    calls: list[dict] = []

    def generate_response(self, *, system, messages, tools, allow_tools, timeout):
        FakeProvider.calls.append(
            {
                "system": system,
                "messages": list(messages),
                "tools": list(tools),
                "allow_tools": allow_tools,
                "timeout": timeout,
            }
        )
        if not FakeProvider.script:
            raise AssertionError("The model was called more often than the test scripted.")
        reply = FakeProvider.script.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


DEFAULT_USAGE = Usage(10, 5)


def reply(text: str, finish: FinishReason = FinishReason.STOP, usage: Usage = DEFAULT_USAGE) -> ModelResponse:
    return ModelResponse(Message("assistant", text=text), finish, usage)


def tool_reply(*calls: tuple[str, object], usage: Usage = DEFAULT_USAGE) -> ModelResponse:
    tool_calls = tuple(ToolCall(f"call_{index}", name, arguments) for index, (name, arguments) in enumerate(calls))
    return ModelResponse(Message("assistant", tool_calls=tool_calls), FinishReason.TOOL_CALLS, usage)


@pytest.fixture
def fake_provider(settings, monkeypatch):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "PROVIDER": "fake", "ENABLED": True, "CLIENT": ""}
    monkeypatch.setitem(providers.PROVIDERS, "fake", "apps.analytics.conftest.FakeProvider")
    FakeProvider.script = []
    FakeProvider.calls = []
    return FakeProvider
