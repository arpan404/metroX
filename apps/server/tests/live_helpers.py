from __future__ import annotations

import os
from typing import Any

import httpx


def live_test_config() -> dict[str, str]:
    return {
        "ollama_base_url": os.getenv("METROX_LIVE_OLLAMA_BASE_URL", "http://localhost:11434"),
        "openai_compat_base_url": os.getenv(
            "METROX_LIVE_OPENAI_COMPAT_BASE_URL", "http://localhost:11434/v1"
        ),
        "managed_model": os.getenv("METROX_LIVE_MANAGED_MODEL", "ollama_chat/gpt-oss:20b"),
        "openai_model": os.getenv("METROX_LIVE_OPENAI_MODEL", "gpt-oss:20b"),
        "api_key": os.getenv("METROX_LIVE_API_KEY", "ollama"),
    }


def live_tests_enabled() -> bool:
    return os.getenv("METROX_ENABLE_LIVE_MODEL_TESTS", "0") == "1"


def require_live_preflight(cfg: dict[str, str]) -> None:
    _assert_ollama_health(cfg["ollama_base_url"])
    _assert_model_available(cfg["ollama_base_url"], cfg["openai_model"])


def configure_afk_litellm_env(cfg: dict[str, str]) -> None:
    os.environ["AFK_LLM_PROVIDER"] = "litellm"
    os.environ["AFK_LLM_MODEL"] = cfg["managed_model"]
    # ollama_chat/* provider routing in litellm expects native Ollama endpoints;
    # forcing /v1 breaks chat path resolution.
    os.environ.pop("AFK_LLM_API_BASE_URL", None)
    os.environ["AFK_LLM_API_KEY"] = cfg["api_key"]


def _assert_ollama_health(base_url: str) -> None:
    url = f"{base_url.rstrip('/')}/api/tags"
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url)
    except Exception as exc:
        raise AssertionError(f"Ollama unreachable at {url}: {exc}") from exc
    if response.status_code >= 400:
        raise AssertionError(f"Ollama health check failed at {url} with status {response.status_code}")


def _assert_model_available(base_url: str, model_name: str) -> None:
    url = f"{base_url.rstrip('/')}/api/tags"
    with httpx.Client(timeout=10.0) as client:
        response = client.get(url)
        response.raise_for_status()
        payload: dict[str, Any] = response.json() if response.content else {}

    models = payload.get("models") if isinstance(payload, dict) else []
    names = {str(item.get("name", "")).strip() for item in models if isinstance(item, dict)}
    if model_name not in names:
        raise AssertionError(
            f"Required Ollama model '{model_name}' not found at {url}. Available: {sorted(name for name in names if name)}"
        )
