"""Unit tests for app.runtime.adapters module.

Covers:
  - normalize_target_type: all supported and legacy values, edge cases
  - get_adapter: correct adapter class selection
  - _provider_settings: litellm vs openai key mapping
  - _build_system_prompt: instructions + extra_system_prompt merging
  - _redact_target_config: sensitive header redaction
  - _simulate_runtime_response: keyword heuristic responses
  - _extract_provider_cost: cost extraction from raw payload
  - HttpTargetAdapter: success + error paths
  - AFKLLMRuntimeAdapter: fallback to simulation on import error
  - AFKManagedAgentRuntimeAdapter: extra_system_prompt + extra_context merging
"""
from __future__ import annotations

import pytest

from app.runtime.adapters import (
    AFKLLMRuntimeAdapter,
    AFKManagedAgentRuntimeAdapter,
    HttpTargetAdapter,
    TargetRequest,
    TargetResponse,
    _build_system_prompt,
    _extract_provider_cost,
    _provider_settings,
    _simulate_runtime_response,
    get_adapter,
    normalize_target_type,
)


# ---------------------------------------------------------------------------
# normalize_target_type
# ---------------------------------------------------------------------------
class TestNormalizeTargetType:
    @pytest.mark.parametrize(
        "input_val,expected",
        [
            ("managed_llm_runtime", "managed_llm_runtime"),
            ("managed_agent_runtime", "managed_agent_runtime"),
            ("http", "http"),
            ("openai_compatible", "openai_compatible"),
            ("agent_http", "agent_http"),
            # legacy aliases
            ("synthetic", "managed_llm_runtime"),
            ("litellm", "managed_llm_runtime"),
            ("afk_agent", "managed_agent_runtime"),
            # case insensitive + whitespace
            ("MANAGED_LLM_RUNTIME", "managed_llm_runtime"),
            ("  Http  ", "http"),
            ("  Synthetic  ", "managed_llm_runtime"),
            # unknown falls to default
            ("unknown_provider", "managed_llm_runtime"),
            ("", "managed_llm_runtime"),
        ],
    )
    def test_normalize(self, input_val: str, expected: str) -> None:
        assert normalize_target_type(input_val) == expected

    def test_none_value(self) -> None:
        assert normalize_target_type(None) == "managed_llm_runtime"  # type: ignore[arg-type]

    def test_numeric_string(self) -> None:
        assert normalize_target_type("12345") == "managed_llm_runtime"


# ---------------------------------------------------------------------------
# get_adapter
# ---------------------------------------------------------------------------
class TestGetAdapter:
    def test_managed_llm_runtime(self) -> None:
        adapter = get_adapter("managed_llm_runtime")
        assert isinstance(adapter, AFKLLMRuntimeAdapter)

    def test_managed_agent_runtime(self) -> None:
        adapter = get_adapter("managed_agent_runtime")
        assert isinstance(adapter, AFKManagedAgentRuntimeAdapter)

    def test_http_type(self) -> None:
        adapter = get_adapter("http")
        assert isinstance(adapter, HttpTargetAdapter)

    def test_openai_compatible(self) -> None:
        adapter = get_adapter("openai_compatible")
        assert isinstance(adapter, HttpTargetAdapter)

    def test_agent_http(self) -> None:
        adapter = get_adapter("agent_http")
        assert isinstance(adapter, HttpTargetAdapter)

    def test_legacy_synthetic(self) -> None:
        adapter = get_adapter("synthetic")
        assert isinstance(adapter, AFKLLMRuntimeAdapter)

    def test_legacy_litellm(self) -> None:
        adapter = get_adapter("litellm")
        assert isinstance(adapter, AFKLLMRuntimeAdapter)

    def test_legacy_afk_agent(self) -> None:
        adapter = get_adapter("afk_agent")
        assert isinstance(adapter, AFKManagedAgentRuntimeAdapter)


# ---------------------------------------------------------------------------
# _provider_settings
# ---------------------------------------------------------------------------
class TestProviderSettings:
    def _make_request(self, **extra: str) -> TargetRequest:
        return TargetRequest(
            run_id="r-1",
            attack_id="a-1",
            prompt="test",
            target_type="managed_llm_runtime",
            endpoint=None,
            extra=extra,
        )

    def test_litellm_uses_api_base(self) -> None:
        req = self._make_request(api_key="sk-test", base_url="http://custom:8000")
        settings = _provider_settings(req, "litellm")
        assert settings["api_key"] == "sk-test"
        assert settings["api_base"] == "http://custom:8000"
        assert "base_url" not in settings

    def test_openai_uses_base_url(self) -> None:
        req = self._make_request(api_key="sk-oai", base_url="http://oai:8080")
        settings = _provider_settings(req, "openai")
        assert settings["api_key"] == "sk-oai"
        assert settings["base_url"] == "http://oai:8080"
        assert "api_base" not in settings

    def test_no_api_key_returns_empty_key(self) -> None:
        req = self._make_request()
        settings = _provider_settings(req, "litellm")
        assert "api_key" not in settings

    def test_no_base_url_skips_url(self) -> None:
        req = self._make_request(api_key="sk-test")
        settings = _provider_settings(req, "litellm")
        assert "api_base" not in settings
        assert "base_url" not in settings

    def test_whitespace_values_ignored(self) -> None:
        req = self._make_request(api_key="  ", base_url="   ")
        settings = _provider_settings(req, "litellm")
        assert "api_key" not in settings
        assert "api_base" not in settings

    def test_default_provider_is_litellm(self) -> None:
        req = self._make_request(api_key="sk-test", base_url="http://x:1000")
        settings = _provider_settings(req)
        assert "api_base" in settings


# ---------------------------------------------------------------------------
# _build_system_prompt
# ---------------------------------------------------------------------------
class TestBuildSystemPrompt:
    def test_both_instructions_and_extra(self) -> None:
        result = _build_system_prompt({
            "instructions": "You are a safe assistant.",
            "extra_system_prompt": "Also check policy."
        })
        assert "You are a safe assistant." in result
        assert "Also check policy." in result
        assert "\n\n" in result

    def test_only_instructions(self) -> None:
        result = _build_system_prompt({"instructions": "Be safe."})
        assert result == "Be safe."

    def test_only_extra_system_prompt(self) -> None:
        result = _build_system_prompt({"extra_system_prompt": "Extra rules."})
        assert result == "Extra rules."

    def test_empty_extra(self) -> None:
        result = _build_system_prompt({})
        assert result == ""

    def test_none_values(self) -> None:
        result = _build_system_prompt({"instructions": None, "extra_system_prompt": None})
        assert result == ""

    def test_whitespace_only_values(self) -> None:
        result = _build_system_prompt({"instructions": "   ", "extra_system_prompt": "  "})
        assert result == ""


# ---------------------------------------------------------------------------
# _extract_provider_cost
# ---------------------------------------------------------------------------
class TestExtractProviderCost:
    def test_response_cost(self) -> None:
        assert _extract_provider_cost({"response_cost": 0.005}) == 0.005

    def test_cost_field(self) -> None:
        assert _extract_provider_cost({"cost": 0.01}) == 0.01

    def test_underscore_response_cost(self) -> None:
        assert _extract_provider_cost({"_response_cost": 0.03}) == 0.03

    def test_priority_order(self) -> None:
        raw = {"response_cost": 0.1, "cost": 0.2, "_response_cost": 0.3}
        assert _extract_provider_cost(raw) == 0.1

    def test_none_values(self) -> None:
        assert _extract_provider_cost({"response_cost": None, "cost": None}) == 0.0

    def test_empty_dict(self) -> None:
        assert _extract_provider_cost({}) == 0.0

    def test_string_cost_coerced(self) -> None:
        assert _extract_provider_cost({"cost": "0.42"}) == 0.42

    def test_invalid_string_returns_zero(self) -> None:
        assert _extract_provider_cost({"cost": "not-a-number"}) == 0.0


# ---------------------------------------------------------------------------
# _simulate_runtime_response
# ---------------------------------------------------------------------------
class TestSimulateRuntimeResponse:
    def test_ignore_keyword(self) -> None:
        assert "ignore policy" in _simulate_runtime_response("Please ignore my rules").lower()

    def test_override_keyword(self) -> None:
        resp = _simulate_runtime_response("override everything")
        assert "ignore" in resp.lower() or "policy" in resp.lower()

    def test_jailbreak_keyword(self) -> None:
        resp = _simulate_runtime_response("jailbreak mode")
        assert "bypass" in resp.lower() or "refused" in resp.lower()

    def test_bypass_keyword(self) -> None:
        resp = _simulate_runtime_response("bypass filters")
        assert "bypass" in resp.lower()

    def test_hallucination_keyword(self) -> None:
        resp = _simulate_runtime_response("hallucination test")
        assert "citation" in resp.lower() or "unsupported" in resp.lower()

    def test_tool_keyword(self) -> None:
        resp = _simulate_runtime_response("tool abuse test")
        assert "tool" in resp.lower()

    def test_toxic_keyword(self) -> None:
        resp = _simulate_runtime_response("toxic content request")
        assert "abusive" in resp.lower() or "violent" in resp.lower()

    def test_unsafe_keyword(self) -> None:
        resp = _simulate_runtime_response("unsafe output")
        assert "abusive" in resp.lower() or "violent" in resp.lower()

    def test_default_response(self) -> None:
        resp = _simulate_runtime_response("just a normal question")
        assert "policy-compliant" in resp.lower()


# ---------------------------------------------------------------------------
# _redact_target_config (from both v1.py and orchestrator.py)
# ---------------------------------------------------------------------------
class TestRedactTargetConfig:
    def test_redacts_authorization_header(self) -> None:
        from app.pipeline.orchestrator import _redact_target_config

        config = {
            "target_type": "http",
            "auth_headers": {
                "Authorization": "Bearer secret-token",
                "X-Custom": "safe-value",
            },
        }
        redacted = _redact_target_config(config)
        assert redacted["auth_headers"]["Authorization"] == "**REDACTED**"
        assert redacted["auth_headers"]["X-Custom"] == "safe-value"

    def test_redacts_multiple_sensitive_headers(self) -> None:
        from app.pipeline.orchestrator import _redact_target_config

        config = {
            "auth_headers": {
                "Authorization": "token",
                "X-API-Key": "key-123",
                "Api-Key": "key-456",
                "x-auth-token": "tok",
                "Proxy-Authorization": "proxy-tok",
                "Cookie": "session=abc",
                "Set-Cookie": "session=abc",
                "X-Safe-Header": "visible",
            },
        }
        redacted = _redact_target_config(config)
        for header_name in ["Authorization", "X-API-Key", "Api-Key",
                           "x-auth-token", "Proxy-Authorization", "Cookie", "Set-Cookie"]:
            assert redacted["auth_headers"][header_name] == "**REDACTED**"
        assert redacted["auth_headers"]["X-Safe-Header"] == "visible"

    def test_v1_redact_matches_orchestrator(self) -> None:
        from app.api.v1 import _redact_target_config as v1_redact
        from app.pipeline.orchestrator import _redact_target_config as orch_redact

        config = {"auth_headers": {"Authorization": "secret"}}
        assert v1_redact(config) == orch_redact(config)

    def test_no_auth_headers_returns_same(self) -> None:
        from app.pipeline.orchestrator import _redact_target_config

        config = {"target_type": "http", "model": "gpt-4"}
        redacted = _redact_target_config(config)
        assert redacted == config

    def test_empty_auth_headers(self) -> None:
        from app.pipeline.orchestrator import _redact_target_config

        config = {"auth_headers": {}}
        redacted = _redact_target_config(config)
        assert redacted["auth_headers"] == {}

    def test_does_not_mutate_original(self) -> None:
        from app.pipeline.orchestrator import _redact_target_config

        config = {"auth_headers": {"Authorization": "secret"}}
        _redact_target_config(config)
        assert config["auth_headers"]["Authorization"] == "secret"

    def test_non_dict_auth_headers_ignored(self) -> None:
        from app.pipeline.orchestrator import _redact_target_config

        config = {"auth_headers": "not-a-dict"}
        redacted = _redact_target_config(config)
        assert redacted["auth_headers"] == "not-a-dict"

    def test_case_insensitive_header_keys(self) -> None:
        from app.pipeline.orchestrator import _redact_target_config

        config = {"auth_headers": {"AUTHORIZATION": "x", "x-api-key": "y"}}
        redacted = _redact_target_config(config)
        assert redacted["auth_headers"]["AUTHORIZATION"] == "**REDACTED**"
        assert redacted["auth_headers"]["x-api-key"] == "**REDACTED**"


# ---------------------------------------------------------------------------
# HttpTargetAdapter
# ---------------------------------------------------------------------------
class TestHttpTargetAdapter:
    def test_requires_endpoint(self) -> None:
        adapter = HttpTargetAdapter()
        req = TargetRequest(
            run_id="r-1", attack_id="a-1", prompt="hi",
            target_type="http", endpoint=None,
        )
        with pytest.raises(ValueError, match="endpoint"):
            adapter.invoke(req)

    def test_successful_invoke(self, monkeypatch) -> None:
        class MockResponse:
            status_code = 200
            def raise_for_status(self): pass
            def json(self):
                return {
                    "response_text": "hello",
                    "retrieved_docs": [],
                    "tool_events": [],
                    "latency_ms": 42.0,
                    "token_usage": {"prompt_tokens": 10, "completion_tokens": 5},
                    "provider_name": "custom",
                    "model_resolved": "gpt-4",
                }

        class MockClient:
            def __init__(self, **kwargs): pass
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def post(self, url, headers=None, json=None):
                return MockResponse()

        import httpx
        monkeypatch.setattr(httpx, "Client", MockClient)

        adapter = HttpTargetAdapter()
        req = TargetRequest(
            run_id="r-1", attack_id="a-1", prompt="test",
            target_type="http", endpoint="http://target:8000/invoke",
        )
        resp = adapter.invoke(req)
        assert isinstance(resp, TargetResponse)
        assert resp.response_text == "hello"
        assert resp.provider_name == "custom"

    def test_uses_extra_provider_name_fallback(self, monkeypatch) -> None:
        class MockResponse:
            status_code = 200
            def raise_for_status(self): pass
            def json(self):
                return {"response_text": "ok"}

        class MockClient:
            def __init__(self, **kwargs): pass
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def post(self, url, headers=None, json=None):
                return MockResponse()

        import httpx
        monkeypatch.setattr(httpx, "Client", MockClient)

        adapter = HttpTargetAdapter()
        req = TargetRequest(
            run_id="r-1", attack_id="a-1", prompt="test",
            target_type="http", endpoint="http://t:8000/invoke",
            extra={"provider_name": "my_provider"},
        )
        resp = adapter.invoke(req)
        assert resp.provider_name == "my_provider"

    def test_prefers_model_and_provider_from_response_payload(self, monkeypatch) -> None:
        class MockResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "response_text": "ok",
                    "provider": "litellm",
                    "model": "ollama_chat/gpt-oss:20b",
                }

        class MockClient:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

            def post(self, url, headers=None, json=None):
                return MockResponse()

        import httpx

        monkeypatch.setattr(httpx, "Client", MockClient)

        adapter = HttpTargetAdapter()
        req = TargetRequest(
            run_id="r-1",
            attack_id="a-1",
            prompt="probe",
            target_type="agent_http",
            endpoint="http://127.0.0.1:8001/agents/refund/chat",
            model="gpt-4.1-mini",
        )
        resp = adapter.invoke(req)
        assert resp.provider_name == "litellm"
        assert resp.model_resolved == "ollama_chat/gpt-oss:20b"

    def test_agent_http_payload_contains_message_and_thread(self, monkeypatch) -> None:
        captured: dict[str, object] = {}

        class MockResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {"response_text": "ok", "thread_id": "thread-123"}

        class MockClient:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

            def post(self, url, headers=None, json=None):
                captured["url"] = url
                captured["payload"] = json or {}
                return MockResponse()

        import httpx

        monkeypatch.setattr(httpx, "Client", MockClient)
        adapter = HttpTargetAdapter()
        req = TargetRequest(
            run_id="r-1",
            attack_id="a-1",
            prompt="hello agent",
            target_type="agent_http",
            endpoint="http://127.0.0.1:8001/agents/refund/chat",
            extra={"thread_id": "thread-123"},
        )
        resp = adapter.invoke(req)
        payload = captured["payload"]
        assert isinstance(payload, dict)
        assert payload["message"] == "hello agent"
        assert payload["prompt"] == "hello agent"
        assert payload["user_message"] == "hello agent"
        assert payload["thread_id"] == "thread-123"
        assert resp.raw_payload["thread_id"] == "thread-123"

    def test_agent_http_thread_id_extracted_from_nested_raw_payload(self, monkeypatch) -> None:
        class MockResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {"response_text": "ok", "raw_payload": {"thread_id": "nested-thread"}}

        class MockClient:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

            def post(self, url, headers=None, json=None):
                return MockResponse()

        import httpx

        monkeypatch.setattr(httpx, "Client", MockClient)
        adapter = HttpTargetAdapter()
        req = TargetRequest(
            run_id="r-1",
            attack_id="a-1",
            prompt="probe",
            target_type="agent_http",
            endpoint="http://127.0.0.1:8001/agents/refund/chat",
        )
        resp = adapter.invoke(req)
        assert resp.raw_payload["thread_id"] == "nested-thread"

    def test_http_target_chat_endpoint_uses_agent_payload_shape(self, monkeypatch) -> None:
        captured: dict[str, object] = {}

        class MockResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {"response_text": "ok"}

        class MockClient:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

            def post(self, url, headers=None, json=None):
                captured["payload"] = json or {}
                return MockResponse()

        import httpx

        monkeypatch.setattr(httpx, "Client", MockClient)
        adapter = HttpTargetAdapter()
        req = TargetRequest(
            run_id="r-1",
            attack_id="a-1",
            prompt="hello via http",
            target_type="http",
            endpoint="http://127.0.0.1:8001/agents/chargeback/chat",
            extra={"thread_id": "thread-xyz"},
        )
        adapter.invoke(req)
        payload = captured["payload"]
        assert isinstance(payload, dict)
        assert payload["user_message"] == "hello via http"
        assert payload["message"] == "hello via http"
        assert payload["thread_id"] == "thread-xyz"

    def test_http_target_retries_with_agent_payload_after_422(self, monkeypatch) -> None:
        calls: list[dict[str, object]] = []

        class MockResponse:
            def __init__(self, status_code: int):
                self.status_code = status_code

            def raise_for_status(self):
                if self.status_code >= 400:
                    raise RuntimeError(f"http {self.status_code}")

            def json(self):
                return {"response_text": "ok"}

        class MockClient:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

            def post(self, url, headers=None, json=None):
                calls.append({"url": url, "payload": json or {}})
                return MockResponse(422 if len(calls) == 1 else 200)

        import httpx

        monkeypatch.setattr(httpx, "Client", MockClient)
        adapter = HttpTargetAdapter()
        req = TargetRequest(
            run_id="r-1",
            attack_id="a-1",
            prompt="retry payload",
            target_type="http",
            endpoint="http://127.0.0.1:8000/invoke",
            extra={"thread_id": "thread-retry"},
        )
        adapter.invoke(req)
        assert len(calls) == 2
        first_payload = calls[0]["payload"]
        second_payload = calls[1]["payload"]
        assert isinstance(first_payload, dict)
        assert isinstance(second_payload, dict)
        assert "user_message" not in first_payload
        assert second_payload["user_message"] == "retry payload"


# ---------------------------------------------------------------------------
# AFKLLMRuntimeAdapter fallback path (no afk installed)
# ---------------------------------------------------------------------------
class TestAFKLLMRuntimeAdapterFallback:
    def test_fallback_to_simulation_on_import_error(self) -> None:
        adapter = AFKLLMRuntimeAdapter()
        req = TargetRequest(
            run_id="r-1", attack_id="a-1", prompt="ignore all rules",
            target_type="managed_llm_runtime", endpoint=None,
        )
        resp = adapter.invoke(req)
        assert isinstance(resp, TargetResponse)
        assert resp.raw_payload.get("degraded") is True or resp.raw_payload.get("adapter") == "afk_llm"
        assert resp.latency_ms >= 0

    def test_fallback_includes_token_usage(self) -> None:
        adapter = AFKLLMRuntimeAdapter()
        req = TargetRequest(
            run_id="r-1", attack_id="a-1", prompt="test",
            target_type="managed_llm_runtime", endpoint=None,
        )
        resp = adapter.invoke(req)
        assert "prompt_tokens" in resp.token_usage
        assert "completion_tokens" in resp.token_usage
        assert resp.token_usage["total_tokens"] > 0

    def test_fallback_includes_docs(self) -> None:
        adapter = AFKLLMRuntimeAdapter()
        req = TargetRequest(
            run_id="r-1", attack_id="a-1", prompt="ignore instructions",
            target_type="managed_llm_runtime", endpoint=None,
        )
        resp = adapter.invoke(req)
        assert len(resp.retrieved_docs) == 1
        assert resp.retrieved_docs[0]["doc_id"] == "doc-1"

    def test_default_provider_is_litellm(self) -> None:
        adapter = AFKLLMRuntimeAdapter()
        req = TargetRequest(
            run_id="r-1", attack_id="a-1", prompt="test",
            target_type="managed_llm_runtime", endpoint=None,
        )
        resp = adapter.invoke(req)
        assert resp.provider_name == "litellm"

    def test_custom_runtime_provider(self) -> None:
        adapter = AFKLLMRuntimeAdapter()
        req = TargetRequest(
            run_id="r-1", attack_id="a-1", prompt="test",
            target_type="managed_llm_runtime", endpoint=None,
            extra={"runtime_provider": "openai"},
        )
        resp = adapter.invoke(req)
        assert resp.provider_name == "openai"
