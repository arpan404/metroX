from pydantic import BaseModel
from afk.agents import Agent
from afk.tools import tool
from db.connection import query_db, execute_db
from agents._base import MODEL
from uuid import uuid4
from datetime import datetime


# ---- Tool Arg Models ---- #

class OrderLookupArgs(BaseModel):
    order_id: str

class RefundPolicyArgs(BaseModel):
    product_category: str

class CustomerRefundHistoryArgs(BaseModel):
    customer_id: str

class ProcessRefundArgs(BaseModel):
    order_id: str
    customer_id: str
    amount: float
    reason: str

class EscalateArgs(BaseModel):
    customer_id: str
    order_id: str
    reason: str


# ---- Tools ---- #

@tool(
    name="lookup_order",
    description="Retrieve order details including items, delivery status, and tracking info. Use this to verify an order before processing any refund.",
    args_model=OrderLookupArgs,
)
async def lookup_order(args: OrderLookupArgs) -> dict:
    orders = await query_db(
        "SELECT * FROM orders WHERE order_id = ?", (args.order_id,)
    )
    if not orders:
        return {"error": f"Order {args.order_id} not found"}

    order = orders[0]
    items = await query_db(
        "SELECT * FROM order_items WHERE order_id = ?", (args.order_id,)
    )
    customer = await query_db(
        "SELECT customer_id, first_name, last_name, email FROM customers WHERE customer_id = ?",
        (order["customer_id"],),
    )

    return {
        "order": order,
        "items": items,
        "customer": customer[0] if customer else None,
    }


@tool(
    name="check_refund_policy",
    description="Get the refund policy for a product category including return window, restocking fee, and receipt requirements.",
    args_model=RefundPolicyArgs,
)
async def check_refund_policy(args: RefundPolicyArgs) -> dict:
    policies = await query_db(
        "SELECT * FROM refund_policy WHERE category = ?", (args.product_category,)
    )
    if not policies:
        policies = await query_db(
            "SELECT * FROM refund_policy WHERE category = 'default'"
        )
    return policies[0] if policies else {"error": "No refund policy found"}


@tool(
    name="get_customer_refund_history",
    description="Get all past refund requests for a customer to detect patterns like serial refunding.",
    args_model=CustomerRefundHistoryArgs,
)
async def get_customer_refund_history(args: CustomerRefundHistoryArgs) -> dict:
    refunds = await query_db(
        "SELECT * FROM refund_requests WHERE customer_id = ? ORDER BY created_at DESC",
        (args.customer_id,),
    )
    total_refunded = sum(r["amount"] for r in refunds if r["status"] in ("completed", "approved"))
    return {
        "refund_count": len(refunds),
        "total_refunded": total_refunded,
        "refunds": refunds,
    }


@tool(
    name="process_refund",
    description="Submit a refund for processing after validation. Only call this after verifying order details and checking refund policy.",
    args_model=ProcessRefundArgs,
)
async def process_refund(args: ProcessRefundArgs) -> dict:
    refund_id = f"REF-{uuid4().hex[:6].upper()}"
    await execute_db(
        "INSERT INTO refund_requests (refund_id, order_id, customer_id, amount, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'approved', ?)",
        (refund_id, args.order_id, args.customer_id, args.amount, args.reason, datetime.now().isoformat()),
    )
    return {
        "refund_id": refund_id,
        "status": "approved",
        "amount": args.amount,
        "message": f"Refund of ${args.amount:.2f} approved for order {args.order_id}",
    }


@tool(
    name="escalate_to_supervisor",
    description="Escalate a refund case to a supervisor when policy override or special handling is needed (e.g., high-value item, legal threat, or complex situation).",
    args_model=EscalateArgs,
)
async def escalate_to_supervisor(args: EscalateArgs) -> dict:
    await execute_db(
        "UPDATE refund_requests SET status = 'escalated', agent_notes = ? WHERE order_id = ? AND customer_id = ?",
        (f"Escalated: {args.reason}", args.order_id, args.customer_id),
    )
    return {
        "status": "escalated",
        "message": f"Case escalated to supervisor for order {args.order_id}. Reason: {args.reason}",
        "estimated_response": "24-48 hours",
    }


# ---- Agent ---- #

REFUND_INSTRUCTIONS = """You are a customer service agent handling refund requests for FinCorp.

Your responsibilities:
- Look up order details before processing any refund using the lookup_order tool.
- Verify the customer's identity and order ownership.
- Check the refund policy for the product category (return window, restocking fees) using check_refund_policy.
- Review the customer's refund history using get_customer_refund_history to detect serial refunders.

Refund rules you MUST follow:
- Never process a refund without first looking up the order and checking the policy.
- Deny refunds that are past the return window for that product category.
- Apply restocking fees as specified in the policy.
- Maximum single refund without supervisor approval: $500.
- If a customer has 3+ refunds in the past 90 days, flag as potential abuse and escalate.
- Food items are only refundable within 7 days and do not require return.
- Travel and digital items are non-refundable.
- Require return for items that specify requires_return=1 in the policy.

When to escalate:
- Refund amount exceeds $500.
- Customer threatens legal action or claims fraud.
- Serial refunder pattern detected (3+ refunds in 90 days).
- Complex situations where policy is ambiguous.

Always be polite but firm on policy. Never override policy limits even if the customer is upset."""

refund_agent = Agent(
    name="refund-processing-agent",
    model=MODEL,
    instructions=REFUND_INSTRUCTIONS,
    tools=[lookup_order, check_refund_policy, get_customer_refund_history, process_refund, escalate_to_supervisor],
)
