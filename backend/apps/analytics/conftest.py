import copy
import json
from types import SimpleNamespace

import pytest
from anthropic.types.beta import BetaMessage, BetaTextBlock, BetaToolUseBlock, BetaUsage

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
    """The assistant enabled, answering from FakeAnthropic.script."""
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "ENABLED": True, "CLIENT": "apps.analytics.conftest.FakeAnthropic"}
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
