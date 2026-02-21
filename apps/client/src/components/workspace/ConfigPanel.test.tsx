import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const { apiMock, dispatchMock, actionsMock, workspaceStateMock } = vi.hoisted(() => ({
  apiMock: {
    listTestAgentsCatalog: vi.fn(),
    listSessions: vi.fn(),
    listConfigProfiles: vi.fn(),
    listRuns: vi.fn(),
    createSession: vi.fn(),
    createConfigProfile: vi.fn(),
    createRun: vi.fn(),
  },
  dispatchMock: vi.fn(),
  actionsMock: {
    startStreaming: vi.fn(),
    fetchRunData: vi.fn(),
  },
  workspaceStateMock: {
    activePanel: 'config',
    sessionId: null,
    configProfileId: null,
    currentRunId: null,
    baselineRunId: null,
    studioNodes: [],
    studioEdges: [],
    eventsOpen: false,
  },
}))

vi.mock('@/lib/api', () => ({
  api: apiMock,
}))

vi.mock('@/stores/workspace-store', () => ({
  useWorkspace: () => ({
    state: workspaceStateMock,
    dispatch: dispatchMock,
    actions: actionsMock,
  }),
}))

import { ConfigPanel } from './ConfigPanel'

const renderConfigPanel = () =>
  render(
    <TooltipProvider>
      <ConfigPanel />
    </TooltipProvider>,
  )

describe('ConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listTestAgentsCatalog.mockResolvedValue({
      base_url: 'http://127.0.0.1:8001',
      source: 'runtime_api',
      agents: [
        { id: 'refund', name: 'Refund', chat_url: 'http://127.0.0.1:8001/agents/refund/chat' },
        { id: 'loan', name: 'Loan', chat_url: 'http://127.0.0.1:8001/agents/loan/chat' },
      ],
    })
    apiMock.listSessions.mockResolvedValue({
      sessions: [{ id: 'session-existing', name: 'Existing Session', owner: 'risk-team', created_at: new Date().toISOString() }],
      total: 1,
    })
    apiMock.listConfigProfiles.mockResolvedValue({ profiles: [], total: 0 })
    apiMock.listRuns.mockResolvedValue({ runs: [], total: 0, status_counts: {} })
    apiMock.createSession.mockResolvedValue({ id: 'session-1' })
    apiMock.createConfigProfile.mockResolvedValue({ id: 'profile-1' })
    apiMock.createRun.mockResolvedValue({ id: 'run-1' })
  })

  it('loads test-agents catalog and shows resolved endpoint', async () => {
    renderConfigPanel()

    await waitFor(() => {
      expect(apiMock.listTestAgentsCatalog).toHaveBeenCalledTimes(1)
    })

    const endpointInput = await screen.findByDisplayValue('http://127.0.0.1:8001/agents/refund/chat')
    expect(endpointInput).toHaveAttribute('readonly')
  })

  it('does not show editable agent URL input', async () => {
    renderConfigPanel()
    await waitFor(() => expect(apiMock.listTestAgentsCatalog).toHaveBeenCalled())
    expect(screen.queryByText('Agent URL')).not.toBeInTheDocument()
    expect(screen.getByText('Resolved Endpoint')).toBeInTheDocument()
  })

  it('launch payload includes agent_id and per_attack_type threading', async () => {
    const user = userEvent.setup()
    renderConfigPanel()
    await waitFor(() => expect(apiMock.listTestAgentsCatalog).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: /launch run/i }))
    await waitFor(() => expect(apiMock.createConfigProfile).toHaveBeenCalledTimes(1))

    const payload = apiMock.createConfigProfile.mock.calls[0][0]
    expect(payload.target_config.agent_id).toBe('refund')
    expect(payload.target_config.agent_url).toBeNull()
    expect(payload.benchmark_config.afk_orchestration.threading.strategy).toBe('per_attack_type')
  })
})
