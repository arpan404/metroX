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
  total_attacks: number
  completed_attacks: number
  summary_metrics: Record<string, number>
  gate_result: { pass?: boolean; reasons?: string[] }
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

export type ClusterPayload = {
  run_id: string
  clusters: Array<{
    cluster_id: number
    label: string
    top_terms: string[]
    size: number
  }>
}
