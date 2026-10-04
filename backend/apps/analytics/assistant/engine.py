"""One answer: the model ↔ tools loop.

The model (whichever provider is configured) may call tools for a few rounds; each call runs in
tools.run_tool for the signed-in user and its JSON result goes back to the model. After
MAX_TOOL_ROUNDS the model has to answer with what it has. The whole answer has one deadline
(AI_ASSISTANT["TIMEOUT"]). The engine knows no vendor SDK: it speaks providers.AIProvider.
"""

import time
from dataclasses import dataclass, field
from datetime import date

from django.conf import settings
from django.utils.translation import gettext_lazy

from apps.common.i18n import language_of

from . import cards, prompts, providers, tools
from .providers import AssistantError, FinishReason, Message, ToolOutput, Usage

MAX_TOOL_ROUNDS = 5
# Don't start a model call with less time than this left before the deadline.
MIN_SECONDS_PER_CALL = 5

REFUSAL_ANSWER = gettext_lazy(
    "Sorry, I can't help with that. I can answer questions about your spending, budgets, "
    "subscriptions and savings goals in WALLEX."
)
INCOMPLETE = gettext_lazy("The assistant couldn't finish this answer. Please try again.")
TOO_SLOW = gettext_lazy("The answer took too long. Please try again.")


@dataclass(frozen=True)
class Answer:
    text: str
    # Tool calls the answer is based on, in call order, without repeats.
    sources: list[dict] = field(default_factory=list)
    # Deterministic cards (cards.py) built from the figures the tools returned.
    insights: list[dict] = field(default_factory=list)
    # Questions to offer next (cards.follow_up_questions), in the user's language.
    suggested_questions: list[str] = field(default_factory=list)
    # Tokens of all model calls of this answer.
    usage: Usage = Usage()


def _finish(user, text: str, question: str, usage: Usage, used: list[tuple[str, dict, dict | None]]) -> Answer:
    sources = []
    for name, arguments, _data in used:
        if (source := {"tool": name, "arguments": arguments}) not in sources:
            sources.append(source)
    with language_of(user):
        insights = cards.build_cards(used)
        follow_ups = cards.follow_up_questions([name for name, _, _ in used], insights, question)
    return Answer(text, sources, insights, follow_ups, usage)


def answer(user, history: list[dict], question: str, today: date) -> Answer:
    """`history`: the conversation so far as [{"role": "user" | "assistant", "content": str}],
    oldest first, starting with a question. Raises AssistantError when there is no answer."""
    provider = providers.get_provider()
    system = prompts.system_prompt(user, today)
    messages = [Message(entry["role"], text=entry["content"]) for entry in history]
    messages.append(Message("user", text=question))
    used: list[tuple[str, dict, dict | None]] = []  # (tool, arguments, data) of every tool call that worked
    usage = Usage()
    deadline = time.monotonic() + settings.AI_ASSISTANT["TIMEOUT"]

    for round_number in range(MAX_TOOL_ROUNDS + 1):
        remaining = deadline - time.monotonic()
        if remaining < MIN_SECONDS_PER_CALL:
            raise AssistantError(TOO_SLOW)
        response = provider.generate_response(
            system=system,
            messages=messages,
            tools=tools.TOOL_SPECS,
            allow_tools=round_number < MAX_TOOL_ROUNDS,
            timeout=remaining,
        )
        usage += response.usage

        # Declined by the model or a safety filter: never show partial output.
        if response.finish == FinishReason.REFUSED:
            return _finish(user, str(REFUSAL_ANSWER), question, usage, [])
        if response.finish in (FinishReason.MAX_TOKENS, FinishReason.OTHER):
            raise AssistantError(INCOMPLETE)

        calls = response.message.tool_calls
        if not calls:
            if not response.message.text:
                raise AssistantError(INCOMPLETE)
            return _finish(user, response.message.text, question, usage, used)

        # The turn goes back as it came (a provider replays its own thinking data), then every result in one message.
        messages.append(response.message)
        outputs = []
        for call in calls:
            result = tools.run_tool(user, call.name, call.arguments, today)
            if result.source is not None:
                used.append((result.source["tool"], result.source["arguments"], result.data))
            outputs.append(ToolOutput(call.id, call.name, result.content, result.is_error))
        messages.append(Message("user", tool_results=tuple(outputs)))

    raise AssistantError(INCOMPLETE)  # not reached: the last round can't call tools
