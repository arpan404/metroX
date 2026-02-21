import type {
  AttackSummaryPayload,
  ClusterPayload,
  ConfigProfileOut,
  CostSummaryPayload,
  CostTimeseriesPayload,
  DriftPayload,
  PricingProfilePayload,
  ProviderValidation,
  RiskCards,
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

  createSession(payload: { name: string; description?: string; owner?: string }) {
    return request<SessionOut>('/v1/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getSession(sessionId: string) {
    return request<SessionOut>(`/v1/sessions/${sessionId}`)
  },

  createConfigProfile(payload: Record<string, unknown>) {
    return request<ConfigProfileOut>('/v1/config-profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  validateProvider(payload: Record<string, unknown>) {
    return request<ProviderValidation>('/v1/providers/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getProviderCapabilities() {
    return request<{ providers: Array<Record<string, unknown>> }>('/v1/providers/capabilities')
  },

  createPricingProfile(payload: Record<string, unknown>) {
    return request<PricingProfilePayload>('/v1/pricing-profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getPricingProfile(profileId: string) {
    return request<PricingProfilePayload>(`/v1/pricing-profiles/${profileId}`)
  },

  getConfigProfile(profileId: string) {
    return request<ConfigProfileOut>(`/v1/config-profiles/${profileId}`)
  },

  createRun(payload: Record<string, unknown>) {
    return request<RunOut>('/v1/runs', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getRun(runId: string) {
    return request<RunOut>(`/v1/runs/${runId}`)
  },

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

  getCostSummary(runId: string) {
    return request<CostSummaryPayload>(`/v1/runs/${runId}/cost-summary`)
  },

  getCostTimeseries(runId: string) {
    return request<CostTimeseriesPayload>(`/v1/runs/${runId}/cost-timeseries`)
  },

  getPolicyEvents(runId: string) {
    return request<{ run_id: string; events: Array<Record<string, unknown>> }>(`/v1/runs/${runId}/policy-events`)
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

  getForecast(runId: string) {
    return request<{ run_id: string; forecasts: Array<Record<string, unknown>> }>(`/v1/runs/${runId}/forecast`)
  },

  resumeRun(runId: string) {
    return request<RunOut>(`/v1/runs/${runId}/resume`, { method: 'POST' })
  },

  getFeatures(runId: string) {
    return request<{ run_id: string; features: Array<Record<string, number | string>> }>(`/v1/runs/${runId}/features`)
  },

  compareRuns(baselineRunId: string, candidateRunId: string) {
    const params = new URLSearchParams({ baseline_run_id: baselineRunId, candidate_run_id: candidateRunId })
    return request<{ baseline_run_id: string; candidate_run_id: string; summary: Record<string, unknown>; tests: Record<string, unknown> }>(`/v1/compare?${params.toString()}`)
  },

  createAdjudication(payload: Record<string, unknown>) {
    return request('/v1/adjudications', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  createMitigationExperiment(payload: Record<string, unknown>) {
    return request('/v1/mitigation-experiments', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  generateReport(runId: string) {
    return request<{ run_id: string; markdown: string; path: string }>(`/v1/reports/${runId}/generate`, {
      method: 'POST',
    })
  },

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
}
