from __future__ import annotations

import base64
import hashlib
import logging
import os
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.orm import Session

from app.models import ProviderCredential, SecretAccessAudit, SecretKey, SecretKeyEvent

logger = logging.getLogger(__name__)

_GCM_NONCE_SIZE = 12


class SecretCipher:
    """DB-managed key encryption for provider credentials using AES-256-GCM."""

    def __init__(self, db: Session):
        self.db = db

    def encrypt(self, plaintext: str) -> tuple[str, str]:
        key = _active_key(self.db)
        if not key:
            raise ValueError("No active secret key. Create and activate a key via /v1/security/keys")
        material = _unwrap_material(key.encrypted_material)
        encrypted = _aead_encrypt(plaintext.encode("utf-8"), material)
        payload = base64.urlsafe_b64encode(encrypted).decode("utf-8")
        return f"dbk2:{key.id}:{key.version}:{payload}", key.version

    def decrypt(self, ciphertext: str) -> str:
        if ciphertext.startswith("dbk2:"):
            _, key_id, version, payload = ciphertext.split(":", 3)
        elif ciphertext.startswith("dbk:"):
            # Legacy XOR format - supported for read/migration only
            _, key_id, version, payload = ciphertext.split(":", 3)
        else:
            raise ValueError("Unsupported ciphertext format; credential must be re-encrypted")

        key = self.db.query(SecretKey).filter(SecretKey.id == key_id).one_or_none()
        if not key:
            raise ValueError("Secret key not found")
        if key.status == "retired":
            raise ValueError("Secret key is retired")
        if key.version != version:
            raise ValueError("Secret key version mismatch")

        material = _unwrap_material(key.encrypted_material)
        raw = base64.urlsafe_b64decode(payload.encode("utf-8"))

        if ciphertext.startswith("dbk2:"):
            plain = _aead_decrypt(raw, material)
        else:
            # Legacy XOR path for migration
            plain = _legacy_xor(raw, material)

        return plain.decode("utf-8")


def list_keys(db: Session) -> list[SecretKey]:
    return db.query(SecretKey).order_by(SecretKey.created_at.desc()).all()


def create_key(db: Session, *, version: str, key_material: str, actor: str) -> SecretKey:
    existing = db.query(SecretKey).filter(SecretKey.version == version).one_or_none()
    if existing:
        raise ValueError("key version already exists")
    active = _active_key(db)
    row = SecretKey(
        version=version,
        encrypted_material=_wrap_material(key_material.encode("utf-8")),
        status="retiring" if active else "active",
        activated_at=datetime.now(timezone.utc) if not active else None,
    )
    db.add(row)
    db.flush()
    _log_key_event(db, key_id=row.id, action="create", actor=actor, meta={"version": version})
    db.commit()
    db.refresh(row)
    return row


def activate_key(db: Session, *, key_id: str, actor: str) -> SecretKey:
    row = db.query(SecretKey).filter(SecretKey.id == key_id).one_or_none()
    if not row:
        raise ValueError("key not found")
    if row.status == "retired":
        raise ValueError("cannot activate retired key")

    now = datetime.now(timezone.utc)
    for key in db.query(SecretKey).filter(SecretKey.status == "active").all():
        key.status = "retiring"
    row.status = "active"
    row.activated_at = now
    _log_key_event(db, key_id=row.id, action="activate", actor=actor, meta={})
    db.commit()
    db.refresh(row)
    return row


def reencrypt_credentials(db: Session, *, key_id: str, actor: str) -> dict[str, int]:
    key = db.query(SecretKey).filter(SecretKey.id == key_id).one_or_none()
    if not key:
        raise ValueError("key not found")
    if key.status != "active":
        raise ValueError("key must be active before re-encryption")

    cipher = SecretCipher(db)
    rows = db.query(ProviderCredential).all()
    updated = 0
    for row in rows:
        try:
            plaintext = cipher.decrypt(row.encrypted_secret)
            db.add(
                SecretAccessAudit(
                    provider_credential_id=row.id,
                    action="decrypt_for_reencrypt",
                    actor=actor,
                    success=True,
                )
            )
            encrypted, version = cipher.encrypt(plaintext)
            row.encrypted_secret = encrypted
            row.key_version = version
            row.last_rotated_at = datetime.now(timezone.utc)
            updated += 1
        except Exception as exc:
            db.add(
                SecretAccessAudit(
                    provider_credential_id=row.id,
                    action="decrypt_for_reencrypt",
                    actor=actor,
                    success=False,
                    error=str(exc),
                )
            )
            continue
    _log_key_event(db, key_id=key_id, action="reencrypt_credentials", actor=actor, meta={"updated": updated})
    db.commit()
    return {"updated": updated, "total": len(rows)}


def retire_key(db: Session, *, key_id: str, actor: str) -> SecretKey:
    row = db.query(SecretKey).filter(SecretKey.id == key_id).one_or_none()
    if not row:
        raise ValueError("key not found")
    if row.status == "active":
        raise ValueError("cannot retire active key")
    row.status = "retired"
    row.retired_at = datetime.now(timezone.utc)
    _log_key_event(db, key_id=row.id, action="retire", actor=actor, meta={})
    db.commit()
    db.refresh(row)
    return row


def list_key_events(db: Session) -> list[SecretKeyEvent]:
    return db.query(SecretKeyEvent).order_by(SecretKeyEvent.created_at.desc()).limit(200).all()


def _active_key(db: Session) -> SecretKey | None:
    return (
        db.query(SecretKey)
        .filter(SecretKey.status == "active")
        .order_by(SecretKey.activated_at.desc(), SecretKey.created_at.desc())
        .first()
    )


def _log_key_event(db: Session, *, key_id: str, action: str, actor: str, meta: dict) -> None:
    db.add(SecretKeyEvent(key_id=key_id, action=action, actor=actor, meta=meta))


def _aead_encrypt(data: bytes, key_material: bytes) -> bytes:
    """Encrypt with AES-256-GCM. Returns nonce || ciphertext (including auth tag)."""
    key = _derive_aes_key(key_material)
    aesgcm = AESGCM(key)
    nonce = os.urandom(_GCM_NONCE_SIZE)
    ciphertext = aesgcm.encrypt(nonce, data, None)
    return nonce + ciphertext


def _aead_decrypt(data: bytes, key_material: bytes) -> bytes:
    """Decrypt AES-256-GCM. Input is nonce || ciphertext (including auth tag)."""
    if len(data) < _GCM_NONCE_SIZE + 16:
        raise ValueError("Ciphertext too short for AES-256-GCM")
    key = _derive_aes_key(key_material)
    aesgcm = AESGCM(key)
    nonce = data[:_GCM_NONCE_SIZE]
    ciphertext = data[_GCM_NONCE_SIZE:]
    return aesgcm.decrypt(nonce, ciphertext, None)


def _derive_aes_key(key_material: bytes) -> bytes:
    """Derive a 256-bit AES key from raw key material using HKDF-SHA256."""
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"metrox-credential-aead-v2",
    )
    return hkdf.derive(key_material)


def _get_wrap_key() -> bytes:
    """Get the master wrap key from METROX_MASTER_WRAP_KEY environment variable."""
    raw = os.getenv("METROX_MASTER_WRAP_KEY", "").strip()
    if not raw:
        raise ValueError(
            "METROX_MASTER_WRAP_KEY environment variable is not set. "
            "Set it to a strong random secret before using credential encryption."
        )
    return hashlib.sha256(raw.encode("utf-8")).digest()


def _wrap_material(material: bytes) -> str:
    """Wrap key material using AES-256-GCM with the master wrap key."""
    master = _get_wrap_key()
    encrypted = _aead_encrypt(material, master)
    return "v2:" + base64.urlsafe_b64encode(encrypted).decode("utf-8")


def _unwrap_material(encrypted_material: str) -> bytes:
    """Unwrap key material. Supports new v2 (AEAD) and legacy (XOR) formats."""
    master = _get_wrap_key()
    if encrypted_material.startswith("v2:"):
        raw = base64.urlsafe_b64decode(encrypted_material[3:].encode("utf-8"))
        return _aead_decrypt(raw, master)
    # Legacy XOR format for migration
    wrapped = base64.urlsafe_b64decode(encrypted_material.encode("utf-8"))
    return _legacy_xor(wrapped, master)


def _legacy_xor(data: bytes, key_material: bytes) -> bytes:
    """Legacy XOR 'encryption' - kept only for migrating old data."""
    key = hashlib.sha256(key_material).digest()
    return bytes([byte ^ key[i % len(key)] for i, byte in enumerate(data)])
