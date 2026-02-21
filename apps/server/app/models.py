from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def uuid_str() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Target(Base):
    __tablename__ = "targets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    endpoint: Mapped[str | None] = mapped_column(String(500), nullable=True)
    auth_config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class EvaluationSession(Base):
    __tablename__ = "evaluation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class ConfigProfile(Base):
    __tablename__ = "config_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("evaluation_sessions.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    strictness_mode: Mapped[str] = mapped_column(String(50), default="balanced")
    target_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    benchmark_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    scoring_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    runtime_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class ConfigSnapshot(Base):
    __tablename__ = "config_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    config_profile_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("config_profiles.id", ondelete="CASCADE"), nullable=False
    )
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class BenchmarkSnapshot(Base):
    __tablename__ = "benchmark_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    source_mix: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class AttackCase(Base):
    __tablename__ = "attack_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    benchmark_snapshot_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("benchmark_snapshots.id", ondelete="CASCADE"), nullable=False
    )
    attack_type: Mapped[str] = mapped_column(String(80), nullable=False)
    family: Mapped[str] = mapped_column(String(120), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    target_behavior: Mapped[str] = mapped_column(String(120), nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(40), default="medium")
    seed: Mapped[int] = mapped_column(Integer, default=0)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    dedupe_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    novelty_score: Mapped[float] = mapped_column(Float, default=0.0)


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("evaluation_sessions.id", ondelete="CASCADE"), nullable=False
    )
    config_profile_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("config_profiles.id", ondelete="CASCADE"), nullable=False
    )
    config_snapshot_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("config_snapshots.id", ondelete="SET NULL"), nullable=True
    )
    baseline_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    preset: Mapped[str] = mapped_column(String(40), default="standard")
    mode: Mapped[str] = mapped_column(String(40), default="deterministic_ci")
    strictness: Mapped[str] = mapped_column(String(60), default="balanced")
    status: Mapped[str] = mapped_column(String(40), default="queued")
    total_attacks: Mapped[int] = mapped_column(Integer, default=0)
    completed_attacks: Mapped[int] = mapped_column(Integer, default=0)
    summary_metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    gate_result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class Execution(Base):
    __tablename__ = "executions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    attack_case_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("attack_cases.id", ondelete="CASCADE"), nullable=False
    )
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    response: Mapped[str] = mapped_column(Text, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    token_usage: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    retrieved_docs: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    tool_events: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class RunEvent(Base):
    __tablename__ = "run_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    step: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class Detection(Base):
    __tablename__ = "detections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("executions.id", ondelete="CASCADE"), nullable=False
    )
    failure_flags: Mapped[dict[str, bool]] = mapped_column(JSON, default=dict)
    severity: Mapped[str] = mapped_column(String(40), default="low")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ProbabilisticLabel(Base):
    __tablename__ = "probabilistic_labels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("executions.id", ondelete="CASCADE"), nullable=False
    )
    label_probs: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    final_label: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    method: Mapped[str] = mapped_column(String(80), default="weak_supervision_v1")


class Adjudication(Base):
    __tablename__ = "adjudications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("executions.id", ondelete="CASCADE"), nullable=False
    )
    reviewer: Mapped[str] = mapped_column(String(120), nullable=False)
    decision: Mapped[str] = mapped_column(String(80), nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class FeatureDefinition(Base):
    __tablename__ = "feature_definitions"
    __table_args__ = (UniqueConstraint("name", "version", name="uq_feature_name_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(40), default="v1")
    family: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dtype: Mapped[str] = mapped_column(String(40), default="float")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class FeatureValue(Base):
    __tablename__ = "feature_values"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("executions.id", ondelete="CASCADE"), nullable=False
    )
    feature_name: Mapped[str] = mapped_column(String(120), nullable=False)
    feature_version: Mapped[str] = mapped_column(String(40), default="v1")
    value_num: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class ClusterMembership(Base):
    __tablename__ = "cluster_memberships"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("executions.id", ondelete="CASCADE"), nullable=False
    )
    cluster_id: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(String(80), default="hdbscan")
    distance: Mapped[float | None] = mapped_column(Float, nullable=True)


class ClusterSummary(Base):
    __tablename__ = "cluster_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    cluster_id: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    top_terms: Mapped[list[str]] = mapped_column(JSON, default=list)
    size: Mapped[int] = mapped_column(Integer, default=0)


class RiskModel(Base):
    __tablename__ = "risk_models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    failure_type: Mapped[str] = mapped_column(String(80), nullable=False)
    model_type: Mapped[str] = mapped_column(String(80), default="logistic_regression")
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    artifact: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class RiskPrediction(Base):
    __tablename__ = "risk_predictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("executions.id", ondelete="CASCADE"), nullable=False
    )
    failure_type: Mapped[str] = mapped_column(String(80), nullable=False)
    probability: Mapped[float] = mapped_column(Float, default=0.0)
    uncertainty_low: Mapped[float] = mapped_column(Float, default=0.0)
    uncertainty_high: Mapped[float] = mapped_column(Float, default=0.0)
    drivers: Mapped[list[str]] = mapped_column(JSON, default=list)


class CalibrationReport(Base):
    __tablename__ = "calibration_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    failure_type: Mapped[str] = mapped_column(String(80), nullable=False)
    method: Mapped[str] = mapped_column(String(80), default="isotonic")
    ece: Mapped[float] = mapped_column(Float, default=0.0)
    brier: Mapped[float] = mapped_column(Float, default=0.0)
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)


class DriftSignal(Base):
    __tablename__ = "drift_signals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    baseline_run_id: Mapped[str] = mapped_column(String(36), nullable=False)
    feature_name: Mapped[str] = mapped_column(String(120), nullable=False)
    psi: Mapped[float] = mapped_column(Float, default=0.0)
    ks_pvalue: Mapped[float] = mapped_column(Float, default=1.0)
    kl_divergence: Mapped[float] = mapped_column(Float, default=0.0)
    drift_level: Mapped[str] = mapped_column(String(40), default="low")


class ChangePoint(Base):
    __tablename__ = "change_points"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    metric_name: Mapped[str] = mapped_column(String(80), nullable=False)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    threshold: Mapped[float] = mapped_column(Float, default=0.0)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class MitigationExperiment(Base):
    __tablename__ = "mitigation_experiments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    baseline_run_id: Mapped[str] = mapped_column(String(36), nullable=False)
    candidate_run_id: Mapped[str] = mapped_column(String(36), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(40), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class MitigationEffect(Base):
    __tablename__ = "mitigation_effects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    mitigation_experiment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("mitigation_experiments.id", ondelete="CASCADE"), nullable=False
    )
    metric_name: Mapped[str] = mapped_column(String(80), nullable=False)
    uplift: Mapped[float] = mapped_column(Float, default=0.0)
    ci_low: Mapped[float] = mapped_column(Float, default=0.0)
    ci_high: Mapped[float] = mapped_column(Float, default=0.0)
    p_value: Mapped[float] = mapped_column(Float, default=1.0)


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    mitigation_experiment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("mitigation_experiments.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    expected_impact: Mapped[float] = mapped_column(Float, default=0.0)
    implementation_cost: Mapped[float] = mapped_column(Float, default=0.0)
    rank: Mapped[int] = mapped_column(Integer, default=0)


class ScoreCard(Base):
    __tablename__ = "scorecards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    gates: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ci: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class Comparison(Base):
    __tablename__ = "comparisons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    baseline_run_id: Mapped[str] = mapped_column(String(36), nullable=False)
    candidate_run_id: Mapped[str] = mapped_column(String(36), nullable=False)
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    tests: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)


class ReportArtifact(Base):
    __tablename__ = "report_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), default="markdown")
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
