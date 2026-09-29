"""One answer: the model ↔ tools loop.

The model may call tools for a few rounds; each call runs in tools.run_tool for the signed-in
user and its JSON result goes back to the model. After MAX_TOOL_ROUNDS the model has to answer
with what it has. The whole answer has one deadline (AI_ASSISTANT["TIMEOUT"]).
"""

import time
from dataclasses import dataclass, field
from datetime import date

from django.conf import settings

from . import client as model
from . import prompts, tools

MAX_TOOL_ROUNDS = 5
# Don't start a model call with less time than this left before the deadline.
MIN_SECONDS_PER_CALL = 5

REFUSAL_ANSWER = (
    "Sorry, I can't help with that. I can answer questions about your spending, budgets, "
    "subscriptions and savings goals in Spendly."
)
INCOMPLETE = "The assistant couldn't finish this answer. Please try again."
TOO_SLOW = "The answer took too long. Please try again."


@dataclass(frozen=True)
class Answer:
    text: str
    # Tool calls the answer is based on, in call order, without repeats.
    sources: list[dict] = field(default_factory=list)


def _text_of(response) -> str:
    return "\n\n".join(block.text for block in response.content if block.type == "text").strip()


def answer(user, history: list[dict], question: str, today: date) -> Answer:
    """`history`: the conversation so far as [{"role": "user" | "assistant", "content": str}],
    oldest first, starting with a question. Raises model.AssistantError when there is no answer."""
    client = model.get_client()
    system = prompts.system_blocks(user, today)
    messages = [*history, {"role": "user", "content": question}]
    sources: list[dict] = []
    deadline = time.monotonic() + settings.AI_ASSISTANT["TIMEOUT"]

    for round_number in range(MAX_TOOL_ROUNDS + 1):
        remaining = deadline - time.monotonic()
        if remaining < MIN_SECONDS_PER_CALL:
            raise model.AssistantError(TOO_SLOW)
        response = model.create_message(
            client,
            system=system,
            messages=messages,
            tools=tools.TOOL_DEFINITIONS,
            allow_tools=round_number < MAX_TOOL_ROUNDS,
            timeout=remaining,
        )

        # Declined by the model or a safety classifier (after any fallback): never show partial output.
        if response.stop_reason == "refusal":
            return Answer(REFUSAL_ANSWER)
        if response.stop_reason == "max_tokens":
            raise model.AssistantError(INCOMPLETE)

        tool_calls = [block for block in response.content if block.type == "tool_use"]
        if not tool_calls:
            text = _text_of(response)
            if not text:
                raise model.AssistantError(INCOMPLETE)
            return Answer(text, sources)

        # The full content goes back unchanged (thinking blocks included), then every result in one message.
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for call in tool_calls:
            result = tools.run_tool(user, call.name, call.input, today)
            if result.source is not None and result.source not in sources:
                sources.append(result.source)
            results.append(
                {"type": "tool_result", "tool_use_id": call.id, "content": result.content, "is_error": result.is_error}
            )
        messages.append({"role": "user", "content": results})

    raise model.AssistantError(INCOMPLETE)  # not reached: the last round can't call tools
