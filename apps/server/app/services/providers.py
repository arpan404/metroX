from __future__ import annotations

from typing import Any

import httpx


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

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(
                    f"{base_url.rstrip('/')}/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
            if resp.status_code >= 400:
                return {
                    "valid": False,
                    "provider_type": provider_type,
                    "error": f"model listing failed: {resp.status_code}",
                }
            data = resp.json()
            models = [str(item.get("id")) for item in data.get("data", []) if isinstance(item, dict)]
            return {
                "valid": True,
                "provider_type": provider_type,
                "model": model,
                "discovered_models": models[:100],
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
