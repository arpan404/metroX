from __future__ import annotations

import time
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

from app.api.v1 import router as v1_router
from app.config import get_settings
from app.db import init_db
from app.observability import METRICS, configure_logging, log_request_event
from app.runtime.run_queue import RUN_QUEUE

app = FastAPI(
    title="MetroX API",
    version="0.1.0",
    description="Data-driven reliability evaluation for LLMs and AI agents",
)

_cors_origins = [
    origin.strip()
    for origin in get_settings().cors_allowed_origins.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event() -> None:
    configure_logging()
    init_db()
    RUN_QUEUE.start()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    trace_id = request.headers.get("x-trace-id") or str(uuid4())
    start = time.perf_counter()
    response = await call_next(request)
    latency_ms = (time.perf_counter() - start) * 1000
    METRICS.record(status_code=response.status_code, latency_ms=latency_ms)
    response.headers["X-Trace-Id"] = trace_id
    log_request_event(
        trace_id=trace_id,
        path=request.url.path,
        method=request.method,
        status_code=response.status_code,
        latency_ms=latency_ms,
    )
    return response


@app.get("/slo")
def slo_metrics() -> dict:
    return METRICS.snapshot()


app.include_router(v1_router)
