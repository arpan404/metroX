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
    preset: 'quick' | 'standard' | 'deep'
    mode: 'deterministic_ci' | 'live_nightly'
    budgetUsd: number
    maxConcurrency: number
  }
}

export const configTemplates: ConfigTemplate[] = [
  {
    id: 'quick-scan',
    name: 'Quick Scan',
    description: 'Fast surface-level check. Prompt injection only, low budget.',
    icon: 'Zap',
    config: {
      sessionName: 'Quick Reliability Scan',
      sessionOwner: 'platform-team',
      profileName: 'quick-scan-profile',
      targetType: 'managed_llm_runtime',
      model: 'gpt-4.1-mini',
      providerName: 'openai',
      taxonomy: 'prompt_injection',
      seed: 42,
      curatedRatio: 0.8,
      strictness: 'balanced',
      activeAdjudication: false,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 2,
      preset: 'quick',
      mode: 'deterministic_ci',
      budgetUsd: 1,
      maxConcurrency: 4,
    },
  },
  {
    id: 'standard-assessment',
    name: 'Standard Assessment',
    description: 'Full taxonomy coverage with balanced depth. Recommended for most evaluations.',
    icon: 'Shield',
    config: {
      sessionName: 'Standard Reliability Assessment',
      sessionOwner: 'platform-team',
      profileName: 'standard-assessment-profile',
      targetType: 'managed_llm_runtime',
      model: 'gpt-4.1-mini',
      providerName: 'openai',
      taxonomy: 'prompt_injection,jailbreak,hallucination,tool_misuse,unsafe_output',
      seed: 42,
      curatedRatio: 0.6,
      strictness: 'balanced',
      activeAdjudication: true,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 3,
      preset: 'standard',
      mode: 'deterministic_ci',
      budgetUsd: 5,
      maxConcurrency: 8,
    },
  },
  {
    id: 'deep-evaluation',
    name: 'Deep Evaluation',
    description: 'Exhaustive testing with high concurrency and extended budget.',
    icon: 'Microscope',
    config: {
      sessionName: 'Deep Reliability Evaluation',
      sessionOwner: 'security-team',
      profileName: 'deep-evaluation-profile',
      targetType: 'managed_llm_runtime',
      model: 'gpt-4.1-mini',
      providerName: 'openai',
      taxonomy: 'prompt_injection,jailbreak,hallucination,tool_misuse,unsafe_output',
      seed: 42,
      curatedRatio: 0.5,
      strictness: 'strict',
      activeAdjudication: true,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 5,
      preset: 'deep',
      mode: 'deterministic_ci',
      budgetUsd: 20,
      maxConcurrency: 16,
    },
  },
  {
    id: 'ci-pipeline',
    name: 'CI Pipeline',
    description: 'Deterministic seed for reproducible CI/CD gate checks.',
    icon: 'GitBranch',
    config: {
      sessionName: 'CI Gate Check',
      sessionOwner: 'devops',
      profileName: 'ci-pipeline-profile',
      targetType: 'managed_llm_runtime',
      model: 'gpt-4.1-mini',
      providerName: 'openai',
      taxonomy: 'prompt_injection,jailbreak',
      seed: 42,
      curatedRatio: 0.7,
      strictness: 'strict',
      activeAdjudication: false,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 2,
      preset: 'quick',
      mode: 'deterministic_ci',
      budgetUsd: 3,
      maxConcurrency: 4,
    },
  },
  {
    id: 'nightly-regression',
    name: 'Nightly Regression',
    description: 'Live nightly run with baseline comparison for drift detection.',
    icon: 'Moon',
    config: {
      sessionName: 'Nightly Regression Suite',
      sessionOwner: 'ml-ops',
      profileName: 'nightly-regression-profile',
      targetType: 'managed_llm_runtime',
      model: 'gpt-4.1-mini',
      providerName: 'openai',
      taxonomy: 'prompt_injection,jailbreak,hallucination,tool_misuse,unsafe_output',
      seed: 42,
      curatedRatio: 0.6,
      strictness: 'balanced',
      activeAdjudication: true,
      joinPolicy: 'all_required',
      routerStrategy: 'taxonomy',
      maxSubagents: 3,
      preset: 'standard',
      mode: 'live_nightly',
      budgetUsd: 10,
      maxConcurrency: 8,
    },
  },
]
