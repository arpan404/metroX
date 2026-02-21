from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    ConfigProfile,
    ConfigSnapshot,
    Detection,
    Execution,
    ProbabilisticLabel,
    Run,
    ScoreCard,
)
from app.services.adapters import TargetRequest, get_adapter
from app.services.benchmark import create_benchmark
from app.services.clustering import build_clusters
from app.services.common import log_event
from app.services.detection import detect_failures, fuse_labels
from app.services.drift import compute_drift
from app.services.features import ensure_feature_definitions, rebuild_features_for_run
from app.services.risk import build_risk_models
from app.services.scoring import build_scorecard


class RunOrchestrator:
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()

    def execute_run(self, run_id: str) -> None:
        run = self.db.query(Run).filter(Run.id == run_id).one_or_none()
        if not run:
            raise ValueError("Run not found")
        profile = self.db.query(ConfigProfile).filter(ConfigProfile.id == run.config_profile_id).one_or_none()
        if not profile:
            raise ValueError("Config profile not found")

        snapshot = ConfigSnapshot(
            config_profile_id=profile.id,
            run_id=run.id,
            snapshot={
                "target_config": profile.target_config,
                "benchmark_config": profile.benchmark_config,
                "scoring_config": profile.scoring_config,
                "runtime_config": profile.runtime_config,
                "strictness": run.strictness,
                "mode": run.mode,
                "preset": run.preset,
            },
        )
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)

        run.config_snapshot_id = snapshot.id
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        self.db.commit()

        log_event(self.db, run_id=run.id, event_type="run_started", step=0, message="Run started")

        try:
            attack_count = self._attack_count(run.preset)
            benchmark_snapshot, attack_cases = create_benchmark(
                self.db,
                run_id=run.id,
                benchmark_config=profile.benchmark_config,
                attack_count=attack_count,
            )
            run.total_attacks = len(attack_cases)
            self.db.commit()

            log_event(
                self.db,
                run_id=run.id,
                event_type="benchmark_ready",
                step=1,
                message="Benchmark generated",
                data={"snapshot_id": benchmark_snapshot.id, "count": len(attack_cases)},
            )

            target_cfg = profile.target_config
            adapter = get_adapter(target_cfg.get("target_type", "synthetic"))

            executions: list[Execution] = []
            low_confidence = []

            for idx, case in enumerate(attack_cases, start=1):
                request = TargetRequest(
                    run_id=run.id,
                    attack_id=case.id,
                    prompt=case.prompt,
                    target_type=target_cfg.get("target_type", "synthetic"),
                    endpoint=target_cfg.get("endpoint"),
                    auth_headers=target_cfg.get("auth_headers", {}),
                    model=target_cfg.get("model", "gpt-4.1-mini"),
                    extra=target_cfg.get("extra", {}),
                )
                response = adapter.invoke(request)

                execution = Execution(
                    run_id=run.id,
                    attack_case_id=case.id,
                    target_type=request.target_type,
                    prompt=case.prompt,
                    response=response.response_text,
                    latency_ms=response.latency_ms,
                    token_usage=response.token_usage,
                    retrieved_docs=response.retrieved_docs,
                    tool_events=response.tool_events,
                    raw_payload=response.raw_payload,
                )
                self.db.add(execution)
                self.db.flush()

                detection = detect_failures(
                    execution_id=execution.id,
                    attack_type=case.attack_type,
                    prompt=case.prompt,
                    response=response.response_text,
                    retrieved_docs=response.retrieved_docs,
                    tool_events=response.tool_events,
                )
                label = fuse_labels(detection)

                self.db.add(detection)
                self.db.add(label)
                executions.append(execution)

                run.completed_attacks = idx

                if self.settings.low_confidence_min <= detection.confidence < self.settings.low_confidence_max:
                    low_confidence.append(execution.id)

                if idx % 100 == 0 or idx == len(attack_cases):
                    self.db.commit()
                    log_event(
                        self.db,
                        run_id=run.id,
                        event_type="progress",
                        step=2,
                        message=f"Processed {idx}/{len(attack_cases)}",
                        data={"completed": idx, "total": len(attack_cases)},
                    )

            ensure_feature_definitions(self.db)
            rebuild_features_for_run(self.db, run.id, executions)
            log_event(self.db, run_id=run.id, event_type="features_ready", step=3, message="Feature extraction complete")

            build_clusters(self.db, run.id)
            log_event(self.db, run_id=run.id, event_type="clusters_ready", step=4, message="Failure clusters computed")

            build_risk_models(self.db, run.id)
            log_event(self.db, run_id=run.id, event_type="risk_ready", step=5, message="Risk models and cards computed")

            baseline_metrics = None
            if run.baseline_run_id:
                baseline_scorecard = (
                    self.db.query(ScoreCard).filter(ScoreCard.run_id == run.baseline_run_id).one_or_none()
                )
                baseline_metrics = baseline_scorecard.metrics if baseline_scorecard else None

            scorecard = build_scorecard(
                self.db,
                run=run,
                scoring_config=profile.scoring_config,
                baseline_metrics=baseline_metrics,
            )
            log_event(self.db, run_id=run.id, event_type="scorecard_ready", step=6, message="Scorecard generated")

            compute_drift(self.db, run.id, run.baseline_run_id)
            log_event(self.db, run_id=run.id, event_type="drift_ready", step=7, message="Drift analysis complete")

            run.summary_metrics = scorecard.metrics
            run.gate_result = scorecard.gates
            run.ended_at = datetime.now(timezone.utc)
            run.status = "completed"
            self.db.commit()

            log_event(
                self.db,
                run_id=run.id,
                event_type="run_completed",
                step=8,
                message="Run completed",
                data={"low_confidence_queue": len(low_confidence)},
            )

        except Exception as exc:
            run.status = "failed"
            run.ended_at = datetime.now(timezone.utc)
            self.db.commit()
            log_event(
                self.db,
                run_id=run.id,
                event_type="run_failed",
                step=99,
                message=str(exc),
            )
            raise

    def _attack_count(self, preset: str) -> int:
        if preset == "quick":
            return self.settings.quick_attack_count
        if preset == "deep":
            return self.settings.deep_attack_count
        return self.settings.standard_attack_count
