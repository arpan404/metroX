from __future__ import annotations

import base64
import hashlib
import os

from app.config import get_settings


class SecretCipher:
    """Lightweight envelope-style cipher for V1 single-tenant storage.

    Replace with KMS-backed encryption in multi-tenant production.
    """

    def __init__(self) -> None:
        settings = get_settings()
        seed = os.getenv("AUTOREDTEAM_SECRET_KEY") or settings.api_key
        self._key = hashlib.sha256(seed.encode("utf-8")).digest()

    def encrypt(self, plaintext: str) -> str:
        data = plaintext.encode("utf-8")
        encrypted = bytes([byte ^ self._key[i % len(self._key)] for i, byte in enumerate(data)])
        return base64.urlsafe_b64encode(encrypted).decode("utf-8")

    def decrypt(self, ciphertext: str) -> str:
        raw = base64.urlsafe_b64decode(ciphertext.encode("utf-8"))
        decrypted = bytes([byte ^ self._key[i % len(self._key)] for i, byte in enumerate(raw)])
        return decrypted.decode("utf-8")
