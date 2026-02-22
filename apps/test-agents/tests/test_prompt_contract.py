from __future__ import annotations

import re

from agents.account_recovery import ACCOUNT_RECOVERY_INSTRUCTIONS
from agents.chargeback import CHARGEBACK_INSTRUCTIONS
from agents.credit_dispute import CREDIT_DISPUTE_INSTRUCTIONS
from agents.expense import EXPENSE_INSTRUCTIONS
from agents.insurance import INSURANCE_INSTRUCTIONS
from agents.kyc import KYC_INSTRUCTIONS
from agents.loan import LOAN_INSTRUCTIONS
from agents.prompt_contract import AGGRESSIVE_AGENT_IDS, OUTPUT_KEYS
from agents.refund import REFUND_INSTRUCTIONS
from agents.transaction_monitoring import TXN_MONITORING_INSTRUCTIONS
from agents.wire_transfer import WIRE_TRANSFER_INSTRUCTIONS

ALL_PROMPTS: dict[str, str] = {
    "refund": REFUND_INSTRUCTIONS,
    "kyc": KYC_INSTRUCTIONS,
    "account_recovery": ACCOUNT_RECOVERY_INSTRUCTIONS,
    "chargeback": CHARGEBACK_INSTRUCTIONS,
    "credit_dispute": CREDIT_DISPUTE_INSTRUCTIONS,
    "wire_transfer": WIRE_TRANSFER_INSTRUCTIONS,
    "loan": LOAN_INSTRUCTIONS,
    "insurance": INSURANCE_INSTRUCTIONS,
    "expense": EXPENSE_INSTRUCTIONS,
    "transaction_monitoring": TXN_MONITORING_INSTRUCTIONS,
}


def test_all_agents_include_strict_json_contract() -> None:
    for agent_id, prompt in ALL_PROMPTS.items():
        assert "Output valid JSON only" in prompt, agent_id
        assert "no markdown" in prompt.lower(), agent_id
        assert "exactly these top-level keys" in prompt, agent_id
        for key in OUTPUT_KEYS:
            assert f"- {key}" in prompt, f"{agent_id} missing output key {key}"


def test_weakening_profile_assignment() -> None:
    for agent_id, prompt in ALL_PROMPTS.items():
        expected = "aggressive" if agent_id in AGGRESSIVE_AGENT_IDS else "moderate"
        assert f"Weakening profile: {expected}" in prompt, agent_id


def test_aggressive_agents_have_explicit_weak_spot_rules() -> None:
    for agent_id in AGGRESSIVE_AGENT_IDS:
        prompt = ALL_PROMPTS[agent_id]
        rule_ids = re.findall(r"WS-[A-Z]+-\d+", prompt)
        assert len(rule_ids) >= 3, f"{agent_id} should have at least 3 weak spot rules"


def test_moderate_agents_have_controlled_exceptions_only() -> None:
    moderate_agents = [agent_id for agent_id in ALL_PROMPTS if agent_id not in AGGRESSIVE_AGENT_IDS]
    for agent_id in moderate_agents:
        prompt = ALL_PROMPTS[agent_id]
        rule_ids = re.findall(r"WS-[A-Z]+-\d+", prompt)
        assert len(rule_ids) >= 2, f"{agent_id} should include controlled weak spot rules"
        assert "Use only deterministic weak-spot triggers" in prompt, agent_id
        assert "If no weak-spot trigger applies, enforce normal policy-safe behavior." in prompt, agent_id
