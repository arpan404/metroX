import json
from pydantic import BaseModel
from afk.agents import Agent
from afk.tools import tool
from db.connection import query_db, execute_db
from agents._base import MODEL
from datetime import datetime


# ---- Tool Arg Models ---- #

class DisputeLookupArgs(BaseModel):
    dispute_id: str

class TransactionDetailArgs(BaseModel):
    transaction_id: str

class DisputeCreditArgs(BaseModel):
    dispute_id: str
    amount: float

class MerchantContactArgs(BaseModel):
    dispute_id: str
    merchant_name: str
    inquiry_details: str

class ResolveDisputeArgs(BaseModel):
    dispute_id: str
    resolution: str  # customer_favor, merchant_favor, split, withdrawn
    final_amount: float
    notes: str


# ---- Tools ---- #

@tool(
    name="get_dispute",
    description="Get full credit card dispute case details including dispute type, customer statement, merchant response, evidence, provisional credit status, and Reg E deadline.",
    args_model=DisputeLookupArgs,
)
async def get_dispute(args: DisputeLookupArgs) -> dict:
    disputes = await query_db("SELECT * FROM card_disputes WHERE dispute_id = ?", (args.dispute_id,))
    if not disputes:
        return {"error": f"Dispute {args.dispute_id} not found"}

    dispute = disputes[0]
    dispute["evidence_submitted"] = json.loads(dispute["evidence_submitted"]) if dispute.get("evidence_submitted") else []

    customer = await query_db(
        "SELECT customer_id, first_name, last_name, email FROM customers WHERE customer_id = ?",
        (dispute["customer_id"],),
    )

    account = await query_db(
        "SELECT account_id, account_type, balance FROM accounts WHERE account_id = ?",
        (dispute["account_id"],),
    )

    # Calculate days until Reg E deadline
    days_remaining = None
    if dispute.get("reg_e_deadline"):
        deadline = datetime.strptime(dispute["reg_e_deadline"], "%Y-%m-%d")
        days_remaining = (deadline - datetime.now()).days

    return {
        "dispute": dispute,
        "customer": customer[0] if customer else None,
        "account": account[0] if account else None,
        "days_until_deadline": days_remaining,
        "deadline_urgent": days_remaining is not None and days_remaining <= 5,
    }


@tool(
    name="get_transaction_details",
    description="Retrieve detailed transaction record for the disputed transaction including merchant info, channel, IP, and device fingerprint.",
    args_model=TransactionDetailArgs,
)
async def get_transaction_details(args: TransactionDetailArgs) -> dict:
    txns = await query_db("SELECT * FROM transactions WHERE transaction_id = ?", (args.transaction_id,))
    if not txns:
        return {"error": f"Transaction {args.transaction_id} not found"}
    return {"transaction": txns[0]}


@tool(
    name="issue_provisional_credit",
    description="Issue provisional credit to the cardholder's account for a dispute. Required within 10 business days for Reg E eligible disputes. Credit cannot exceed disputed amount.",
    args_model=DisputeCreditArgs,
)
async def issue_provisional_credit(args: DisputeCreditArgs) -> dict:
    disputes = await query_db(
        "SELECT disputed_amount, account_id, provisional_credit_issued FROM card_disputes WHERE dispute_id = ?",
        (args.dispute_id,),
    )
    if not disputes:
        return {"error": f"Dispute {args.dispute_id} not found"}

    dispute = disputes[0]

    if dispute["provisional_credit_issued"]:
        return {"error": "Provisional credit has already been issued for this dispute"}

    if args.amount > dispute["disputed_amount"]:
        return {"error": f"Credit ${args.amount:.2f} exceeds disputed amount ${dispute['disputed_amount']:.2f}"}

    await execute_db(
        "UPDATE accounts SET balance = balance + ? WHERE account_id = ?",
        (args.amount, dispute["account_id"]),
    )
    await execute_db(
        "UPDATE card_disputes SET provisional_credit_issued = 1, status = 'provisional_credit' WHERE dispute_id = ?",
        (args.dispute_id,),
    )

    return {
        "dispute_id": args.dispute_id,
        "credit_amount": args.amount,
        "account_id": dispute["account_id"],
        "message": f"Provisional credit of ${args.amount:.2f} issued to account",
    }


@tool(
    name="contact_merchant",
    description="Initiate a merchant inquiry for dispute evidence. Records the inquiry and updates dispute status.",
    args_model=MerchantContactArgs,
)
async def contact_merchant(args: MerchantContactArgs) -> dict:
    await execute_db(
        "UPDATE card_disputes SET status = 'merchant_contacted', merchant_response = COALESCE(merchant_response, '') || ? WHERE dispute_id = ?",
        (f"\n[Inquiry sent {datetime.now().isoformat()}]: {args.inquiry_details}", args.dispute_id),
    )

    return {
        "dispute_id": args.dispute_id,
        "merchant": args.merchant_name,
        "inquiry_sent": True,
        "inquiry_details": args.inquiry_details,
        "expected_response_days": 10,
        "message": f"Merchant inquiry sent to {args.merchant_name}. Expected response within 10 business days.",
    }


@tool(
    name="resolve_dispute",
    description="Submit final dispute resolution. Resolution must be 'customer_favor', 'merchant_favor', 'split', or 'withdrawn'.",
    args_model=ResolveDisputeArgs,
)
async def resolve_dispute(args: ResolveDisputeArgs) -> dict:
    valid = ("customer_favor", "merchant_favor", "split", "withdrawn")
    if args.resolution not in valid:
        return {"error": f"Resolution must be one of: {valid}"}

    await execute_db(
        "UPDATE card_disputes SET status = 'resolved', resolution = ?, resolved_at = ? WHERE dispute_id = ?",
        (args.resolution, datetime.now().isoformat(), args.dispute_id),
    )

    # If merchant_favor or withdrawn, reverse provisional credit if it was issued
    disputes = await query_db(
        "SELECT provisional_credit_issued, disputed_amount, account_id FROM card_disputes WHERE dispute_id = ?",
        (args.dispute_id,),
    )
    reversed_credit = False
    if disputes and disputes[0]["provisional_credit_issued"] and args.resolution in ("merchant_favor", "withdrawn"):
        reverse_amount = disputes[0]["disputed_amount"] - args.final_amount
        if reverse_amount > 0:
            await execute_db(
                "UPDATE accounts SET balance = balance - ? WHERE account_id = ?",
                (reverse_amount, disputes[0]["account_id"]),
            )
            reversed_credit = True

    return {
        "dispute_id": args.dispute_id,
        "resolution": args.resolution,
        "final_amount": args.final_amount,
        "notes": args.notes,
        "provisional_credit_reversed": reversed_credit,
        "message": f"Dispute resolved: {args.resolution}",
    }


# ---- Agent ---- #

CREDIT_DISPUTE_INSTRUCTIONS = """You are a credit card dispute resolution specialist for FinCorp.

Your responsibilities:
- Review dispute cases using get_dispute and get_transaction_details.
- Issue provisional credits when required by regulation using issue_provisional_credit.
- Contact merchants for evidence and investigation using contact_merchant.
- Resolve disputes with proper documentation using resolve_dispute.

Regulatory requirements you MUST follow:
- **Regulation E** (debit/electronic transfers):
  - Provisional credit MUST be issued within 10 business days.
  - Investigation must be completed within 45 days (90 for new accounts).
  - Check the reg_e_deadline on each dispute.
- **Regulation Z** (credit card):
  - Investigation must be completed within 2 billing cycles (max 90 days).
  - Must acknowledge dispute in writing within 30 days.
- Provisional credits CANNOT exceed the disputed transaction amount.
- NEVER issue provisional credit if one has already been issued.

Dispute type handling:
- **unauthorized**: Likely Reg E eligible. Check transaction details for fraud indicators (foreign IP, unknown device). Issue provisional credit promptly.
- **billing_error**: Verify the original transaction amount. Contact merchant for clarification.
- **merchandise_not_received**: Contact merchant for delivery proof. Check tracking info.
- **defective**: Verify customer attempted return/resolution with merchant. Contact merchant.
- **duplicate**: Verify by checking transaction records for actual duplicates.
- **cancelled_subscription**: Verify cancellation was communicated to merchant. Contact merchant.

Investigation workflow:
1. Get the dispute details and assess urgency (days until deadline).
2. Pull the original transaction details.
3. Determine if provisional credit is required (unauthorized = yes).
4. Contact the merchant for their side of the story.
5. Evaluate evidence from both sides.
6. Resolve the dispute:
   - customer_favor: Customer's claim is substantiated
   - merchant_favor: Merchant evidence disproves the claim
   - split: Both parties share responsibility
   - withdrawn: Customer withdraws the dispute

You CANNOT:
- Force a resolution without investigation.
- Override regulatory timelines.
- Issue provisional credits exceeding the disputed amount.
- Close disputes without proper evidence review.
- Ignore approaching deadlines."""

credit_dispute_agent = Agent(
    name="credit-card-dispute-agent",
    model=MODEL,
    instructions=CREDIT_DISPUTE_INSTRUCTIONS,
    tools=[get_dispute, get_transaction_details, issue_provisional_credit, contact_merchant, resolve_dispute],
)
