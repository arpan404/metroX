from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import AttackCase, ConfigSnapshot, Detection, Execution, ReportArtifact, Run, ScoreCard
from app.runtime.adapters import TargetRequest, get_adapter
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
    top_attack = payload["top_attack"]
    risk_rows = payload["risk_rows"]
    gate_reasons = payload["gate_reasons"]
    score = payload["score"]
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
        "run_id": run.id,
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
    narrative, provider, resolved_model = _generate_llm_narrative(llm_input, model=model)
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
