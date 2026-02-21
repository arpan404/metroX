import json
from pydantic import BaseModel
from afk.agents import Agent
from afk.tools import tool
from db.connection import query_db, execute_db
from agents._base import MODEL
from uuid import uuid4
from datetime import datetime


# ---- Tool Arg Models ---- #

class CustomerProfileArgs(BaseModel):
    customer_id: str

class WatchlistScreenArgs(BaseModel):
    full_name: str
    country: str | None = None

class IDVerifyArgs(BaseModel):
    customer_id: str
    document_type: str
    document_number: str

class KYCUpdateArgs(BaseModel):
    customer_id: str
    status: str
    notes: str

class VerificationHistoryArgs(BaseModel):
    customer_id: str


# ---- Tools ---- #

@tool(
    name="get_customer_profile",
    description="Retrieve customer personal information including name, address, DOB, and ID document details for KYC verification.",
    args_model=CustomerProfileArgs,
)
async def get_customer_profile(args: CustomerProfileArgs) -> dict:
    customers = await query_db("SELECT * FROM customers WHERE customer_id = ?", (args.customer_id,))
    if not customers:
        return {"error": f"Customer {args.customer_id} not found"}
    c = customers[0]
    # Redact full SSN
    c["ssn_last4"] = f"***-**-{c['ssn_last4']}" if c.get("ssn_last4") else None
    return {"customer": c}


@tool(
    name="screen_watchlists",
    description="Screen a person's name against OFAC SDN, PEP, sanctions, and adverse media watchlists. Returns potential matches with confidence scores.",
    args_model=WatchlistScreenArgs,
)
async def screen_watchlists(args: WatchlistScreenArgs) -> dict:
    # Fuzzy name matching simulation
    name_parts = args.full_name.lower().split()
    matches = []

    entries = await query_db("SELECT * FROM watchlist_entries WHERE active = 1")
    for entry in entries:
        entity_lower = entry["entity_name"].lower()
        aliases = json.loads(entry.get("entity_aliases") or "[]")
        all_names = [entity_lower] + [a.lower() for a in aliases]

        for name in all_names:
            # Check if any part of the search name matches
            match_score = 0
            for part in name_parts:
                if part in name:
                    match_score += 0.4
                if name.startswith(part) or name.endswith(part):
                    match_score += 0.2

            if match_score >= entry["match_threshold"] * 0.8:
                matches.append({
                    "entry_id": entry["entry_id"],
                    "list_type": entry["list_type"],
                    "entity_name": entry["entity_name"],
                    "entity_country": entry["entity_country"],
                    "match_score": round(min(match_score, 1.0), 2),
                    "threshold": entry["match_threshold"],
                    "hit": match_score >= entry["match_threshold"],
                })

    if args.country:
        country_matches = await query_db(
            "SELECT * FROM watchlist_entries WHERE entity_country = ? AND active = 1",
            (args.country.upper(),),
        )
        for cm in country_matches:
            if cm["entry_id"] not in [m["entry_id"] for m in matches]:
                matches.append({
                    "entry_id": cm["entry_id"],
                    "list_type": cm["list_type"],
                    "entity_name": cm["entity_name"],
                    "entity_country": cm["entity_country"],
                    "match_score": 0.3,
                    "threshold": cm["match_threshold"],
                    "hit": False,
                    "note": "Country association only",
                })

    hits = [m for m in matches if m.get("hit")]
    return {
        "screened_name": args.full_name,
        "total_matches": len(matches),
        "confirmed_hits": len(hits),
        "matches": matches,
        "clear": len(hits) == 0,
    }


@tool(
    name="verify_identity_document",
    description="Validate a customer's identity document (drivers_license, passport, state_id) against records on file.",
    args_model=IDVerifyArgs,
)
async def verify_identity_document(args: IDVerifyArgs) -> dict:
    customers = await query_db(
        "SELECT id_document_type, id_document_number, id_document_expiry, first_name, last_name FROM customers WHERE customer_id = ?",
        (args.customer_id,),
    )
    if not customers:
        return {"error": f"Customer {args.customer_id} not found"}

    c = customers[0]
    type_match = c["id_document_type"] == args.document_type
    number_match = c["id_document_number"] == args.document_number

    # Check expiry
    expired = False
    if c["id_document_expiry"]:
        expiry_date = datetime.strptime(c["id_document_expiry"], "%Y-%m-%d")
        expired = expiry_date < datetime.now()

    if type_match and number_match and not expired:
        result = "passed"
        confidence = 0.98
    elif type_match and number_match and expired:
        result = "failed"
        confidence = 0.95
    elif not number_match:
        result = "failed"
        confidence = 0.90
    else:
        result = "manual_review"
        confidence = 0.60

    flags = []
    if expired:
        flags.append("document_expired")
    if not type_match:
        flags.append("document_type_mismatch")
    if not number_match:
        flags.append("document_number_mismatch")

    return {
        "customer_id": args.customer_id,
        "verification_result": result,
        "confidence": confidence,
        "document_expired": expired,
        "flags": flags,
        "customer_name": f"{c['first_name']} {c['last_name']}",
    }


@tool(
    name="update_kyc_status",
    description="Update the KYC verification status for a customer. Status must be 'verified', 'failed', or 'pending'.",
    args_model=KYCUpdateArgs,
)
async def update_kyc_status(args: KYCUpdateArgs) -> dict:
    if args.status not in ("verified", "failed", "pending", "expired"):
        return {"error": "Status must be 'verified', 'failed', 'pending', or 'expired'"}

    await execute_db(
        "UPDATE customers SET kyc_status = ? WHERE customer_id = ?",
        (args.status, args.customer_id),
    )

    vid = f"KYC-{uuid4().hex[:6].upper()}"
    await execute_db(
        "INSERT INTO kyc_verifications (verification_id, customer_id, verification_type, verification_result, verified_by, created_at) VALUES (?, ?, 'status_update', ?, 'agent', ?)",
        (vid, args.customer_id, args.status, datetime.now().isoformat()),
    )

    return {
        "customer_id": args.customer_id,
        "new_kyc_status": args.status,
        "verification_id": vid,
        "notes": args.notes,
    }


@tool(
    name="get_verification_history",
    description="Get all past KYC verification attempts for a customer including identity, sanctions, and PEP screening results.",
    args_model=VerificationHistoryArgs,
)
async def get_verification_history(args: VerificationHistoryArgs) -> dict:
    verifications = await query_db(
        "SELECT * FROM kyc_verifications WHERE customer_id = ? ORDER BY created_at DESC",
        (args.customer_id,),
    )
    return {
        "customer_id": args.customer_id,
        "verification_count": len(verifications),
        "verifications": verifications,
    }


# ---- Agent ---- #

KYC_INSTRUCTIONS = """You are a KYC/AML compliance officer for FinCorp.

Your responsibilities:
- Verify customer identity using get_customer_profile and verify_identity_document.
- Screen ALL customers against watchlists using screen_watchlists (OFAC SDN, PEP, sanctions).
- Review verification history using get_verification_history.

Compliance rules you MUST follow:
- NEVER clear a customer who has a confirmed watchlist hit. Escalate these cases.
- Reject identity verification if documents are expired.
- Flag discrepancies between provided information and database records.
- Require re-verification if identity documents expire within 30 days.
- Maintain audit trail for all verification decisions using update_kyc_status.
- Apply Enhanced Due Diligence (EDD) for:
  - Customers from high-risk countries (RU, IR, SY, KP, CU, BY)
  - PEP matches (even partial matches above threshold)
  - Customers with adverse media matches

Verification workflow:
1. Pull customer profile
2. Verify identity document
3. Screen against all watchlists
4. Review verification history for patterns
5. Make determination and update status

You cannot skip required verification steps or override sanctions screening results.
You cannot mark a customer as 'verified' if any screening step has not been completed.
Always document your reasoning when updating KYC status."""

kyc_agent = Agent(
    name="kyc-verification-agent",
    model=MODEL,
    instructions=KYC_INSTRUCTIONS,
    tools=[get_customer_profile, screen_watchlists, verify_identity_document, update_kyc_status, get_verification_history],
)
