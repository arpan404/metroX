from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import auth_dependency
from app.db import SessionLocal, get_db
from app.models import (
    Adjudication,
    ConfigProfile,
    Detection,
    EvaluationSession,
    Execution,
    Run,
    RunEvent,
    ScoreCard,
)
from app.schemas import (
    AdjudicationCreate,
    AdjudicationOut,
    CompareOut,
    ConfigProfileCreate,
    ConfigProfileOut,
    DriftOut,
    FeatureOut,
    MitigationExperimentCreate,
    MitigationExperimentOut,
    RiskCardOut,
    RunCreate,
    RunOut,
    RunReportOut,
    ScoreCardOut,
    SessionCreate,
    SessionOut,
)
from app.services.clustering import list_clusters
from app.services.compare import compare_runs
from app.services.drift import drift_payload
from app.services.features import feature_table_for_run
from app.services.mitigation import create_mitigation_experiment, mitigation_payload
from app.services.orchestrator import RunOrchestrator
from app.services.reporting import generate_markdown_report
from app.services.risk import risk_cards

router = APIRouter(prefix="/v1", dependencies=[Depends(auth_dependency)])


def _run_pipeline_background(run_id: str) -> None:
    db = SessionLocal()
    try:
        orchestrator = RunOrchestrator(db)
        orchestrator.execute_run(run_id)
    finally:
        db.close()


@router.post("/sessions", response_model=SessionOut)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> SessionOut:
    row = EvaluationSession(name=payload.name, description=payload.description, owner=payload.owner)
    db.add(row)
    db.commit()
    db.refresh(row)
    return SessionOut.model_validate(row, from_attributes=True)


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, db: Session = Depends(get_db)) -> SessionOut:
    row = db.query(EvaluationSession).filter(EvaluationSession.id == session_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionOut.model_validate(row, from_attributes=True)


@router.post("/config-profiles", response_model=ConfigProfileOut)
def create_profile(payload: ConfigProfileCreate, db: Session = Depends(get_db)) -> ConfigProfileOut:
    session = db.query(EvaluationSession).filter(EvaluationSession.id == payload.session_id).one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    row = ConfigProfile(
        session_id=payload.session_id,
        name=payload.name,
        strictness_mode=payload.scoring_config.strictness_mode,
        target_config=payload.target_config.model_dump(),
        benchmark_config=payload.benchmark_config.model_dump(),
        scoring_config=payload.scoring_config.model_dump(),
        runtime_config=payload.runtime_config.model_dump(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ConfigProfileOut.model_validate(row, from_attributes=True)


@router.get("/config-profiles/{profile_id}", response_model=ConfigProfileOut)
def get_profile(profile_id: str, db: Session = Depends(get_db)) -> ConfigProfileOut:
    row = db.query(ConfigProfile).filter(ConfigProfile.id == profile_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Config profile not found")
    return ConfigProfileOut.model_validate(row, from_attributes=True)


@router.post("/runs", response_model=RunOut)
def create_run(
    payload: RunCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> RunOut:
    session = db.query(EvaluationSession).filter(EvaluationSession.id == payload.session_id).one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    profile = db.query(ConfigProfile).filter(ConfigProfile.id == payload.config_profile_id).one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Config profile not found")

    run = Run(
        session_id=payload.session_id,
        config_profile_id=payload.config_profile_id,
        baseline_run_id=payload.baseline_run_id,
        preset=payload.preset,
        mode=payload.mode,
        strictness=payload.strictness,
        status="queued",
        created_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    if payload.execute_now:
        background_tasks.add_task(_run_pipeline_background, run.id)

    return RunOut.model_validate(run, from_attributes=True)


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: str, db: Session = Depends(get_db)) -> RunOut:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut.model_validate(run, from_attributes=True)


@router.get("/runs/{run_id}/events")
def stream_run_events(run_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    def event_generator() -> str:
        last_id = 0
        terminal_states = {"completed", "failed"}
        stream_db = SessionLocal()
        try:
            while True:
                events = (
                    stream_db.query(RunEvent)
                    .filter(RunEvent.run_id == run_id, RunEvent.id > last_id)
                    .order_by(RunEvent.id.asc())
                    .all()
                )
                for event in events:
                    payload = {
                        "id": event.id,
                        "event_type": event.event_type,
                        "step": event.step,
                        "message": event.message,
                        "data": event.data,
                        "created_at": event.created_at.isoformat(),
                    }
                    last_id = event.id
                    yield f"data: {json.dumps(payload)}\n\n"

                current = stream_db.query(Run).filter(Run.id == run_id).one_or_none()
                if current and current.status in terminal_states:
                    yield "event: end\ndata: {}\n\n"
                    break
                time.sleep(1)
        finally:
            stream_db.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/runs/{run_id}/scorecard", response_model=ScoreCardOut)
def get_scorecard(run_id: str, db: Session = Depends(get_db)) -> ScoreCardOut:
    card = db.query(ScoreCard).filter(ScoreCard.run_id == run_id).one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Scorecard not found")
    return ScoreCardOut(run_id=run_id, metrics=card.metrics, gates=card.gates, ci=card.ci)


@router.get("/runs/{run_id}/risk-cards", response_model=RiskCardOut)
def get_risk_cards(run_id: str, db: Session = Depends(get_db)) -> RiskCardOut:
    return RiskCardOut(run_id=run_id, risks=risk_cards(db, run_id))


@router.get("/runs/{run_id}/features", response_model=FeatureOut)
def get_features(run_id: str, db: Session = Depends(get_db)) -> FeatureOut:
    return FeatureOut(run_id=run_id, features=feature_table_for_run(db, run_id))


@router.get("/runs/{run_id}/clusters")
def get_clusters(run_id: str, db: Session = Depends(get_db)) -> dict:
    return {"run_id": run_id, "clusters": list_clusters(db, run_id)}


@router.get("/runs/{run_id}/drift", response_model=DriftOut)
def get_drift(run_id: str, db: Session = Depends(get_db)) -> DriftOut:
    payload = drift_payload(db, run_id)
    return DriftOut.model_validate(payload)


@router.post("/adjudications", response_model=AdjudicationOut)
def create_adjudication(payload: AdjudicationCreate, db: Session = Depends(get_db)) -> AdjudicationOut:
    run = db.query(Run).filter(Run.id == payload.run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    execution = db.query(Execution).filter(Execution.id == payload.execution_id).one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    row = Adjudication(
        run_id=payload.run_id,
        execution_id=payload.execution_id,
        reviewer=payload.reviewer,
        decision=payload.decision,
        rationale=payload.rationale,
    )
    db.add(row)

    detection = db.query(Detection).filter(Detection.execution_id == payload.execution_id).one_or_none()
    if detection:
        flags = {key: False for key in detection.failure_flags.keys()}
        if payload.decision != "none":
            flags[payload.decision] = True
        detection.failure_flags = flags
        detection.confidence = max(detection.confidence, 0.95)

    db.commit()
    db.refresh(row)
    return AdjudicationOut.model_validate(row, from_attributes=True)


@router.post("/mitigation-experiments", response_model=MitigationExperimentOut)
def create_mitigation(payload: MitigationExperimentCreate, db: Session = Depends(get_db)) -> MitigationExperimentOut:
    experiment = create_mitigation_experiment(
        db,
        name=payload.name,
        baseline_run_id=payload.baseline_run_id,
        candidate_run_id=payload.candidate_run_id,
        config=payload.config,
    )
    details = mitigation_payload(db, experiment.id)
    return MitigationExperimentOut.model_validate(details)


@router.get("/mitigation-experiments/{experiment_id}", response_model=MitigationExperimentOut)
def get_mitigation(experiment_id: str, db: Session = Depends(get_db)) -> MitigationExperimentOut:
    try:
        details = mitigation_payload(db, experiment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return MitigationExperimentOut.model_validate(details)


@router.get("/compare", response_model=CompareOut)
def compare(
    baseline_run_id: str = Query(...),
    candidate_run_id: str = Query(...),
    db: Session = Depends(get_db),
) -> CompareOut:
    try:
        comparison = compare_runs(db, baseline_run_id, candidate_run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return CompareOut(
        baseline_run_id=comparison.baseline_run_id,
        candidate_run_id=comparison.candidate_run_id,
        summary=comparison.summary,
        tests=comparison.tests,
    )


@router.post("/reports/{run_id}/generate", response_model=RunReportOut)
def generate_report(run_id: str, db: Session = Depends(get_db)) -> RunReportOut:
    try:
        markdown, path = generate_markdown_report(db, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RunReportOut(run_id=run_id, markdown=markdown, path=path)
