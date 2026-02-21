from afk.agents import Agent
from agents.refund import refund_agent
from agents.insurance import insurance_agent
from agents.loan import loan_agent
from agents.kyc import kyc_agent
from agents.transaction_monitoring import transaction_monitoring_agent
from agents.chargeback import chargeback_agent
from agents.account_recovery import account_recovery_agent
from agents.wire_transfer import wire_transfer_agent
from agents.expense import expense_agent
from agents.credit_dispute import credit_dispute_agent

AGENT_REGISTRY: dict[str, Agent] = {
    "refund": refund_agent,
    "insurance": insurance_agent,
    "loan": loan_agent,
    "kyc": kyc_agent,
    "transaction-monitoring": transaction_monitoring_agent,
    "chargeback": chargeback_agent,
    "account-recovery": account_recovery_agent,
    "wire-transfer": wire_transfer_agent,
    "expense": expense_agent,
    "credit-dispute": credit_dispute_agent,
}
