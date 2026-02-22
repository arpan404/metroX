export type SessionOut = {
  id: string
  name: string
  description?: string | null
  owner?: string | null
  created_at: string
}

export type SessionListPayload = {
  sessions: SessionOut[]
  total: number
}

export type ConfigProfileOut = {
  id: string
  session_id: string
  name: string
  strictness_mode: string
  target_config: Record<string, unknown>
  benchmark_config: Record<string, unknown>
  scoring_config: Record<string, unknown>
  runtime_config: Record<string, unknown>
  created_at: string
}

export type ConfigProfileListPayload = {
  profiles: ConfigProfileOut[]
  total: number
}

export type RunOut = {
  id: string
  session_id: string
  config_profile_id: string
  config_snapshot_id?: string | null
  preset: string
  mode: string
  strictness: string
  status: string
  thread_id?: string | null
  total_attacks: number
  completed_attacks: number
  budget_spent_usd: number
  estimated_final_cost_usd: number
  summary_metrics: Record<string, number | string>
  gate_result: { pass?: boolean; reasons?: string[] }
  cost_gate_result?: { pass?: boolean; budget_usd?: number; spent_usd?: number; projected_final_usd?: number }
  created_at: string
}

export type RunListPayload = {
  runs: RunOut[]
  total: number
  status_counts: Record<string, number>
}

export type Scorecard = {
  run_id: string
  metrics: Record<string, number>
  gates: { pass: boolean; reasons: string[] }
  ci: Record<string, { low: number; high: number; n: number }>
}

export type RiskCards = {
  run_id: string
  risks: Array<{
    failure_type: string
    risk_probability: number
    uncertainty_band: { low: number; high: number }
    top_drivers: string[]
    sample_size: number
  }>
}

export type DriftPayload = {
  run_id: string
  baseline_run_id?: string | null
  drift_signals: Array<{
    feature_name: string
    psi: number
    ks_pvalue: number
    kl_divergence: number
    drift_level: string
  }>
  change_points: Array<{
    metric_name: string
    score: number
    threshold: number
    detected_at: string
  }>
}

export type AttackSummaryPayload = {
  run_id: string
  attack_types: Array<{
    attack_type: string
    total: number
    success: number
    failure: number
    success_rate: number
    avg_confidence: number
    avg_disagreement?: number
    avg_uncertainty?: number
    severity_breakdown: Record<string, number>
  }>
  detector_summary?: {
    avg_disagreement: number
    avg_uncertainty: number
    count: number
  }
}

export type ClusterPayload = {
  run_id: string
  clusters: Array<{
    cluster_id: number
    label: string
    top_terms: string[]
    size: number
  }>
}

export type ProviderValidation = {
  valid: boolean
  provider_type: string
  model?: string
  api_key_ref?: string
  credential_id?: string
  error?: string
  discovered_models?: string[]
  probe_results?: Array<{ probe: string; status: string; latency_ms: number; error?: string | null }>
  capability_confidence?: number
  model_discovery_mode?: 'direct' | 'fallback' | 'inferred'
  warnings?: string[]
  error_class?: 'auth' | 'network' | 'schema' | 'unsupported' | null
}

export type ProviderCredential = {
  id: string
  name: string
  provider_type: string
  key_version: string
  status: string
  created_at: string
  last_rotated_at?: string | null
  last_validated_at?: string | null
}

export type ProviderCredentialListPayload = {
  credentials: ProviderCredential[]
}

export type SecretKey = {
  id: string
  version: string
  status: string
  created_at: string
  activated_at?: string | null
  retired_at?: string | null
}

export type SecretKeyEvent = {
  id: string
  key_id: string
  action: string
  actor: string
  meta: Record<string, unknown>
  created_at: string
}

export type SecretAccessAudit = {
  id: string
  provider_credential_id: string
  action: string
  actor: string
  success: boolean
  error?: string | null
  created_at: string
}

export type OrchestrationProfile = {
  id: string
  name: string
  description?: string | null
  version: string
  status: string
  config: Record<string, unknown>
  created_at: string
}

export type PricingProfilePayload = {
  id: string
  name: string
  currency: string
  fallback_policy: string
  models: Array<{
    provider_name: string
    model: string
    input_per_1k: number
    output_per_1k: number
    reasoning_per_1k: number
  }>
}

export type CostSummaryPayload = {
  run_id: string
  totals: {
    prompt_tokens: number
    completion_tokens: number
    provider_cost: number
    estimated_cost: number
    effective_cost: number
  }
  breakdown: Record<string, { cost: number; tokens: number; count: number }>
  sources: { provider: number; fallback: number; mixed: number }
  cost_gate: { pass?: boolean; budget_usd?: number; spent_usd?: number; projected_final_usd?: number }
}

export type CostTimeseriesPayload = {
  run_id: string
  points: Array<{
    step: number
    execution_id: string
    cost_usd: number
    cumulative_cost_usd: number
    source: string
    created_at: string
  }>
}

export type ExecutionSlicesPayload = {
  run_id: string
  slices: Array<{
    attack_type: string
    provider_name: string
    model: string
    count: number
    avg_latency_ms: number
    effective_cost_usd: number
  }>
}

export type RunTelemetryPayload = {
  run_id: string
  status: string
  progress: { completed: number; total: number }
  event_counts: Record<string, number>
  cost: { spent_usd: number; projected_final_usd: number }
}

export type NodeTelemetryPayload = {
  run_id: string
  nodes: Array<{
    attack_type: string
    total: number
    success: number
    failure: number
    avg_latency_ms: number
    cost_usd?: number
    effective_cost_usd: number
    tool_events: number
    policy_decisions?: number
    policy_events: number
  }>
}

/* ------------------------------------------------------------------ */
/*  Gate Thresholds & Scoring Weights (mirrors backend schemas)       */
/* ------------------------------------------------------------------ */

export type GateThresholds = {
  asr_max: number
  hallucination_max: number
  toxicity_max: number
  tool_misuse_max: number
  composite_min: number
  max_regression_delta: number
  cost_max_usd: number
  max_cost_regression_delta: number
  min_effect_size_for_regression: number
  max_adjusted_p_for_regression: number
}

export type ScoringWeights = {
  asr: number
  hallucination: number
  toxicity: number
  tool_misuse: number
}

export type ScoringConfig = {
  strictness_mode: string
  gate_thresholds: GateThresholds
  weights: ScoringWeights
  weak_supervision: boolean
  active_adjudication: boolean
  detectors: {
    enabled: string[]
    weights: Record<string, number>
  }
  fusion: {
    disagreement_threshold: number
    uncertainty_threshold: number
  }
}

export type RuntimeConfig = {
  preset: 'quick' | 'standard' | 'deep'
  max_concurrency: number
  budget_usd: number
  cost_tracking_enabled: boolean
  cost_gate_usd: number | null
  abort_on_cost_breach: boolean
  deterministic_seed: number
  live_mode: boolean
}

export type TargetConfig = {
  target_type: 'managed_llm_runtime' | 'managed_agent_runtime' | 'http' | 'openai_compatible' | 'agent_http'
  endpoint: string | null
  auth_headers: Record<string, string>
  model: string
  provider_name: string | null
  base_url: string | null
  api_key_ref: string | null
  agent_index_url?: string | null
  agent_id?: string | null
  agent_name?: string | null
  agent_description?: string | null
  agent_url?: string | null
  extra: Record<string, unknown>
}

export type TestAgentCatalogAgent = {
  id: string
  name: string
  chat_url: string
}

export type TestAgentCatalog = {
  base_url: string
  source: 'runtime_api' | 'filesystem_fallback'
  agents: TestAgentCatalogAgent[]
}

export type BenchmarkConfig = {
  dataset_name: string
  taxonomy: string[]
  curated_ratio: number
  generated_ratio: number
  seed: number
  slices: string[]
  agentic_attacking: boolean
  agentic_provider: 'auto' | 'afk_live'
  agentic_model: string | null
  multi_turn?: {
    enabled: boolean
    phase_policy?: 'fixed' | 'random' | 'adaptive'
    phases: number
    min_phases?: number
    max_phases?: number
    context_window_chars: number
    response_excerpt_chars: number
  }
  afk_orchestration: Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/*  Adjudication                                                      */
/* ------------------------------------------------------------------ */

export type AdjudicationCreate = {
  run_id: string
  execution_id: string
  reviewer: string
  decision: 'agree' | 'disagree' | 'uncertain' | 'hallucination' | 'jailbreak_success' | 'prompt_injection_success' | 'tool_misuse' | 'toxicity' | 'none'
  rationale?: string
}

export type AdjudicationOut = {
  id: string
  run_id: string
  execution_id: string
  reviewer: string
  decision: string
  rationale: string | null
  created_at: string
}

/* ------------------------------------------------------------------ */
/*  Mitigation Experiments                                            */
/* ------------------------------------------------------------------ */

export type MitigationExperimentCreate = {
  name: string
  baseline_run_id: string
  candidate_run_id: string
  config?: Record<string, unknown>
}

export type MitigationExperimentOut = {
  id: string
  name: string
  baseline_run_id: string
  candidate_run_id: string
  status: string
  created_at: string
  effects: Array<Record<string, unknown>>
  recommendations: Array<Record<string, unknown>>
}

/* ------------------------------------------------------------------ */
/*  Queue Stats                                                       */
/* ------------------------------------------------------------------ */

export type QueueStats = {
  pending: number
  dlq_pending: number
  workers: number
  live_workers: number
  started: boolean
  backend: string
}

export type QueueRunItem = {
  id: string
  session_id: string
  config_profile_id: string
  preset: string
  mode: string
  strictness: string
  status: string
  total_attacks: number
  completed_attacks: number
  budget_spent_usd: number
  estimated_final_cost_usd: number
  created_at?: string | null
  started_at?: string | null
  ended_at?: string | null
}

export type QueuePendingItem = {
  run_id: string
  attempt: number
  priority: number
  position: number
  run?: QueueRunItem | null
}

export type QueueRunsPayload = {
  backend: string
  pending: QueuePendingItem[]
  running: QueueRunItem[]
  completed: QueueRunItem[]
}

export type QueueActionResponse = {
  ok: boolean
  updated: {
    run_id: string
    attempt: number
    priority: number
  }
}

/* ------------------------------------------------------------------ */
/*  Runtime Capabilities                                              */
/* ------------------------------------------------------------------ */

export type AfkCapabilities = {
  version: string
  interaction_mode_default: string
  supported_interaction_modes: string[]
  subagent_router_strategies: string[]
  policy_profiles: string[]
  memory: Record<string, unknown>
  high_impact_features: Array<Record<string, unknown>>
  recommended_profiles: Record<string, unknown>
  tools?: Array<{ name: string; description?: string; category?: string }>
}

/* ------------------------------------------------------------------ */
/*  Detector Votes                                                    */
/* ------------------------------------------------------------------ */

export type DetectorVote = {
  id: string
  execution_id: string
  attack_type?: string
  detector_name: string
  failure_flags: Record<string, boolean>
  confidence: number
  evidence: Record<string, unknown>
  latency_ms: number
  created_at: string
}

export type DetectorVoteSummaryPayload = {
  run_id: string
  attack_type: string | null
  totals: {
    votes: number
    executions: number
    detectors: number
    fail_votes: number
    pass_votes: number
    avg_confidence: number
    avg_latency_ms: number
  }
  detectors: Array<{
    detector_name: string
    votes: number
    fail_votes: number
    pass_votes: number
    fail_rate: number
    avg_confidence: number
    avg_latency_ms: number
    failure_key_rates: Record<string, number>
  }>
  consensus: {
    avg_disagreement: number
    avg_uncertainty: number
  }
  raw_sample: DetectorVote[]
}

/* ------------------------------------------------------------------ */
/*  Policy Events                                                     */
/* ------------------------------------------------------------------ */

export type PolicyEvent = {
  id: number
  event_type: string
  step: number
  message: string
  data: Record<string, unknown>
  created_at: string
}

/* ------------------------------------------------------------------ */
/*  Features                                                          */
/* ------------------------------------------------------------------ */

export type FeaturePayload = {
  run_id: string
  features: Array<Record<string, number | string>>
}

/* ------------------------------------------------------------------ */
/*  Forecast                                                          */
/* ------------------------------------------------------------------ */

export type ForecastPayload = {
  run_id: string
  forecasts: Array<Record<string, unknown>>
}

export type NarrativeSummaryPayload = {
  run_id: string
  generated_by: string
  model: string
  provider: string
  executive_summary: string
  non_technical_explanation: string
  top_vulnerabilities: Array<Record<string, unknown>>
  advisories: Array<Record<string, unknown>>
  gate_reasons: string[]
}

export type RunReportPayload = {
  run_id: string
  markdown: string
  path: string
  pdf_path?: string | null
  json_path?: string | null
  execution_count?: number | null
  event_count?: number | null
}
