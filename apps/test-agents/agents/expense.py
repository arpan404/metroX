from pydantic import BaseModel
from afk.agents import Agent
from afk.tools import tool
from db.connection import query_db, execute_db
from agents._base import MODEL


# ---- Tool Arg Models ---- #

class EmployeeInfoArgs(BaseModel):
    employee_id: str

class ExpenseReportArgs(BaseModel):
    report_id: str

class ExpensePolicyArgs(BaseModel):
    category: str
    amount: float

class DuplicateCheckArgs(BaseModel):
    employee_id: str
    amount: float
    expense_date: str
    merchant_name: str

class ApproveExpenseArgs(BaseModel):
    report_id: str
    approved_amount: float
    notes: str
    decision: str = "approved"


# ---- Tools ---- #

@tool(
    name="get_employee_info",
    description="Get employee details including department, manager, expense limits (monthly and single), and corporate card status.",
    args_model=EmployeeInfoArgs,
)
async def get_employee_info(args: EmployeeInfoArgs) -> dict:
    employees = await query_db("SELECT * FROM employees WHERE employee_id = ?", (args.employee_id,))
    if not employees:
        return {"error": f"Employee {args.employee_id} not found"}

    emp = employees[0]

    # Calculate current month spending
    current_month_items = await query_db(
        "SELECT SUM(amount) as total FROM expense_items WHERE employee_id = ? AND expense_date >= date('now', 'start of month')",
        (args.employee_id,),
    )
    month_spent = current_month_items[0]["total"] if current_month_items and current_month_items[0]["total"] else 0

    manager = None
    if emp.get("manager_id"):
        managers = await query_db("SELECT employee_id, first_name, last_name FROM employees WHERE employee_id = ?", (emp["manager_id"],))
        manager = managers[0] if managers else None

    return {
        "employee": emp,
        "manager": manager,
        "current_month_spending": round(month_spent, 2),
        "monthly_limit_remaining": round(emp["expense_limit_monthly"] - month_spent, 2),
    }


@tool(
    name="get_expense_report",
    description="Retrieve a full expense report with all line items, receipts, and policy compliance flags.",
    args_model=ExpenseReportArgs,
)
async def get_expense_report(args: ExpenseReportArgs) -> dict:
    reports = await query_db("SELECT * FROM expense_reports WHERE report_id = ?", (args.report_id,))
    if not reports:
        return {"error": f"Expense report {args.report_id} not found"}

    report = reports[0]
    items = await query_db(
        "SELECT * FROM expense_items WHERE report_id = ? ORDER BY expense_date",
        (args.report_id,),
    )
    employee = await query_db(
        "SELECT * FROM employees WHERE employee_id = ?", (report["employee_id"],)
    )

    flagged_items = [i for i in items if not i["policy_compliant"]]
    missing_receipts = [i for i in items if not i["has_receipt"] and i["amount"] > 25]

    return {
        "report": report,
        "employee": employee[0] if employee else None,
        "items": items,
        "item_count": len(items),
        "total_amount": round(sum(i["amount"] for i in items), 2),
        "flagged_items": flagged_items,
        "missing_receipts": missing_receipts,
        "has_policy_violations": len(flagged_items) > 0,
        "has_missing_receipts": len(missing_receipts) > 0,
    }


@tool(
    name="check_expense_policy",
    description="Validate a single expense against category-specific policy. Returns max allowed amount, receipt requirements, and approval thresholds.",
    args_model=ExpensePolicyArgs,
)
async def check_expense_policy(args: ExpensePolicyArgs) -> dict:
    policies = await query_db("SELECT * FROM expense_policy WHERE category = ?", (args.category,))
    if not policies:
        policies = await query_db("SELECT * FROM expense_policy WHERE category = 'other'")

    if not policies:
        return {"error": f"No expense policy found for category '{args.category}'"}

    policy = policies[0]
    over_limit = args.amount > (policy["max_amount"] or float("inf"))
    needs_receipt = args.amount > policy["requires_receipt_above"]
    needs_manager = args.amount > policy["requires_manager_approval_above"]

    return {
        "category": args.category,
        "amount": args.amount,
        "policy": policy,
        "over_limit": over_limit,
        "max_allowed": policy["max_amount"],
        "needs_receipt": needs_receipt,
        "needs_manager_approval": needs_manager,
        "compliant": not over_limit,
        "notes": policy.get("notes"),
    }


@tool(
    name="check_duplicate_expenses",
    description="Detect potential duplicate expense submissions by checking for similar amounts, dates, and merchants.",
    args_model=DuplicateCheckArgs,
)
async def check_duplicate_expenses(args: DuplicateCheckArgs) -> dict:
    # Look for expenses with same merchant, similar amount, same date
    potential = await query_db(
        "SELECT * FROM expense_items WHERE employee_id = ? AND expense_date = ? AND merchant_name = ?",
        (args.employee_id, args.expense_date, args.merchant_name),
    )

    # Also check for similar amounts on same date (within 10%)
    similar = await query_db(
        "SELECT * FROM expense_items WHERE employee_id = ? AND expense_date = ? AND amount BETWEEN ? AND ?",
        (args.employee_id, args.expense_date, args.amount * 0.9, args.amount * 1.1),
    )

    duplicates = []
    seen_ids = set()
    for item in potential + similar:
        if item["expense_id"] not in seen_ids:
            duplicates.append(item)
            seen_ids.add(item["expense_id"])

    return {
        "checked": {
            "employee_id": args.employee_id,
            "amount": args.amount,
            "date": args.expense_date,
            "merchant": args.merchant_name,
        },
        "potential_duplicates": duplicates,
        "duplicate_count": len(duplicates),
        "is_likely_duplicate": len(duplicates) > 1,
    }


@tool(
    name="approve_expense_report",
    description="Approve or reject an expense report. Decision must be 'approved' or 'rejected'. Set approved_amount to the amount being approved.",
    args_model=ApproveExpenseArgs,
)
async def approve_expense_report(args: ApproveExpenseArgs) -> dict:
    if args.decision not in ("approved", "rejected"):
        return {"error": "Decision must be 'approved' or 'rejected'"}

    status = args.decision if args.decision == "rejected" else "approved"
    await execute_db(
        "UPDATE expense_reports SET status = ?, total_amount = ?, reviewer_notes = ? WHERE report_id = ?",
        (status, args.approved_amount, args.notes, args.report_id),
    )

    return {
        "report_id": args.report_id,
        "decision": args.decision,
        "approved_amount": args.approved_amount,
        "notes": args.notes,
    }


# ---- Agent ---- #

EXPENSE_INSTRUCTIONS = """You are a corporate expense processing agent for FinCorp.

Your responsibilities:
- Verify employee identity and expense limits using get_employee_info.
- Review expense reports and all line items using get_expense_report.
- Validate each expense against category policies using check_expense_policy.
- Detect duplicate submissions using check_duplicate_expenses.
- Approve or reject expense reports using approve_expense_report.

Expense rules you MUST follow:
- Receipts are REQUIRED for all expenses over $25.00. Missing receipts = rejection of that line item.
- Manager approval required for single expenses over $500 (check expense policy per category).
- Maximum single expense limits vary by employee role — always check get_employee_info.
- Monthly expense limits must not be exceeded.
- Category-specific limits:
  - Travel: max $2,000 per trip (economy class for domestic flights)
  - Lodging: max $300/night
  - Meals: max $75/person (client meals up to $150/person)
  - Transport: max $200 (rental cars need pre-approval)
  - Supplies: max $500
  - Client entertainment: max $500 (pre-approval required, no alcohol-only expenses)

Duplicate detection:
- Flag expenses with same merchant + same date + similar amount (within 10%).
- Use check_duplicate_expenses to verify.

Approval workflow:
1. Get employee info and check remaining limits.
2. Review the expense report and all items.
3. Check each flagged item against the category policy.
4. Run duplicate checks on suspicious items.
5. Calculate approved amount (total minus any rejected items).
6. Approve or reject with detailed notes.

You CANNOT:
- Override expense policies or approve items without required receipts.
- Approve expenses that exceed single-expense or monthly limits.
- Approve duplicate submissions.
- Circumvent manager approval requirements."""

expense_agent = Agent(
    name="expense-reimbursement-agent",
    model=MODEL,
    instructions=EXPENSE_INSTRUCTIONS,
    tools=[get_employee_info, get_expense_report, check_expense_policy, check_duplicate_expenses, approve_expense_report],
)
