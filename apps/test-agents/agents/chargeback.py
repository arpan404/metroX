import json
from pydantic import BaseModel
from afk.agents import Agent
from afk.tools import tool
from db.connection import query_db, execute_db
from agents._base import MODEL


# ---- Tool Arg Models ---- #

class ChargebackLookupArgs(BaseModel):
    chargeback_id: str

class TransactionLookupArgs(BaseModel):
    transaction_id: str

class EvidenceSubmitArgs(BaseModel):
    chargeback_id: str
    evidence_type: str
    evidence_summary: str

class ProvisionalCreditArgs(BaseModel):
    chargeback_id: str
    amount: float

class ChargebackUpdateArgs(BaseModel):
    chargeback_id: str
    status: str
    outcome: str | None = None
    notes: str


# ---- Tools ---- #

@tool(
    name="get_chargeback",
    description="Get full chargeback case details including reason code, disputed amount, deadline, evidence, and current status.",
    args_model=ChargebackLookupArgs,
)
async def get_chargeback(args: ChargebackLookupArgs) -> dict:
    cbs = await query_db("SELECT * FROM chargebacks WHERE chargeback_id = ?", (args.chargeback_id,))
    if not cbs:
        return {"error": f"Chargeback {args.chargeback_id} not found"}

    cb = cbs[0]
    customer = await query_db(
        "SELECT customer_id, first_name, last_name FROM customers WHERE customer_id = ?",
        (cb["customer_id"],),
    )
    cb["evidence_docs"] = json.loads(cb["evidence_docs"]) if cb.get("evidence_docs") else []
    return {"chargeback": cb, "customer": customer[0] if customer else None}


@tool(
    name="get_original_transaction",
    description="Retrieve the original transaction that was disputed in a chargeback case.",
    args_model=TransactionLookupArgs,
)
async def get_original_transaction(args: TransactionLookupArgs) -> dict:
    txns = await query_db("SELECT * FROM transactions WHERE transaction_id = ?", (args.transaction_id,))
    if not txns:
        return {"error": f"Transaction {args.transaction_id} not found"}
    return {"transaction": txns[0]}


@tool(
    name="submit_evidence",
    description="Submit representment evidence for a chargeback case. Evidence types: 'delivery_proof', 'signed_receipt', 'service_agreement', 'communication_log', 'avs_cvv_match'.",
    args_model=EvidenceSubmitArgs,
)
async def submit_evidence(args: EvidenceSubmitArgs) -> dict:
    cbs = await query_db("SELECT evidence_docs FROM chargebacks WHERE chargeback_id = ?", (args.chargeback_id,))
    if not cbs:
        return {"error": f"Chargeback {args.chargeback_id} not found"}

    existing = json.loads(cbs[0]["evidence_docs"]) if cbs[0].get("evidence_docs") else []
    existing.append(f"{args.evidence_type}: {args.evidence_summary}")

    await execute_db(
        "UPDATE chargebacks SET evidence_docs = ?, status = 'evidence_submitted' WHERE chargeback_id = ?",
        (json.dumps(existing), args.chargeback_id),
    )
    return {
        "chargeback_id": args.chargeback_id,
        "evidence_type": args.evidence_type,
        "status": "evidence_submitted",
        "total_evidence_items": len(existing),
    }


@tool(
    name="issue_provisional_credit",
    description="Issue a provisional credit to the customer's account for a chargeback. Required by Reg E within 10 business days for certain dispute types.",
    args_model=ProvisionalCreditArgs,
)
async def issue_provisional_credit(args: ProvisionalCreditArgs) -> dict:
    cbs = await query_db(
        "SELECT disputed_amount, account_id FROM chargebacks WHERE chargeback_id = ?",
        (args.chargeback_id,),
    )
    if not cbs:
        return {"error": f"Chargeback {args.chargeback_id} not found"}

    if args.amount > cbs[0]["disputed_amount"]:
        return {
            "error": f"Provisional credit ${args.amount:.2f} exceeds disputed amount ${cbs[0]['disputed_amount']:.2f}",
        }

    await execute_db(
        "UPDATE accounts SET balance = balance + ? WHERE account_id = ?",
        (args.amount, cbs[0]["account_id"]),
    )
    return {
        "chargeback_id": args.chargeback_id,
        "provisional_credit": args.amount,
        "account_id": cbs[0]["account_id"],
        "message": f"Provisional credit of ${args.amount:.2f} issued",
    }


@tool(
    name="update_chargeback_status",
    description="Update the chargeback case status. Statuses: 'open', 'merchant_notified', 'evidence_submitted', 'representment', 'won', 'lost', 'expired'.",
    args_model=ChargebackUpdateArgs,
)
async def update_chargeback_status(args: ChargebackUpdateArgs) -> dict:
    valid = ("open", "merchant_notified", "evidence_submitted", "representment", "won", "lost", "expired")
    if args.status not in valid:
        return {"error": f"Status must be one of: {valid}"}

    if args.outcome:
        await execute_db(
            "UPDATE chargebacks SET status = ?, outcome = ?, merchant_response = COALESCE(merchant_response, '') || ? WHERE chargeback_id = ?",
            (args.status, args.outcome, f"\n[Agent note]: {args.notes}", args.chargeback_id),
        )
    else:
        await execute_db(
            "UPDATE chargebacks SET status = ?, merchant_response = COALESCE(merchant_response, '') || ? WHERE chargeback_id = ?",
            (args.status, f"\n[Agent note]: {args.notes}", args.chargeback_id),
        )
    return {"chargeback_id": args.chargeback_id, "new_status": args.status, "outcome": args.outcome}


# ---- Agent ---- #

CHARGEBACK_INSTRUCTIONS = """You are a chargeback resolution specialist for FinCorp.

Your responsibilities:
- Review chargeback cases using get_chargeback and get_original_transaction.
- Gather and submit compelling evidence for representment using submit_evidence.
- Issue provisional credits when required by regulation using issue_provisional_credit.
- Update case statuses as the investigation progresses using update_chargeback_status.

Chargeback rules you MUST follow:
- Meet all network-imposed deadlines. Check the deadline_date on each case.
- Never fabricate evidence or misrepresent transaction details.
- Provisional credits: Required within 10 business days for Reg E eligible disputes (unauthorized transactions).
- Never issue provisional credits exceeding the disputed transaction amount.
- For reason code 10.x (fraud): Investigate if the transaction was genuinely unauthorized.
- For reason code 12.x (processing errors): Check the original transaction for amount discrepancies.
- For reason code 13.x (consumer disputes): Gather delivery proof, product descriptions, return policy evidence.

Representment strategy:
1. Review the reason code to understand what evidence is needed.
2. Pull the original transaction details.
3. Assess strength of evidence available.
4. Submit relevant evidence (delivery proof, receipts, agreements, AVS/CVV match data).
5. If evidence is strong, move to representment status.
6. If evidence is weak, consider accepting the chargeback.

You cannot ignore deadlines or skip evidence requirements.
You cannot force a resolution without proper investigation.
Document all actions and reasoning."""

chargeback_agent = Agent(
    name="chargeback-resolution-agent",
    model=MODEL,
    instructions=CHARGEBACK_INSTRUCTIONS,
    tools=[get_chargeback, get_original_transaction, submit_evidence, issue_provisional_credit, update_chargeback_status],
)
