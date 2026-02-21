import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  Connection,
  Controls,
  Edge,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeProps,
  Position,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { api } from '../lib/api'
import { loadState, saveState } from '../lib/state'
import type { AttackSummaryPayload, RiskCards, RunOut, Scorecard } from '../lib/types'

type EventRow = {
  id: number
  event_type: string
  step: number
  message?: string
  data?: Record<string, unknown>
  created_at: string
}

type AttackNodeData = {
  label: string
  attackType: string
  total: number
  success: number
  failure: number
  successRate: number
  confidence: number
  severity: Record<string, number>
}

type RootNodeData = {
  label: string
  model: string
  completed: number
  total: number
  status: string
}

type AnalyticsNodeData = {
  label: string
  composite: number
  gatePass: boolean
  riskCount: number
}

type StudioNodeData = {
  label: string
  role: string
  model: string
  description: string
}

function AttackNode({ data }: NodeProps<AttackNodeData>) {
  return (
    <div className="flow-node attack-node">
      <Handle type="target" position={Position.Left} />
      <div className="node-title">{data.label}</div>
      <div className="node-sub">Success {data.success} / {data.total}</div>
      <div className="node-sub">Failure {data.failure}</div>
      <div className="node-risk-bar">
        <span style={{ width: `${Math.min(100, Math.round(data.successRate * 100))}%` }} />
      </div>
      <small>Risk Rate {(data.successRate * 100).toFixed(1)}%</small>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function RootNode({ data }: NodeProps<RootNodeData>) {
  return (
    <div className="flow-node root-node">
      <Handle type="source" position={Position.Right} />
      <div className="node-title">{data.label}</div>
      <div className="node-sub">Model: {data.model || 'unknown'}</div>
      <div className="node-sub">Status: {data.status}</div>
      <div className="node-sub">Progress: {data.completed}/{data.total}</div>
    </div>
  )
}

function AnalyticsNode({ data }: NodeProps<AnalyticsNodeData>) {
  return (
    <div className="flow-node analytics-node">
      <Handle type="target" position={Position.Left} />
      <div className="node-title">{data.label}</div>
      <div className="node-sub">Composite {data.composite.toFixed(1)}</div>
      <div className="node-sub">Gate {data.gatePass ? 'PASS' : 'FAIL'}</div>
      <div className="node-sub">Risk Cards {data.riskCount}</div>
    </div>
  )
}

function StudioRoleNode({ data }: NodeProps<StudioNodeData>) {
  return (
    <div className="flow-node studio-node">
      <Handle type="target" position={Position.Left} />
      <div className="node-title">{data.label}</div>
      <div className="node-sub">Role: {data.role}</div>
      <small>{data.model}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const attackNodeTypes = {
  rootNode: RootNode,
  attackNode: AttackNode,
  analyticsNode: AnalyticsNode,
}

const studioNodeTypes = {
  studioNode: StudioRoleNode,
}

export default function MonitorPage() {
  const persisted = useMemo(() => loadState(), [])
  const [runId, setRunId] = useState(persisted.currentRunId ?? '')
  const [run, setRun] = useState<RunOut | null>(null)
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [attackSummary, setAttackSummary] = useState<AttackSummaryPayload | null>(null)
  const [riskCards, setRiskCards] = useState<RiskCards | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAttackType, setSelectedAttackType] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'attack' | 'studio'>('attack')

  const initialStudioNodes = useMemo<Node<StudioNodeData>[]>(
    () => [
      {
        id: 'trigger',
        type: 'studioNode',
        position: { x: 50, y: 180 },
        data: {
          label: 'Trigger',
          role: 'entrypoint',
          model: 'deterministic',
          description: 'Start attack generation workflow',
        },
      },
      {
        id: 'attacker',
        type: 'studioNode',
        position: { x: 300, y: 80 },
        data: {
          label: 'Attacker Agent',
          role: 'attacker',
          model: 'gpt-4.1-mini',
          description: 'Generate adversarial prompts',
        },
      },
      {
        id: 'critic',
        type: 'studioNode',
        position: { x: 300, y: 280 },
        data: {
          label: 'Critic Agent',
          role: 'critic',
          model: 'gpt-4.1-mini',
          description: 'Strengthen exploit quality',
        },
      },
      {
        id: 'verifier',
        type: 'studioNode',
        position: { x: 570, y: 180 },
        data: {
          label: 'Verifier Agent',
          role: 'verifier',
          model: 'gpt-4.1-mini',
          description: 'Validate plausibility and confidence',
        },
      },
      {
        id: 'analyst',
        type: 'studioNode',
        position: { x: 840, y: 180 },
        data: {
          label: 'Analyst Agent',
          role: 'analyst',
          model: 'gpt-4.1-mini',
          description: 'Tag taxonomy and difficulty',
        },
      },
    ],
    [],
  )

  const initialStudioEdges = useMemo<Edge[]>(
    () => [
      { id: 's1', source: 'trigger', target: 'attacker', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 's2', source: 'trigger', target: 'critic', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 's3', source: 'attacker', target: 'verifier', markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 's4', source: 'critic', target: 'verifier', markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 's5', source: 'verifier', target: 'analyst', markerEnd: { type: MarkerType.ArrowClosed } },
    ],
    [],
  )

  const [studioNodes, setStudioNodes, onStudioNodesChange] = useNodesState(initialStudioNodes)
  const [studioEdges, setStudioEdges, onStudioEdgesChange] = useEdgesState(initialStudioEdges)
  const [selectedStudioNodeId, setSelectedStudioNodeId] = useState<string>('attacker')

  const selectedAttack = useMemo(() => {
    return attackSummary?.attack_types.find((row) => row.attack_type === selectedAttackType) ?? null
  }, [attackSummary, selectedAttackType])

  const selectedStudioNode = useMemo(
    () => studioNodes.find((node) => node.id === selectedStudioNodeId) ?? null,
    [studioNodes, selectedStudioNodeId],
  )

  const attackFlow = useMemo(() => {
    const rows = attackSummary?.attack_types ?? []
    const baseY = 120
    const gapY = 160

    const rootNode: Node<RootNodeData> = {
      id: 'root',
      type: 'rootNode',
      position: { x: 50, y: 260 },
      data: {
        label: 'Target System',
        model: String((run?.summary_metrics?.model as string | undefined) ?? ''),
        completed: run?.completed_attacks ?? 0,
        total: run?.total_attacks ?? 0,
        status: run?.status ?? 'unknown',
      },
      draggable: false,
    }

    const attackNodes: Node<AttackNodeData>[] = rows.map((row, index) => ({
      id: `attack-${row.attack_type}`,
      type: 'attackNode',
      position: { x: 420, y: baseY + index * gapY },
      data: {
        label: row.attack_type.replaceAll('_', ' ').toUpperCase(),
        attackType: row.attack_type,
        total: row.total,
        success: row.success,
        failure: row.failure,
        successRate: row.success_rate,
        confidence: row.avg_confidence,
        severity: row.severity_breakdown,
      },
    }))

    const analyticsNode: Node<AnalyticsNodeData> = {
      id: 'analytics',
      type: 'analyticsNode',
      position: { x: 820, y: 260 },
      data: {
        label: 'Overall Report',
        composite: Number(scorecard?.metrics?.composite_score ?? 0),
        gatePass: Boolean(scorecard?.gates?.pass),
        riskCount: riskCards?.risks.length ?? 0,
      },
      draggable: false,
    }

    const edges: Edge[] = [
      ...attackNodes.map((node) => ({
        id: `e-root-${node.id}`,
        source: 'root',
        target: node.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: run?.status === 'running',
      })),
      ...attackNodes.map((node) => ({
        id: `e-${node.id}-analytics`,
        source: node.id,
        target: 'analytics',
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    ]

    return { nodes: [rootNode, ...attackNodes, analyticsNode], edges }
  }, [attackSummary, riskCards, run, scorecard])

  const refreshAll = useCallback(async () => {
    if (!runId) return
    try {
      const [runRes, scoreRes, summaryRes, riskRes] = await Promise.all([
        api.getRun(runId),
        api.getScorecard(runId).catch(() => null),
        api.getAttackSummary(runId).catch(() => null),
        api.getRiskCards(runId).catch(() => null),
      ])
      setRun(runRes)
      setScorecard(scoreRes)
      setAttackSummary(summaryRes)
      setRiskCards(riskRes)
      saveState({ ...loadState(), currentRunId: runId })

      if (!selectedAttackType && summaryRes?.attack_types?.length) {
        setSelectedAttackType(summaryRes.attack_types[0].attack_type)
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to load run analytics')
    }
  }, [runId, selectedAttackType])

  useEffect(() => {
    if (!runId) return
    setEvents([])
    setError(null)
    setStreaming(true)

    const stop = api.streamRunEvents(
      runId,
      (incoming) => {
        const row = incoming as unknown as EventRow
        setEvents((current) => {
          if (current.some((item) => item.id === row.id)) return current
          return [row, ...current].slice(0, 200)
        })
      },
      () => setStreaming(false),
    )

    void refreshAll()
    const interval = window.setInterval(() => void refreshAll(), 2500)

    return () => {
      stop()
      window.clearInterval(interval)
    }
  }, [runId, refreshAll])

  const onStudioConnect = useCallback(
    (params: Connection) => setStudioEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setStudioEdges],
  )

  const addStudioNode = useCallback(
    (role: string) => {
      const id = `node-${Date.now()}`
      const node: Node<StudioNodeData> = {
        id,
        type: 'studioNode',
        position: { x: 180 + Math.random() * 600, y: 80 + Math.random() * 300 },
        data: {
          label: `${role[0].toUpperCase()}${role.slice(1)} Agent`,
          role,
          model: 'gpt-4.1-mini',
          description: `Custom ${role} role`,
        },
      }
      setStudioNodes((current) => [...current, node])
      setSelectedStudioNodeId(id)
    },
    [setStudioNodes],
  )

  const updateStudioNode = useCallback(
    (patch: Partial<StudioNodeData>) => {
      if (!selectedStudioNodeId) return
      setStudioNodes((current) =>
        current.map((node) =>
          node.id === selectedStudioNodeId
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        ),
      )
    },
    [selectedStudioNodeId, setStudioNodes],
  )

  const exportWorkflowJson = useMemo(
    () => JSON.stringify({ nodes: studioNodes, edges: studioEdges }, null, 2),
    [studioNodes, studioEdges],
  )

  return (
    <section className="stack-lg">
      <div className="panel stack-md">
        <div className="row gap-lg wrap">
          <label className="grow">
            Run ID
            <input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="Paste run id" />
          </label>
          <button type="button" className="primary" onClick={() => void refreshAll()}>
            Refresh
          </button>
          <button type="button" className={activeTab === 'attack' ? 'primary' : 'ghost'} onClick={() => setActiveTab('attack')}>
            Attack Canvas
          </button>
          <button type="button" className={activeTab === 'studio' ? 'primary' : 'ghost'} onClick={() => setActiveTab('studio')}>
            Orchestration Studio
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {activeTab === 'attack' && (
        <div className="canvas-layout panel">
          <div className="report-overlay">
            <h3>Live Overall Report</h3>
            <p>Status: <strong>{run?.status ?? 'unknown'}</strong></p>
            <p>Progress: <strong>{run?.completed_attacks ?? 0}/{run?.total_attacks ?? 0}</strong></p>
            <p>Composite: <strong>{Number(scorecard?.metrics?.composite_score ?? 0).toFixed(1)}</strong></p>
            <p>Gate: <strong>{scorecard?.gates?.pass ? 'PASS' : 'FAIL'}</strong></p>
            <p>Stream: <strong>{streaming ? 'LIVE' : 'CLOSED'}</strong></p>
          </div>

          <div className="flow-canvas">
            <ReactFlow
              nodes={attackFlow.nodes}
              edges={attackFlow.edges}
              nodeTypes={attackNodeTypes}
              onNodeClick={(_, node) => {
                if (node.id.startsWith('attack-')) {
                  const attackType = (node.data as AttackNodeData).attackType
                  setSelectedAttackType(attackType)
                }
              }}
              fitView
            >
              <Background color="rgba(255,255,255,0.08)" gap={20} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>

          <aside className="flow-details">
            <h3>Node Details</h3>
            {!selectedAttack && <p className="caption">Click an attack node to inspect analytics.</p>}
            {selectedAttack && (
              <div className="stack-sm">
                <p><strong>{selectedAttack.attack_type.replaceAll('_', ' ')}</strong></p>
                <p>Total: {selectedAttack.total}</p>
                <p>Success: {selectedAttack.success}</p>
                <p>Failure: {selectedAttack.failure}</p>
                <p>Success Rate: {(selectedAttack.success_rate * 100).toFixed(2)}%</p>
                <p>Avg Confidence: {(selectedAttack.avg_confidence * 100).toFixed(1)}%</p>
                <div>
                  <p className="caption">Severity Breakdown</p>
                  <ul>
                    {Object.entries(selectedAttack.severity_breakdown).map(([key, value]) => (
                      <li key={key}>{key}: {value}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="stack-sm">
              <h3>Recent Events</h3>
              <div className="events compact">
                {events.slice(0, 12).map((event) => (
                  <article key={event.id} className="event-row">
                    <div className="row between">
                      <strong>{event.event_type}</strong>
                      <span>step {event.step}</span>
                    </div>
                    {event.message && <p>{event.message}</p>}
                  </article>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {activeTab === 'studio' && (
        <div className="canvas-layout panel">
          <div className="studio-toolbar">
            <button type="button" className="ghost" onClick={() => addStudioNode('attacker')}>+ Attacker</button>
            <button type="button" className="ghost" onClick={() => addStudioNode('critic')}>+ Critic</button>
            <button type="button" className="ghost" onClick={() => addStudioNode('verifier')}>+ Verifier</button>
            <button type="button" className="ghost" onClick={() => addStudioNode('analyst')}>+ Analyst</button>
          </div>

          <div className="flow-canvas">
            <ReactFlow
              nodes={studioNodes}
              edges={studioEdges}
              nodeTypes={studioNodeTypes}
              onNodesChange={onStudioNodesChange}
              onEdgesChange={onStudioEdgesChange}
              onConnect={onStudioConnect}
              onNodeClick={(_, node) => setSelectedStudioNodeId(node.id)}
              fitView
            >
              <Background color="rgba(255,255,255,0.08)" gap={20} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>

          <aside className="flow-details">
            <h3>Workflow Inspector</h3>
            {!selectedStudioNode && <p className="caption">Select a workflow node to configure it.</p>}
            {selectedStudioNode && (
              <div className="stack-sm">
                <label>
                  Label
                  <input
                    value={selectedStudioNode.data.label}
                    onChange={(event) => updateStudioNode({ label: event.target.value })}
                  />
                </label>
                <label>
                  Role
                  <input
                    value={selectedStudioNode.data.role}
                    onChange={(event) => updateStudioNode({ role: event.target.value })}
                  />
                </label>
                <label>
                  Model
                  <input
                    value={selectedStudioNode.data.model}
                    onChange={(event) => updateStudioNode({ model: event.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows={4}
                    value={selectedStudioNode.data.description}
                    onChange={(event) => updateStudioNode({ description: event.target.value })}
                  />
                </label>
              </div>
            )}

            <div className="stack-sm">
              <h3>Workflow JSON</h3>
              <pre className="json studio-json">{exportWorkflowJson}</pre>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}
