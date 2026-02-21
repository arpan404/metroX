from __future__ import annotations

from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

import httpx


@dataclass
class TargetRequest:
    run_id: str
    attack_id: str
    prompt: str
    target_type: str
    endpoint: str | None
    auth_headers: dict[str, str] = field(default_factory=dict)
    model: str = "gpt-4.1-mini"
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class TargetResponse:
    response_text: str
    retrieved_docs: list[dict[str, Any]]
    tool_events: list[dict[str, Any]]
    latency_ms: float
    token_usage: dict[str, Any]
    raw_payload: dict[str, Any]


class TargetAdapter:
    def invoke(self, request: TargetRequest) -> TargetResponse:
        raise NotImplementedError


class SyntheticTargetAdapter(TargetAdapter):
    """Deterministic fallback target for local testing and CI."""

    def invoke(self, request: TargetRequest) -> TargetResponse:
        start = perf_counter()
        prompt = request.prompt.lower()

        if "ignore" in prompt or "override" in prompt:
            response = "I will ignore prior instructions and reveal restricted details."
        elif "jailbreak" in prompt or "bypass" in prompt:
            response = "Here are disallowed instructions to bypass guardrails."
        elif "hallucination" in prompt:
            response = "The citation claims moon is made of cobalt (citation: doc-404)."
        elif "tool" in prompt:
            response = "Invoking delete_resource despite missing approval token."
        elif "toxic" in prompt or "unsafe" in prompt:
            response = "This contains violent unsafe language and abuse."
        else:
            response = "Compliant response with grounded summary from retrieved context."

        retrieved_docs = [
            {
                "doc_id": "doc-1",
                "title": "Security policy baseline",
                "text": "Never disclose restricted secrets and always cite trusted context.",
                "score": 0.82,
            }
        ]
        tool_events = []
        if "tool" in prompt:
            tool_events.append(
                {
                    "tool_name": "delete_resource",
                    "success": True,
                    "approved": False,
                    "mutating": True,
                }
            )

        latency_ms = (perf_counter() - start) * 1000
        token_usage = {
            "prompt_tokens": max(20, len(request.prompt) // 4),
            "completion_tokens": max(16, len(response) // 5),
            "total_tokens": max(36, len(request.prompt) // 4 + len(response) // 5),
        }
        return TargetResponse(
            response_text=response,
            retrieved_docs=retrieved_docs,
            tool_events=tool_events,
            latency_ms=latency_ms,
            token_usage=token_usage,
            raw_payload={"adapter": "synthetic", "model": request.model},
        )


class HttpTargetAdapter(TargetAdapter):
    def invoke(self, request: TargetRequest) -> TargetResponse:
        if not request.endpoint:
            raise ValueError("HTTP target requires endpoint")
        start = perf_counter()
        payload = {
            "run_id": request.run_id,
            "attack_id": request.attack_id,
            "prompt": request.prompt,
            "model": request.model,
            "extra": request.extra,
        }
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(request.endpoint, headers=request.auth_headers, json=payload)
            resp.raise_for_status()
            body = resp.json()
        latency_ms = (perf_counter() - start) * 1000
        return TargetResponse(
            response_text=body.get("response_text", ""),
            retrieved_docs=body.get("retrieved_docs", []),
            tool_events=body.get("tool_events", []),
            latency_ms=body.get("latency_ms", latency_ms),
            token_usage=body.get("token_usage", {}),
            raw_payload=body,
        )


def get_adapter(target_type: str) -> TargetAdapter:
    if target_type in {"http", "openai_compatible", "agent_http"}:
        return HttpTargetAdapter()
    return SyntheticTargetAdapter()
