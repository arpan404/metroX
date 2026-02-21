export type ConfigTemplate = {
  id: string
  name: string
  description: string
  icon: string
  config: {
    sessionName: string
    sessionOwner: string
    profileName: string
    targetType: 'managed_llm_runtime' | 'managed_agent_runtime' | 'http' | 'openai_compatible' | 'agent_http'
    agentId: string
    agentName: string
    agentDescription: string
    model: string
    providerName: string
    taxonomy: string
    seed: number
    curatedRatio: number
    strictness: string
    activeAdjudication: boolean
    joinPolicy: string
    routerStrategy: string
    maxSubagents: number
    orchestrationTemplate?: 'fraud_triage' | 'refund_guard' | 'deep_investigation'
    preset: 'quick' | 'standard' | 'deep'
    mode: 'deterministic_ci' | 'live_nightly'
    budgetUsd: number
    maxConcurrency: number
  }
}

export const configTemplates: ConfigTemplate[] = [
  {
    id: 'fraud-starter',
    name: 'Fraud Readiness',
    description: 'Balanced pre-release fraud resilience check for financial agents.',
    icon: 'FlaskConical',
    config: {
      sessionName: 'Fraud Readiness Session',
      sessionOwner: 'risk-team',
      profileName: 'fraud-readiness-profile',
      targetType: 'agent_http',
      agentId: 'refund',
      agentName: 'refund-agent',
      agentDescription: 'Automated refund decisioning agent under fraud stress test.',
      model: 'ollama_chat/gpt-oss:20b',
      providerName: 'litellm',
      taxonomy: 'tool_misuse,prompt_injection,jailbreak,refund_abuse,claim_manipulation,identity_mismatch',
      seed: 42,
      curatedRatio: 0.7,
      strictness: 'strict',
      activeAdjudication: true,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 4,
      orchestrationTemplate: 'fraud_triage',
      preset: 'standard',
      mode: 'deterministic_ci',
      budgetUsd: 6,
      maxConcurrency: 8,
    },
  },
  {
    id: 'quick-scan',
    name: 'Quick Fraud Smoke',
    description: 'Fast low-cost check before demos or internal QA.',
    icon: 'Zap',
    config: {
      sessionName: 'Quick Fraud Smoke',
      sessionOwner: 'qa-team',
      profileName: 'quick-fraud-smoke-profile',
      targetType: 'agent_http',
      agentId: 'refund',
      agentName: 'refund-agent',
      agentDescription: 'Fast smoke run for refund abuse exposure before demo/release.',
      model: 'ollama_chat/gpt-oss:20b',
      providerName: 'litellm',
      taxonomy: 'refund_abuse,claim_manipulation,prompt_injection',
      seed: 42,
      curatedRatio: 0.8,
      strictness: 'balanced',
      activeAdjudication: false,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 2,
      orchestrationTemplate: 'refund_guard',
      preset: 'quick',
      mode: 'deterministic_ci',
      budgetUsd: 1,
      maxConcurrency: 4,
    },
  },
  {
    id: 'refund-abuse-check',
    name: 'Refund Abuse Check',
    description: 'Focused defense test for refund loops and policy bypass attempts.',
    icon: 'Shield',
    config: {
      sessionName: 'Refund Abuse Validation',
      sessionOwner: 'trust-safety',
      profileName: 'refund-abuse-check-profile',
      targetType: 'agent_http',
      agentId: 'chargeback',
      agentName: 'refund-agent',
      agentDescription: 'Refund abuse focused workflow including claim and identity checks.',
      model: 'ollama_chat/gpt-oss:20b',
      providerName: 'litellm',
      taxonomy: 'refund_abuse,claim_manipulation,identity_mismatch,tool_misuse',
      seed: 42,
      curatedRatio: 0.7,
      strictness: 'strict',
      activeAdjudication: true,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 3,
      orchestrationTemplate: 'refund_guard',
      preset: 'standard',
      mode: 'deterministic_ci',
      budgetUsd: 4,
      maxConcurrency: 8,
    },
  },
  {
    id: 'identity-risk-sweep',
    name: 'Identity Risk Sweep',
    description: 'Deeper stress test for identity mismatch and account-takeover style abuse.',
    icon: 'Microscope',
    config: {
      sessionName: 'Identity Risk Sweep',
      sessionOwner: 'security-team',
      profileName: 'identity-risk-sweep-profile',
      targetType: 'agent_http',
      agentId: 'account-recovery',
      agentName: 'account-recovery-agent',
      agentDescription: 'Identity and account-recovery agent tested for takeover manipulation.',
      model: 'ollama_chat/gpt-oss:20b',
      providerName: 'litellm',
      taxonomy: 'identity_mismatch,claim_manipulation,data_exfiltration,system_prompt_leak,jailbreak',
      seed: 42,
      curatedRatio: 0.5,
      strictness: 'strict',
      activeAdjudication: true,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 5,
      orchestrationTemplate: 'deep_investigation',
      preset: 'deep',
      mode: 'deterministic_ci',
      budgetUsd: 20,
      maxConcurrency: 16,
    },
  },
  {
    id: 'release-gate',
    name: 'Release Gate',
    description: 'Deterministic pass/fail gate for merges and pre-release checks.',
    icon: 'GitBranch',
    config: {
      sessionName: 'Release Gate Validation',
      sessionOwner: 'platform-team',
      profileName: 'release-gate-profile',
      targetType: 'agent_http',
      agentId: 'transaction-monitoring',
      agentName: 'financial-ops-agent',
      agentDescription: 'Pre-release gate for financial ops actions and risky policy paths.',
      model: 'ollama_chat/gpt-oss:20b',
      providerName: 'litellm',
      taxonomy: 'refund_abuse,claim_manipulation,prompt_injection,tool_misuse',
      seed: 42,
      curatedRatio: 0.7,
      strictness: 'strict',
      activeAdjudication: false,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 2,
      orchestrationTemplate: 'refund_guard',
      preset: 'quick',
      mode: 'deterministic_ci',
      budgetUsd: 3,
      maxConcurrency: 4,
    },
  },
  {
    id: 'nightly-regression',
    name: 'Nightly Fraud Watch',
    description: 'Recurring broad run for drift and regression monitoring.',
    icon: 'Moon',
    config: {
      sessionName: 'Nightly Fraud Watch',
      sessionOwner: 'ml-ops',
      profileName: 'nightly-fraud-watch-profile',
      targetType: 'agent_http',
      agentId: 'loan',
      agentName: 'financial-ops-agent',
      agentDescription: 'Nightly drift watch for fraud vulnerabilities across key workflows.',
      model: 'ollama_chat/gpt-oss:20b',
      providerName: 'litellm',
      taxonomy: 'prompt_injection,jailbreak,tool_misuse,refund_abuse,claim_manipulation,identity_mismatch',
      seed: 42,
      curatedRatio: 0.6,
      strictness: 'balanced',
      activeAdjudication: true,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 3,
      orchestrationTemplate: 'fraud_triage',
      preset: 'standard',
      mode: 'live_nightly',
      budgetUsd: 10,
      maxConcurrency: 8,
    },
  },
]
