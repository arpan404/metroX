export type SessionOut = {
  id: string
  name: string
  description?: string | null
  owner?: string | null
  created_at: string
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
    severity_breakdown: Record<string, number>
  }>
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
    effective_cost_usd: number
    tool_events: number
    policy_events: number
  }>
}
