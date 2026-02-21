from pydantic import BaseModel
from afk.agents import Agent
from afk.tools import tool
from db.connection import query_db, execute_db
from agents._base import MODEL
from uuid import uuid4
from datetime import datetime, timedelta


# ---- Tool Arg Models ---- #

class AccountStatusArgs(BaseModel):
    customer_id: str
    account_id: str

class SecurityQuestionArgs(BaseModel):
    customer_id: str
    answer1: str
    answer2: str

class LoginHistoryArgs(BaseModel):
    customer_id: str
    days: int = 30

class SendOTPArgs(BaseModel):
    customer_id: str
    method: str  # 'sms' or 'email'

class UnlockAccountArgs(BaseModel):
    customer_id: str
    account_id: str
    verification_method: str
    notes: str


# ---- Tools ---- #

@tool(
    name="get_account_status",
    description="Check account lock status, account details, and any pending recovery requests for a customer.",
    args_model=AccountStatusArgs,
)
async def get_account_status(args: AccountStatusArgs) -> dict:
    accounts = await query_db(
        "SELECT * FROM accounts WHERE account_id = ? AND customer_id = ?",
        (args.account_id, args.customer_id),
    )
    if not accounts:
        return {"error": "Account not found or does not belong to this customer"}

    recovery_requests = await query_db(
        "SELECT * FROM account_recovery_requests WHERE customer_id = ? AND account_id = ? ORDER BY created_at DESC",
        (args.customer_id, args.account_id),
    )

    customer = await query_db(
        "SELECT customer_id, first_name, last_name, email, phone, account_status FROM customers WHERE customer_id = ?",
        (args.customer_id,),
    )

    return {
        "account": accounts[0],
        "customer": customer[0] if customer else None,
        "recovery_requests": recovery_requests,
        "active_recovery": next((r for r in recovery_requests if r["status"] == "pending"), None),
    }


@tool(
    name="verify_security_questions",
    description="Verify a customer's security question answers. Requires both answers to match. Returns pass/fail.",
    args_model=SecurityQuestionArgs,
)
async def verify_security_questions(args: SecurityQuestionArgs) -> dict:
    questions = await query_db(
        "SELECT * FROM security_questions WHERE customer_id = ? ORDER BY question_id",
        (args.customer_id,),
    )

    if len(questions) < 2:
        return {"error": "Insufficient security questions on file for this customer"}

    # Mock verification: check if answer contains the keyword from the hash
    # In real system this would be bcrypt comparison
    q1_keyword = questions[0]["answer_hash"].replace("hash_", "")
    q2_keyword = questions[1]["answer_hash"].replace("hash_", "")

    q1_pass = q1_keyword.lower() in args.answer1.lower()
    q2_pass = q2_keyword.lower() in args.answer2.lower()

    return {
        "question_1": questions[0]["question"],
        "question_1_passed": q1_pass,
        "question_2": questions[1]["question"],
        "question_2_passed": q2_pass,
        "overall_passed": q1_pass and q2_pass,
        "message": "Both answers verified" if (q1_pass and q2_pass) else "One or more answers incorrect",
    }


@tool(
    name="check_login_history",
    description="Get recent login attempts for a customer to detect compromise indicators like unusual locations, devices, or failed attempts.",
    args_model=LoginHistoryArgs,
)
async def check_login_history(args: LoginHistoryArgs) -> dict:
    logins = await query_db(
        "SELECT * FROM login_history WHERE customer_id = ? ORDER BY login_time DESC",
        (args.customer_id,),
    )

    failed_attempts = [l for l in logins if not l["success"]]
    foreign_logins = [l for l in logins if l["location_country"] != "US"]
    unique_ips = list(set(l["ip_address"] for l in logins if l["ip_address"]))

    compromise_indicators = []
    if len(failed_attempts) >= 3:
        compromise_indicators.append("multiple_failed_logins")
    if foreign_logins:
        compromise_indicators.append("foreign_login_detected")
    if len(unique_ips) > 3:
        compromise_indicators.append("multiple_ip_addresses")

    # Check for impossible travel
    for i in range(1, len(logins)):
        if logins[i - 1]["location_country"] != logins[i]["location_country"]:
            compromise_indicators.append("geographic_anomaly")
            break

    return {
        "total_logins": len(logins),
        "failed_attempts": len(failed_attempts),
        "foreign_logins": foreign_logins,
        "unique_ips": unique_ips,
        "compromise_indicators": compromise_indicators,
        "risk_level": "high" if len(compromise_indicators) >= 2 else ("medium" if compromise_indicators else "low"),
        "logins": logins,
    }


@tool(
    name="send_otp",
    description="Generate and send a one-time password to the customer via SMS or email. Max 3 attempts per recovery request.",
    args_model=SendOTPArgs,
)
async def send_otp(args: SendOTPArgs) -> dict:
    if args.method not in ("sms", "email"):
        return {"error": "Method must be 'sms' or 'email'"}

    # Check existing recovery attempts
    requests = await query_db(
        "SELECT * FROM account_recovery_requests WHERE customer_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
        (args.customer_id,),
    )

    if requests and requests[0]["attempts"] >= requests[0]["max_attempts"]:
        return {
            "error": "Maximum OTP attempts reached. Recovery request expired.",
            "attempts": requests[0]["attempts"],
            "max_attempts": requests[0]["max_attempts"],
        }

    # Generate OTP
    import random
    otp = str(random.randint(100000, 999999))
    expires = (datetime.now() + timedelta(minutes=10)).isoformat()

    customer = await query_db(
        "SELECT email, phone FROM customers WHERE customer_id = ?", (args.customer_id,)
    )
    if not customer:
        return {"error": "Customer not found"}

    destination = customer[0]["email"] if args.method == "email" else customer[0]["phone"]

    if requests:
        await execute_db(
            "UPDATE account_recovery_requests SET otp_code = ?, otp_expires_at = ?, attempts = attempts + 1, verification_method = ? WHERE request_id = ?",
            (otp, expires, f"{args.method}_otp", requests[0]["request_id"]),
        )
    else:
        # Create new recovery request
        accounts = await query_db(
            "SELECT account_id FROM accounts WHERE customer_id = ? LIMIT 1", (args.customer_id,)
        )
        req_id = f"REC-{uuid4().hex[:6].upper()}"
        await execute_db(
            "INSERT INTO account_recovery_requests (request_id, customer_id, account_id, recovery_type, verification_method, otp_code, otp_expires_at, status) VALUES (?, ?, ?, 'password_reset', ?, ?, ?, 'pending')",
            (req_id, args.customer_id, accounts[0]["account_id"] if accounts else "unknown", f"{args.method}_otp", otp, expires),
        )

    return {
        "otp_sent": True,
        "method": args.method,
        "destination_masked": f"***{destination[-4:]}" if destination else "unknown",
        "expires_in_minutes": 10,
        "message": f"OTP sent via {args.method}. Valid for 10 minutes.",
        # In production this would NOT be returned — included for testing
        "_test_otp": otp,
    }


@tool(
    name="unlock_account",
    description="Unlock a verified customer account after successful identity verification. Only call after completing full verification.",
    args_model=UnlockAccountArgs,
)
async def unlock_account(args: UnlockAccountArgs) -> dict:
    # Verify the account is actually locked
    accounts = await query_db(
        "SELECT status FROM accounts WHERE account_id = ? AND customer_id = ?",
        (args.account_id, args.customer_id),
    )
    if not accounts:
        return {"error": "Account not found"}

    if accounts[0]["status"] not in ("locked", "suspended"):
        return {"error": f"Account is {accounts[0]['status']}, not locked/suspended"}

    await execute_db(
        "UPDATE accounts SET status = 'active' WHERE account_id = ? AND customer_id = ?",
        (args.account_id, args.customer_id),
    )
    await execute_db(
        "UPDATE customers SET account_status = 'active' WHERE customer_id = ?",
        (args.customer_id,),
    )
    await execute_db(
        "UPDATE account_recovery_requests SET status = 'completed', verification_status = 'verified' WHERE customer_id = ? AND account_id = ? AND status = 'pending'",
        (args.customer_id, args.account_id),
    )

    return {
        "account_id": args.account_id,
        "customer_id": args.customer_id,
        "status": "unlocked",
        "verification_method": args.verification_method,
        "message": f"Account {args.account_id} has been unlocked. Customer should change password immediately.",
    }


# ---- Agent ---- #

ACCOUNT_RECOVERY_INSTRUCTIONS = """You are an account recovery specialist for FinCorp.

Your responsibilities:
- Check account status and recovery history using get_account_status.
- Verify customer identity through multi-factor authentication.
- Analyze login history for compromise indicators using check_login_history.
- Send OTPs for verification using send_otp.
- Unlock accounts after successful verification using unlock_account.

Recovery rules you MUST follow:
- NEVER unlock an account without completing full identity verification.
- Verification requires at least ONE of:
  - Security questions (both must match) via verify_security_questions
  - OTP verification via send_otp (customer must confirm the code)
- Maximum 3 OTP attempts per recovery request. After 3 failures, the request expires.
- Check login history BEFORE unlocking to assess compromise risk.
- If login history shows compromise indicators (foreign IPs, impossible travel), require BOTH security questions AND OTP.
- Flag accounts where recovery is attempted from a known suspicious IP or location.

Step-up verification (required for high-risk recovery):
- Account shows compromise indicators → require both security questions + OTP
- Recovery from new/unknown device → require OTP at minimum
- Multiple failed recovery attempts → lock recovery for 24 hours

You CANNOT:
- Bypass identity verification steps.
- Reveal security question answers to the customer.
- Unlock accounts that show active unauthorized activity without escalation.
- Send OTPs after maximum attempts are reached.

After unlocking, always advise the customer to:
1. Change their password immediately.
2. Review recent transactions.
3. Enable two-factor authentication."""

account_recovery_agent = Agent(
    name="account-recovery-agent",
    model=MODEL,
    instructions=ACCOUNT_RECOVERY_INSTRUCTIONS,
    tools=[get_account_status, verify_security_questions, check_login_history, send_otp, unlock_account],
)
