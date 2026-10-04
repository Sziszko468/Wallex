"""The language model providers, and which one is configured.

AI_ASSISTANT["PROVIDER"] (env AI_ASSISTANT_PROVIDER) names one of PROVIDERS. The rest of the app
depends on `AIProvider` only (providers/base.py), never on a vendor SDK.
"""

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils.module_loading import import_string

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
    ToolOutput,
    ToolSpec,
    Usage,
)

__all__ = [
    "BUSY",
    "PROVIDERS",
    "UNAVAILABLE",
    "AIProvider",
    "AssistantError",
    "FinishReason",
    "Message",
    "ModelResponse",
    "SystemPrompt",
    "ToolCall",
    "ToolOutput",
    "ToolSpec",
    "Usage",
    "get_provider",
]

# Dotted paths, imported on demand: a deployment using one provider never loads the other's SDK.
PROVIDERS = {
    "gemini": "apps.analytics.assistant.providers.gemini.GeminiProvider",
    "anthropic": "apps.analytics.assistant.providers.anthropic.AnthropicProvider",
}


def get_provider() -> AIProvider:
    config = settings.AI_ASSISTANT
    try:
        provider_class = import_string(PROVIDERS[config["PROVIDER"]])
    except KeyError:
        raise ImproperlyConfigured(
            f"AI_ASSISTANT_PROVIDER must be one of {', '.join(PROVIDERS)}, not {config['PROVIDER']!r}."
        ) from None
    # `CLIENT` builds the SDK client (swappable, e.g. for tests); empty = the provider's own default.
    client = import_string(config["CLIENT"])() if config["CLIENT"] else None
    return provider_class(client)
