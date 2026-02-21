import type {
  AdjudicationCreate,
  AdjudicationOut,
  AfkCapabilities,
  AttackSummaryPayload,
  ClusterPayload,
  ConfigProfileOut,
  CostSummaryPayload,
  CostTimeseriesPayload,
  DetectorVote,
  DriftPayload,
  ExecutionSlicesPayload,
  FeaturePayload,
  ForecastPayload,
  MitigationExperimentCreate,
  MitigationExperimentOut,
  OrchestrationProfile,
  NodeTelemetryPayload,
  PolicyEvent,
  PricingProfilePayload,
  ProviderCredential,
  ProviderCredentialListPayload,
  ProviderValidation,
  QueueStats,
  SecretAccessAudit,
  SecretKey,
  SecretKeyEvent,
  RiskCards,
  RunTelemetryPayload,
  RunOut,
  Scorecard,
  SessionOut,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const API_KEY = import.meta.env.VITE_API_KEY ?? 'local-dev-key'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...(options?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  apiKey: API_KEY,
  apiBase: API_BASE,

  /* ---------------------------------------------------------------- */
  /*  Sessions                                                        */
  /* ---------------------------------------------------------------- */

  createSession(payload: { name: string; description?: string; owner?: string }) {
    return request<SessionOut>('/v1/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getSession(sessionId: string) {
    return request<SessionOut>(`/v1/sessions/${sessionId}`)
  },

  /* ---------------------------------------------------------------- */
  /*  Config Profiles                                                 */
  /* ---------------------------------------------------------------- */

  createConfigProfile(payload: Record<string, unknown>) {
    return request<ConfigProfileOut>('/v1/config-profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getConfigProfile(profileId: string) {
    return request<ConfigProfileOut>(`/v1/config-profiles/${profileId}`)
  },

  /* ---------------------------------------------------------------- */
  /*  Providers                                                       */
  /* ---------------------------------------------------------------- */

  validateProvider(payload: Record<string, unknown>) {
    return request<ProviderValidation>('/v1/providers/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getProviderCapabilities() {
    return request<{ providers: Array<Record<string, unknown>> }>('/v1/providers/capabilities')
  },

  createProviderCredential(payload: { name: string; provider_type: string; api_key: string; status?: string }) {
    return request<ProviderCredential>('/v1/providers/credentials', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  listProviderCredentials() {
    return request<ProviderCredentialListPayload>('/v1/providers/credentials')
  },

  getProviderCredential(credentialId: string) {
    return request<ProviderCredential>(`/v1/providers/credentials/${credentialId}`)
  },

  getProviderCredentialAudits(credentialId: string) {
    return request<{ credential_id: string; audits: SecretAccessAudit[] }>(
      `/v1/providers/credentials/${credentialId}/audits`,
    )
  },

  rotateProviderCredential(credentialId: string, payload: { api_key: string; key_version?: string; status?: string }) {
    return request<ProviderCredential>(`/v1/providers/credentials/${credentialId}/rotate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  /* ---------------------------------------------------------------- */
  /*  Security Keys                                                   */
  /* ---------------------------------------------------------------- */

  createSecurityKey(payload: { version: string; key_material: string; actor?: string }) {
    return request<SecretKey>('/v1/security/keys', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  listSecurityKeys() {
    return request<{ keys: SecretKey[] }>('/v1/security/keys')
  },

  activateSecurityKey(keyId: string, actor = 'ui') {
    return request<SecretKey>(`/v1/security/keys/${keyId}/activate?actor=${encodeURIComponent(actor)}`, {
      method: 'POST',
    })
  },

  reencryptCredentials(keyId: string, actor = 'ui') {
    return request<{ key_id: string; updated: number; total: number }>(
      `/v1/security/keys/${keyId}/reencrypt-credentials?actor=${encodeURIComponent(actor)}`,
      { method: 'POST' },
    )
  },

  retireSecurityKey(keyId: string, actor = 'ui') {
    return request<SecretKey>(`/v1/security/keys/${keyId}/retire?actor=${encodeURIComponent(actor)}`, {
      method: 'POST',
    })
  },

  listSecurityKeyEvents() {
    return request<{ events: SecretKeyEvent[] }>('/v1/security/keys/events')
  },

  /* ---------------------------------------------------------------- */
  /*  Orchestration Profiles                                          */
  /* ---------------------------------------------------------------- */

  createOrchestrationProfile(payload: {
    name: string
    description?: string
    version?: string
    status?: string
    config: Record<string, unknown>
  }) {
    return request<OrchestrationProfile>('/v1/orchestration-profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  listOrchestrationProfiles() {
    return request<{ profiles: OrchestrationProfile[] }>('/v1/orchestration-profiles')
  },

  getOrchestrationProfile(profileId: string) {
    return request<OrchestrationProfile>(`/v1/orchestration-profiles/${profileId}`)
  },

  updateOrchestrationProfile(profileId: string, payload: Record<string, unknown>) {
    return request<OrchestrationProfile>(`/v1/orchestration-profiles/${profileId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  /* ---------------------------------------------------------------- */
  /*  Pricing Profiles                                                */
  /* ---------------------------------------------------------------- */

  createPricingProfile(payload: Record<string, unknown>) {
    return request<PricingProfilePayload>('/v1/pricing-profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getPricingProfile(profileId: string) {
    return request<PricingProfilePayload>(`/v1/pricing-profiles/${profileId}`)
  },

  /* ---------------------------------------------------------------- */
  /*  Runs                                                            */
  /* ---------------------------------------------------------------- */

  createRun(payload: Record<string, unknown>) {
    return request<RunOut>('/v1/runs', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getRun(runId: string) {
    return request<RunOut>(`/v1/runs/${runId}`)
  },

  resumeRun(runId: string) {
    return request<RunOut>(`/v1/runs/${runId}/resume`, { method: 'POST' })
  },

  /* ---------------------------------------------------------------- */
  /*  Run Analytics                                                   */
  /* ---------------------------------------------------------------- */

  getScorecard(runId: string) {
    return request<Scorecard>(`/v1/runs/${runId}/scorecard`)
  },

  getRiskCards(runId: string) {
    return request<RiskCards>(`/v1/runs/${runId}/risk-cards`)
  },

  getClusters(runId: string) {
    return request<ClusterPayload>(`/v1/runs/${runId}/clusters`)
  },

  getDrift(runId: string) {
    return request<DriftPayload>(`/v1/runs/${runId}/drift`)
  },

  getAttackSummary(runId: string) {
    return request<AttackSummaryPayload>(`/v1/runs/${runId}/attack-summary`)
  },

  getExecutionSlices(runId: string) {
    return request<ExecutionSlicesPayload>(`/v1/runs/${runId}/execution-slices`)
  },

  getCostSummary(runId: string) {
    return request<CostSummaryPayload>(`/v1/runs/${runId}/cost-summary`)
  },

  getCostTimeseries(runId: string) {
    return request<CostTimeseriesPayload>(`/v1/runs/${runId}/cost-timeseries`)
  },

  getRunTelemetry(runId: string) {
    return request<RunTelemetryPayload>(`/v1/runs/${runId}/telemetry`)
  },

  getNodeTelemetry(runId: string) {
    return request<NodeTelemetryPayload>(`/v1/runs/${runId}/node-telemetry`)
  },

  getDetectorVotes(runId: string) {
    return request<{ run_id: string; votes: DetectorVote[] }>(`/v1/runs/${runId}/detector-votes`)
  },

  getFeatures(runId: string) {
    return request<FeaturePayload>(`/v1/runs/${runId}/features`)
  },

  getForecast(runId: string) {
    return request<ForecastPayload>(`/v1/runs/${runId}/forecast`)
  },

  getPolicyEvents(runId: string) {
    return request<{ run_id: string; events: PolicyEvent[] }>(`/v1/runs/${runId}/policy-events`)
  },

  getCalibration(runId: string) {
    return request<{ run_id: string; reports: Array<Record<string, unknown>>; bins: Array<Record<string, unknown>> }>(`/v1/runs/${runId}/calibration`)
  },

  getInference(runId: string) {
    return request<{ run_id: string; tests: Array<Record<string, unknown>> }>(`/v1/runs/${runId}/inference`)
  },

  getCooccurrence(runId: string) {
    return request<{ run_id: string; nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }>(`/v1/runs/${runId}/cooccurrence-graph`)
  },

  /* ---------------------------------------------------------------- */
  /*  Comparison                                                      */
  /* ---------------------------------------------------------------- */

  compareRuns(baselineRunId: string, candidateRunId: string) {
    const params = new URLSearchParams({ baseline_run_id: baselineRunId, candidate_run_id: candidateRunId })
    return request<{ baseline_run_id: string; candidate_run_id: string; summary: Record<string, unknown>; tests: Record<string, unknown> }>(`/v1/compare?${params.toString()}`)
  },

  /* ---------------------------------------------------------------- */
  /*  Adjudications                                                   */
  /* ---------------------------------------------------------------- */

  createAdjudication(payload: AdjudicationCreate) {
    return request<AdjudicationOut>('/v1/adjudications', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  /* ---------------------------------------------------------------- */
  /*  Mitigation Experiments                                          */
  /* ---------------------------------------------------------------- */

  createMitigationExperiment(payload: MitigationExperimentCreate) {
    return request<MitigationExperimentOut>('/v1/mitigation-experiments', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getMitigationExperiment(experimentId: string) {
    return request<MitigationExperimentOut>(`/v1/mitigation-experiments/${experimentId}`)
  },

  /* ---------------------------------------------------------------- */
  /*  Queue                                                           */
  /* ---------------------------------------------------------------- */

  getQueueStats() {
    return request<QueueStats>('/v1/queue/stats')
  },

  /* ---------------------------------------------------------------- */
  /*  AFK Capabilities                                                */
  /* ---------------------------------------------------------------- */

  getCapabilities() {
    return request<AfkCapabilities>('/v1/afk/capabilities')
  },

  /* ---------------------------------------------------------------- */
  /*  Reports                                                         */
  /* ---------------------------------------------------------------- */

  generateReport(runId: string) {
    return request<{ run_id: string; markdown: string; path: string }>(`/v1/reports/${runId}/generate`, {
      method: 'POST',
    })
  },

  /* ---------------------------------------------------------------- */
  /*  Streaming                                                       */
  /* ---------------------------------------------------------------- */

  streamRunEvents(runId: string, onEvent: (event: Record<string, unknown>) => void, onEnd: () => void) {
    const url = `${API_BASE}/v1/runs/${runId}/events?api_key=${encodeURIComponent(API_KEY)}`
    const source = new EventSource(url)

    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as Record<string, unknown>)
      } catch (_error) {
        // Ignore malformed events.
      }
    }
    source.addEventListener('end', () => {
      source.close()
      onEnd()
    })
    source.onerror = () => {
      source.close()
      onEnd()
    }

    return () => source.close()
  },

  streamRunEventsWs(runId: string, onEvent: (event: Record<string, unknown>) => void, onEnd: () => void) {
    const wsBase = API_BASE.replace(/^http/, 'ws')
    const socket = new WebSocket(`${wsBase}/v1/runs/${runId}/ws?api_key=${encodeURIComponent(API_KEY)}`)
    let closed = false

    socket.onmessage = (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as Record<string, unknown>
        if (payload.event_type === 'heartbeat') return
        if (payload.event_type === 'end') {
          if (!closed) {
            closed = true
            socket.close()
            onEnd()
          }
          return
        }
        onEvent(payload)
      } catch (_error) {
        // Ignore malformed payloads.
      }
    }

    socket.onerror = () => {
      if (!closed) {
        closed = true
        socket.close()
        onEnd()
      }
    }
    socket.onclose = () => {
      if (!closed) {
        closed = true
        onEnd()
      }
    }

    return () => {
      closed = true
      socket.close()
    }
  },
}
