from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    AFKRunState,
    AttackCase,
    BenchmarkSnapshot,
    ConfigProfile,
    ConfigSnapshot,
    Detection,
    DetectionVote,
    Execution,
    ProbabilisticLabel,
    Run,
    ScoreCard,
)
from app.runtime.adapters import TargetRequest, get_adapter, normalize_target_type
from app.stats.advanced_analytics import (
    build_cooccurrence_graph,
    build_forecast,
    build_inference_and_calibration,
)
from app.pipeline.benchmark import create_benchmark
from app.stats.clustering import build_clusters
from app.utils.common import log_event
from app.pipeline.costing import compute_execution_cost, rebuild_run_cost_aggregate, reset_run_cost
from app.stats.detection import detect_failures, fuse_labels
from app.stats.drift import compute_drift
from app.stats.features import ensure_feature_definitions, rebuild_features_for_run
from app.stats.risk import build_risk_models
from app.stats.scoring import build_scorecard
from app.runtime.policy import resolve_policy_config


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

        latest_state = (
            self.db.query(AFKRunState)
            .filter(AFKRunState.run_id == run.id)
            .order_by(AFKRunState.created_at.desc())
            .first()
        )
        resume_requested = latest_state is not None and latest_state.state == "resumed"
        existing_executions = (
            self.db.query(Execution.id, Execution.attack_case_id)
            .filter(Execution.run_id == run.id)
            .all()
        )
        processed_case_ids = {attack_case_id for _, attack_case_id in existing_executions}

        if run.config_snapshot_id:
            snapshot = self.db.query(ConfigSnapshot).filter(ConfigSnapshot.id == run.config_snapshot_id).one_or_none()
        else:
            snapshot = None
        if not snapshot:
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

        run.thread_id = run.thread_id or f"run-{run.id}"
        run.status = "running"
        if not run.started_at:
            run.started_at = datetime.now(timezone.utc)
        self.db.commit()
        if not resume_requested and len(processed_case_ids) == 0:
            reset_run_cost(self.db, run.id)

        log_event(self.db, run_id=run.id, event_type="run_started", step=0, message="Run started")
        self.db.add(
            AFKRunState(
                run_id=run.id,
                thread_id=run.thread_id,
                state="running",
                step=0,
                checkpoint={
                    "resume_requested": resume_requested,
                    "already_processed": len(processed_case_ids),
                },
            )
        )
        self.db.commit()

        try:
            benchmark_snapshot = (
                self.db.query(BenchmarkSnapshot)
                .filter(BenchmarkSnapshot.run_id == run.id)
                .order_by(BenchmarkSnapshot.created_at.desc())
                .first()
            )
            if benchmark_snapshot:
                attack_cases = (
                    self.db.query(AttackCase)
                    .filter(AttackCase.benchmark_snapshot_id == benchmark_snapshot.id)
                    .all()
                )
            else:
                attack_cases = []

            if not attack_cases:
                attack_count = self._attack_count(run.preset)
                benchmark_snapshot, attack_cases = create_benchmark(
                    self.db,
                    run_id=run.id,
                    benchmark_config=profile.benchmark_config,
                    attack_count=attack_count,
                )

            run.total_attacks = len(attack_cases)
            run.completed_attacks = len(processed_case_ids)
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
            adapter = get_adapter(target_cfg.get("target_type", "managed_llm_runtime"))
            runtime_cfg = profile.runtime_config or {}
            budget_usd = float(runtime_cfg.get("budget_usd", 0.0) or 0.0)
            abort_on_cost_breach = bool(runtime_cfg.get("abort_on_cost_breach", False))
            batch_size = max(1, int(runtime_cfg.get("batch_size", self.settings.run_batch_size)))
            pricing_profile_id = target_cfg.get("extra", {}).get("pricing_profile_id")
            policy_cfg = resolve_policy_config(target_cfg.get("extra", {}))
            log_event(
                self.db,
                run_id=run.id,
                event_type="policy_profile_applied",
                step=2,
                message=f"policy_profile={policy_cfg['name']}",
                data=policy_cfg,
            )
            last_afk_state = (
                self.db.query(AFKRunState)
                .filter(AFKRunState.run_id == run.id)
                .order_by(AFKRunState.created_at.desc())
                .first()
            )
            last_afk_run_id = None
            if last_afk_state and isinstance(last_afk_state.checkpoint, dict):
                last_afk_run_id = last_afk_state.checkpoint.get("last_afk_run_id")

            executions: list[Execution] = []
            low_confidence = []
            interrupted_early = False
            spent_usd = 0.0
            if processed_case_ids:
                cost_summary = rebuild_run_cost_aggregate(self.db, run.id)
                run.budget_spent_usd = float(cost_summary["totals"]["effective_cost"])
                spent_usd = run.budget_spent_usd
                completion_ratio = len(processed_case_ids) / max(len(attack_cases), 1)
                run.estimated_final_cost_usd = (
                    run.budget_spent_usd / completion_ratio if completion_ratio > 0 else run.budget_spent_usd
                )
                run.cost_gate_result = {
                    "pass": budget_usd <= 0 or run.budget_spent_usd <= budget_usd,
                    "budget_usd": budget_usd,
                    "spent_usd": run.budget_spent_usd,
                    "projected_final_usd": run.estimated_final_cost_usd,
                }
                self.db.commit()

            for case in attack_cases:
                if case.id in processed_case_ids:
                    continue
                request = TargetRequest(
                    run_id=run.id,
                    attack_id=case.id,
                    prompt=case.prompt,
                    target_type=normalize_target_type(target_cfg.get("target_type", "managed_llm_runtime")),
                    endpoint=target_cfg.get("endpoint"),
                    auth_headers=target_cfg.get("auth_headers", {}),
                    model=target_cfg.get("model", "gpt-4.1-mini"),
                    extra={
                        **target_cfg.get("extra", {}),
                        "provider_name": target_cfg.get("provider_name", target_cfg.get("target_type", "unknown")),
                        "base_url": target_cfg.get("base_url"),
                        "thread_id": run.thread_id,
                        "policy_profile": policy_cfg["name"],
                        "allowed_tools": sorted(policy_cfg["allowed_tools"]),
                        "afk_resume": resume_requested
                        and normalize_target_type(str(target_cfg.get("target_type", ""))) == "managed_agent_runtime",
                        "afk_run_id": last_afk_run_id,
                    },
                )
                response = adapter.invoke(request)
                afk_events = response.raw_payload.get("afk_events", []) if isinstance(response.raw_payload, dict) else []
                if isinstance(response.raw_payload, dict):
                    afk_run_id = response.raw_payload.get("run_id")
                    if afk_run_id:
                        last_afk_run_id = afk_run_id

                execution = Execution(
                    run_id=run.id,
                    attack_case_id=case.id,
                    target_type=request.target_type,
                    provider_name=response.provider_name,
                    model_resolved=response.model_resolved,
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

                detection, votes, adjudication_candidate = detect_failures(
                    execution_id=execution.id,
                    attack_type=case.attack_type,
                    prompt=case.prompt,
                    response=response.response_text,
                    retrieved_docs=response.retrieved_docs,
                    tool_events=response.tool_events,
                    scoring_config=profile.scoring_config,
                )
                label = fuse_labels(detection)

                self.db.add(detection)
                for vote in votes:
                    self.db.add(vote)
                self.db.add(label)
                executions.append(execution)
                processed_case_ids.add(case.id)
                cost_row = compute_execution_cost(
                    self.db,
                    run_id=run.id,
                    execution=execution,
                    provider_name=response.provider_name,
                    model=response.model_resolved,
                    pricing_profile_id=pricing_profile_id,
                )

                run.completed_attacks = len(processed_case_ids)
                spent_usd += float(cost_row.effective_cost_usd)
                run.budget_spent_usd = spent_usd
                completion_ratio = run.completed_attacks / max(len(attack_cases), 1)
                run.estimated_final_cost_usd = (
                    run.budget_spent_usd / completion_ratio if completion_ratio > 0 else run.budget_spent_usd
                )
                run.cost_gate_result = {
                    "pass": budget_usd <= 0 or run.budget_spent_usd <= budget_usd,
                    "budget_usd": budget_usd,
                    "spent_usd": run.budget_spent_usd,
                    "projected_final_usd": run.estimated_final_cost_usd,
                }

                if (
                    self.settings.low_confidence_min <= detection.confidence < self.settings.low_confidence_max
                    or adjudication_candidate
                ):
                    low_confidence.append(execution.id)

                for event in afk_events:
                    if not isinstance(event, dict):
                        continue
                    event_type = str(event.get("type", "")).strip()
                    if event_type in {"policy_decision", "run_paused", "run_resumed", "tool_started", "tool_completed"}:
                        log_event(
                            self.db,
                            run_id=run.id,
                            event_type=event_type,
                            step=2,
                            message=str(event.get("reason") or event.get("tool_name") or event_type),
                            data=event,
                            auto_commit=False,
                        )

                if run.completed_attacks % batch_size == 0 or run.completed_attacks == len(attack_cases):
                    self.db.commit()
                    rebuild_run_cost_aggregate(self.db, run.id)
                    log_event(
                        self.db,
                        run_id=run.id,
                        event_type="progress",
                        step=2,
                        message=f"Processed {run.completed_attacks}/{len(attack_cases)}",
                        data={
                            "completed": run.completed_attacks,
                            "total": len(attack_cases),
                            "spent_usd": run.budget_spent_usd,
                            "projected_final_usd": run.estimated_final_cost_usd,
                        },
                    )
                    self.db.add(
                        AFKRunState(
                            run_id=run.id,
                            thread_id=run.thread_id or f"run-{run.id}",
                            state="running",
                            step=2,
                            checkpoint={
                                "completed_attacks": run.completed_attacks,
                                "total_attacks": run.total_attacks,
                                "spent_usd": run.budget_spent_usd,
                                "projected_final_usd": run.estimated_final_cost_usd,
                                "last_afk_run_id": last_afk_run_id,
                            },
                        )
                    )
                    self.db.commit()

                if abort_on_cost_breach and budget_usd > 0 and run.budget_spent_usd > budget_usd:
                    log_event(
                        self.db,
                        run_id=run.id,
                        event_type="cost_gate_breached",
                        step=2,
                        message="Run stopped due to cost gate breach",
                        data={"spent_usd": run.budget_spent_usd, "budget_usd": budget_usd},
                    )
                    interrupted_early = True
                    break

            if interrupted_early:
                run.status = "interrupted"
                run.ended_at = datetime.now(timezone.utc)
                self.db.commit()
                self.db.add(
                    AFKRunState(
                        run_id=run.id,
                        thread_id=run.thread_id or f"run-{run.id}",
                        state="interrupted",
                        step=2,
                        checkpoint={
                            "completed_attacks": run.completed_attacks,
                            "total_attacks": run.total_attacks,
                            "spent_usd": run.budget_spent_usd,
                            "budget_usd": budget_usd,
                            "last_afk_run_id": last_afk_run_id,
                        },
                    )
                )
                self.db.commit()
                return

            rebuild_run_cost_aggregate(self.db, run.id)

            ensure_feature_definitions(self.db)
            all_executions = self.db.query(Execution).filter(Execution.run_id == run.id).all()
            rebuild_features_for_run(self.db, run.id, all_executions)
            log_event(self.db, run_id=run.id, event_type="features_ready", step=3, message="Feature extraction complete")

            build_clusters(self.db, run.id)
            log_event(self.db, run_id=run.id, event_type="clusters_ready", step=4, message="Failure clusters computed")

            build_risk_models(self.db, run.id)
            log_event(self.db, run_id=run.id, event_type="risk_ready", step=5, message="Risk models and cards computed")
            build_inference_and_calibration(self.db, run.id)
            build_cooccurrence_graph(self.db, run.id)
            build_forecast(self.db, run.id)
            log_event(self.db, run_id=run.id, event_type="advanced_ds_ready", step=5, message="Inference/graph/forecast computed")

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
            self.db.add(
                AFKRunState(
                    run_id=run.id,
                    thread_id=run.thread_id or f"run-{run.id}",
                    state="completed",
                    step=8,
                    checkpoint={
                        "completed_attacks": run.completed_attacks,
                        "total_attacks": run.total_attacks,
                        "last_afk_run_id": last_afk_run_id,
                    },
                )
            )
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
            self.db.add(
                AFKRunState(
                    run_id=run.id,
                    thread_id=run.thread_id or f"run-{run.id}",
                    state="failed",
                    step=99,
                    checkpoint={"error": str(exc), "last_afk_run_id": locals().get("last_afk_run_id")},
                )
            )
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
