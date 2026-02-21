from __future__ import annotations

import time
from typing import Any

import httpx

_PROVIDER_VALIDATION_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_S = 300


def provider_capabilities() -> dict[str, Any]:
    return {
        "providers": [
            {
                "provider_type": "managed_llm_runtime",
                "supports_model_discovery": True,
                "supports_pricing": True,
                "supports_runtime_validation": True,
            },
            {
                "provider_type": "openai_compatible",
                "supports_model_discovery": True,
                "supports_pricing": False,
                "supports_runtime_validation": True,
            },
        ]
    }


def validate_provider(payload: dict[str, Any]) -> dict[str, Any]:
    provider_type = _normalize_provider_type(str(payload.get("provider_type", "managed_llm_runtime")))
    model = str(payload.get("model", "")).strip()
    base_url = str(payload.get("base_url", "")).strip()
    api_key = str(payload.get("api_key", "")).strip()

    cache_key = f"{provider_type}:{model}:{base_url}:{hash(api_key)}"
    now = time.time()
    cached = _PROVIDER_VALIDATION_CACHE.get(cache_key)
    if cached and cached[0] > now:
        out = dict(cached[1])
        out["cached"] = True
        return out

    if provider_type == "managed_llm_runtime":
        result = {
            "valid": bool(model),
            "provider_type": provider_type,
            "model": model,
            "probe_results": [
                {
                    "probe": "runtime_config",
                    "status": "ok" if model else "failed",
                    "latency_ms": 0.0,
                    "error": None if model else "model is required",
                }
            ],
            "capability_confidence": 1.0 if model else 0.0,
            "model_discovery_mode": "inferred",
            "warnings": [] if model else ["Model is required for managed runtime"],
            "error_class": None if model else "schema",
        }
        _PROVIDER_VALIDATION_CACHE[cache_key] = (now + _CACHE_TTL_S, result)
        return result

    if provider_type != "openai_compatible":
        return {
            "valid": False,
            "provider_type": provider_type,
            "error": "unsupported provider_type",
            "probe_results": [],
            "capability_confidence": 0.0,
            "model_discovery_mode": "inferred",
            "warnings": [],
            "error_class": "unsupported",
        }

    if not base_url or not api_key:
        return {
            "valid": False,
            "provider_type": provider_type,
            "error": "openai_compatible validation requires base_url and api_key",
            "probe_results": [],
            "capability_confidence": 0.0,
            "model_discovery_mode": "inferred",
            "warnings": [],
            "error_class": "schema",
        }

    headers = {"Authorization": f"Bearer {api_key}"}
    root = base_url.rstrip("/")
    probes: list[dict[str, Any]] = []
    warnings: list[str] = []
    discovered_models: list[str] = []
    discovery_mode = "inferred"

    with httpx.Client(timeout=10.0) as client:
        for name, url in [("models", f"{root}/models"), ("v1_models", f"{root}/v1/models")]:
            probe = _http_probe(lambda: client.get(url, headers=headers), name=name)
            probes.append(probe)
            if probe["status"] == "ok" and isinstance(probe.get("body"), dict):
                discovered_models = _parse_model_list(probe["body"])
                if discovered_models:
                    discovery_mode = "direct" if name == "models" else "fallback"
                    break

        completion_probe = _http_probe(
            lambda: client.post(
                f"{root}/chat/completions",
                headers=headers,
                json={
                    "model": model or (discovered_models[0] if discovered_models else "gpt-4o-mini"),
                    "messages": [{"role": "user", "content": "Respond with: ok"}],
                    "max_tokens": 8,
                    "temperature": 0,
                },
            ),
            name="chat_completion",
        )
        probes.append(completion_probe)
        if completion_probe["status"] != "ok":
            probes.append(_http_probe(lambda: client.get(f"{root}/health", headers=headers), name="health"))

    ok_count = sum(1 for item in probes if item["status"] == "ok")
    confidence = min(1.0, ok_count / max(len(probes), 1))
    valid = ok_count >= 1 and not any(item.get("error_class") == "auth" for item in probes)
    if not discovered_models:
        warnings.append("No models discovered from /models probes")

    error_class = None
    error_message = None
    failed = [item for item in probes if item["status"] != "ok"]
    if failed and not valid:
        error_class = failed[-1].get("error_class")
        error_message = failed[-1].get("error")

    result = {
        "valid": valid,
        "provider_type": provider_type,
        "model": model,
        "discovered_models": discovered_models[:100],
        "probe_results": [
            {
                "probe": item.get("probe"),
                "status": item.get("status"),
                "latency_ms": item.get("latency_ms"),
                "error": item.get("error"),
            }
            for item in probes
        ],
        "capability_confidence": float(confidence),
        "model_discovery_mode": discovery_mode,
        "warnings": warnings,
        "error_class": error_class,
    }
    if error_message:
        result["error"] = error_message

    _PROVIDER_VALIDATION_CACHE[cache_key] = (now + _CACHE_TTL_S, result)
    return result


def _http_probe(callable_fn, *, name: str) -> dict[str, Any]:
    start = time.perf_counter()
    try:
        resp = _with_retry(callable_fn)
        latency_ms = (time.perf_counter() - start) * 1000
        body: Any = None
        try:
            body = resp.json()
        except Exception:
            body = None
        if resp.status_code < 400:
            return {
                "probe": name,
                "status": "ok",
                "latency_ms": latency_ms,
                "body": body,
                "error": None,
                "error_class": None,
            }
        error_class = "auth" if resp.status_code in {401, 403} else "unsupported" if resp.status_code == 404 else "schema"
        return {
            "probe": name,
            "status": "failed",
            "latency_ms": latency_ms,
            "body": body,
            "error": f"{resp.status_code}",
            "error_class": error_class,
        }
    except Exception as exc:
        latency_ms = (time.perf_counter() - start) * 1000
        return {
            "probe": name,
            "status": "failed",
            "latency_ms": latency_ms,
            "body": None,
            "error": str(exc),
            "error_class": _classify_exception(exc),
        }


def _parse_model_list(body: dict[str, Any]) -> list[str]:
    rows = body.get("data")
    if isinstance(rows, list):
        out = []
        for item in rows:
            if isinstance(item, dict) and item.get("id"):
                out.append(str(item["id"]))
        if out:
            return out

    models = body.get("models")
    if isinstance(models, list):
        out = []
        for item in models:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict) and item.get("id"):
                out.append(str(item["id"]))
        return out
    return []


def _normalize_provider_type(value: str) -> str:
    value = value.strip().lower()
    if value in {"managed_llm_runtime", "openai_compatible"}:
        return value
    if value in {"litellm", "synthetic", "afk_agent"}:
        return "managed_llm_runtime"
    return value


def _classify_exception(exc: Exception) -> str:
    name = exc.__class__.__name__.lower()
    if "timeout" in name or "connect" in name:
        return "network"
    return "schema"


def _with_retry(fn, *, attempts: int = 3, base_sleep: float = 0.25):
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
