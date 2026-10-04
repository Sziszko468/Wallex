"""How the AI assistant is configured from the environment.

The settings are imported in a separate process with a controlled environment (the local .env
file is ignored), so these checks see exactly what a deployment would.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from django.conf import settings

BACKEND_DIR = Path(settings.BASE_DIR)
AI_VARIABLES = {
    "GEMINI_API_KEY",
    "ANTHROPIC_API_KEY",
    "AI_ASSISTANT_PROVIDER",
    "AI_ASSISTANT_MODEL",
    "AI_ASSISTANT_EFFORT",
    "AI_ASSISTANT_MAX_TOKENS",
    "AI_ASSISTANT_TIMEOUT",
    "AI_ASSISTANT_RATE",
    "ASSISTANT_RATE",
    "AI_ASSISTANT_MAX_QUESTION_LENGTH",
    "AI_ASSISTANT_HISTORY_MESSAGES",
    "AI_ASSISTANT_MAX_MESSAGES",
    "AI_ASSISTANT_CLIENT",
}
PROGRAM = (
    "import json, environ; environ.Env.read_env = lambda *a, **k: None;"
    "import config.settings.dev as s;"
    "print(json.dumps({**s.AI_ASSISTANT, 'rate': s.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['assistant']}))"
)


def load(**env_overrides) -> dict:
    env = {key: value for key, value in os.environ.items() if key not in AI_VARIABLES}
    env.update(
        DJANGO_SETTINGS_MODULE="config.settings.dev",
        DJANGO_SECRET_KEY="test-only-secret-key-0123456789-abcdefghijklmnopqrstuvwxyz",
        DATABASE_URL="postgres://user:password@localhost:5432/wallex",
        **env_overrides,
    )
    result = subprocess.run(
        [sys.executable, "-c", PROGRAM], cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=60
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.splitlines()[-1])


def test_without_any_key_the_assistant_is_off_and_gemini_is_the_provider():
    config = load()

    assert config["PROVIDER"] == "gemini" and config["ENABLED"] is False
    assert config["MODEL"] == "gemini-3.8-flash"
    assert config["EFFORT"] == "low"
    assert config["CLIENT"] == ""


def test_a_gemini_key_switches_the_assistant_on():
    config = load(GEMINI_API_KEY="server-side-key")

    assert (config["PROVIDER"], config["ENABLED"]) == ("gemini", True)


def test_an_existing_claude_setup_keeps_working_without_a_new_variable():
    config = load(ANTHROPIC_API_KEY="sk-claude")

    assert (config["PROVIDER"], config["ENABLED"], config["MODEL"], config["EFFORT"]) == (
        "anthropic",
        True,
        "claude-opus-5",
        "medium",
    )


def test_gemini_wins_when_both_keys_exist_unless_told_otherwise():
    assert load(GEMINI_API_KEY="g", ANTHROPIC_API_KEY="a")["PROVIDER"] == "gemini"
    assert load(GEMINI_API_KEY="g", ANTHROPIC_API_KEY="a", AI_ASSISTANT_PROVIDER="anthropic")["PROVIDER"] == "anthropic"


def test_the_chosen_provider_needs_its_own_key():
    assert load(ANTHROPIC_API_KEY="sk-claude", AI_ASSISTANT_PROVIDER="gemini")["ENABLED"] is False
    assert load(GEMINI_API_KEY="g", AI_ASSISTANT_PROVIDER="anthropic")["ENABLED"] is False


def test_everything_tunable_comes_from_the_environment():
    config = load(
        GEMINI_API_KEY="g",
        AI_ASSISTANT_MODEL="gemini-3.5-flash-lite",
        AI_ASSISTANT_EFFORT="minimal",
        AI_ASSISTANT_MAX_TOKENS="2048",
        AI_ASSISTANT_TIMEOUT="45",
        AI_ASSISTANT_RATE="20/hour",
        AI_ASSISTANT_MAX_QUESTION_LENGTH="500",
        AI_ASSISTANT_HISTORY_MESSAGES="10",
        AI_ASSISTANT_MAX_MESSAGES="30",
    )

    assert (config["MODEL"], config["EFFORT"], config["MAX_TOKENS"], config["TIMEOUT"]) == (
        "gemini-3.5-flash-lite",
        "minimal",
        2048,
        45,
    )
    assert (config["MAX_QUESTION_LENGTH"], config["HISTORY_MESSAGES"], config["MAX_MESSAGES"]) == (500, 10, 30)
    assert config["rate"] == "20/hour"


def test_the_old_rate_variable_still_works_and_the_new_one_wins():
    assert load()["rate"] == "30/hour"
    assert load(ASSISTANT_RATE="10/hour")["rate"] == "10/hour"
    assert load(ASSISTANT_RATE="10/hour", AI_ASSISTANT_RATE="20/hour")["rate"] == "20/hour"


def test_an_unknown_provider_stops_the_server_from_starting():
    env = {key: value for key, value in os.environ.items() if key not in AI_VARIABLES}
    env.update(
        DJANGO_SECRET_KEY="test-only-secret-key-0123456789-abcdefghijklmnopqrstuvwxyz",
        DATABASE_URL="postgres://user:password@localhost:5432/wallex",
        AI_ASSISTANT_PROVIDER="skynet",
    )

    result = subprocess.run(
        [sys.executable, "-c", PROGRAM], cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=60
    )

    assert result.returncode != 0
    assert "AI_ASSISTANT_PROVIDER must be one of gemini, anthropic" in result.stderr


@pytest.mark.parametrize("variable", ["GEMINI_API_KEY", "ANTHROPIC_API_KEY"])
def test_the_api_keys_are_never_part_of_the_settings_the_apps_can_read(variable):
    """The assistant dict (and everything else sent to clients) carries no key: only `ENABLED`."""
    config = load(**{variable: "super-secret-key-value"})

    assert "super-secret-key-value" not in json.dumps(config)
