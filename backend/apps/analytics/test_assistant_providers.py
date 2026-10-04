"""The AI providers: Gemini and Claude behind one interface, and the engine on top of it.

Gemini is exercised twice: with real SDK objects against a scripted client (what we send, how
answers are read, every failure), and — the closest thing to a live call without an API key — the
real SDK talking HTTP to a local stand-in server, to check the actual wire format.
"""

import json
import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest
from django.core.exceptions import ImproperlyConfigured
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types

from apps.analytics.assistant import engine, providers
from apps.analytics.assistant.providers import (
    BUSY,
    UNAVAILABLE,
    AssistantError,
    FinishReason,
    Message,
    SystemPrompt,
    ToolOutput,
    Usage,
)
from apps.analytics.assistant.providers.anthropic import AnthropicProvider
from apps.analytics.assistant.providers.gemini import GeminiProvider
from apps.analytics.assistant.tools import TOOL_DEFINITIONS, TOOL_SPECS
from apps.analytics.conftest import (
    FakeGemini,
    FakeProvider,
    gemini_blocked,
    gemini_text,
    gemini_tool_calls,
    reply,
    tool_reply,
)

# Every test starts from the Gemini provider with a known model and effort, and a clean FakeGemini.
pytestmark = pytest.mark.usefixtures("fake_gemini")

TODAY = date(2026, 9, 15)
SEP = {"year": 2026, "month": 9}
SYSTEM = SystemPrompt(stable="You are the assistant.", per_request="Today is Tuesday.")
QUESTION = [Message("user", text="What did I spend?")]


def user_like(**overrides):
    """What the engine needs of a user when no tool touches the database."""
    return SimpleNamespace(**{"base_currency": "EUR", "language": "en", **overrides})


def generate(*, allow_tools=True, timeout=30.0, messages=QUESTION):
    return GeminiProvider(FakeGemini()).generate_response(
        system=SYSTEM, messages=messages, tools=TOOL_SPECS, allow_tools=allow_tools, timeout=timeout
    )


def field(node: dict, camel: str):
    """A field of the request body, whichever spelling the SDK sends (the API accepts both
    `thinkingLevel` and `thinking_level`: the casing is the SDK's business, not ours)."""
    snake = "".join(f"_{c.lower()}" if c.isupper() else c for c in camel)
    return node[camel] if camel in node else node[snake]


def api_error(code: int, status: str, message: str = "boom") -> genai_errors.APIError:
    cls = genai_errors.ClientError if code < 500 else genai_errors.ServerError
    return cls(code, {"error": {"code": code, "message": message, "status": status}})


# --- Which provider is configured -----------------------------------------------------------------


def test_the_configured_provider_is_built(settings):
    settings.AI_ASSISTANT = {
        **settings.AI_ASSISTANT,
        "PROVIDER": "gemini",
        "CLIENT": "apps.analytics.conftest.FakeGemini",
    }
    assert isinstance(providers.get_provider(), GeminiProvider)
    assert isinstance(providers.get_provider().client, FakeGemini)

    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "PROVIDER": "anthropic"}
    assert isinstance(providers.get_provider(), AnthropicProvider)


def test_an_unknown_provider_is_a_configuration_error(settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "PROVIDER": "skynet"}

    with pytest.raises(ImproperlyConfigured, match="AI_ASSISTANT_PROVIDER must be one of gemini, anthropic"):
        providers.get_provider()


def test_the_default_gemini_client_uses_the_server_side_key(settings):
    settings.GEMINI_API_KEY = "server-side-key"

    client = GeminiProvider().client

    assert isinstance(client, genai.Client)
    assert client._api_client.api_key == "server-side-key"


# --- Gemini: what we send -------------------------------------------------------------------------


def test_gemini_request_parameters():
    FakeGemini.script = [gemini_text("Hello!")]

    generate(timeout=42.5)

    [request] = FakeGemini.requests
    config = request["config"]
    assert request["model"] == "gemini-test-model"
    assert config.system_instruction == "You are the assistant.\n\nToday is Tuesday."
    assert config.max_output_tokens == 16000
    assert config.thinking_config.thinking_level == genai_types.ThinkingLevel.LOW
    assert config.http_options.timeout == 42500
    assert config.automatic_function_calling.disable is True
    [declarations] = [tool.function_declarations for tool in config.tools]
    assert [(d.name, d.description, d.parameters_json_schema) for d in declarations] == [
        (d["name"], d["description"], d["input_schema"]) for d in TOOL_DEFINITIONS
    ]
    assert config.tool_config.function_calling_config.mode == genai_types.FunctionCallingConfigMode.AUTO
    [content] = request["contents"]
    assert (content.role, content.parts[0].text) == ("user", "What did I spend?")


def test_gemini_uses_the_configured_model(settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "MODEL": "gemini-3.5-flash-lite"}
    FakeGemini.script = [gemini_text("Hi")]

    generate()

    assert FakeGemini.requests[0]["model"] == "gemini-3.5-flash-lite"


@pytest.mark.parametrize(
    ("effort", "level"),
    [
        ("minimal", genai_types.ThinkingLevel.MINIMAL),
        ("High", genai_types.ThinkingLevel.HIGH),
        ("", None),
        ("xhigh", None),
    ],
)
def test_gemini_effort_maps_to_a_thinking_level(settings, effort, level):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "EFFORT": effort}
    FakeGemini.script = [gemini_text("Hi")]

    generate()

    thinking = FakeGemini.requests[0]["config"].thinking_config
    assert (thinking.thinking_level if thinking else None) == level


def test_gemini_may_not_call_tools_when_the_answer_is_due():
    FakeGemini.script = [gemini_text("Final.")]

    generate(allow_tools=False)

    mode = FakeGemini.requests[0]["config"].tool_config.function_calling_config.mode
    assert mode == genai_types.FunctionCallingConfigMode.NONE


# --- Gemini: how answers are read -----------------------------------------------------------------


def test_gemini_text_answer():
    FakeGemini.script = [
        gemini_text("You spent **42.00 EUR**.", prompt_tokens=120, output_tokens=30, thought_tokens=50)
    ]

    response = generate()

    assert response.finish == FinishReason.STOP
    assert response.message.text == "You spent **42.00 EUR**."
    assert response.message.tool_calls == ()
    assert response.usage == Usage(input_tokens=120, output_tokens=80)  # thinking tokens are output


def test_gemini_thought_summaries_are_not_part_of_the_answer():
    parts = [
        genai_types.Part(text="Let me think about their spending…", thought=True),
        genai_types.Part(text="42.00 EUR."),
    ]
    FakeGemini.script = [
        genai_types.GenerateContentResponse(
            candidates=[
                genai_types.Candidate(
                    content=genai_types.Content(role="model", parts=parts), finish_reason=genai_types.FinishReason.STOP
                )
            ]
        )
    ]

    assert generate().message.text == "42.00 EUR."


def test_gemini_tool_calls():
    FakeGemini.script = [gemini_tool_calls(("get_monthly_spending", SEP), ("get_budget_status", SEP))]

    response = generate()

    assert response.finish == FinishReason.TOOL_CALLS
    assert [(call.id, call.name, call.arguments) for call in response.message.tool_calls] == [
        ("fc_0", "get_monthly_spending", SEP),
        ("fc_1", "get_budget_status", SEP),
    ]


@pytest.mark.parametrize(
    ("reply_", "finish"),
    [
        (gemini_text("Cut off", genai_types.FinishReason.MAX_TOKENS), FinishReason.MAX_TOKENS),
        (gemini_text("", genai_types.FinishReason.SAFETY), FinishReason.REFUSED),
        (gemini_text("", genai_types.FinishReason.PROHIBITED_CONTENT), FinishReason.REFUSED),
        (gemini_text("", genai_types.FinishReason.RECITATION), FinishReason.REFUSED),
        (gemini_blocked(), FinishReason.REFUSED),
        (gemini_text("", genai_types.FinishReason.MALFORMED_FUNCTION_CALL), FinishReason.OTHER),
        (gemini_text("", genai_types.FinishReason.OTHER), FinishReason.OTHER),
        (genai_types.GenerateContentResponse(candidates=[]), FinishReason.OTHER),
    ],
)
def test_gemini_finish_reasons(reply_, finish):
    FakeGemini.script = [reply_]

    assert generate().finish == finish


# --- Gemini: tool results go back, thought signatures included -------------------------------------


@pytest.mark.django_db
def test_gemini_tool_loop_replays_the_models_turn_and_answers_parallel_calls_in_one_message(user):
    FakeGemini.script = [
        gemini_tool_calls(("get_monthly_spending", SEP), ("get_category_spending", SEP)),
        gemini_text("No data."),
    ]

    answer = engine.answer(user, [], "What did I spend?", TODAY)

    assert answer.text == "No data."
    first, second = FakeGemini.requests
    question, model_turn, results = second["contents"]
    assert question.role == "user"
    # The model's own turn, thought signature and all — Gemini 3 rejects a function call without it.
    assert model_turn.role == "model"
    assert [part.function_call.name for part in model_turn.parts] == ["get_monthly_spending", "get_category_spending"]
    assert model_turn.parts[0].thought_signature == b"signature-of-the-turn"
    # Every result of the turn in ONE user message, in call order, matched by id and name.
    assert results.role == "user"
    assert [(p.function_response.id, p.function_response.name) for p in results.parts] == [
        ("fc_0", "get_monthly_spending"),
        ("fc_1", "get_category_spending"),
    ]
    assert results.parts[0].function_response.response["has_data"] is False
    assert [request["config"].tool_config.function_calling_config.mode for request in (first, second)] == [
        genai_types.FunctionCallingConfigMode.AUTO
    ] * 2


@pytest.mark.django_db
def test_gemini_calls_without_ids_get_results_without_ids(user):
    FakeGemini.script = [gemini_tool_calls(("get_monthly_spending", SEP), with_ids=False), gemini_text("OK.")]

    engine.answer(user, [], "What did I spend?", TODAY)

    results = FakeGemini.requests[1]["contents"][2]
    assert [part.function_response.id for part in results.parts] == [None]
    assert results.parts[0].function_response.name == "get_monthly_spending"


@pytest.mark.django_db
def test_gemini_bad_tool_calls_come_back_as_errors_the_model_can_fix(user):
    FakeGemini.script = [
        gemini_tool_calls(("get_monthly_spending", {"year": 2026, "month": 13})),
        gemini_text("Sorry."),
    ]

    engine.answer(user, [], "What did I spend?", TODAY)

    [part] = FakeGemini.requests[1]["contents"][2].parts
    assert "invalid_arguments" in part.function_response.response["error"]


@pytest.mark.django_db
def test_gemini_history_is_sent_as_user_and_model_turns(user):
    history = [{"role": "user", "content": "How much on food?"}, {"role": "assistant", "content": "42.00 EUR."}]
    FakeGemini.script = [gemini_text("Transport: 0.00 EUR.")]

    engine.answer(user, history, "And on transport?", TODAY)

    contents = FakeGemini.requests[0]["contents"]
    assert [(c.role, c.parts[0].text) for c in contents] == [
        ("user", "How much on food?"),
        ("model", "42.00 EUR."),
        ("user", "And on transport?"),
    ]


@pytest.mark.django_db
def test_nothing_personal_is_sent_to_gemini(user):
    user.first_name, user.last_name = "Ada", "Lovelace"
    user.save()
    FakeGemini.script = [
        gemini_tool_calls(
            ("get_monthly_spending", SEP), ("get_merchant_spending", SEP), ("get_subscription_costs", {})
        ),
        gemini_text("Done."),
    ]

    engine.answer(user, [], "What did I spend?", TODAY)

    sent = json.dumps(
        [
            {"model": r["model"], "system": r["config"].system_instruction, "contents": str(r["contents"])}
            for r in FakeGemini.requests
        ]
    )
    for personal in (user.email, "testuser", "Ada", "Lovelace"):
        assert personal not in sent


# --- Gemini: failures -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("failure", "message"),
    [
        (api_error(429, "RESOURCE_EXHAUSTED", "Quota exceeded"), BUSY),
        (api_error(503, "UNAVAILABLE", "The model is overloaded"), UNAVAILABLE),
        (api_error(500, "INTERNAL"), UNAVAILABLE),
        (api_error(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key."), UNAVAILABLE),
        (api_error(403, "PERMISSION_DENIED"), UNAVAILABLE),
        (api_error(404, "NOT_FOUND", "models/nope is not found"), UNAVAILABLE),
        (TimeoutError("read timed out"), UNAVAILABLE),
        (ConnectionError("network unreachable"), UNAVAILABLE),
        (ValueError("Missing key inputs argument!"), UNAVAILABLE),
    ],
)
def test_gemini_failures_become_a_message_safe_to_show(failure, message):
    FakeGemini.script = [failure]

    with pytest.raises(AssistantError) as raised:
        generate()

    assert str(raised.value) == str(message)
    # Nothing of the provider's error text (it can echo keys or the request) reaches the user.
    assert "key" not in str(raised.value).lower() and "quota" not in str(raised.value).lower()


def test_gemini_failures_never_log_the_error_text_or_the_key(caplog, settings):
    settings.GEMINI_API_KEY = "AIza-very-secret"
    FakeGemini.script = [api_error(400, "INVALID_ARGUMENT", "API key not valid: AIza-very-secret")]

    with pytest.raises(AssistantError), caplog.at_level("DEBUG"):
        generate()

    assert "AIza-very-secret" not in caplog.text and "API key not valid" not in caplog.text
    assert "400 INVALID_ARGUMENT" in caplog.text


# --- Gemini: the real SDK over HTTP, against a local stand-in server -------------------------------

STAND_IN_ANSWER = {
    "candidates": [
        {
            "content": {
                "role": "model",
                "parts": [
                    {
                        "functionCall": {
                            "id": "fc-abc",
                            "name": "get_monthly_spending",
                            "args": {"year": 2026, "month": 9},
                        },
                        "thoughtSignature": "c2lnbmF0dXJl",
                    }
                ],
            },
            "finishReason": "STOP",
        }
    ],
    "usageMetadata": {
        "promptTokenCount": 321,
        "candidatesTokenCount": 12,
        "thoughtsTokenCount": 40,
        "totalTokenCount": 373,
    },
    "modelVersion": "gemini-test-model",
}


class StandIn(BaseHTTPRequestHandler):
    requests: list[dict] = []
    status = 200
    body: dict = STAND_IN_ANSWER

    def do_POST(self):
        length = int(self.headers["Content-Length"])
        StandIn.requests.append(
            {"path": self.path, "headers": dict(self.headers), "body": json.loads(self.rfile.read(length))}
        )
        payload = json.dumps(StandIn.body).encode()
        self.send_response(StandIn.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):  # keep the test output clean
        pass


@pytest.fixture
def stand_in_gemini():
    StandIn.requests, StandIn.status, StandIn.body = [], 200, STAND_IN_ANSWER
    server = ThreadingHTTPServer(("127.0.0.1", 0), StandIn)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    client = genai.Client(
        api_key="test-key", http_options=genai_types.HttpOptions(base_url=f"http://127.0.0.1:{server.server_port}")
    )
    yield client
    server.shutdown()
    thread.join()


def test_the_wire_format_of_a_gemini_request(stand_in_gemini, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "MODEL": "gemini-test-model", "EFFORT": "low"}

    response = GeminiProvider(stand_in_gemini).generate_response(
        system=SYSTEM, messages=QUESTION, tools=TOOL_SPECS, allow_tools=True, timeout=30
    )

    [request] = StandIn.requests
    assert request["path"].endswith("/models/gemini-test-model:generateContent")
    assert request["headers"]["x-goog-api-key"] == "test-key"  # a header: never in the URL or the body
    body = request["body"]
    assert body["systemInstruction"]["parts"] == [{"text": "You are the assistant.\n\nToday is Tuesday."}]
    assert body["contents"] == [{"role": "user", "parts": [{"text": "What did I spend?"}]}]
    declarations = body["tools"][0]["functionDeclarations"]
    assert [d["name"] for d in declarations] == [spec.name for spec in TOOL_SPECS]
    assert field(declarations[0], "parametersJsonSchema") == TOOL_DEFINITIONS[0]["input_schema"]
    assert body["toolConfig"]["functionCallingConfig"]["mode"] == "AUTO"
    assert body["generationConfig"]["maxOutputTokens"] == 16000
    assert field(body["generationConfig"]["thinkingConfig"], "thinkingLevel") == "LOW"
    assert "test-key" not in json.dumps(body)
    # …and the answer, parsed from the API's JSON.
    assert response.finish == FinishReason.TOOL_CALLS
    assert [(c.id, c.name, c.arguments) for c in response.message.tool_calls] == [
        ("fc-abc", "get_monthly_spending", {"year": 2026, "month": 9})
    ]
    assert response.usage == Usage(input_tokens=321, output_tokens=52)


def test_the_wire_format_of_the_tool_results_and_the_replayed_turn(stand_in_gemini, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "MODEL": "gemini-test-model"}
    provider = GeminiProvider(stand_in_gemini)
    first = provider.generate_response(system=SYSTEM, messages=QUESTION, tools=TOOL_SPECS, allow_tools=True, timeout=30)
    output = ToolOutput("fc-abc", "get_monthly_spending", json.dumps({"has_data": True, "total_expenses": "42.00"}))

    provider.generate_response(
        system=SYSTEM,
        messages=[*QUESTION, first.message, Message("user", tool_results=(output,))],
        tools=TOOL_SPECS,
        allow_tools=False,
        timeout=30,
    )

    body = StandIn.requests[1]["body"]
    assert body["toolConfig"]["functionCallingConfig"]["mode"] == "NONE"
    _, model_turn, results = body["contents"]
    assert model_turn["role"] == "model"
    assert model_turn["parts"][0]["functionCall"]["name"] == "get_monthly_spending"
    assert model_turn["parts"][0]["thoughtSignature"] == "c2lnbmF0dXJl"  # sent back untouched
    assert results == {
        "role": "user",
        "parts": [
            {
                "functionResponse": {
                    "id": "fc-abc",
                    "name": "get_monthly_spending",
                    "response": {"has_data": True, "total_expenses": "42.00"},
                }
            }
        ],
    }


@pytest.mark.parametrize(("status", "message"), [(429, BUSY), (503, UNAVAILABLE), (400, UNAVAILABLE)])
def test_http_errors_from_gemini_become_assistant_errors(stand_in_gemini, status, message):
    StandIn.status = status
    StandIn.body = {"error": {"code": status, "message": "stand-in failure", "status": "FAILED"}}

    with pytest.raises(AssistantError) as raised:
        GeminiProvider(stand_in_gemini).generate_response(
            system=SYSTEM, messages=QUESTION, tools=TOOL_SPECS, allow_tools=True, timeout=30
        )

    assert str(raised.value) == str(message)


def test_a_503_is_retried_once_a_429_is_not(stand_in_gemini):
    StandIn.status, StandIn.body = 503, {"error": {"code": 503, "message": "overloaded", "status": "UNAVAILABLE"}}
    with pytest.raises(AssistantError):
        GeminiProvider(stand_in_gemini).generate_response(
            system=SYSTEM, messages=QUESTION, tools=TOOL_SPECS, allow_tools=True, timeout=30
        )
    assert len(StandIn.requests) == 2

    StandIn.requests, StandIn.status = [], 429
    StandIn.body = {"error": {"code": 429, "message": "quota", "status": "RESOURCE_EXHAUSTED"}}
    with pytest.raises(AssistantError):
        GeminiProvider(stand_in_gemini).generate_response(
            system=SYSTEM, messages=QUESTION, tools=TOOL_SPECS, allow_tools=True, timeout=30
        )
    assert len(StandIn.requests) == 1


# --- The engine knows no vendor: a neutral provider ---------------------------------------------------


def test_the_engine_sums_the_usage_of_all_calls(fake_provider):
    fake_provider.script = [
        tool_reply(("get_monthly_spending", {"year": 2026, "month": 13}), usage=Usage(100, 10)),
        reply("Done.", usage=Usage(150, 25)),
    ]

    answer = engine.answer(user_like(), [], "What did I spend?", TODAY)

    assert answer.usage == Usage(250, 35)


def test_the_engine_hands_the_provider_neutral_messages(fake_provider):
    fake_provider.script = [reply("OK.")]
    history = [{"role": "user", "content": "Q1"}, {"role": "assistant", "content": "A1"}]

    engine.answer(user_like(), history, "Q2", TODAY)

    [call] = fake_provider.calls
    assert call["messages"] == [Message("user", text="Q1"), Message("assistant", text="A1"), Message("user", text="Q2")]
    assert call["tools"] == TOOL_SPECS and call["allow_tools"] is True
    assert call["system"].stable.startswith("You are the finance assistant of WALLEX")
    assert call["system"].per_request.startswith("Today is Tuesday, 2026-09-15. The user's base currency is EUR")


def test_the_engine_turns_provider_refusals_into_a_polite_answer(fake_provider):
    fake_provider.script = [reply("", FinishReason.REFUSED)]

    answer = engine.answer(user_like(), [], "Tell me a secret", TODAY)

    assert answer.text == engine.REFUSAL_ANSWER
    assert answer.sources == [] and answer.insights == []
    assert answer.suggested_questions  # a refusal still offers something to ask


@pytest.mark.parametrize("finish", [FinishReason.MAX_TOKENS, FinishReason.OTHER])
def test_the_engine_reports_an_unusable_turn_as_incomplete(fake_provider, finish):
    fake_provider.script = [reply("part of an ans", finish)]

    with pytest.raises(AssistantError, match="couldn't finish"):
        engine.answer(user_like(), [], "Q", TODAY)


def test_provider_errors_pass_through_the_engine(fake_provider):
    fake_provider.script = [AssistantError(BUSY)]

    with pytest.raises(AssistantError) as raised:
        engine.answer(user_like(), [], "Q", TODAY)

    assert str(raised.value) == str(BUSY)


def test_the_provider_gets_what_is_left_of_the_deadline(fake_provider, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "TIMEOUT": 60}
    fake_provider.script = [reply("Hi.")]

    engine.answer(user_like(), [], "Q", TODAY)

    assert 59 < fake_provider.calls[0]["timeout"] <= 60


def test_fake_provider_is_registered_only_inside_the_fixture():
    assert "fake" not in providers.PROVIDERS and FakeProvider.name == "fake"
