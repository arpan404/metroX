from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReportArtifact, Run, ScoreCard
from app.services.risk import risk_cards


def generate_markdown_report(db: Session, run_id: str) -> tuple[str, str]:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise ValueError("Run not found")
    scorecard = db.query(ScoreCard).filter(ScoreCard.run_id == run_id).one_or_none()
    if not scorecard:
        raise ValueError("Scorecard not found")

    risks = risk_cards(db, run_id)
    lines = [
        f"# AutoRedTeam Run Report: {run_id}",
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

    artifact = ReportArtifact(run_id=run_id, kind="markdown", path=str(path), metadata={"bytes": len(content)})
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
            "metadata": artifact.metadata,
            "created_at": artifact.created_at.isoformat(),
        }
        for artifact in artifacts
    ]
