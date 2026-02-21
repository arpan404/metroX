from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

VALID_JOIN_POLICIES = {"all_required", "allow_optional_failures", "first_success", "quorum"}
VALID_ROUTER_STRATEGIES = {"taxonomy", "difficulty", "provider_slice", "round_robin"}


def config_hash(config: dict[str, Any]) -> str:
    encoded = json.dumps(config, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def validate_orchestration_config(raw_config: dict[str, Any] | None) -> dict[str, Any]:
    config = dict(raw_config or {})
    join_policy = str(config.get("join_policy", "all_required"))
    if join_policy not in VALID_JOIN_POLICIES:
        raise ValueError(f"Invalid join_policy: {join_policy}")
    router = str(config.get("subagent_router_strategy", "taxonomy"))
    if router not in VALID_ROUTER_STRATEGIES:
        raise ValueError(f"Invalid subagent_router_strategy: {router}")

    roles = config.get("roles", [])
    if roles is None:
        roles = []
    if not isinstance(roles, list):
        raise ValueError("roles must be a list")
    role_names: set[str] = set()
    for role in roles:
        if not isinstance(role, dict):
            raise ValueError("each role must be an object")
        name = str(role.get("name", "")).strip()
        if not name:
            raise ValueError("each role requires a non-empty name")
        if name in role_names:
            raise ValueError(f"duplicate role name: {name}")
        role_names.add(name)

    graph = config.get("graph", {})
    if graph is None:
        graph = {}
    if not isinstance(graph, dict):
        raise ValueError("graph must be an object")
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("graph.nodes and graph.edges must be lists")
    node_ids: set[str] = set()
    for node in nodes:
        if not isinstance(node, dict):
            raise ValueError("graph nodes must be objects")
        node_id = str(node.get("id", "")).strip()
        if not node_id:
            raise ValueError("each graph node requires id")
        if node_id in node_ids:
            raise ValueError(f"duplicate graph node id: {node_id}")
        node_ids.add(node_id)
    for edge in edges:
        if not isinstance(edge, dict):
            raise ValueError("graph edges must be objects")
        source = str(edge.get("source", "")).strip()
        target = str(edge.get("target", "")).strip()
        if source not in node_ids or target not in node_ids:
            raise ValueError(f"graph edge source/target not found: {source}->{target}")

    config["join_policy"] = join_policy
    config["subagent_router_strategy"] = router
    config["roles"] = roles
    config["graph"] = {"nodes": nodes, "edges": edges}
    config["graph_schema_version"] = str(config.get("graph_schema_version", "afk.flow.v1"))
    config.setdefault(
        "lineage",
        {"updated_at": datetime.now(timezone.utc).isoformat()},
    )
    return config


def bound_orchestration_snapshot(
    *,
    profile_id: str,
    profile_name: str,
    profile_version: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    return {
        "profile_id": profile_id,
        "profile_name": profile_name,
        "profile_version": profile_version,
        "graph_schema_version": str(config.get("graph_schema_version", "afk.flow.v1")),
        "config_hash": config_hash(config),
        "bound_at": datetime.now(timezone.utc).isoformat(),
    }
