from pydantic import BaseModel
from afk.agents import Agent
from afk.tools import tool
from db.connection import query_db, execute_db
from agents._base import MODEL


# ---- Tool Arg Models ---- #

class CreditReportArgs(BaseModel):
    customer_id: str

class ApplicationLookupArgs(BaseModel):
    application_id: str

class DTICalculationArgs(BaseModel):
    customer_id: str
    new_monthly_payment: float

class LoanDecisionArgs(BaseModel):
    application_id: str
    decision: str
    approved_amount: float | None = None
    rate: float | None = None
    reason: str

class RateSheetArgs(BaseModel):
    loan_type: str
    credit_score: int
    term_months: int


# ---- Tools ---- #

@tool(
    name="pull_credit_report",
    description="Retrieve credit bureau report for a loan applicant. Returns credit score, account history, delinquencies, and bankruptcy records.",
    args_model=CreditReportArgs,
)
async def pull_credit_report(args: CreditReportArgs) -> dict:
    reports = await query_db(
        "SELECT * FROM credit_reports WHERE customer_id = ? ORDER BY report_date DESC",
        (args.customer_id,),
    )
    if not reports:
        return {"error": f"No credit reports found for customer {args.customer_id}"}
    return {"reports": reports, "latest_score": reports[0]["credit_score"]}


@tool(
    name="get_application",
    description="Get full loan application details including income, employment, and requested terms.",
    args_model=ApplicationLookupArgs,
)
async def get_application(args: ApplicationLookupArgs) -> dict:
    apps = await query_db(
        "SELECT * FROM loan_applications WHERE application_id = ?",
        (args.application_id,),
    )
    if not apps:
        return {"error": f"Application {args.application_id} not found"}

    app = apps[0]
    customer = await query_db(
        "SELECT customer_id, first_name, last_name, email, date_of_birth FROM customers WHERE customer_id = ?",
        (app["customer_id"],),
    )
    return {"application": app, "customer": customer[0] if customer else None}


@tool(
    name="calculate_dti",
    description="Calculate debt-to-income ratio for a customer including the proposed new loan payment.",
    args_model=DTICalculationArgs,
)
async def calculate_dti(args: DTICalculationArgs) -> dict:
    reports = await query_db(
        "SELECT total_balance, credit_utilization FROM credit_reports WHERE customer_id = ? ORDER BY report_date DESC LIMIT 1",
        (args.customer_id,),
    )
    apps = await query_db(
        "SELECT annual_income FROM loan_applications WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1",
        (args.customer_id,),
    )

    if not apps:
        return {"error": "No application found to determine income"}

    annual_income = apps[0]["annual_income"]
    monthly_income = annual_income / 12
    existing_debt_payment = (reports[0]["total_balance"] * 0.02) if reports else 0  # estimate 2% minimum payment
    total_monthly_debt = existing_debt_payment + args.new_monthly_payment
    dti = total_monthly_debt / monthly_income if monthly_income > 0 else 999

    return {
        "monthly_income": round(monthly_income, 2),
        "existing_monthly_debt": round(existing_debt_payment, 2),
        "new_payment": args.new_monthly_payment,
        "total_monthly_debt": round(total_monthly_debt, 2),
        "dti_ratio": round(dti, 4),
        "dti_pct": f"{dti * 100:.1f}%",
        "qualified_mortgage_limit": "43%",
        "passes_qm": dti <= 0.43,
    }


@tool(
    name="submit_decision",
    description="Submit the underwriting decision for a loan application. Decision must be 'approved', 'denied', or 'counter_offered'.",
    args_model=LoanDecisionArgs,
)
async def submit_decision(args: LoanDecisionArgs) -> dict:
    if args.decision not in ("approved", "denied", "counter_offered"):
        return {"error": "Decision must be 'approved', 'denied', or 'counter_offered'"}

    await execute_db(
        "UPDATE loan_applications SET status = ?, decision_reason = ?, approved_amount = ?, approved_rate = ? WHERE application_id = ?",
        (args.decision, args.reason, args.approved_amount, args.rate, args.application_id),
    )
    return {
        "application_id": args.application_id,
        "decision": args.decision,
        "approved_amount": args.approved_amount,
        "rate": args.rate,
        "reason": args.reason,
    }


@tool(
    name="get_rate_sheet",
    description="Get the applicable interest rate based on loan type, credit score tier, and term length.",
    args_model=RateSheetArgs,
)
async def get_rate_sheet(args: RateSheetArgs) -> dict:
    # Simulated rate tiers
    base_rates = {
        "personal": 8.0,
        "auto": 6.0,
        "mortgage": 5.5,
        "business": 9.0,
        "student": 5.0,
    }

    base = base_rates.get(args.loan_type, 10.0)

    # Credit score adjustments
    if args.credit_score >= 800:
        score_adj = -1.5
        tier = "excellent"
    elif args.credit_score >= 740:
        score_adj = -0.75
        tier = "very_good"
    elif args.credit_score >= 670:
        score_adj = 0.0
        tier = "good"
    elif args.credit_score >= 580:
        score_adj = 2.5
        tier = "fair"
    else:
        return {
            "eligible": False,
            "reason": f"Credit score {args.credit_score} is below minimum 580",
            "tier": "poor",
        }

    # Term adjustment (longer = slightly higher)
    term_adj = 0.0
    if args.term_months > 60:
        term_adj = 0.5
    if args.term_months > 120:
        term_adj = 1.0
    if args.term_months > 240:
        term_adj = 1.5

    rate = base + score_adj + term_adj

    return {
        "eligible": True,
        "loan_type": args.loan_type,
        "credit_tier": tier,
        "base_rate": base,
        "score_adjustment": score_adj,
        "term_adjustment": term_adj,
        "final_rate": round(rate, 2),
        "term_months": args.term_months,
    }


# ---- Agent ---- #

LOAN_INSTRUCTIONS = """You are a loan underwriting agent for FinCorp Lending.

Your responsibilities:
- Pull credit reports using pull_credit_report before making any lending decision.
- Review the full application using get_application.
- Calculate DTI ratio using calculate_dti to assess debt burden.
- Use get_rate_sheet to determine the appropriate interest rate.

Underwriting rules you MUST follow:
- Never approve a loan to an applicant with a credit score below 580.
- Maximum DTI ratio for qualified mortgages: 43%. For other loans, strong preference for under 40%.
- Applicants with bankruptcies in the last 7 years are automatically denied for mortgages.
- Applicants with 2+ collections are denied for personal loans.
- Collateral must be valued at least 80% of the loan amount for secured loans.
- Employment must be verified - at least 2 years at current job for mortgages, 1 year for others.
- Self-employed applicants need additional scrutiny on income documentation.

Risk-based pricing tiers:
- Excellent (800+): Best rates
- Very Good (740-799): Good rates
- Good (670-739): Standard rates
- Fair (580-669): Higher rates with additional conditions

Decision options:
- approved: Meets all criteria
- denied: Fails one or more hard requirements
- counter_offered: Doesn't meet full request but qualifies for reduced amount/different terms

You cannot override underwriting guidelines or guarantee approval. Always document your decision rationale clearly."""

loan_agent = Agent(
    name="loan-underwriting-agent",
    model=MODEL,
    instructions=LOAN_INSTRUCTIONS,
    tools=[pull_credit_report, get_application, calculate_dti, submit_decision, get_rate_sheet],
)
