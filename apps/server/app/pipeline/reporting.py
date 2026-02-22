from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    AttackCase,
    ConfigSnapshot,
    Detection,
    DetectionVote,
    Execution,
    ExecutionCost,
    ProbabilisticLabel,
    ReportArtifact,
    Run,
    RunEvent,
    ScoreCard,
)
from app.pipeline.costing import cost_timeseries, rebuild_run_cost_aggregate
from app.runtime.adapters import TargetRequest, get_adapter
from app.stats.advanced_analytics import calibration_payload, cooccurrence_payload, forecast_payload, inference_payload
from app.stats.clustering import list_clusters
from app.stats.drift import drift_payload
from app.stats.features import feature_table_for_run
from app.stats.risk import risk_cards


def generate_markdown_report(db: Session, run_id: str) -> tuple[str, str]:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise ValueError("Run not found")
    scorecard = db.query(ScoreCard).filter(ScoreCard.run_id == run_id).one_or_none()
    if not scorecard:
        raise ValueError("Scorecard not found")

    risks = risk_cards(db, run_id)
    lines = [
        f"# MetroX Run Report: {run_id}",
        "",
        "## Summary",
        f"- Status: {run.status}",
        f"- Preset: {run.preset}",
        f"- Mode: {run.mode}",
        f"- Total Attacks: {run.total_attacks}",
        f"- Completed: {run.completed_attacks}",
        "",
        "## Scorecard",
    ]
    for key, value in scorecard.metrics.items():
        lines.append(f"- {key}: {value}")

    lines.append("")
    lines.append("## Gate Verdict")
    lines.append(f"- Pass: {scorecard.gates.get('pass')}")
    for reason in scorecard.gates.get("reasons", []):
        lines.append(f"- Reason: {reason}")

    lines.append("")
    lines.append("## Calibrated Risk Cards")
    for card in risks[:10]:
        lines.append(
            f"- {card['failure_type']}: p={card['risk_probability']:.3f} "
            f"[{card['uncertainty_band']['low']:.3f}, {card['uncertainty_band']['high']:.3f}] "
            f"drivers={', '.join(card['top_drivers'])}"
        )

    content = "\n".join(lines)

    reports_dir = Path("reports")
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / f"run-{run_id}.md"
    path.write_text(content, encoding="utf-8")

    artifact = ReportArtifact(run_id=run_id, kind="markdown", path=str(path), meta={"bytes": len(content)})
    db.add(artifact)
    db.commit()

    return content, str(path)


def report_artifacts_for_run(db: Session, run_id: str) -> list[dict[str, Any]]:
    artifacts = db.query(ReportArtifact).filter(ReportArtifact.run_id == run_id).all()
    return [
        {
                "id": artifact.id,
                "kind": artifact.kind,
                "path": artifact.path,
                "metadata": artifact.meta,
                "created_at": artifact.created_at.isoformat() if artifact.created_at else None,
            }
        for artifact in artifacts
    ]


def _has_failure(flags: dict[str, Any] | None) -> bool:
    if not isinstance(flags, dict):
        return False
    return any(bool(value) for value in flags.values())


def _coerce_json(text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None
    return None


def _fallback_narrative(payload: dict[str, Any]) -> dict[str, Any]:
    run_meta = payload["run"]
    top_attacks = payload.get("top_attacks") if isinstance(payload.get("top_attacks"), list) else []
    top_attack = top_attacks[0] if top_attacks else None
    risk_rows = payload.get("risk_rows") if isinstance(payload.get("risk_rows"), list) else []
    gate_reasons = payload.get("gate_reasons") if isinstance(payload.get("gate_reasons"), list) else []
    score = float(payload.get("score", 0.0) or 0.0)
    risk_blurbs = [
        f"{row['failure_type'].replace('_', ' ')} ({row['risk_probability'] * 100:.1f}%)"
        for row in risk_rows[:3]
    ]
    vulnerabilities: list[dict[str, Any]] = []
    if top_attack:
        vulnerabilities.append(
            {
                "title": f"Elevated {top_attack['attack_type'].replace('_', ' ')} exposure",
                "attack_type": top_attack["attack_type"],
                "severity": "high" if top_attack["asr"] >= 0.25 else "medium",
                "evidence": (
                    f"{top_attack['failed']} compromised out of {top_attack['total']} "
                    f"({top_attack['asr'] * 100:.1f}% ASR)"
                ),
                "business_impact": "Increased probability of unsafe financial decisions in production flows.",
            }
        )
    if risk_rows:
        top_risk = risk_rows[0]
        vulnerabilities.append(
            {
                "title": f"Modeled risk concentration: {top_risk['failure_type'].replace('_', ' ')}",
                "attack_type": top_attack["attack_type"] if top_attack else "overall",
                "severity": "medium",
                "evidence": f"Calibrated risk is {top_risk['risk_probability'] * 100:.1f}%",
                "business_impact": "Potential fraud leakage and policy breach under adversarial pressure.",
            }
        )
    if not vulnerabilities:
        vulnerabilities.append(
            {
                "title": "No critical vulnerabilities detected in this run",
                "attack_type": "overall",
                "severity": "low",
                "evidence": "Current run metrics are within configured gate thresholds.",
                "business_impact": "Residual risk remains; continue scheduled regression testing.",
            }
        )

    advisories = [
        {
            "priority": 1,
            "action": "Harden policy checks around highest-ASR scenario types.",
            "why": "This directly targets the dominant exploit class observed in the run.",
            "expected_risk_reduction": "Medium to high if combined with stricter refusal templates.",
        },
        {
            "priority": 2,
            "action": "Increase detector disagreement review for uncertain executions.",
            "why": "High uncertainty often hides false negatives and brittle detector behavior.",
            "expected_risk_reduction": "Medium through improved adjudication quality.",
        },
        {
            "priority": 3,
            "action": "Run weekly multi-turn stress suites against financial abuse paths.",
            "why": "Context growth can unlock failures not visible in single-turn tests.",
            "expected_risk_reduction": "Steady reduction in late-stage production surprises.",
        },
    ]

    return {
        "run_id": str(run_meta.get("id", "")),
        "generated_by": "fallback",
        "model": "fallback",
        "provider": "fallback",
        "executive_summary": (
            f"Run {str(run_meta.get('id', ''))[:8]} completed with composite score {score:.1f}. "
            f"Top concern: {top_attack['attack_type'].replace('_', ' ') if top_attack else 'no dominant attack type'}."
        ),
        "non_technical_explanation": (
            "This test simulates fraudulent conversations against your financial agent. "
            "A higher attack success rate means attackers can more easily trick the system. "
            f"Current high-risk signals: {', '.join(risk_blurbs) if risk_blurbs else 'none observed'}."
        ),
        "top_vulnerabilities": vulnerabilities,
        "advisories": advisories,
        "gate_reasons": gate_reasons,
    }


def _generate_llm_narrative(payload: dict[str, Any], *, model: str) -> tuple[dict[str, Any] | None, str, str]:
    adapter = get_adapter("managed_llm_runtime")
    prompt = (
        "You are a financial AI safety advisor. Convert the run analytics below into plain-language guidance for "
        "non-technical stakeholders.\n\n"
        "Return STRICT JSON with exactly these keys:\n"
        "- executive_summary (string)\n"
        "- non_technical_explanation (string)\n"
        "- top_vulnerabilities (array of {title, attack_type, severity, evidence, business_impact})\n"
        "- advisories (array of {priority, action, why, expected_risk_reduction})\n\n"
        "Constraints:\n"
        "- Keep wording concrete and business-relevant.\n"
        "- Use evidence from supplied numbers.\n"
        "- Do not include markdown fences.\n\n"
        f"RUN_DATA:\n{json.dumps(payload, ensure_ascii=True)}"
    )
    response = adapter.invoke(
        TargetRequest(
            run_id=str(payload["run"].id),
            attack_id=str(payload["run"].id),
            prompt=prompt,
            target_type="managed_llm_runtime",
            endpoint=None,
            auth_headers={},
            model=model,
            extra={
                "runtime_provider": "litellm",
                "temperature": 0.15,
                "max_tokens": 1100,
                "extra_system_prompt": (
                    "You produce concise board-ready summaries for AI risk reviews."
                ),
            },
        )
    )
    parsed = _coerce_json(str(response.response_text or ""))
    return parsed, str(response.provider_name or "litellm"), str(response.model_resolved or model)


def generate_narrative_summary(
    db: Session,
    run_id: str,
    *,
    regenerate: bool = False,
) -> dict[str, Any]:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise ValueError("Run not found")

    latest_artifact = (
        db.query(ReportArtifact)
        .filter(ReportArtifact.run_id == run_id, ReportArtifact.kind == "narrative_summary")
        .order_by(ReportArtifact.created_at.desc())
        .first()
    )
    if latest_artifact and not regenerate:
        cached = latest_artifact.meta.get("payload") if isinstance(latest_artifact.meta, dict) else None
        if isinstance(cached, dict):
            return cached

    scorecard = db.query(ScoreCard).filter(ScoreCard.run_id == run_id).one_or_none()
    score = float((scorecard.metrics or {}).get("composite_score", 0.0)) if scorecard else 0.0
    gate_reasons = list((scorecard.gates or {}).get("reasons", [])) if scorecard else []
    risk_rows = risk_cards(db, run_id)

    execution_rows = (
        db.query(Execution, Detection, AttackCase)
        .join(Detection, Detection.execution_id == Execution.id)
        .join(AttackCase, AttackCase.id == Execution.attack_case_id)
        .filter(Execution.run_id == run_id)
        .all()
    )
    attack_rollup: dict[str, dict[str, Any]] = {}
    for _execution, detection, attack_case in execution_rows:
        attack_type = str(attack_case.attack_type or "unknown")
        row = attack_rollup.setdefault(attack_type, {"attack_type": attack_type, "total": 0, "failed": 0})
        row["total"] += 1
        if _has_failure(detection.failure_flags):
            row["failed"] += 1
    for row in attack_rollup.values():
        row["asr"] = float(row["failed"]) / max(float(row["total"]), 1.0)
    sorted_attacks = sorted(attack_rollup.values(), key=lambda item: (item["asr"], item["failed"]), reverse=True)
    top_attack = sorted_attacks[0] if sorted_attacks else None

    snapshot = db.query(ConfigSnapshot).filter(ConfigSnapshot.id == run.config_snapshot_id).one_or_none()
    snapshot_payload = snapshot.snapshot if snapshot and isinstance(snapshot.snapshot, dict) else {}
    model = (
        str(
            (snapshot_payload.get("benchmark_config") or {}).get("agentic_model")
            or (snapshot_payload.get("target_config") or {}).get("model")
            or "ollama_chat/gpt-oss:20b"
        ).strip()
        or "ollama_chat/gpt-oss:20b"
    )

    llm_input = {
        "run": {
            "id": run.id,
            "status": run.status,
            "preset": run.preset,
            "mode": run.mode,
            "total_attacks": int(run.total_attacks or 0),
            "completed_attacks": int(run.completed_attacks or 0),
        },
        "status": run.status,
        "preset": run.preset,
        "mode": run.mode,
        "score": score,
        "gate_pass": bool((scorecard.gates or {}).get("pass")) if scorecard else None,
        "gate_reasons": gate_reasons,
        "total_attacks": int(run.total_attacks or 0),
        "completed_attacks": int(run.completed_attacks or 0),
        "top_attacks": sorted_attacks[:6],
        "risk_rows": risk_rows[:6],
    }

    generated_by = "llm"
    provider = "litellm"
    resolved_model = model
    narrative: dict[str, Any] | None = None
    try:
        narrative, provider, resolved_model = _generate_llm_narrative(llm_input, model=model)
    except Exception:
        narrative = None
        provider = "fallback"
        resolved_model = "fallback"

    if not isinstance(narrative, dict):
        generated_by = "fallback"
        narrative = _fallback_narrative(llm_input)
    else:
        narrative = {
            "run_id": run_id,
            "generated_by": generated_by,
            "model": resolved_model,
            "provider": provider,
            "executive_summary": str(narrative.get("executive_summary", "")),
            "non_technical_explanation": str(narrative.get("non_technical_explanation", "")),
            "top_vulnerabilities": narrative.get("top_vulnerabilities", []) if isinstance(narrative.get("top_vulnerabilities"), list) else [],
            "advisories": narrative.get("advisories", []) if isinstance(narrative.get("advisories"), list) else [],
            "gate_reasons": gate_reasons,
        }

    reports_dir = Path("reports")
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / f"run-{run_id}-narrative.json"
    path.write_text(json.dumps(narrative, indent=2, ensure_ascii=True), encoding="utf-8")

    artifact = ReportArtifact(
        run_id=run_id,
        kind="narrative_summary",
        path=str(path),
        meta={"payload": narrative, "generated_by": generated_by, "provider": provider, "model": resolved_model},
    )
    db.add(artifact)
    db.commit()
    return narrative


def get_latest_narrative_summary(db: Session, run_id: str) -> dict[str, Any] | None:
    artifact = (
        db.query(ReportArtifact)
        .filter(ReportArtifact.run_id == run_id, ReportArtifact.kind == "narrative_summary")
        .order_by(ReportArtifact.created_at.desc())
        .first()
    )
    if not artifact or not isinstance(artifact.meta, dict):
        return None
    payload = artifact.meta.get("payload")
    if not isinstance(payload, dict):
        return None
    return payload


def _build_execution_records(db: Session, run_id: str) -> list[dict[str, Any]]:
    rows = (
        db.query(Execution, AttackCase, Detection, ExecutionCost, ProbabilisticLabel)
        .join(AttackCase, AttackCase.id == Execution.attack_case_id)
        .outerjoin(Detection, Detection.execution_id == Execution.id)
        .outerjoin(ExecutionCost, ExecutionCost.execution_id == Execution.id)
        .outerjoin(ProbabilisticLabel, ProbabilisticLabel.execution_id == Execution.id)
        .filter(Execution.run_id == run_id)
        .all()
    )
    execution_ids = [execution.id for execution, *_ in rows]
    votes_by_execution: dict[str, list[DetectionVote]] = {}
    if execution_ids:
        vote_rows = db.query(DetectionVote).filter(DetectionVote.execution_id.in_(execution_ids)).all()
        for vote in vote_rows:
            votes_by_execution.setdefault(vote.execution_id, []).append(vote)

    output: list[dict[str, Any]] = []
    for idx, (execution, attack_case, detection, execution_cost, label) in enumerate(rows, start=1):
        failure_flags = detection.failure_flags if detection and isinstance(detection.failure_flags, dict) else {}
        failed_keys = sorted([str(key) for key, value in failure_flags.items() if bool(value)])
        tool_events = execution.tool_events if isinstance(execution.tool_events, list) else []
        vote_rows = votes_by_execution.get(execution.id, [])
        output.append(
            {
                "index": idx,
                "execution_id": execution.id,
                "attack_case_id": attack_case.id,
                "attack_type": str(attack_case.attack_type or "unknown"),
                "target_type": str(execution.target_type or ""),
                "provider_name": str(execution.provider_name or "unknown"),
                "model_resolved": str(execution.model_resolved or "unknown"),
                "latency_ms": float(execution.latency_ms or 0.0),
                "effective_cost_usd": float(execution_cost.effective_cost_usd if execution_cost else 0.0),
                "provider_reported_cost_usd": float(execution_cost.provider_reported_cost_usd if execution_cost else 0.0),
                "token_usage": execution.token_usage if isinstance(execution.token_usage, dict) else {},
                "status": "failed" if failed_keys else "passed",
                "failed_reasons": failed_keys,
                "severity": str(detection.severity if detection else "low"),
                "confidence": float(detection.confidence if detection else 0.0),
                "disagreement_score": float(detection.disagreement_score if detection else 0.0),
                "uncertainty": float(detection.uncertainty if detection else 0.0),
                "failure_flags": failure_flags,
                "detection_evidence": detection.evidence if detection and isinstance(detection.evidence, dict) else {},
                "label": {
                    "final_label": str(label.final_label or "") if label else "",
                    "confidence": float(label.confidence if label else 0.0),
                    "label_probs": label.label_probs if label and isinstance(label.label_probs, dict) else {},
                    "method": str(label.method or "") if label else "",
                },
                "detector_votes": [
                    {
                        "vote_id": vote.id,
                        "detector_name": str(vote.detector_name or "unknown"),
                        "status": (
                            "fail"
                            if isinstance(vote.failure_flags, dict) and any(bool(v) for v in vote.failure_flags.values())
                            else "pass"
                        ),
                        "failure_flags": vote.failure_flags if isinstance(vote.failure_flags, dict) else {},
                        "confidence": float(vote.confidence or 0.0),
                        "latency_ms": float(vote.latency_ms or 0.0),
                        "evidence": vote.evidence if isinstance(vote.evidence, dict) else {},
                        "created_at": vote.created_at.isoformat() if vote.created_at else None,
                    }
                    for vote in vote_rows
                ],
                "tool_calls": tool_events,
                "retrieved_docs": execution.retrieved_docs if isinstance(execution.retrieved_docs, list) else [],
                "prompt": str(execution.prompt or ""),
                "response": str(execution.response or ""),
                "raw_payload": execution.raw_payload if isinstance(execution.raw_payload, dict) else {},
            }
        )
    return output


def _collect_report_payload(db: Session, run_id: str) -> dict[str, Any]:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise ValueError("Run not found")
    scorecard = db.query(ScoreCard).filter(ScoreCard.run_id == run_id).one_or_none()
    if not scorecard:
        raise ValueError("Scorecard not found")

    events = (
        db.query(RunEvent)
        .filter(RunEvent.run_id == run_id)
        .order_by(RunEvent.id.asc())
        .all()
    )
    narrative = get_latest_narrative_summary(db, run_id)
    if not narrative:
        narrative = generate_narrative_summary(db, run_id, regenerate=False)

    payload = {
        "run": {
            "id": run.id,
            "status": run.status,
            "preset": run.preset,
            "mode": run.mode,
            "strictness": run.strictness,
            "thread_id": run.thread_id,
            "total_attacks": int(run.total_attacks or 0),
            "completed_attacks": int(run.completed_attacks or 0),
            "budget_spent_usd": float(run.budget_spent_usd or 0.0),
            "estimated_final_cost_usd": float(run.estimated_final_cost_usd or 0.0),
            "summary_metrics": run.summary_metrics if isinstance(run.summary_metrics, dict) else {},
            "gate_result": run.gate_result if isinstance(run.gate_result, dict) else {},
            "cost_gate_result": run.cost_gate_result if isinstance(run.cost_gate_result, dict) else {},
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "ended_at": run.ended_at.isoformat() if run.ended_at else None,
        },
        "scorecard": {
            "metrics": scorecard.metrics if isinstance(scorecard.metrics, dict) else {},
            "gates": scorecard.gates if isinstance(scorecard.gates, dict) else {},
            "ci": scorecard.ci if isinstance(scorecard.ci, dict) else {},
        },
        "narrative_summary": narrative if isinstance(narrative, dict) else {},
        "events": [
            {
                "id": int(event.id),
                "event_type": str(event.event_type or ""),
                "step": int(event.step or 0),
                "message": str(event.message or ""),
                "data": event.data if isinstance(event.data, dict) else {},
                "created_at": event.created_at.isoformat() if event.created_at else None,
            }
            for event in events
        ],
        "executions": _build_execution_records(db, run_id),
        "analytics": {
            "risk_cards": risk_cards(db, run_id),
            "drift": drift_payload(db, run_id),
            "clusters": list_clusters(db, run_id),
            "features": feature_table_for_run(db, run_id),
            "inference": inference_payload(db, run_id),
            "calibration": calibration_payload(db, run_id),
            "cooccurrence_graph": cooccurrence_payload(db, run_id),
            "forecast": forecast_payload(db, run_id),
            "cost_summary": rebuild_run_cost_aggregate(db, run_id),
            "cost_timeseries": cost_timeseries(db, run_id),
        },
    }
    return payload


def _to_ascii_text(text: str) -> str:
    ascii_text = str(text or "").encode("ascii", errors="replace").decode("ascii")
    return re.sub(r"\s+", " ", ascii_text).strip()


def _render_report_markdown(payload: dict[str, Any]) -> str:
    run_meta = payload.get("run", {})
    scorecard = payload.get("scorecard", {})
    narrative = payload.get("narrative_summary", {})
    executions = payload.get("executions", [])
    analytics = payload.get("analytics", {})
    lines: list[str] = [
        f"# MetroX Comprehensive Report: {run_meta.get('id', '')}",
        "",
        "## Run Summary",
        f"- Status: {run_meta.get('status', '')}",
        f"- Preset: {run_meta.get('preset', '')}",
        f"- Mode: {run_meta.get('mode', '')}",
        f"- Strictness: {run_meta.get('strictness', '')}",
        f"- Completed Attacks: {run_meta.get('completed_attacks', 0)}/{run_meta.get('total_attacks', 0)}",
        f"- Budget Spent (USD): {float(run_meta.get('budget_spent_usd', 0.0) or 0.0):.4f}",
        "",
        "## Executive Advisory",
        f"- Summary: {_to_ascii_text(str(narrative.get('executive_summary', '')))}",
        f"- Analysis: {_to_ascii_text(str(narrative.get('non_technical_explanation', '')))}",
        "",
        "## Scorecard",
    ]
    metrics = scorecard.get("metrics", {}) if isinstance(scorecard, dict) else {}
    for key, value in (metrics.items() if isinstance(metrics, dict) else []):
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Forecasts (Predictions)"])
    forecast_rows = (
        analytics.get("forecast", {}).get("forecasts", [])
        if isinstance(analytics.get("forecast", {}), dict)
        else []
    )
    for row in forecast_rows:
        if not isinstance(row, dict):
            continue
        lines.append(
            f"- {row.get('metric_name', 'unknown')}: predicted={row.get('predicted_value', 0.0)} "
            f"interval=[{row.get('low', 0.0)}, {row.get('high', 0.0)}] method={row.get('method', '')}"
        )
    lines.extend(["", "## Execution Records (Detailed)"])
    for row in executions if isinstance(executions, list) else []:
        if not isinstance(row, dict):
            continue
        lines.append(
            f"### [{row.get('index', 0)}] execution={row.get('execution_id', '')} attack={row.get('attack_type', '')}"
        )
        lines.append(
            f"- Status: {row.get('status', '')} severity={row.get('severity', '')} "
            f"confidence={float(row.get('confidence', 0.0) or 0.0):.3f} "
            f"disagreement={float(row.get('disagreement_score', 0.0) or 0.0):.3f} "
            f"uncertainty={float(row.get('uncertainty', 0.0) or 0.0):.3f}"
        )
        lines.append(
            f"- Runtime: provider={row.get('provider_name', '')} model={row.get('model_resolved', '')} "
            f"latency_ms={float(row.get('latency_ms', 0.0) or 0.0):.2f} cost_usd={float(row.get('effective_cost_usd', 0.0) or 0.0):.6f}"
        )
        lines.append(f"- Failed Reasons: {', '.join(row.get('failed_reasons', [])) if row.get('failed_reasons') else 'none'}")
        tool_calls = row.get("tool_calls", [])
        lines.append(f"- Tool Calls: {len(tool_calls) if isinstance(tool_calls, list) else 0}")
        for vote in row.get("detector_votes", []):
            if not isinstance(vote, dict):
                continue
            lines.append(
                f"  - Detector {vote.get('detector_name', 'unknown')}: status={vote.get('status', '')} "
                f"confidence={float(vote.get('confidence', 0.0) or 0.0):.3f}"
            )
        lines.append(f"- Prompt: {_to_ascii_text(str(row.get('prompt', '')))[:800]}")
        lines.append(f"- Response: {_to_ascii_text(str(row.get('response', '')))[:800]}")
        lines.append("")
    return "\n".join(lines)


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _render_text_pdf(lines: list[str]) -> bytes:
    page_width = 612
    page_height = 792
    left_margin = 36
    top = 756
    line_height = 12
    lines_per_page = 58
    pages: list[list[str]] = []
    for i in range(0, len(lines), lines_per_page):
        pages.append(lines[i : i + lines_per_page])
    if not pages:
        pages = [["MetroX report has no content."]]

    objects: list[bytes] = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [] /Count 0 >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>")

    page_refs: list[int] = []
    for page_lines in pages:
        page_obj_id = len(objects) + 1
        content_obj_id = page_obj_id + 1
        page_refs.append(page_obj_id)
        escaped_lines = [_pdf_escape(_to_ascii_text(line))[:160] for line in page_lines]
        stream_lines = ["BT", "/F1 9 Tf", f"{left_margin} {top} Td"]
        for idx, line in enumerate(escaped_lines):
            if idx == 0:
                stream_lines.append(f"({line}) Tj")
            else:
                stream_lines.append(f"0 -{line_height} Td ({line}) Tj")
        stream_lines.append("ET")
        stream_payload = "\n".join(stream_lines).encode("ascii", errors="replace")
        content = (
            f"<< /Length {len(stream_payload)} >>\nstream\n".encode("ascii")
            + stream_payload
            + b"\nendstream"
        )
        page = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_obj_id} 0 R >>"
        ).encode("ascii")
        objects.append(page)
        objects.append(content)

    kids = " ".join(f"{obj_id} 0 R" for obj_id in page_refs)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_refs)} >>".encode("ascii")

    output = bytearray(b"%PDF-1.4\n")
    xref_offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        xref_offsets.append(len(output))
        output.extend(f"{idx} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref_start = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in xref_offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        (
            f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(output)


def generate_comprehensive_report(db: Session, run_id: str) -> dict[str, Any]:
    payload = _collect_report_payload(db, run_id)
    markdown = _render_report_markdown(payload)
    json_blob = json.dumps(payload, indent=2, ensure_ascii=True)

    reports_dir = Path("reports")
    reports_dir.mkdir(parents=True, exist_ok=True)
    md_path = reports_dir / f"run-{run_id}-comprehensive.md"
    json_path = reports_dir / f"run-{run_id}-comprehensive.json"
    pdf_path = reports_dir / f"run-{run_id}-comprehensive.pdf"
    md_path.write_text(markdown, encoding="utf-8")
    json_path.write_text(json_blob, encoding="utf-8")
    pdf_lines = markdown.splitlines()
    pdf_path.write_bytes(_render_text_pdf(pdf_lines))

    artifacts = [
        ReportArtifact(
            run_id=run_id,
            kind="comprehensive_markdown",
            path=str(md_path),
            meta={"bytes": len(markdown), "executions": len(payload.get("executions", []))},
        ),
        ReportArtifact(
            run_id=run_id,
            kind="comprehensive_json",
            path=str(json_path),
            meta={"bytes": len(json_blob), "executions": len(payload.get("executions", []))},
        ),
        ReportArtifact(
            run_id=run_id,
            kind="comprehensive_pdf",
            path=str(pdf_path),
            meta={"bytes": int(pdf_path.stat().st_size), "executions": len(payload.get("executions", []))},
        ),
    ]
    for artifact in artifacts:
        db.add(artifact)
    db.commit()
    return {
        "run_id": run_id,
        "markdown": markdown,
        "path": str(md_path),
        "pdf_path": str(pdf_path),
        "json_path": str(json_path),
        "execution_count": len(payload.get("executions", [])),
        "event_count": len(payload.get("events", [])),
    }


def get_report_download_path(db: Session, run_id: str, fmt: str) -> Path:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise ValueError("Run not found")
    kind_map = {
        "pdf": "comprehensive_pdf",
        "json": "comprehensive_json",
        "md": "comprehensive_markdown",
        "markdown": "comprehensive_markdown",
    }
    key = str(fmt or "pdf").strip().lower()
    kind = kind_map.get(key)
    if not kind:
        raise ValueError("Unsupported report format")
    artifact = (
        db.query(ReportArtifact)
        .filter(ReportArtifact.run_id == run_id, ReportArtifact.kind == kind)
        .order_by(ReportArtifact.created_at.desc())
        .first()
    )
    if not artifact:
        result = generate_comprehensive_report(db, run_id)
        generated_path = (
            result.get("pdf_path")
            if kind == "comprehensive_pdf"
            else result.get("json_path")
            if kind == "comprehensive_json"
            else result.get("path")
        )
        path = Path(str(generated_path or "")).resolve()
    else:
        path = Path(str(artifact.path)).resolve()
    if not path.exists():
        raise ValueError("Report artifact file missing")
    return path
