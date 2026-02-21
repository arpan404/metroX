import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AnalyticsPage from './AnalyticsPage'

vi.mock('../lib/api', () => ({
  api: {
    getScorecard: vi.fn(async () => ({
      run_id: 'r-1',
      metrics: { composite_score: 81.2, asr: 0.2 },
      gates: { pass: true, reasons: [] },
      ci: {},
    })),
    getRiskCards: vi.fn(async () => ({
      run_id: 'r-1',
      risks: [
        {
          failure_type: 'hallucination',
          risk_probability: 0.31,
          uncertainty_band: { low: 0.2, high: 0.4 },
          top_drivers: ['retrieval_avg_score'],
          sample_size: 10,
        },
      ],
    })),
    getClusters: vi.fn(async () => ({ run_id: 'r-1', clusters: [] })),
    getDrift: vi.fn(async () => ({ run_id: 'r-1', drift_signals: [], change_points: [] })),
    getCostSummary: vi.fn(async () => ({
      run_id: 'r-1',
      totals: { prompt_tokens: 100, completion_tokens: 50, provider_cost: 0.01, estimated_cost: 0.02, effective_cost: 0.01 },
      breakdown: {},
      sources: { provider: 1, fallback: 0, mixed: 0 },
      cost_gate: { pass: true },
    })),
    getCostTimeseries: vi.fn(async () => ({ run_id: 'r-1', points: [] })),
    getExecutionSlices: vi.fn(async () => ({
      run_id: 'r-1',
      slices: [
        {
          attack_type: 'prompt_injection',
          provider_name: 'synthetic',
          model: 'gpt-4.1-mini',
          count: 3,
          avg_latency_ms: 120,
          effective_cost_usd: 0.01,
        },
      ],
    })),
    getInference: vi.fn(async () => ({ run_id: 'r-1', tests: [] })),
    getCalibration: vi.fn(async () => ({ run_id: 'r-1', bins: [], summaries: [] })),
    compareRuns: vi.fn(async () => ({ baseline_run_id: 'b', candidate_run_id: 'c', summary: {}, tests: {} })),
    generateReport: vi.fn(async () => ({ run_id: 'r-1', markdown: '# report', path: 'reports/r-1.md' })),
  },
}))

vi.mock('../lib/state', () => ({
  loadState: () => ({ currentRunId: 'r-1' }),
}))

describe('AnalyticsPage', () => {
  it('loads analytics for a run', async () => {
    render(<AnalyticsPage />)

    await userEvent.click(screen.getByRole('button', { name: /load analytics/i }))

    await waitFor(() => {
      expect(screen.getByText(/scorecard/i)).toBeInTheDocument()
      expect(screen.getByText(/risk cards/i)).toBeInTheDocument()
      expect(screen.getByText(/81.2000/i)).toBeInTheDocument()
    })
  })
})
