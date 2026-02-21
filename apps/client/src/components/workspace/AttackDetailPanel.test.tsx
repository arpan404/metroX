import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, beforeEach, vi } from 'vitest'

const { dispatchMock, workspaceStateMock, apiMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  workspaceStateMock: {
    activePanel: 'attack-detail',
    selectedAttackType: 'prompt_injection',
    currentRunId: 'run-1',
    attackSummary: {
      run_id: 'run-1',
      attack_types: [
        {
          attack_type: 'prompt_injection',
          total: 10,
          success: 2,
          failure: 8,
          success_rate: 0.2,
          avg_confidence: 0.82,
          avg_disagreement: 0.14,
          avg_uncertainty: 0.11,
          severity_breakdown: { critical: 0, high: 1, medium: 1, low: 8 },
        },
      ],
    },
    nodeTelemetry: {
      run_id: 'run-1',
      nodes: [
        {
          attack_type: 'prompt_injection',
          total: 10,
          success: 2,
          failure: 8,
          avg_latency_ms: 1200,
          cost_usd: 0.12,
          effective_cost_usd: 0.12,
          tool_events: 4,
          policy_decisions: 2,
          policy_events: 2,
        },
      ],
    },
    detectorVotes: [
      {
        id: 'vote-1',
        execution_id: 'exec-1',
        attack_type: 'prompt_injection',
        detector_name: 'rule',
        failure_flags: { prompt_injection_success: true },
        confidence: 0.9,
        evidence: {},
        latency_ms: 2,
        created_at: new Date().toISOString(),
      },
    ],
  } as any,
  apiMock: {
    getDetectorVotesSummary: vi.fn(),
    createAdjudication: vi.fn(),
  },
}))

vi.mock('@/stores/workspace-store', () => ({
  useWorkspace: () => ({
    state: workspaceStateMock,
    dispatch: dispatchMock,
  }),
}))

vi.mock('@/lib/api', () => ({
  api: apiMock,
}))

import { AttackDetailPanel } from './AttackDetailPanel'

describe('AttackDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.getDetectorVotesSummary.mockResolvedValue({
      run_id: 'run-1',
      attack_type: 'prompt_injection',
      totals: {
        votes: 2,
        executions: 1,
        detectors: 2,
        fail_votes: 1,
        pass_votes: 1,
        avg_confidence: 0.6,
        avg_latency_ms: 2.6,
      },
      detectors: [
        {
          detector_name: 'rule',
          votes: 1,
          fail_votes: 1,
          pass_votes: 0,
          fail_rate: 1,
          avg_confidence: 0.9,
          avg_latency_ms: 2,
          failure_key_rates: { prompt_injection_success: 1, hallucination: 0, jailbreak_success: 0, tool_misuse: 0, toxicity: 0 },
        },
        {
          detector_name: 'retrieval_consistency',
          votes: 1,
          fail_votes: 0,
          pass_votes: 1,
          fail_rate: 0,
          avg_confidence: 0.3,
          avg_latency_ms: 3.2,
          failure_key_rates: { prompt_injection_success: 0, hallucination: 0, jailbreak_success: 0, tool_misuse: 0, toxicity: 0 },
        },
      ],
      consensus: { avg_disagreement: 0.14, avg_uncertainty: 0.11 },
      raw_sample: [
        {
          id: 'vote-1',
          execution_id: 'exec-1',
          attack_type: 'prompt_injection',
          detector_name: 'rule',
          failure_flags: { prompt_injection_success: true },
          confidence: 0.9,
          evidence: {},
          latency_ms: 2,
          created_at: new Date().toISOString(),
        },
      ],
    })
  })

  it('renders scoped detector summary in detector tab', async () => {
    const user = userEvent.setup()
    render(<AttackDetailPanel />)

    await waitFor(() => expect(apiMock.getDetectorVotesSummary).toHaveBeenCalledWith('run-1', 'prompt_injection', 200))

    await user.click(screen.getByRole('tab', { name: 'Detectors' }))

    expect(await screen.findByText('retrieval_consistency')).toBeInTheDocument()
    expect(screen.getByText('rule')).toBeInTheDocument()
  })

  it('renders raw votes and telemetry with numeric cost', async () => {
    const user = userEvent.setup()
    render(<AttackDetailPanel />)

    await waitFor(() => expect(apiMock.getDetectorVotesSummary).toHaveBeenCalled())

    await user.click(screen.getByRole('tab', { name: 'Raw Votes' }))
    expect(await screen.findByText(/fail \(prompt injection success\)/i)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Telemetry' }))
    expect(await screen.findByText('$0.1200')).toBeInTheDocument()
  })
})
