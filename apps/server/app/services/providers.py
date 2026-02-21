from __future__ import annotations

from typing import Any

import httpx
import time


def provider_capabilities() -> dict[str, Any]:
    return {
        "providers": [
            {
                "provider_type": "synthetic",
                "supports_model_discovery": False,
                "supports_pricing": False,
            },
            {
                "provider_type": "litellm",
                "supports_model_discovery": False,
                "supports_pricing": True,
            },
            {
                "provider_type": "openai_compatible",
                "supports_model_discovery": True,
                "supports_pricing": False,
            },
            {
                "provider_type": "afk_agent",
                "supports_model_discovery": False,
                "supports_pricing": True,
            },
        ]
    }


def validate_provider(payload: dict[str, Any]) -> dict[str, Any]:
    provider_type = str(payload.get("provider_type", "synthetic"))
    model = str(payload.get("model", "")).strip()
    base_url = str(payload.get("base_url", "")).strip()
    api_key = str(payload.get("api_key", "")).strip()

    if provider_type == "synthetic":
        return {"valid": True, "provider_type": provider_type, "model": model or "synthetic"}

    if provider_type == "litellm":
        if not api_key or not model:
            return {
                "valid": False,
                "provider_type": provider_type,
                "error": "litellm validation requires api_key and model",
            }
        try:
            import litellm  # type: ignore # noqa: F401
        except Exception as exc:
            return {
                "valid": False,
                "provider_type": provider_type,
                "error": f"litellm import failed: {exc}",
            }
        return {"valid": True, "provider_type": provider_type, "model": model}

    if provider_type == "openai_compatible":
        if not base_url or not api_key:
            return {
                "valid": False,
                "provider_type": provider_type,
                "error": "openai_compatible validation requires base_url and api_key",
            }

        headers = {"Authorization": f"Bearer {api_key}"}
        models_url = f"{base_url.rstrip('/')}/models"
        health_urls = [f"{base_url.rstrip('/')}/models", f"{base_url.rstrip('/')}/health", f"{base_url.rstrip('/')}/v1/models"]
        last_error = "unknown"
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = _with_retry(lambda: client.get(models_url, headers=headers))
                if resp.status_code < 400:
                    data = resp.json()
                    models = [str(item.get("id")) for item in data.get("data", []) if isinstance(item, dict)]
                    return {
                        "valid": True,
                        "provider_type": provider_type,
                        "model": model,
                        "discovered_models": models[:100],
                    }
                last_error = f"/models returned {resp.status_code}"

                # Fallback probe for providers that don't expose /models in strict OpenAI shape.
                for url in health_urls:
                    ping = _with_retry(lambda: client.get(url, headers=headers))
                    if ping.status_code < 500:
                        return {
                            "valid": ping.status_code < 400 or ping.status_code == 404,
                            "provider_type": provider_type,
                            "model": model,
                            "discovered_models": [],
                            "warning": "model discovery fallback used",
                        }
                return {
                    "valid": False,
                    "provider_type": provider_type,
                    "error": last_error,
                }
        except Exception as exc:
            return {
                "valid": False,
                "provider_type": provider_type,
                "error": f"provider endpoint unreachable: {exc}",
            }

    return {
        "valid": False,
        "provider_type": provider_type,
        "error": "unsupported provider_type",
    }


def _with_retry(fn, *, attempts: int = 3, base_sleep: float = 0.2):
    last_exc: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if i == attempts - 1:
                break
            time.sleep(base_sleep * (2 ** i))
    if last_exc:
        raise last_exc
    raise RuntimeError("retry wrapper reached invalid state")
