from __future__ import annotations

from app.models import (
    ChangePoint,
    ConfigProfile,
    EvaluationSession,
    FeatureValue,
    Run,
    ScoreCard,
)
from app.stats.drift import compute_drift


def test_drift_detects_shift(db_session):
    session = EvaluationSession(name="s")
    db_session.add(session)
    db_session.flush()

    profile = ConfigProfile(
        session_id=session.id,
        name="p",
        strictness_mode="balanced",
        target_config={},
        benchmark_config={},
        scoring_config={},
        runtime_config={},
    )
    db_session.add(profile)
    db_session.flush()

    baseline = Run(session_id=session.id, config_profile_id=profile.id, status="completed")
    candidate = Run(session_id=session.id, config_profile_id=profile.id, status="completed")
    db_session.add_all([baseline, candidate])
    db_session.flush()

    db_session.add(ScoreCard(run_id=baseline.id, metrics={"asr": 0.1}, gates={}, ci={}))
    db_session.add(ScoreCard(run_id=candidate.id, metrics={"asr": 0.6}, gates={}, ci={}))

    for i in range(40):
        db_session.add(
            FeatureValue(
                run_id=baseline.id,
                execution_id=f"b-{i}",
                feature_name="latency_ms",
                feature_version="v1",
                value_num=30 + i * 0.1,
            )
        )
        db_session.add(
            FeatureValue(
                run_id=candidate.id,
                execution_id=f"c-{i}",
                feature_name="latency_ms",
                feature_version="v1",
                value_num=200 + i * 0.2,
            )
        )

    db_session.commit()

    compute_drift(db_session, candidate.id, baseline.id)

    from app.models import DriftSignal

    signals = db_session.query(DriftSignal).filter(DriftSignal.run_id == candidate.id).all()
    assert len(signals) >= 1
    assert signals[0].drift_level in {"medium", "high"}

    # Change point is optional depending on scorecard history, but should not crash.
    _ = db_session.query(ChangePoint).filter(ChangePoint.run_id == candidate.id).all()
