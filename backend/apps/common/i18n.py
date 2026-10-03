"""The languages the API speaks (English, Hungarian — settings.LANGUAGES).

A request is answered in the language of its `Accept-Language` header (Django's
LocaleMiddleware activates it). Texts written *outside* a request — a scheduled notification,
a push sent from a management command — have no header, so they use the user's own saved
`language` through `language_of`.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from functools import wraps

from django.conf import settings
from django.utils import translation

# The currency a new account starts with when its language says where it is probably used; anyone
# else gets the project default (EUR). It can be changed in the account settings at any time.
DEFAULT_CURRENCY_OF_LANGUAGE = {"hu": "HUF"}


def supported_language(code: str | None) -> str:
    """A language we offer for a code like "hu-HU" or "hu"; the default for anything else."""
    try:
        return translation.get_supported_language_variant(code or settings.LANGUAGE_CODE)
    except LookupError:
        return settings.LANGUAGE_CODE


def active_language() -> str:
    """The language the current request is answered in (always one of settings.LANGUAGES)."""
    return supported_language(translation.get_language())


@contextmanager
def language_of(user) -> Iterator[None]:
    """Run a block in the user's own language (for texts that are stored or pushed later)."""
    with translation.override(supported_language(getattr(user, "language", None))):
        yield


def in_user_language[**P, R](function: Callable[P, R]) -> Callable[P, R]:
    """For functions whose first argument is the user: they run in that user's language, so the
    texts they write (a notification stored now, read on a phone later) are in it."""

    @wraps(function)
    def wrapper(user, *args: P.args, **kwargs: P.kwargs) -> R:
        with language_of(user):
            return function(user, *args, **kwargs)

    return wrapper  # type: ignore[return-value]
