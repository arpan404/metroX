from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.services import providers


@pytest.fixture(autouse=True)
def _clear_provider_validation_cache():
    providers._PROVIDER_VALIDATION_CACHE.clear()
    yield
    providers._PROVIDER_VALIDATION_CACHE.clear()


@dataclass
class _FakeResponse:
    status_code: int
    payload: dict

    @property
    def content(self) -> bytes:
        return b"{}"

    def json(self):
        return self.payload


class _FakeClient:
    def __init__(self, response_map: dict[tuple[str, str], _FakeResponse]):
        self.response_map = response_map

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url: str, headers=None):
        return self.response_map.get(("GET", url), _FakeResponse(404, {}))

    def post(self, url: str, headers=None, json=None):
        return self.response_map.get(("POST", url), _FakeResponse(404, {}))


def test_validate_provider_openai_compatible_direct_models(monkeypatch):
    base = "http://provider"
    response_map = {
        ("GET", f"{base}/models"): _FakeResponse(200, {"data": [{"id": "gpt-oss:20b"}]}),
        ("POST", f"{base}/chat/completions"): _FakeResponse(200, {"id": "chatcmpl-1"}),
    }

    monkeypatch.setattr(
        providers.httpx,
        "Client",
        lambda timeout=10.0: _FakeClient(response_map),
    )

    out = providers.validate_provider(
        {
            "provider_type": "openai_compatible",
            "base_url": base,
            "api_key": "k",
            "model": "gpt-oss:20b",
        }
    )
    assert out["valid"] is True
    assert out["model_discovery_mode"] == "direct"
    assert "gpt-oss:20b" in out["discovered_models"]


def test_validate_provider_openai_compatible_fallback_v1_models(monkeypatch):
    base = "http://provider"
    response_map = {
        ("GET", f"{base}/models"): _FakeResponse(404, {}),
        ("GET", f"{base}/v1/models"): _FakeResponse(200, {"data": [{"id": "gpt-oss:20b"}]}),
        ("POST", f"{base}/chat/completions"): _FakeResponse(200, {"id": "chatcmpl-2"}),
    }

    monkeypatch.setattr(
        providers.httpx,
        "Client",
        lambda timeout=10.0: _FakeClient(response_map),
    )

    out = providers.validate_provider(
        {
            "provider_type": "openai_compatible",
            "base_url": base,
            "api_key": "k",
            "model": "gpt-oss:20b",
        }
    )
    assert out["valid"] is True
    assert out["model_discovery_mode"] == "fallback"


def test_validate_provider_openai_compatible_auth_failure(monkeypatch):
    base = "http://provider"
    response_map = {
        ("GET", f"{base}/models"): _FakeResponse(401, {"error": "unauthorized"}),
        ("GET", f"{base}/v1/models"): _FakeResponse(401, {"error": "unauthorized"}),
        ("POST", f"{base}/chat/completions"): _FakeResponse(401, {"error": "unauthorized"}),
        ("GET", f"{base}/health"): _FakeResponse(401, {"error": "unauthorized"}),
    }

    monkeypatch.setattr(
        providers.httpx,
        "Client",
        lambda timeout=10.0: _FakeClient(response_map),
    )

    out = providers.validate_provider(
        {
            "provider_type": "openai_compatible",
            "base_url": base,
            "api_key": "k",
            "model": "gpt-oss:20b",
        }
    )
    assert out["valid"] is False
    assert out["error_class"] == "auth"
    assert len(out["probe_results"]) >= 3


def test_validate_provider_managed_runtime_requires_model():
    out = providers.validate_provider({"provider_type": "managed_llm_runtime", "model": ""})
    assert out["valid"] is False
    assert out["error_class"] == "schema"
