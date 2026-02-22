from __future__ import annotations

import asyncio
from collections import Counter

import app.pipeline.benchmark as benchmark_module
from app.pipeline.benchmark import create_benchmark


def test_benchmark_reproducibility(db_session):
    config = {
        "dataset_name": "core",
        "taxonomy": ["prompt_injection", "hallucination"],
        "seed": 77,
        "curated_ratio": 0.5,
        "agentic_attacking": False,
        "agentic_provider": "afk_live",
    }

    snapshot_1, cases_1 = asyncio.run(create_benchmark(db_session, run_id="run-1", benchmark_config=config, attack_count=40))
    snapshot_2, cases_2 = asyncio.run(create_benchmark(db_session, run_id="run-2", benchmark_config=config, attack_count=40))

    hashes_1 = sorted(case.dedupe_hash for case in cases_1)
    hashes_2 = sorted(case.dedupe_hash for case in cases_2)

    assert len(cases_1) == 40
    assert len(cases_2) == 40
    assert hashes_1 == hashes_2
    assert snapshot_1.meta["unique_prompts"] == snapshot_2.meta["unique_prompts"]
    assert "afk_orchestration" in snapshot_1.meta


def test_benchmark_includes_extended_taxonomy_types(db_session):
    config = {
        "dataset_name": "finance-extended",
        "taxonomy": [
            "prompt_injection",
            "refund_abuse",
            "claim_manipulation",
            "identity_mismatch",
            "data_exfiltration",
            "system_prompt_leak",
        ],
        "seed": 13,
        "curated_ratio": 0.4,
        "agentic_attacking": False,
        "agentic_provider": "afk_live",
    }

    snapshot, cases = asyncio.run(create_benchmark(db_session, run_id="run-ext", benchmark_config=config, attack_count=60))

    counts = Counter(case.attack_type for case in cases)
    for key in config["taxonomy"]:
        assert counts[key] > 0, f"{key} was selected but produced no attack cases"
    assert snapshot.meta["by_attack_type"]["refund_abuse"] > 0
    assert snapshot.meta["by_attack_type"]["data_exfiltration"] > 0


def test_benchmark_rebalances_when_prompt_collisions_starve_taxonomy(db_session, monkeypatch):
    taxonomy = [
        "prompt_injection",
        "jailbreak",
        "hallucination",
        "tool_misuse",
        "unsafe_output",
        "refund_abuse",
        "claim_manipulation",
        "identity_mismatch",
        "data_exfiltration",
        "system_prompt_leak",
    ]

    def _same_seed(_attack_type: str) -> tuple[str, str, str]:
        # Force heavy collisions for non-curated taxonomies.
        return ("collision-prompt", "collision-behavior", "collision-family")

    monkeypatch.setattr(benchmark_module, "_fallback_seed_for_attack_type", _same_seed)
    snapshot, cases = asyncio.run(create_benchmark(
        db_session,
        run_id="run-collision",
        benchmark_config={
            "dataset_name": "collision-suite",
            "taxonomy": taxonomy,
            "seed": 99,
            "curated_ratio": 0.8,
            "agentic_attacking": False,
            "agentic_provider": "afk_live",
        },
        attack_count=60,
    ))

    counts = Counter(case.attack_type for case in cases)
    for attack_type in taxonomy:
        assert counts[attack_type] > 0, f"{attack_type} should have at least one case after coverage rebalance"
    coverage_meta = snapshot.meta.get("coverage", {})
    assert coverage_meta.get("missing_taxonomy_types") == []
