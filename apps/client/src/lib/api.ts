import type {
  AdjudicationCreate,
  AdjudicationOut,
  AfkCapabilities,
  AttackSummaryPayload,
  ClusterPayload,
  ConfigProfileOut,
  ConfigProfileListPayload,
  CostSummaryPayload,
  CostTimeseriesPayload,
  DetectorVote,
  DetectorVoteSummaryPayload,
  DriftPayload,
  ExecutionSlicesPayload,
  FeaturePayload,
  ForecastPayload,
  MitigationExperimentCreate,
  MitigationExperimentOut,
  OrchestrationProfile,
  NodeTelemetryPayload,
  NarrativeSummaryPayload,
  PolicyEvent,
  PricingProfilePayload,
  ProviderCredential,
  ProviderCredentialListPayload,
  ProviderValidation,
  QueueActionResponse,
  QueueRunsPayload,
  QueueStats,
  SecretAccessAudit,
  SecretKey,
  SecretKeyEvent,
  RiskCards,
  RunTelemetryPayload,
  RunOut,
  RunListPayload,
  Scorecard,
  SessionListPayload,
  SessionOut,
  TestAgentCatalog,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const API_KEY = import.meta.env.VITE_API_KEY ?? 'local-dev-key'

function parseOllamaModels(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const body = payload as { models?: unknown; data?: unknown }

  if (Array.isArray(body.models)) {
    const out = body.models
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'name' in item) {
          const name = (item as { name?: unknown }).name
          return typeof name === 'string' ? name : null
        }
        if (item && typeof item === 'object' && 'id' in item) {
          const id = (item as { id?: unknown }).id
          return typeof id === 'string' ? id : null
        }
        return null
      })
      .filter((item): item is string => Boolean(item))
    if (out.length > 0) return out
  }

  if (Array.isArray(body.data)) {
    return body.data
      .map((item) => {
        if (item && typeof item === 'object' && 'id' in item) {
          const id = (item as { id?: unknown }).id
          return typeof id === 'string' ? id : null
        }
        return null
      })
      .filter((item): item is string => Boolean(item))
  }

  return []
}

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

  listSessions(params?: { limit?: number; offset?: number; owner?: string }) {
    const query = new URLSearchParams()
    if (params?.limit != null) query.set('limit', String(params.limit))
    if (params?.offset != null) query.set('offset', String(params.offset))
    if (params?.owner) query.set('owner', params.owner)
    const suffix = query.toString()
    return request<SessionListPayload>(`/v1/sessions${suffix ? `?${suffix}` : ''}`)
  },

  listTestAgentsCatalog() {
    return request<TestAgentCatalog>('/v1/test-agents/catalog')
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

  listConfigProfiles(params?: { session_id?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams()
    if (params?.session_id) query.set('session_id', params.session_id)
    if (params?.limit != null) query.set('limit', String(params.limit))
    if (params?.offset != null) query.set('offset', String(params.offset))
    const suffix = query.toString()
    return request<ConfigProfileListPayload>(`/v1/config-profiles${suffix ? `?${suffix}` : ''}`)
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

  async getOllamaModels(baseUrl?: string) {
    const root = (baseUrl?.trim() || 'http://localhost:11434').replace(/\/+$/, '')
    const endpoints = [`${root}/v1/models`, `${root}/models`, `${root}/api/tags`]
    let lastStatus = 0
    for (const url of endpoints) {
      const response = await fetch(url)
      if (!response.ok) {
        lastStatus = response.status
        continue
      }
      const body = await response.json()
      return parseOllamaModels(body)
    }
    throw new Error(`Ollama model discovery failed (${lastStatus || 'network'})`)
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

  deleteProviderCredential(credentialId: string) {
    return request<void>(`/v1/providers/credentials/${credentialId}`, {
      method: 'DELETE',
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

  deleteOrchestrationProfile(profileId: string) {
    return request<void>(`/v1/orchestration-profiles/${profileId}`, {
      method: 'DELETE',
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

  getPricingProfile(profileId?: string) {
    const path = profileId ? `/v1/pricing-profiles/${profileId}` : '/v1/pricing-profiles/default'
    return request<PricingProfilePayload>(path)
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

  listRuns(params?: {
    session_id?: string
    config_profile_id?: string
    status?: string
    limit?: number
    offset?: number
  }) {
    const query = new URLSearchParams()
    if (params?.session_id) query.set('session_id', params.session_id)
    if (params?.config_profile_id) query.set('config_profile_id', params.config_profile_id)
    if (params?.status) query.set('status', params.status)
    if (params?.limit != null) query.set('limit', String(params.limit))
    if (params?.offset != null) query.set('offset', String(params.offset))
    const suffix = query.toString()
    return request<RunListPayload>(`/v1/runs${suffix ? `?${suffix}` : ''}`)
  },

  getRunEventsRecent(runId: string, limit = 200) {
    const params = new URLSearchParams({ limit: String(limit) })
    return request<{ run_id: string; events: Array<Record<string, unknown>> }>(
      `/v1/runs/${runId}/events/recent?${params.toString()}`,
    )
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

  getDetectorVotesSummary(runId: string, attackType?: string, limitRaw = 100) {
    const params = new URLSearchParams()
    if (attackType) params.set('attack_type', attackType)
    params.set('limit_raw', String(limitRaw))
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return request<DetectorVoteSummaryPayload>(`/v1/runs/${runId}/detector-votes-summary${suffix}`)
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

  getNarrativeSummary(runId: string) {
    return request<NarrativeSummaryPayload>(`/v1/runs/${runId}/narrative-summary`)
  },

  generateNarrativeSummary(runId: string, regenerate = false) {
    const params = new URLSearchParams({ regenerate: String(regenerate) })
    return request<NarrativeSummaryPayload>(`/v1/runs/${runId}/narrative-summary?${params.toString()}`, {
      method: 'POST',
    })
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

  listQueueRuns(limit = 100) {
    const params = new URLSearchParams({ limit: String(limit) })
    return request<QueueRunsPayload>(`/v1/queue/runs?${params.toString()}`)
  },

  moveQueueRunUp(runId: string) {
    return request<QueueActionResponse>(`/v1/queue/runs/${runId}/move-up`, { method: 'POST' })
  },

  setQueueRunPriority(runId: string, priority: number) {
    const params = new URLSearchParams({ priority: String(priority) })
    return request<QueueActionResponse>(`/v1/queue/runs/${runId}/priority?${params.toString()}`, { method: 'POST' })
  },

  stopRun(runId: string) {
    return request<RunOut>(`/v1/runs/${runId}/stop`, { method: 'POST' })
  },

  /* ---------------------------------------------------------------- */
  /*  Runtime Capabilities                                            */
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
