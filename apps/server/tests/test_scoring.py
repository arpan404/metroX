from __future__ import annotations

from app.models import ConfigProfile, Detection, EvaluationSession, Execution, Run, RunCostAggregate, StatisticalTest
from app.services.scoring import build_scorecard


def test_scorecard_and_gate(db_session):
    session = EvaluationSession(name="s")
    db_session.add(session)
    db_session.flush()

    profile = ConfigProfile(
        session_id=session.id,
        name="p",
        strictness_mode="balanced",
        target_config={},
        benchmark_config={},
        scoring_config={
            "gate_thresholds": {
                "asr_max": 0.2,
                "hallucination_max": 0.2,
                "toxicity_max": 0.2,
                "tool_misuse_max": 0.2,
                "composite_min": 90,
            }
        },
        runtime_config={},
    )
    db_session.add(profile)
    db_session.flush()

    run = Run(session_id=session.id, config_profile_id=profile.id, status="running")
    db_session.add(run)
    db_session.flush()

    for idx in range(10):
        ex = Execution(
            run_id=run.id,
            attack_case_id="case",
            target_type="managed_llm_runtime",
            prompt=f"prompt {idx}",
            response="response",
            latency_ms=10,
            token_usage={"total_tokens": 50},
            retrieved_docs=[],
            tool_events=[],
            raw_payload={},
        )
        db_session.add(ex)
        db_session.flush()
        db_session.add(
            Detection(
                execution_id=ex.id,
                failure_flags={
                    "hallucination": idx < 3,
                    "jailbreak_success": False,
                    "prompt_injection_success": False,
                    "tool_misuse": False,
                    "toxicity": False,
                },
                severity="medium",
                confidence=0.8,
                evidence={},
            )
        )

    db_session.commit()

    card = build_scorecard(
        db_session,
        run=run,
        scoring_config=profile.scoring_config,
    )

    assert card.metrics["hallucination_rate"] == 0.3
    assert card.gates["pass"] is False
    assert any("Hallucination cap" in reason for reason in card.gates["reasons"])


def test_cost_and_inference_gate_thresholds(db_session):
    session = EvaluationSession(name="s2")
    db_session.add(session)
    db_session.flush()

    profile = ConfigProfile(
        session_id=session.id,
        name="p2",
        strictness_mode="balanced",
        target_config={},
        benchmark_config={},
        scoring_config={
            "gate_thresholds": {
                "asr_max": 1.0,
                "hallucination_max": 1.0,
                "toxicity_max": 1.0,
                "tool_misuse_max": 1.0,
                "composite_min": 0,
                "cost_max_usd": 0.05,
                "max_cost_regression_delta": 0.01,
                "min_effect_size_for_regression": 0.04,
                "max_adjusted_p_for_regression": 0.2,
            }
        },
        runtime_config={},
    )
    db_session.add(profile)
    db_session.flush()

    run = Run(session_id=session.id, config_profile_id=profile.id, status="running")
    db_session.add(run)
    db_session.flush()

    ex = Execution(
        run_id=run.id,
        attack_case_id="case",
        target_type="managed_llm_runtime",
        prompt="prompt",
        response="response",
        latency_ms=1.0,
        token_usage={"total_tokens": 10},
        retrieved_docs=[],
        tool_events=[],
        raw_payload={},
    )
    db_session.add(ex)
    db_session.flush()
    db_session.add(
        Detection(
            execution_id=ex.id,
            failure_flags={
                "hallucination": False,
                "jailbreak_success": False,
                "prompt_injection_success": False,
                "tool_misuse": False,
                "toxicity": False,
            },
            severity="low",
            confidence=0.9,
            evidence={},
        )
    )
    db_session.add(
        RunCostAggregate(
            run_id=run.id,
            total_prompt_tokens=100,
            total_completion_tokens=50,
            total_effective_cost_usd=0.2,
            total_provider_cost_usd=0.2,
            total_estimated_cost_usd=0.2,
            breakdown={},
        )
    )
    db_session.add(
        StatisticalTest(
            run_id=run.id,
            metric_name="risk:hallucination",
            effect_size=0.08,
            p_value=0.01,
            adjusted_p_value=0.05,
            power=0.8,
            mde=0.03,
            ci_low=0.02,
            ci_high=0.12,
        )
    )
    db_session.commit()

    card = build_scorecard(
        db_session,
        run=run,
        scoring_config=profile.scoring_config,
        baseline_metrics={"effective_cost_usd": 0.15},
    )
    assert card.gates["pass"] is False
    assert any("Cost cap breached" in reason for reason in card.gates["reasons"])
    assert any("Cost regression" in reason for reason in card.gates["reasons"])
    assert any("Inference regression signal" in reason for reason in card.gates["reasons"])
