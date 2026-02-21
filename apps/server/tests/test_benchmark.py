from __future__ import annotations

from app.services.benchmark import create_benchmark


def test_benchmark_reproducibility(db_session):
    config = {
        "dataset_name": "core",
        "taxonomy": ["prompt_injection", "hallucination"],
        "seed": 77,
        "curated_ratio": 0.5,
    }

    snapshot_1, cases_1 = create_benchmark(db_session, run_id="run-1", benchmark_config=config, attack_count=40)
    snapshot_2, cases_2 = create_benchmark(db_session, run_id="run-2", benchmark_config=config, attack_count=40)

    hashes_1 = sorted(case.dedupe_hash for case in cases_1)
    hashes_2 = sorted(case.dedupe_hash for case in cases_2)

    assert len(cases_1) == 40
    assert len(cases_2) == 40
    assert hashes_1 == hashes_2
    assert snapshot_1.meta["unique_prompts"] == snapshot_2.meta["unique_prompts"]
