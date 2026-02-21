import json
from pydantic import BaseModel
from afk.agents import Agent
from afk.tools import tool
from db.connection import query_db, execute_db
from agents._base import MODEL
from uuid import uuid4
from datetime import datetime


# ---- Tool Arg Models ---- #

class AlertLookupArgs(BaseModel):
    alert_id: str

class TransactionHistoryArgs(BaseModel):
    customer_id: str
    days: int = 30

class PatternAnalysisArgs(BaseModel):
    customer_id: str
    pattern_type: str  # velocity, structuring, geo_anomaly

class AlertUpdateArgs(BaseModel):
    alert_id: str
    status: str
    notes: str

class SARArgs(BaseModel):
    customer_id: str
    alert_ids: list[str]
    narrative: str


# ---- Tools ---- #

@tool(
    name="get_alert_details",
    description="Retrieve full alert details including related transactions, trigger rule, and current investigation status.",
    args_model=AlertLookupArgs,
)
async def get_alert_details(args: AlertLookupArgs) -> dict:
    alerts = await query_db("SELECT * FROM alerts WHERE alert_id = ?", (args.alert_id,))
    if not alerts:
        return {"error": f"Alert {args.alert_id} not found"}

    alert = alerts[0]
    txn_ids = json.loads(alert.get("related_transactions") or "[]")
    transactions = []
    for tid in txn_ids:
        txns = await query_db("SELECT * FROM transactions WHERE transaction_id = ?", (tid,))
        if txns:
            transactions.append(txns[0])

    customer = await query_db(
        "SELECT customer_id, first_name, last_name, risk_score FROM customers WHERE customer_id = ?",
        (alert["customer_id"],),
    )

    rule = await query_db("SELECT * FROM monitoring_rules WHERE rule_id = ?", (alert.get("trigger_rule"),)) if alert.get("trigger_rule") else []

    return {
        "alert": alert,
        "related_transactions": transactions,
        "customer": customer[0] if customer else None,
        "trigger_rule": rule[0] if rule else None,
    }


@tool(
    name="get_transaction_history",
    description="Pull transaction history for a customer over a specified number of days for pattern analysis.",
    args_model=TransactionHistoryArgs,
)
async def get_transaction_history(args: TransactionHistoryArgs) -> dict:
    transactions = await query_db(
        "SELECT * FROM transactions WHERE customer_id = ? ORDER BY created_at DESC",
        (args.customer_id,),
    )
    # Filter by days (simplified — just return all for mock purposes)
    customer = await query_db(
        "SELECT customer_id, first_name, last_name, risk_score FROM customers WHERE customer_id = ?",
        (args.customer_id,),
    )

    total_amount = sum(abs(t["amount"]) for t in transactions)
    return {
        "customer": customer[0] if customer else None,
        "transaction_count": len(transactions),
        "total_volume": round(total_amount, 2),
        "transactions": transactions,
    }


@tool(
    name="run_pattern_analysis",
    description="Run a specific pattern detection analysis on a customer's transactions. Types: 'velocity' (unusual frequency), 'structuring' (sub-threshold splitting), 'geo_anomaly' (impossible travel).",
    args_model=PatternAnalysisArgs,
)
async def run_pattern_analysis(args: PatternAnalysisArgs) -> dict:
    transactions = await query_db(
        "SELECT * FROM transactions WHERE customer_id = ? ORDER BY created_at DESC",
        (args.customer_id,),
    )

    if args.pattern_type == "velocity":
        # Count transactions in recent windows
        daily_groups: dict[str, int] = {}
        for t in transactions:
            day = t["created_at"][:10]
            daily_groups[day] = daily_groups.get(day, 0) + 1

        high_velocity_days = {d: c for d, c in daily_groups.items() if c >= 3}
        return {
            "pattern": "velocity",
            "total_transactions": len(transactions),
            "daily_counts": daily_groups,
            "high_velocity_days": high_velocity_days,
            "anomaly_detected": len(high_velocity_days) > 0,
            "risk_level": "high" if len(high_velocity_days) > 2 else ("medium" if high_velocity_days else "low"),
        }

    elif args.pattern_type == "structuring":
        # Look for transactions just under $10,000
        suspicious = [
            t for t in transactions
            if abs(t["amount"]) >= 9000 and abs(t["amount"]) < 10000
            and t["transaction_type"] in ("deposit", "transfer", "withdrawal")
        ]
        total = sum(abs(t["amount"]) for t in suspicious)
        return {
            "pattern": "structuring",
            "suspicious_transactions": suspicious,
            "count": len(suspicious),
            "total_amount": round(total, 2),
            "anomaly_detected": len(suspicious) >= 2,
            "risk_level": "critical" if len(suspicious) >= 3 else ("high" if len(suspicious) >= 2 else "low"),
            "ctr_threshold": 10000.0,
            "note": "Transactions appear structured to avoid Currency Transaction Report (CTR) filing threshold",
        }

    elif args.pattern_type == "geo_anomaly":
        # Check for impossible travel
        anomalies = []
        sorted_txns = sorted(transactions, key=lambda t: t["created_at"])
        for i in range(1, len(sorted_txns)):
            prev = sorted_txns[i - 1]
            curr = sorted_txns[i]
            if prev["location_country"] != curr["location_country"]:
                # Rough time check
                anomalies.append({
                    "first_txn": prev["transaction_id"],
                    "first_location": f"{prev['location_city']}, {prev['location_country']}",
                    "first_time": prev["created_at"],
                    "second_txn": curr["transaction_id"],
                    "second_location": f"{curr['location_city']}, {curr['location_country']}",
                    "second_time": curr["created_at"],
                })

        return {
            "pattern": "geo_anomaly",
            "geographic_anomalies": anomalies,
            "anomaly_detected": len(anomalies) > 0,
            "risk_level": "high" if anomalies else "low",
        }

    return {"error": f"Unknown pattern type: {args.pattern_type}. Use 'velocity', 'structuring', or 'geo_anomaly'."}


@tool(
    name="update_alert",
    description="Update an alert's investigation status. Status: 'investigating', 'escalated', 'resolved', 'false_positive'. Cannot close critical alerts.",
    args_model=AlertUpdateArgs,
)
async def update_alert(args: AlertUpdateArgs) -> dict:
    valid_statuses = ("investigating", "escalated", "resolved", "false_positive")
    if args.status not in valid_statuses:
        return {"error": f"Status must be one of: {valid_statuses}"}

    # Cannot close critical alerts
    alerts = await query_db("SELECT severity FROM alerts WHERE alert_id = ?", (args.alert_id,))
    if alerts and alerts[0]["severity"] == "critical" and args.status in ("resolved", "false_positive"):
        return {
            "error": "Cannot resolve or dismiss critical alerts. These must be escalated.",
            "alert_id": args.alert_id,
            "severity": "critical",
        }

    await execute_db(
        "UPDATE alerts SET status = ?, analyst_notes = ? WHERE alert_id = ?",
        (args.status, args.notes, args.alert_id),
    )
    return {"alert_id": args.alert_id, "new_status": args.status}


@tool(
    name="file_sar",
    description="File a Suspicious Activity Report (SAR) for confirmed suspicious activity. Requires customer ID, related alert IDs, and a detailed narrative.",
    args_model=SARArgs,
)
async def file_sar(args: SARArgs) -> dict:
    sar_id = f"SAR-{uuid4().hex[:8].upper()}"

    # Mark related alerts as escalated
    for alert_id in args.alert_ids:
        await execute_db(
            "UPDATE alerts SET status = 'escalated', analyst_notes = ? WHERE alert_id = ?",
            (f"SAR filed: {sar_id}. {args.narrative[:200]}", alert_id),
        )

    # Update customer risk score
    await execute_db(
        "UPDATE customers SET risk_score = MIN(risk_score + 0.2, 1.0) WHERE customer_id = ?",
        (args.customer_id,),
    )

    return {
        "sar_id": sar_id,
        "customer_id": args.customer_id,
        "related_alerts": args.alert_ids,
        "status": "filed",
        "filing_date": datetime.now().isoformat(),
        "message": f"SAR {sar_id} filed successfully. Regulatory reporting initiated.",
    }


# ---- Agent ---- #

TXN_MONITORING_INSTRUCTIONS = """You are an AML/fraud transaction monitoring analyst for FinCorp.

Your responsibilities:
- Review and investigate transaction alerts using get_alert_details.
- Analyze transaction patterns using get_transaction_history and run_pattern_analysis.
- Escalate or resolve alerts based on investigation findings using update_alert.
- File Suspicious Activity Reports (SARs) when warranted using file_sar.

Detection patterns you must investigate:
1. **Structuring**: Multiple transactions just under $10,000 to avoid CTR filing. Look for deposits/transfers between $9,000-$9,999.
2. **Velocity anomaly**: Unusually high transaction frequency (3+ in a single day, or 10+ in a week).
3. **Geographic anomaly**: Transactions in different countries within physically impossible timeframes.
4. **Pattern**: Compromised account indicators (foreign IP, unknown device, rapid transfers).

Investigation rules you MUST follow:
- Never dismiss high-severity or critical alerts without documented justification.
- You CANNOT close or resolve critical alerts - they must be escalated.
- Always pull full transaction history before making a determination.
- Run relevant pattern analysis for the alert type.
- BSA/AML regulations require SAR filing for:
  - Transactions aggregating $5,000+ with known suspicious indicators.
  - Any structuring pattern detected.
  - Account takeover or unauthorized access.
- Document all investigation steps and findings in alert notes.

SAR filing criteria:
- Confirmed structuring pattern
- Verified account compromise
- Transactions involving sanctioned entities or jurisdictions
- Geographic impossibilities combined with high-value transactions

You cannot modify alert severity levels. You cannot access customer accounts directly."""

transaction_monitoring_agent = Agent(
    name="transaction-monitoring-agent",
    model=MODEL,
    instructions=TXN_MONITORING_INSTRUCTIONS,
    tools=[get_alert_details, get_transaction_history, run_pattern_analysis, update_alert, file_sar],
)
