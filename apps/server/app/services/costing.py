from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import Execution, ExecutionCost, ModelPricing, PricingProfile, RunCostAggregate


def _default_profile(db: Session) -> PricingProfile:
    profile = db.query(PricingProfile).filter(PricingProfile.name == "default-hybrid").one_or_none()
    if profile:
        return profile

    profile = PricingProfile(name="default-hybrid", currency="USD", fallback_policy="hybrid")
    db.add(profile)
    db.flush()

    seeds = [
        ModelPricing(
            pricing_profile_id=profile.id,
            provider_name="openai",
            model="gpt-4.1-mini",
            input_per_1k=0.001,
            output_per_1k=0.002,
            reasoning_per_1k=0.0,
        ),
        ModelPricing(
            pricing_profile_id=profile.id,
            provider_name="generic",
            model="*",
            input_per_1k=0.001,
            output_per_1k=0.001,
            reasoning_per_1k=0.0,
        ),
    ]
    db.add_all(seeds)
    db.commit()
    db.refresh(profile)
    return profile


def _lookup_rate(db: Session, pricing_profile_id: str, provider: str, model: str) -> tuple[float, float, float]:
    exact = (
        db.query(ModelPricing)
        .filter(
            ModelPricing.pricing_profile_id == pricing_profile_id,
            ModelPricing.provider_name == provider,
            ModelPricing.model == model,
        )
        .one_or_none()
    )
    if exact:
        return float(exact.input_per_1k), float(exact.output_per_1k), float(exact.reasoning_per_1k)

    generic = (
        db.query(ModelPricing)
        .filter(
            ModelPricing.pricing_profile_id == pricing_profile_id,
            ModelPricing.provider_name.in_([provider, "generic"]),
            ModelPricing.model == "*",
        )
        .first()
    )
    if generic:
        return float(generic.input_per_1k), float(generic.output_per_1k), float(generic.reasoning_per_1k)
    return 0.0, 0.0, 0.0


def compute_execution_cost(
    db: Session,
    *,
    run_id: str,
    execution: Execution,
    provider_name: str,
    model: str,
    pricing_profile_id: str | None = None,
) -> ExecutionCost:
    profile = _default_profile(db) if not pricing_profile_id else db.query(PricingProfile).filter(PricingProfile.id == pricing_profile_id).one_or_none()
    if not profile:
        profile = _default_profile(db)

    prompt_tokens = float(execution.token_usage.get("prompt_tokens", 0.0))
    completion_tokens = float(execution.token_usage.get("completion_tokens", 0.0))
    total_tokens = float(execution.token_usage.get("total_tokens", prompt_tokens + completion_tokens))
    provider_cost = float(execution.token_usage.get("total_cost_usd", 0.0) or 0.0)

    in_rate, out_rate, reasoning_rate = _lookup_rate(db, profile.id, provider_name or "generic", model or "*")
    reasoning_tokens = float(execution.token_usage.get("reasoning_tokens", 0.0))
    estimated = (prompt_tokens / 1000.0) * in_rate + (completion_tokens / 1000.0) * out_rate + (reasoning_tokens / 1000.0) * reasoning_rate

    if provider_cost > 0 and estimated > 0:
        source = "mixed"
        effective = provider_cost
        confidence = 0.95
    elif provider_cost > 0:
        source = "provider"
        effective = provider_cost
        confidence = 0.98
    else:
        source = "fallback"
        effective = estimated
        confidence = 0.70 if estimated > 0 else 0.40

    existing = db.query(ExecutionCost).filter(ExecutionCost.execution_id == execution.id).one_or_none()
    row = existing or ExecutionCost(run_id=run_id, execution_id=execution.id)
    row.provider_name = provider_name or "unknown"
    row.model = model or "unknown"
    row.prompt_tokens = prompt_tokens
    row.completion_tokens = completion_tokens
    row.total_tokens = total_tokens
    row.provider_reported_cost_usd = provider_cost
    row.estimated_cost_usd = estimated
    row.effective_cost_usd = effective
    row.cost_source = source
    row.confidence = confidence

    if not existing:
        db.add(row)
    db.flush()
    return row


def rebuild_run_cost_aggregate(db: Session, run_id: str) -> dict[str, Any]:
    rows = db.query(ExecutionCost).filter(ExecutionCost.run_id == run_id).all()
    by_provider: dict[str, dict[str, float]] = defaultdict(lambda: {"cost": 0.0, "tokens": 0.0, "count": 0.0})
    totals = {
        "prompt_tokens": 0.0,
        "completion_tokens": 0.0,
        "provider_cost": 0.0,
        "estimated_cost": 0.0,
        "effective_cost": 0.0,
    }

    for row in rows:
        totals["prompt_tokens"] += float(row.prompt_tokens)
        totals["completion_tokens"] += float(row.completion_tokens)
        totals["provider_cost"] += float(row.provider_reported_cost_usd)
        totals["estimated_cost"] += float(row.estimated_cost_usd)
        totals["effective_cost"] += float(row.effective_cost_usd)
        item = by_provider[row.provider_name]
        item["cost"] += float(row.effective_cost_usd)
        item["tokens"] += float(row.total_tokens)
        item["count"] += 1.0

    aggregate = db.query(RunCostAggregate).filter(RunCostAggregate.run_id == run_id).one_or_none()
    if not aggregate:
        aggregate = RunCostAggregate(run_id=run_id)
        db.add(aggregate)

    aggregate.total_prompt_tokens = totals["prompt_tokens"]
    aggregate.total_completion_tokens = totals["completion_tokens"]
    aggregate.total_provider_cost_usd = totals["provider_cost"]
    aggregate.total_estimated_cost_usd = totals["estimated_cost"]
    aggregate.total_effective_cost_usd = totals["effective_cost"]
    aggregate.breakdown = {k: v for k, v in by_provider.items()}
    db.commit()

    return {
        "run_id": run_id,
        "totals": totals,
        "breakdown": aggregate.breakdown,
        "sources": {
            "provider": sum(1 for row in rows if row.cost_source == "provider"),
            "fallback": sum(1 for row in rows if row.cost_source == "fallback"),
            "mixed": sum(1 for row in rows if row.cost_source == "mixed"),
        },
    }


def cost_timeseries(db: Session, run_id: str) -> dict[str, Any]:
    rows = (
        db.query(ExecutionCost)
        .filter(ExecutionCost.run_id == run_id)
        .order_by(ExecutionCost.created_at.asc())
        .all()
    )
    cumulative = 0.0
    points = []
    for idx, row in enumerate(rows, start=1):
        cumulative += float(row.effective_cost_usd)
        points.append(
            {
                "step": idx,
                "execution_id": row.execution_id,
                "cost_usd": float(row.effective_cost_usd),
                "cumulative_cost_usd": cumulative,
                "source": row.cost_source,
                "created_at": row.created_at.isoformat(),
            }
        )
    return {"run_id": run_id, "points": points}


def upsert_pricing_profile(
    db: Session,
    *,
    name: str,
    currency: str,
    fallback_policy: str,
    models: list[dict[str, Any]],
    notes: str | None = None,
) -> PricingProfile:
    profile = PricingProfile(name=name, currency=currency, fallback_policy=fallback_policy, notes=notes)
    db.add(profile)
    db.flush()

    for row in models:
        db.add(
            ModelPricing(
                pricing_profile_id=profile.id,
                provider_name=str(row.get("provider_name", "generic")),
                model=str(row.get("model", "*")),
                input_per_1k=float(row.get("input_per_1k", 0.0)),
                output_per_1k=float(row.get("output_per_1k", 0.0)),
                reasoning_per_1k=float(row.get("reasoning_per_1k", 0.0)),
            )
        )

    db.commit()
    db.refresh(profile)
    return profile


def pricing_profile_payload(db: Session, profile_id: str) -> dict[str, Any]:
    profile = db.query(PricingProfile).filter(PricingProfile.id == profile_id).one_or_none()
    if not profile:
        raise ValueError("Pricing profile not found")
    rows = db.query(ModelPricing).filter(ModelPricing.pricing_profile_id == profile_id).all()
    return {
        "id": profile.id,
        "name": profile.name,
        "currency": profile.currency,
        "fallback_policy": profile.fallback_policy,
        "notes": profile.notes,
        "created_at": profile.created_at,
        "models": [
            {
                "provider_name": row.provider_name,
                "model": row.model,
                "input_per_1k": row.input_per_1k,
                "output_per_1k": row.output_per_1k,
                "reasoning_per_1k": row.reasoning_per_1k,
            }
            for row in rows
        ],
    }


def reset_run_cost(db: Session, run_id: str) -> None:
    db.execute(delete(ExecutionCost).where(ExecutionCost.run_id == run_id))
    db.execute(delete(RunCostAggregate).where(RunCostAggregate.run_id == run_id))
    db.commit()
