"""Unit tests for app.agents.orchestration_profiles and app.runtime.policy modules.

Covers:
  - validate_orchestration_config: all validation rules, edge cases
  - config_hash: deterministic hashing
  - bound_orchestration_snapshot: snapshot shape
  - resolve_policy_config: profile resolution, defaults
  - infer_mutating_tool: prefix matching
  - policy_decision_for_tool: allowlist, mutating, fallback
"""
from __future__ import annotations

import pytest

from app.agents.orchestration_profiles import (
    bound_orchestration_snapshot,
    config_hash,
    validate_orchestration_config,
)
from app.runtime.policy import (
    POLICY_PROFILES,
    infer_mutating_tool,
    policy_decision_for_tool,
    resolve_policy_config,
)


# ---------------------------------------------------------------------------
# config_hash
# ---------------------------------------------------------------------------
class TestConfigHash:
    def test_deterministic(self) -> None:
        cfg = {"key": "value", "number": 42}
        assert config_hash(cfg) == config_hash(cfg)

    def test_key_order_invariant(self) -> None:
        a = {"a": 1, "b": 2}
        b = {"b": 2, "a": 1}
        assert config_hash(a) == config_hash(b)

    def test_different_configs_different_hash(self) -> None:
        assert config_hash({"a": 1}) != config_hash({"a": 2})

    def test_empty_hash(self) -> None:
        h = config_hash({})
        assert isinstance(h, str)
        assert len(h) == 64


# ---------------------------------------------------------------------------
# validate_orchestration_config
# ---------------------------------------------------------------------------
class TestValidateOrchestrationConfig:
    def test_minimal_valid_config(self) -> None:
        result = validate_orchestration_config({"join_policy": "all_required"})
        assert result["join_policy"] == "all_required"
        assert "graph" in result
        assert "execution_order" in result

    def test_none_input(self) -> None:
        result = validate_orchestration_config(None)
        assert result["join_policy"] == "all_required"

    def test_invalid_join_policy(self) -> None:
        with pytest.raises(ValueError, match="join_policy"):
            validate_orchestration_config({"join_policy": "invalid"})

    @pytest.mark.parametrize("policy", [
        "all_required", "allow_optional_failures", "first_success", "quorum",
    ])
    def test_valid_join_policies(self, policy: str) -> None:
        result = validate_orchestration_config({"join_policy": policy})
        assert result["join_policy"] == policy

    def test_invalid_router_strategy(self) -> None:
        with pytest.raises(ValueError, match="subagent_router_strategy"):
            validate_orchestration_config({"subagent_router_strategy": "invalid"})

    @pytest.mark.parametrize("strategy", [
        "taxonomy", "difficulty", "provider_slice", "round_robin",
    ])
    def test_valid_router_strategies(self, strategy: str) -> None:
        result = validate_orchestration_config({"subagent_router_strategy": strategy})
        assert result["subagent_router_strategy"] == strategy

    def test_roles_not_a_list(self) -> None:
        with pytest.raises(ValueError, match="roles must be a list"):
            validate_orchestration_config({"roles": "not-a-list"})

    def test_role_not_a_dict(self) -> None:
        with pytest.raises(ValueError, match="each role must be an object"):
            validate_orchestration_config({"roles": ["not-dict"]})

    def test_role_empty_name(self) -> None:
        with pytest.raises(ValueError, match="non-empty name"):
            validate_orchestration_config({"roles": [{"name": ""}]})

    def test_duplicate_role_name(self) -> None:
        with pytest.raises(ValueError, match="duplicate role name"):
            validate_orchestration_config({
                "roles": [{"name": "attacker"}, {"name": "attacker"}],
            })

    def test_graph_not_a_dict(self) -> None:
        with pytest.raises(ValueError, match="graph must be an object"):
            validate_orchestration_config({"graph": "not-dict"})

    def test_graph_nodes_not_a_list(self) -> None:
        with pytest.raises(ValueError, match="lists"):
            validate_orchestration_config({"graph": {"nodes": "bad", "edges": []}})

    def test_graph_node_missing_id(self) -> None:
        with pytest.raises(ValueError, match="requires id"):
            validate_orchestration_config({
                "roles": [{"name": "attacker"}],
                "graph": {"nodes": [{}], "edges": []},
            })

    def test_graph_duplicate_node_id(self) -> None:
        with pytest.raises(ValueError, match="duplicate graph node"):
            validate_orchestration_config({
                "roles": [{"name": "attacker"}],
                "graph": {"nodes": [{"id": "attacker"}, {"id": "attacker"}], "edges": []},
            })

    def test_graph_node_unknown_role(self) -> None:
        with pytest.raises(ValueError, match="declared roles"):
            validate_orchestration_config({
                "roles": [{"name": "attacker"}],
                "graph": {"nodes": [{"id": "unknown"}], "edges": []},
            })

    def test_graph_edge_missing_source(self) -> None:
        with pytest.raises(ValueError, match="source/target not found"):
            validate_orchestration_config({
                "roles": [{"name": "attacker"}],
                "graph": {
                    "nodes": [{"id": "attacker"}],
                    "edges": [{"source": "missing", "target": "attacker"}],
                },
            })

    def test_graph_self_edge(self) -> None:
        with pytest.raises(ValueError, match="self-control"):
            validate_orchestration_config({
                "roles": [{"name": "attacker"}],
                "graph": {
                    "nodes": [{"id": "attacker"}],
                    "edges": [{"source": "attacker", "target": "attacker"}],
                },
            })

    def test_graph_cycle_detected(self) -> None:
        with pytest.raises(ValueError, match="cycle"):
            validate_orchestration_config({
                "roles": [{"name": "attacker"}, {"name": "critic"}],
                "graph": {
                    "nodes": [{"id": "attacker"}, {"id": "critic"}],
                    "edges": [
                        {"source": "attacker", "target": "critic"},
                        {"source": "critic", "target": "attacker"},
                    ],
                },
            })

    def test_valid_dag(self) -> None:
        result = validate_orchestration_config({
            "roles": [{"name": "attacker"}, {"name": "critic"}, {"name": "verifier"}],
            "graph": {
                "nodes": [{"id": "attacker"}, {"id": "critic"}, {"id": "verifier"}],
                "edges": [
                    {"source": "attacker", "target": "critic"},
                    {"source": "critic", "target": "verifier"},
                ],
            },
        })
        assert len(result["graph"]["nodes"]) == 3

    def test_execution_order_not_a_list(self) -> None:
        with pytest.raises(ValueError, match="execution_order must be a list"):
            validate_orchestration_config({"execution_order": "not-a-list"})

    def test_execution_order_duplicates(self) -> None:
        with pytest.raises(ValueError, match="duplicates"):
            validate_orchestration_config({
                "roles": [{"name": "attacker"}, {"name": "critic"}],
                "execution_order": ["attacker", "attacker"],
            })

    def test_execution_order_unknown_role(self) -> None:
        with pytest.raises(ValueError, match="unknown roles"):
            validate_orchestration_config({
                "roles": [{"name": "attacker"}],
                "execution_order": ["unknown_role"],
            })

    def test_execution_order_valid(self) -> None:
        result = validate_orchestration_config({
            "roles": [{"name": "attacker"}, {"name": "critic"}],
            "execution_order": ["critic", "attacker"],
        })
        assert result["execution_order"] == ["critic", "attacker"]

    def test_graph_schema_version_default(self) -> None:
        result = validate_orchestration_config({})
        assert result["graph_schema_version"] == "afk.flow.v1"

    def test_lineage_set(self) -> None:
        result = validate_orchestration_config({})
        assert "lineage" in result
        assert "updated_at" in result["lineage"]

    def test_null_graph_becomes_empty(self) -> None:
        result = validate_orchestration_config({"graph": None})
        assert result["graph"] == {"nodes": [], "edges": []}

    def test_null_roles_becomes_empty(self) -> None:
        result = validate_orchestration_config({"roles": None})
        assert result["roles"] == []

    def test_null_execution_order_becomes_empty(self) -> None:
        result = validate_orchestration_config({"execution_order": None})
        assert result["execution_order"] == []


# ---------------------------------------------------------------------------
# bound_orchestration_snapshot
# ---------------------------------------------------------------------------
class TestBoundOrchestrationSnapshot:
    def test_snapshot_shape(self) -> None:
        config = {"join_policy": "all_required", "graph_schema_version": "afk.flow.v1"}
        snap = bound_orchestration_snapshot(
            profile_id="p1",
            profile_name="test",
            profile_version="v1",
            config=config,
        )
        assert snap["profile_id"] == "p1"
        assert snap["profile_name"] == "test"
        assert snap["profile_version"] == "v1"
        assert snap["graph_schema_version"] == "afk.flow.v1"
        assert "config_hash" in snap
        assert "bound_at" in snap


# ---------------------------------------------------------------------------
# resolve_policy_config
# ---------------------------------------------------------------------------
class TestResolvePolicyConfig:
    def test_default_profile(self) -> None:
        result = resolve_policy_config(None)
        assert result["name"] == "balanced_eval"
        assert result["allow_mutating_tools"] is False

    def test_known_profile(self) -> None:
        result = resolve_policy_config({"policy_profile": "live_exploratory"})
        assert result["name"] == "live_exploratory"
        assert result["allow_mutating_tools"] is True

    def test_unknown_profile_falls_back(self) -> None:
        result = resolve_policy_config({"policy_profile": "nonexistent"})
        assert result["name"] == "nonexistent"
        # Falls back to balanced_eval base settings
        assert result["allow_mutating_tools"] is False

    def test_allowed_tools_sorted(self) -> None:
        result = resolve_policy_config({
            "allowed_tools": ["zeta", "alpha", "beta"],
        })
        assert result["allowed_tools"] == ["alpha", "beta", "zeta"]

    def test_empty_string_tools_stripped(self) -> None:
        result = resolve_policy_config({
            "allowed_tools": ["  ", "alpha", ""],
        })
        assert result["allowed_tools"] == ["alpha"]

    def test_non_dict_input(self) -> None:
        result = resolve_policy_config("not-a-dict")  # type: ignore[arg-type]
        assert result["name"] == "balanced_eval"


# ---------------------------------------------------------------------------
# infer_mutating_tool
# ---------------------------------------------------------------------------
class TestInferMutatingTool:
    @pytest.mark.parametrize("name", [
        "delete_user", "drop_table", "create_file", "update_record",
        "write_data", "exec_query", "run_command", "deploy_service",
    ])
    def test_mutating(self, name: str) -> None:
        assert infer_mutating_tool(name) is True

    @pytest.mark.parametrize("name", [
        "read_file", "list_users", "get_status", "search_data",
        "fetch_data", "validate_input",
    ])
    def test_non_mutating(self, name: str) -> None:
        assert infer_mutating_tool(name) is False

    def test_case_insensitive(self) -> None:
        assert infer_mutating_tool("DELETE_ALL") is True
        assert infer_mutating_tool("  Delete_All  ") is True


# ---------------------------------------------------------------------------
# policy_decision_for_tool
# ---------------------------------------------------------------------------
class TestPolicyDecisionForTool:
    def test_approved_read_tool(self) -> None:
        policy = resolve_policy_config({"policy_profile": "balanced_eval"})
        approved, reason = policy_decision_for_tool(policy, tool_name="read_file")
        assert approved is True

    def test_blocked_mutating_tool(self) -> None:
        policy = resolve_policy_config({"policy_profile": "strict_readonly"})
        approved, reason = policy_decision_for_tool(policy, tool_name="delete_user")
        assert approved is False
        assert "mutating" in reason

    def test_allowed_tool_in_allowlist(self) -> None:
        policy = resolve_policy_config({
            "policy_profile": "balanced_eval",
            "allowed_tools": ["search_data"],
        })
        approved, reason = policy_decision_for_tool(policy, tool_name="search_data")
        assert approved is True

    def test_tool_not_in_allowlist(self) -> None:
        policy = resolve_policy_config({
            "policy_profile": "balanced_eval",
            "allowed_tools": ["search_data"],
        })
        approved, reason = policy_decision_for_tool(policy, tool_name="other_tool")
        assert approved is False
        assert "allowlisted" in reason

    def test_live_exploratory_allows_mutating(self) -> None:
        policy = resolve_policy_config({"policy_profile": "live_exploratory"})
        approved, reason = policy_decision_for_tool(policy, tool_name="delete_user")
        assert approved is True

    def test_deny_fallback_for_mutating_without_allowlist(self) -> None:
        policy = resolve_policy_config({"policy_profile": "strict_readonly"})
        approved, reason = policy_decision_for_tool(policy, tool_name="delete_user")
        assert approved is False
