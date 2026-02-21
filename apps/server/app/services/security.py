from __future__ import annotations

import base64
import hashlib
import json
import os
from dataclasses import dataclass
from typing import Protocol

from app.config import get_settings


@dataclass
class CipherKey:
    version: str
    material: bytes


class KeyResolver:
    """Versioned key resolver for rotation-ready secret encryption."""

    def __init__(self) -> None:
        settings = get_settings()
        self.active_version = settings.secret_active_key_version
        raw = (settings.secret_keys_json or "").strip()
        self.keys: dict[str, CipherKey] = {}
        if raw:
            try:
                payload = json.loads(raw)
                for version, value in payload.items():
                    self.keys[str(version)] = CipherKey(
                        version=str(version),
                        material=hashlib.sha256(str(value).encode("utf-8")).digest(),
                    )
            except Exception:
                self.keys = {}

        if not self.keys:
            seed = os.getenv("AUTOREDTEAM_SECRET_KEY") or settings.api_key
            self.keys = {
                self.active_version: CipherKey(
                    version=self.active_version,
                    material=hashlib.sha256(seed.encode("utf-8")).digest(),
                )
            }

        if self.active_version not in self.keys:
            first_version = next(iter(self.keys.keys()))
            self.active_version = first_version

    def get(self, version: str) -> CipherKey:
        if version not in self.keys:
            raise ValueError(f"Unknown key version: {version}")
        return self.keys[version]

    def current(self) -> CipherKey:
        return self.get(self.active_version)


class SecretBackend(Protocol):
    def encrypt(self, plaintext: str) -> str:
        ...

    def decrypt(self, ciphertext: str) -> str:
        ...


class LocalEnvelopeBackend:
    def __init__(self) -> None:
        self.resolver = KeyResolver()

    def encrypt(self, plaintext: str) -> str:
        key = self.resolver.current()
        data = plaintext.encode("utf-8")
        encrypted = bytes([byte ^ key.material[i % len(key.material)] for i, byte in enumerate(data)])
        payload = base64.urlsafe_b64encode(encrypted).decode("utf-8")
        return f"kver:{key.version}:{payload}"

    def decrypt(self, ciphertext: str) -> str:
        if ciphertext.startswith("kver:"):
            _, version, payload = ciphertext.split(":", 2)
            key = self.resolver.get(version)
            raw = base64.urlsafe_b64decode(payload.encode("utf-8"))
            decrypted = bytes([byte ^ key.material[i % len(key.material)] for i, byte in enumerate(raw)])
            return decrypted.decode("utf-8")

        key = self.resolver.current()
        raw = base64.urlsafe_b64decode(ciphertext.encode("utf-8"))
        decrypted = bytes([byte ^ key.material[i % len(key.material)] for i, byte in enumerate(raw)])
        return decrypted.decode("utf-8")


class AwsKmsBackend:
    def __init__(self, key_id: str, region: str) -> None:
        if not key_id:
            raise ValueError("aws_kms_key_id is required for kms backend")
        self.key_id = key_id
        try:
            import boto3  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("boto3 is required for kms backend") from exc
        self.client = boto3.client("kms", region_name=region)

    def encrypt(self, plaintext: str) -> str:
        blob = plaintext.encode("utf-8")
        out = self.client.encrypt(KeyId=self.key_id, Plaintext=blob)
        ciphertext_blob = out["CiphertextBlob"]
        payload = base64.urlsafe_b64encode(ciphertext_blob).decode("utf-8")
        return f"kms:{payload}"

    def decrypt(self, ciphertext: str) -> str:
        if not ciphertext.startswith("kms:"):
            raise ValueError("ciphertext is not kms payload")
        payload = ciphertext.split(":", 1)[1]
        blob = base64.urlsafe_b64decode(payload.encode("utf-8"))
        out = self.client.decrypt(CiphertextBlob=blob)
        return out["Plaintext"].decode("utf-8")


class SecretCipher:
    """Envelope-style cipher with key version prefix.

    Format: `kver:<version>:<b64_payload>`
    This is rotation-ready and KMS-provider swappable in V2.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self.backend: SecretBackend
        if settings.secret_backend == "kms":
            try:
                self.backend = AwsKmsBackend(settings.aws_kms_key_id, settings.aws_region)
            except Exception:
                # Safe fallback for local/dev and test environments.
                self.backend = LocalEnvelopeBackend()
        else:
            self.backend = LocalEnvelopeBackend()

    def encrypt(self, plaintext: str) -> str:
        return self.backend.encrypt(plaintext)

    def decrypt(self, ciphertext: str) -> str:
        if ciphertext.startswith("kms:"):
            return self.backend.decrypt(ciphertext)
        return LocalEnvelopeBackend().decrypt(ciphertext)
