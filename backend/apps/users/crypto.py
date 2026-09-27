"""Encryption at rest for small secrets, and keyed hashes for single-use codes.

Everything is derived from FIELD_ENCRYPTION_KEY (environment only — production refuses to
start without a dedicated strong value), with HKDF and one sub-key per purpose, so no key
serves two uses. A copy of the database alone therefore reveals neither the users'
authenticator secrets nor usable recovery codes.
"""

import hashlib
import hmac
from base64 import urlsafe_b64encode
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings


class DecryptionError(Exception):
    """The value wasn't encrypted with the current FIELD_ENCRYPTION_KEY (or was altered)."""


def _derive(master_key: str, purpose: str) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=f"spendly:{purpose}".encode()).derive(
        master_key.encode()
    )


@lru_cache(maxsize=4)
def _fernet(master_key: str) -> Fernet:
    return Fernet(urlsafe_b64encode(_derive(master_key, "field-encryption")))


@lru_cache(maxsize=4)
def _hash_key(master_key: str) -> bytes:
    return _derive(master_key, "code-hashing")


def encrypt(plaintext: str) -> str:
    return _fernet(settings.FIELD_ENCRYPTION_KEY).encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet(settings.FIELD_ENCRYPTION_KEY).decrypt(token.encode()).decode()
    except InvalidToken as error:
        raise DecryptionError("Can't decrypt: wrong FIELD_ENCRYPTION_KEY or tampered value.") from error


def keyed_hash(value: str) -> str:
    """HMAC-SHA256 — for high-entropy codes a fast keyed hash is enough (no password hashing needed)."""
    return hmac.new(_hash_key(settings.FIELD_ENCRYPTION_KEY), value.encode(), hashlib.sha256).hexdigest()
