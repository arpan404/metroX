import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dispatchMock, workspaceStateMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  workspaceStateMock: {
    canvasMode: 'evaluate',
    selectedAttackType: null,
    selectedNodeId: null,
    activePanel: null,
    runData: {
      id: 'run-1',
      status: 'completed',
      preset: 'standard',
      total_attacks: 10,
      completed_attacks: 10,
      summary_metrics: {},
    },
    attackSummary: {
      run_id: 'run-1',
      attack_types: [
        {
          attack_type: 'prompt_injection',
          total: 10,
          success: 2,
          failure: 8,
          success_rate: 0.2,
          avg_confidence: 0.8,
          severity_breakdown: { low: 10 },
        },
      ],
    },
    scorecard: {
      run_id: 'run-1',
      metrics: { composite_score: 90 },
      gates: { pass: true, reasons: [] },
      ci: {},
    },
    riskCards: { run_id: 'run-1', risks: [] },
    studioNodes: [],
    studioEdges: [],
  } as any,
}))

vi.mock('@/stores/workspace-store', () => ({
  useWorkspace: () => ({
    state: workspaceStateMock,
    dispatch: dispatchMock,
  }),
}))

vi.mock('reactflow', () => {
  const MockFlow = (props: any) => (
    <div>
      <button onClick={() => props.onNodeClick?.({}, { id: 'attack-prompt_injection', type: 'attack' })}>attack-node</button>
      <button onClick={() => props.onNodeClick?.({}, { id: 'metrics-summary', type: 'metrics' })}>metrics-node</button>
      <button onClick={() => props.onPaneClick?.()}>pane-click</button>
    </div>
  )
  return {
    __esModule: true,
    default: MockFlow,
    Background: () => <div />,
    Controls: () => <div />,
    MiniMap: () => <div />,
    Panel: ({ children }: any) => <div>{children}</div>,
    BackgroundVariant: { Dots: 'dots' },
    Position: { Left: 'left', Right: 'right' },
    useNodesState: () => [[], vi.fn(), vi.fn()],
    useEdgesState: () => [[], vi.fn(), vi.fn()],
    addEdge: (_connection: any, edges: any[]) => edges,
  }
})

import { Canvas } from './Canvas'

describe('Canvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workspaceStateMock.selectedAttackType = null
  })

  it('auto-selects first attack node when none is selected', async () => {
    render(<Canvas />)

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'SELECT_NODE',
        nodeId: 'attack-prompt_injection',
        attackType: 'prompt_injection',
      })
    })
  })

  it('pane click dispatches node clear without forcing attackType reset', async () => {
    const user = userEvent.setup()
    render(<Canvas />)

    await user.click(screen.getByRole('button', { name: 'pane-click' }))

    expect(dispatchMock).toHaveBeenCalledWith({ type: 'SELECT_NODE', nodeId: null })
  })

  it('opens analytics panel when metrics node is clicked', async () => {
    const user = userEvent.setup()
    render(<Canvas />)

    await user.click(screen.getByRole('button', { name: 'metrics-node' }))

    expect(dispatchMock).toHaveBeenCalledWith({ type: 'OPEN_PANEL', panel: 'analytics' })
  })
})
