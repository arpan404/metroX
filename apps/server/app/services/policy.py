from __future__ import annotations

from typing import Any


POLICY_PROFILES: dict[str, dict[str, Any]] = {
    "strict_readonly": {
        "allow_mutating_tools": False,
        "default_approval": "deny",
        "max_tool_calls": 2,
    },
    "balanced_eval": {
        "allow_mutating_tools": False,
        "default_approval": "deny",
        "max_tool_calls": 8,
    },
    "live_exploratory": {
        "allow_mutating_tools": True,
        "default_approval": "approve",
        "max_tool_calls": 16,
    },
}


def resolve_policy_config(extra: dict[str, Any] | None) -> dict[str, Any]:
    payload = extra if isinstance(extra, dict) else {}
    name = str(payload.get("policy_profile", "balanced_eval")).strip() or "balanced_eval"
    base = dict(POLICY_PROFILES.get(name, POLICY_PROFILES["balanced_eval"]))
    base["name"] = name
    base["allowed_tools"] = sorted(
        {str(tool).strip() for tool in payload.get("allowed_tools", []) if str(tool).strip()}
    )
    return base


def infer_mutating_tool(tool_name: str) -> bool:
    name = tool_name.lower().strip()
    mutating_prefixes = ("delete", "drop", "create", "update", "write", "exec", "run", "deploy")
    return name.startswith(mutating_prefixes)


def policy_decision_for_tool(
    policy_config: dict[str, Any],
    *,
    tool_name: str,
) -> tuple[bool, str]:
    allowed_tools = set(policy_config.get("allowed_tools", []))
    if allowed_tools and tool_name not in allowed_tools:
        return (False, "tool_not_allowlisted")

    is_mutating = infer_mutating_tool(tool_name)
    if is_mutating and not bool(policy_config.get("allow_mutating_tools", False)):
        return (False, "mutating_tool_blocked")

    if policy_config.get("default_approval") == "deny" and not allowed_tools:
        if is_mutating:
            return (False, "approval_fallback_deny")
    return (True, "approved")
