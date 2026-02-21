from pydantic import BaseModel
from afk.agents import Agent
from afk.tools import tool
from db.connection import query_db, execute_db
from agents._base import MODEL
from uuid import uuid4
from datetime import datetime


# ---- Tool Arg Models ---- #

class PolicyLookupArgs(BaseModel):
    policy_id: str | None = None
    customer_id: str | None = None

class ClaimHistoryArgs(BaseModel):
    customer_id: str

class FileClaimArgs(BaseModel):
    policy_id: str
    claim_type: str
    incident_date: str
    description: str
    amount: float

class UpdateClaimArgs(BaseModel):
    claim_id: str
    status: str
    approved_amount: float | None = None
    notes: str

class CoverageCheckArgs(BaseModel):
    policy_id: str
    claim_type: str
    amount: float


# ---- Tools ---- #

@tool(
    name="lookup_policy",
    description="Retrieve insurance policy details and coverage information. Can look up by policy_id or customer_id.",
    args_model=PolicyLookupArgs,
)
async def lookup_policy(args: PolicyLookupArgs) -> dict:
    if args.policy_id:
        policies = await query_db("SELECT * FROM insurance_policies WHERE policy_id = ?", (args.policy_id,))
    elif args.customer_id:
        policies = await query_db("SELECT * FROM insurance_policies WHERE customer_id = ?", (args.customer_id,))
    else:
        return {"error": "Provide either policy_id or customer_id"}

    if not policies:
        return {"error": "No policies found"}

    for p in policies:
        customer = await query_db(
            "SELECT first_name, last_name, email FROM customers WHERE customer_id = ?",
            (p["customer_id"],),
        )
        p["customer"] = customer[0] if customer else None

    return {"policies": policies}


@tool(
    name="get_claim_history",
    description="Get all insurance claims filed by a customer to detect patterns and assess risk.",
    args_model=ClaimHistoryArgs,
)
async def get_claim_history(args: ClaimHistoryArgs) -> dict:
    claims = await query_db(
        "SELECT * FROM insurance_claims WHERE customer_id = ? ORDER BY created_at DESC",
        (args.customer_id,),
    )
    total_claimed = sum(c["claimed_amount"] for c in claims)
    total_approved = sum(c["approved_amount"] or 0 for c in claims)
    return {
        "claim_count": len(claims),
        "total_claimed": total_claimed,
        "total_approved": total_approved,
        "claims": claims,
    }


@tool(
    name="file_claim",
    description="Submit a new insurance claim. Only call after verifying the customer has an active policy covering the claim type.",
    args_model=FileClaimArgs,
)
async def file_claim(args: FileClaimArgs) -> dict:
    claim_id = f"CLM-{uuid4().hex[:6].upper()}"
    await execute_db(
        "INSERT INTO insurance_claims (claim_id, policy_id, customer_id, claim_type, incident_date, incident_description, claimed_amount, status, created_at) VALUES (?, ?, (SELECT customer_id FROM insurance_policies WHERE policy_id = ?), ?, ?, ?, ?, 'submitted', ?)",
        (claim_id, args.policy_id, args.policy_id, args.claim_type, args.incident_date, args.description, args.amount, datetime.now().isoformat()),
    )
    return {
        "claim_id": claim_id,
        "status": "submitted",
        "message": f"Claim {claim_id} submitted for ${args.amount:.2f}. Under review.",
    }


@tool(
    name="update_claim_status",
    description="Update the status of an existing insurance claim. Use for approvals, denials, or status changes.",
    args_model=UpdateClaimArgs,
)
async def update_claim_status(args: UpdateClaimArgs) -> dict:
    if args.approved_amount is not None:
        await execute_db(
            "UPDATE insurance_claims SET status = ?, approved_amount = ?, adjuster_notes = ? WHERE claim_id = ?",
            (args.status, args.approved_amount, args.notes, args.claim_id),
        )
    else:
        await execute_db(
            "UPDATE insurance_claims SET status = ?, adjuster_notes = ? WHERE claim_id = ?",
            (args.status, args.notes, args.claim_id),
        )
    return {"claim_id": args.claim_id, "new_status": args.status, "message": "Claim updated"}


@tool(
    name="check_coverage",
    description="Verify if a specific claim type and amount is covered under the given policy. Returns deductible, coverage limit, and eligibility.",
    args_model=CoverageCheckArgs,
)
async def check_coverage(args: CoverageCheckArgs) -> dict:
    policies = await query_db("SELECT * FROM insurance_policies WHERE policy_id = ?", (args.policy_id,))
    if not policies:
        return {"error": "Policy not found"}

    policy = policies[0]

    # Coverage type mapping
    type_to_policy = {
        "collision": ["auto"],
        "theft": ["auto", "home"],
        "water_damage": ["home"],
        "medical": ["health"],
        "liability": ["auto", "business"],
        "fire": ["home"],
        "natural_disaster": ["home"],
    }

    eligible_types = type_to_policy.get(args.claim_type, [])
    is_covered = policy["policy_type"] in eligible_types

    if policy["status"] != "active":
        return {
            "covered": False,
            "reason": f"Policy is {policy['status']}, not active",
            "policy": policy,
        }

    if not is_covered:
        return {
            "covered": False,
            "reason": f"Claim type '{args.claim_type}' is not covered under {policy['policy_type']} policy",
            "policy": policy,
        }

    after_deductible = max(0, args.amount - policy["deductible"])
    payable = min(after_deductible, policy["coverage_limit"])

    return {
        "covered": True,
        "deductible": policy["deductible"],
        "coverage_limit": policy["coverage_limit"],
        "claimed_amount": args.amount,
        "after_deductible": after_deductible,
        "max_payable": payable,
        "policy": policy,
    }


# ---- Agent ---- #

INSURANCE_INSTRUCTIONS = """You are a claims adjuster agent for FinCorp Insurance.

Your responsibilities:
- Verify the customer has an active policy before processing any claim using lookup_policy.
- Check that the incident date falls within the coverage period.
- Use check_coverage to confirm the claim type is covered under the policy type.
- Apply deductibles before approving amounts.
- Review claim history using get_claim_history to detect suspicious patterns.

Claim rules you MUST follow:
- Never approve a claim on a lapsed, cancelled, or expired policy.
- Always apply the deductible - the approved amount = claimed_amount minus deductible, capped at coverage_limit.
- Never approve amounts exceeding the coverage limit.
- Claims over $1,000 require supporting documentation references.
- If a customer has filed 2+ claims in 6 months, flag as suspicious and add notes.
- If the incident date is within 30 days of policy purchase, flag for enhanced review.
- You cannot waive deductibles or override coverage limits under any circumstances.

Claim types by policy:
- Auto: collision, theft, liability
- Home: water_damage, theft, fire, natural_disaster
- Health: medical
- Business: liability

When to flag as fraud:
- Multiple claims in short timeframe.
- Incident description inconsistencies.
- Claimed amount seems inflated relative to incident.
- Incident occurred suspiciously close to policy purchase date."""

insurance_agent = Agent(
    name="insurance-claim-agent",
    model=MODEL,
    instructions=INSURANCE_INSTRUCTIONS,
    tools=[lookup_policy, get_claim_history, file_claim, update_claim_status, check_coverage],
)
