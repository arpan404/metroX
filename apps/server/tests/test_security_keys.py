from __future__ import annotations

import pytest

from app.models import ProviderCredential
from app.security.service import SecretCipher, activate_key, create_key, retire_key


def test_secret_cipher_fails_without_active_key(db_session):
    cipher = SecretCipher(db_session)
    with pytest.raises(ValueError, match="No active secret key"):
        cipher.encrypt("secret")


def test_secret_cipher_retired_key_decrypt_failure(db_session):
    first = create_key(db_session, version="v1", key_material="material-v1", actor="test")
    cipher = SecretCipher(db_session)
    encrypted, key_version = cipher.encrypt("secret-token")
    cred = ProviderCredential(
        name="cred",
        provider_type="managed_llm_runtime",
        encrypted_secret=encrypted,
        key_version=key_version,
        status="active",
    )
    db_session.add(cred)
    db_session.commit()

    second = create_key(db_session, version="v2", key_material="material-v2", actor="test")
    activate_key(db_session, key_id=second.id, actor="test")
    retire_key(db_session, key_id=first.id, actor="test")

    with pytest.raises(ValueError, match="retired"):
        SecretCipher(db_session).decrypt(cred.encrypted_secret)
