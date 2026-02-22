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
    studioNodes: [] as any[],
    studioEdges: [] as any[],
    eventsOpen: false,
  } as any,
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
    workspaceStateMock.sessionId = null
    workspaceStateMock.configProfileId = null
    workspaceStateMock.currentRunId = null
    workspaceStateMock.baselineRunId = null
    workspaceStateMock.studioNodes = []
    workspaceStateMock.studioEdges = []
    workspaceStateMock.eventsOpen = false
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
    workspaceStateMock.studioNodes = [
      {
        id: 'studio-attacker',
        type: 'studioRole',
        position: { x: 120, y: 240 },
        data: {
          role: 'attacker',
          label: 'Attacker Node',
          model: 'gpt-4.1',
          enabled: true,
          runtime_provider: 'openai',
          api_key_ref: 'cred-openai',
          base_url: 'https://api.openai.com/v1',
          instruction_file: 'attacker.md',
          instructions: 'Generate targeted probes',
          auth_headers: { 'x-tenant': 'demo' },
          extra: { temperature: 0.1 },
        },
      },
    ]
    renderConfigPanel()
    await waitFor(() => expect(apiMock.listTestAgentsCatalog).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: /launch run/i }))
    await waitFor(() => expect(apiMock.createConfigProfile).toHaveBeenCalledTimes(1))

    const payload = apiMock.createConfigProfile.mock.calls[0][0]
    expect(payload.target_config.agent_id).toBe('refund')
    expect(payload.target_config.agent_url).toBeNull()
    expect(payload.benchmark_config.multi_turn).toEqual(
      expect.objectContaining({
        enabled: true,
        phases: 3,
        context_window_chars: 320,
      }),
    )
    expect(payload.benchmark_config.afk_orchestration.threading.strategy).toBe('per_attack_type')
    expect(payload.benchmark_config.afk_orchestration.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'attacker',
          model: 'gpt-4.1',
          runtime_provider: 'openai',
          api_key_ref: 'cred-openai',
          base_url: 'https://api.openai.com/v1',
          instruction_file: 'attacker.md',
          instructions: 'Generate targeted probes',
        }),
      ]),
    )
  })

  it('hydrates studio node llm settings from saved profile orchestration', async () => {
    workspaceStateMock.sessionId = 'session-existing'
    workspaceStateMock.configProfileId = 'profile-existing'
    apiMock.listConfigProfiles.mockResolvedValue({
      profiles: [
        {
          id: 'profile-existing',
          session_id: 'session-existing',
          name: 'finance-profile',
          strictness_mode: 'balanced',
          target_config: {
            target_type: 'agent_http',
            model: 'gpt-4.1-mini',
            agent_id: 'refund',
            agent_name: 'refund-agent',
            agent_description: 'refund guard',
          },
          benchmark_config: {
            taxonomy: ['prompt_injection'],
            curated_ratio: 0.6,
            seed: 42,
            agentic_attacking: true,
            agentic_provider: 'afk_live',
            agentic_model: 'gpt-4.1-mini',
            afk_orchestration: {
              model: 'gpt-4.1-mini',
              roles: [
                {
                  name: 'attacker',
                  enabled: true,
                  model: 'gpt-4.1',
                  runtime_provider: 'openai',
                  api_key_ref: 'cred-openai',
                  base_url: 'https://api.openai.com/v1',
                  instruction_file: 'attacker.md',
                  instructions: 'Probe refund edge cases',
                  auth_headers: { 'x-tenant': 'risk' },
                  extra: { temperature: 0.2 },
                },
              ],
              graph: {
                nodes: [{ id: 'attacker' }],
                edges: [],
              },
              execution_order: ['attacker'],
            },
          },
          scoring_config: {
            strictness_mode: 'balanced',
            active_adjudication: true,
            gate_thresholds: { composite_min: 70 },
          },
          runtime_config: {
            preset: 'quick',
            max_concurrency: 8,
            budget_usd: 5,
            live_mode: false,
          },
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    })

    renderConfigPanel()

    await waitFor(() => {
      const actions = dispatchMock.mock.calls.map((call) => call[0])
      expect(actions.some((action) => action?.type === 'SET_STUDIO_GRAPH')).toBe(true)
    })

    const graphAction = dispatchMock.mock.calls
      .map((call) => call[0])
      .find((action) => action?.type === 'SET_STUDIO_GRAPH')
    const attackerNode = graphAction.nodes.find((node: any) => node.data.role === 'attacker')
    expect(attackerNode).toBeDefined()
    expect(attackerNode.data.model).toBe('gpt-4.1')
    expect(attackerNode.data.runtime_provider).toBe('openai')
    expect(attackerNode.data.api_key_ref).toBe('cred-openai')
    expect(attackerNode.data.base_url).toBe('https://api.openai.com/v1')
  })

  it('auto-saves a new profile when existing profile mode is dirty', async () => {
    const user = userEvent.setup()
    workspaceStateMock.sessionId = 'session-existing'
    workspaceStateMock.configProfileId = 'profile-existing'
    apiMock.listConfigProfiles.mockResolvedValue({
      profiles: [
        {
          id: 'profile-existing',
          session_id: 'session-existing',
          name: 'saved-profile',
          strictness_mode: 'balanced',
          target_config: {
            target_type: 'agent_http',
            model: 'ollama_chat/gpt-oss:20b',
            agent_id: 'refund',
            agent_name: 'financial-agent',
            agent_description: 'Financial assistant agent under fraud-resilience testing.',
          },
          benchmark_config: {
            taxonomy: ['prompt_injection', 'jailbreak', 'hallucination'],
            curated_ratio: 0.6,
            seed: 42,
            agentic_attacking: true,
            afk_orchestration: {},
          },
          scoring_config: { strictness_mode: 'balanced' },
          runtime_config: { preset: 'quick', max_concurrency: 8, budget_usd: 5, live_mode: false },
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    })

    renderConfigPanel()
    await waitFor(() => expect(apiMock.listConfigProfiles).toHaveBeenCalled())

    // Change scenario taxonomy => dirty profile while existing mode remains selected
    await user.click(screen.getByText('Data Exfiltration'))
    await user.click(screen.getByRole('button', { name: /launch run/i }))

    await waitFor(() => expect(apiMock.createConfigProfile).toHaveBeenCalledTimes(1))
  })
})
