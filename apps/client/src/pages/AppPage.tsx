import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MarkerType,
  MiniMap,
  Node,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import {
  Swords,
  Workflow,
  Rocket,
  FileText,
  Copy,
  Trash2,
} from 'lucide-react'

import { api } from '@/lib/api'
import { loadState, saveState } from '@/lib/state'
import type {
  AttackSummaryPayload,
  NodeTelemetryPayload,
  RiskCards,
  RunOut,
  RunTelemetryPayload,
  Scorecard,
} from '@/lib/types'

import {
  attackNodeTypes,
  type AttackNodeData,
  type RootNodeData,
  type AnalyticsNodeData,
} from '@/components/canvas/AttackFlowNodes'
import {
  studioNodeTypes,
  type StudioNodeData,
} from '@/components/canvas/StudioNodes'
import { BottomActionBar } from '@/components/canvas/BottomActionBar'
import { CanvasBackground } from '@/components/canvas/CanvasBackground'
import { FloatingPanel } from '@/components/canvas/FloatingPanel'
import { FloatingToolbar, type ToolbarMode } from '@/components/canvas/FloatingToolbar'
import { GlassPanel } from '@/components/canvas/GlassPanel'
import { CommandPalette } from '@/components/CommandPalette'
import { useOnboardingContext } from '@/components/onboarding/OnboardingProvider'
import { SpotlightWalkthrough } from '@/components/onboarding/SpotlightWalkthrough'

import { ConfigPanel } from '@/components/panels/ConfigPanel'
import { AnalyticsPanel } from '@/components/panels/AnalyticsPanel'
import { SettingsPanel } from '@/components/panels/SettingsPanel'
import { AttackDetailPanel } from '@/components/panels/AttackDetailPanel'
import { StudioInspectorPanel } from '@/components/panels/StudioInspectorPanel'
import { EventsDrawer } from '@/components/panels/EventsDrawer'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type PanelState = {
  left: 'config' | null
  right: 'attack-detail' | 'studio-inspector' | 'analytics' | 'settings' | null
  bottom: 'events' | null
}

type EventRow = {
  id: number
  event_type: string
  step: number
  message?: string
  data?: Record<string, unknown>
  created_at: string
}

type ContextMenuState = {
  x: number
  y: number
  nodeId: string | null
  nodeType: 'attack' | 'studio' | null
} | null

/* ------------------------------------------------------------------ */
/*  AppPage                                                           */
/* ------------------------------------------------------------------ */

export function AppPage() {
  /* ---- panel state ---- */
  const [panels, setPanels] = useState<PanelState>({ left: null, right: null, bottom: null })
  const [commandOpen, setCommandOpen] = useState(false)
  const [canvasMode, setCanvasMode] = useState<'attack' | 'studio'>('attack')

  /* ---- onboarding ---- */
  const onboarding = useOnboardingContext()
  useEffect(() => {
    if (onboarding.completed) return
    const timer = setTimeout(() => {
      const firstTarget = document.querySelector('[data-onboarding]')
      if (firstTarget) onboarding.start()
    }, 1500)
    return () => clearTimeout(timer)
  }, [onboarding.completed])

  /* ---- persisted & core state ---- */
  const persisted = useMemo(() => loadState(), [])
  const [runId, setRunId] = useState(persisted.currentRunId ?? '')
  const [run, setRun] = useState<RunOut | null>(null)
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [attackSummary, setAttackSummary] = useState<AttackSummaryPayload | null>(null)
  const [riskCards, setRiskCards] = useState<RiskCards | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [streaming, setStreaming] = useState(false)
  const [telemetry, setTelemetry] = useState<RunTelemetryPayload | null>(null)
  const [nodeTelemetry, setNodeTelemetry] = useState<NodeTelemetryPayload | null>(null)
  const [selectedAttackType, setSelectedAttackType] = useState<string | null>(null)

  /* ---- studio state ---- */
  const initialStudioNodes = useMemo<Node<StudioNodeData>[]>(
    () => [
      { id: 'trigger', type: 'studioNode', position: { x: 50, y: 180 }, data: { label: 'Trigger', role: 'entrypoint', model: 'deterministic', description: 'Start attack generation workflow' } },
      { id: 'attacker', type: 'studioNode', position: { x: 300, y: 80 }, data: { label: 'Attacker Agent', role: 'attacker', model: 'gpt-4.1-mini', description: 'Generate adversarial prompts' } },
      { id: 'critic', type: 'studioNode', position: { x: 300, y: 280 }, data: { label: 'Critic Agent', role: 'critic', model: 'gpt-4.1-mini', description: 'Strengthen exploit quality' } },
      { id: 'verifier', type: 'studioNode', position: { x: 570, y: 180 }, data: { label: 'Verifier Agent', role: 'verifier', model: 'gpt-4.1-mini', description: 'Validate plausibility and confidence' } },
      { id: 'analyst', type: 'studioNode', position: { x: 840, y: 180 }, data: { label: 'Analyst Agent', role: 'analyst', model: 'gpt-4.1-mini', description: 'Tag taxonomy and difficulty' } },
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
  const [selectedStudioNodeId, setSelectedStudioNodeId] = useState<string | null>(null)

  /* ---- context menu state ---- */
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  /* ---- derived ---- */
  const selectedAttack = useMemo(
    () => attackSummary?.attack_types.find((r) => r.attack_type === selectedAttackType) ?? null,
    [attackSummary, selectedAttackType],
  )

  const selectedStudioNode = useMemo(
    () => studioNodes.find((n) => n.id === selectedStudioNodeId) ?? null,
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
      ...attackNodes.map((n) => ({
        id: `e-root-${n.id}`,
        source: 'root',
        target: n.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: run?.status === 'running',
      })),
      ...attackNodes.map((n) => ({
        id: `e-${n.id}-analytics`,
        source: n.id,
        target: 'analytics',
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    ]

    return { nodes: [rootNode, ...attackNodes, analyticsNode], edges }
  }, [attackSummary, riskCards, run, scorecard])

  const exportWorkflowJson = useMemo(
    () => JSON.stringify({ nodes: studioNodes, edges: studioEdges }, null, 2),
    [studioNodes, studioEdges],
  )

  /* ---- data fetching ---- */
  const refreshAll = useCallback(async () => {
    if (!runId) return
    try {
      const [runRes, scoreRes, summaryRes, riskRes, telemetryRes, nodeTelemetryRes] = await Promise.all([
        api.getRun(runId),
        api.getScorecard(runId).catch(() => null),
        api.getAttackSummary(runId).catch(() => null),
        api.getRiskCards(runId).catch(() => null),
        api.getRunTelemetry(runId).catch(() => null),
        api.getNodeTelemetry(runId).catch(() => null),
      ])
      setRun(runRes)
      setScorecard(scoreRes)
      setAttackSummary(summaryRes)
      setRiskCards(riskRes)
      setTelemetry(telemetryRes)
      setNodeTelemetry(nodeTelemetryRes)
      saveState({ ...loadState(), currentRunId: runId })
      if (!selectedAttackType && summaryRes?.attack_types?.length) {
        setSelectedAttackType(summaryRes.attack_types[0].attack_type)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load run data')
    }
  }, [runId, selectedAttackType])

  /* ---- streaming ---- */
  useEffect(() => {
    if (!runId) return
    setEvents([])
    setStreaming(true)
    let receivedAny = false

    let stop = api.streamRunEventsWs(
      runId,
      (incoming) => {
        receivedAny = true
        const row = incoming as unknown as EventRow
        setEvents((cur) => {
          if (cur.some((e) => e.id === row.id)) return cur
          return [row, ...cur].slice(0, 200)
        })
      },
      () => setStreaming(false),
    )

    const wsFallback = window.setTimeout(() => {
      if (receivedAny) return
      stop()
      stop = api.streamRunEvents(
        runId,
        (incoming) => {
          const row = incoming as unknown as EventRow
          setEvents((cur) => {
            if (cur.some((e) => e.id === row.id)) return cur
            return [row, ...cur].slice(0, 200)
          })
        },
        () => setStreaming(false),
      )
    }, 1800)

    void refreshAll()
    const interval = window.setInterval(() => void refreshAll(), 2500)

    return () => {
      stop()
      window.clearTimeout(wsFallback)
      window.clearInterval(interval)
    }
  }, [runId, refreshAll])

  /* ---- panel helpers ---- */
  const handleModeChange = useCallback((mode: ToolbarMode) => {
    if (mode === 'canvas') {
      setPanels({ left: null, right: null, bottom: null })
    } else if (mode === 'config') {
      setPanels((p) => ({ ...p, left: p.left === 'config' ? null : 'config' }))
    } else if (mode === 'analytics') {
      setPanels((p) => ({ ...p, right: p.right === 'analytics' ? null : 'analytics' }))
    } else if (mode === 'settings') {
      setPanels((p) => ({ ...p, right: p.right === 'settings' ? null : 'settings' }))
    } else if (mode === 'attack-detail') {
      setPanels((p) => ({ ...p, right: p.right === 'attack-detail' ? null : 'attack-detail' }))
    }
  }, [])

  const activeToolbarMode: ToolbarMode = useMemo(() => {
    if (panels.left === 'config') return 'config'
    if (panels.right === 'analytics') return 'analytics'
    if (panels.right === 'settings') return 'settings'
    return 'canvas'
  }, [panels])

  /* ---- studio callbacks ---- */
  const onStudioConnect = useCallback(
    (params: Connection) =>
      setStudioEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
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
      setStudioNodes((cur) => [...cur, node])
      setSelectedStudioNodeId(id)
    },
    [setStudioNodes],
  )

  const updateStudioNode = useCallback(
    (patch: Partial<StudioNodeData>) => {
      if (!selectedStudioNodeId) return
      setStudioNodes((cur) =>
        cur.map((n) =>
          n.id === selectedStudioNodeId
            ? { ...n, data: { ...n.data, ...patch } }
            : n,
        ),
      )
    },
    [selectedStudioNodeId, setStudioNodes],
  )

  const deleteStudioNode = useCallback(
    (nodeId: string) => {
      setStudioNodes((cur) => cur.filter((n) => n.id !== nodeId))
      setStudioEdges((cur) => cur.filter((e) => e.source !== nodeId && e.target !== nodeId))
      if (selectedStudioNodeId === nodeId) setSelectedStudioNodeId(null)
    },
    [setStudioNodes, setStudioEdges, selectedStudioNodeId],
  )

  const handleRunLaunched = useCallback((newRunId: string) => {
    setRunId(newRunId)
    setPanels((p) => ({ ...p, left: null }))
  }, [])

  /* ---- close context menu on outside click ---- */
  useEffect(() => {
    if (!contextMenu) return
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  const isAttack = canvasMode === 'attack'

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <CanvasBackground>
      {/* ---- Toolbar ---- */}
      <FloatingToolbar
        activeMode={activeToolbarMode}
        onModeChange={handleModeChange}
        onCommandPalette={() => setCommandOpen(true)}
        runId={runId}
        onRunIdChange={setRunId}
        onRefresh={() => void refreshAll()}
        canvasMode={canvasMode}
        onCanvasModeChange={(mode) => {
          setCanvasMode(mode)
          setPanels((p) => ({ ...p, right: null }))
        }}
      />

      {/* ---- Command Palette ---- */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onModeChange={handleModeChange}
        onReplayTour={() => {
          onboarding.reset()
          onboarding.start()
        }}
      />

      {/* ---- Canvas area ---- */}
      <div
        className="absolute inset-0 pt-12"
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null, nodeType: null })
        }}
      >
        {isAttack ? (
          <ReactFlow
            className="h-full w-full"
            nodes={attackFlow.nodes}
            edges={attackFlow.edges}
            nodeTypes={attackNodeTypes}
            onNodeClick={(_, node) => {
              if (node.id.startsWith('attack-')) {
                const attackType = (node.data as AttackNodeData).attackType
                setSelectedAttackType(attackType)
                setPanels((p) => ({ ...p, right: 'attack-detail' }))
              }
              if (node.id === 'analytics') {
                setPanels((p) => ({ ...p, right: 'analytics' }))
              }
            }}
            onNodeContextMenu={(e, node) => {
              e.preventDefault()
              if (node.id.startsWith('attack-')) {
                setContextMenu({ x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY, nodeId: node.id, nodeType: 'attack' })
              }
            }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
            <Controls position="bottom-left" />
            <MiniMap
              className="hidden sm:block"
              pannable
              zoomable
              nodeColor={(node) => {
                if (node.type === 'rootNode') return '#818cf8'
                if (node.type === 'attackNode') {
                  const d = node.data as AttackNodeData
                  return d.successRate > 0.5 ? '#f87171' : '#34d399'
                }
                if (node.type === 'analyticsNode') return '#34d399'
                return '#475569'
              }}
              maskColor="rgba(130, 165, 235, 0.10)"
              style={{
                background: 'rgba(10, 14, 26, 0.88)',
                border: '1px solid rgba(171, 187, 214, 0.16)',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            />
          </ReactFlow>
        ) : (
          <ReactFlow
            className="h-full w-full"
            nodes={studioNodes}
            edges={studioEdges}
            nodeTypes={studioNodeTypes}
            onNodesChange={onStudioNodesChange}
            onEdgesChange={onStudioEdgesChange}
            onConnect={onStudioConnect}
            onNodeClick={(_, node) => {
              setSelectedStudioNodeId(node.id)
              setPanels((p) => ({ ...p, right: 'studio-inspector' }))
            }}
            onNodeContextMenu={(e, node) => {
              e.preventDefault()
              setContextMenu({ x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY, nodeId: node.id, nodeType: 'studio' })
            }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
            <Controls position="bottom-left" />
            <MiniMap
              className="hidden sm:block"
              pannable
              zoomable
              nodeColor={() => '#818cf8'}
              maskColor="rgba(130, 165, 235, 0.10)"
              style={{
                background: 'rgba(10, 14, 26, 0.88)',
                border: '1px solid rgba(171, 187, 214, 0.16)',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            />
          </ReactFlow>
        )}
      </div>

      {/* ---- Custom context menu ---- */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 100,
            minWidth: '180px',
            background: 'rgba(12,12,18,0.96)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
            padding: '4px',
            backdropFilter: 'blur(16px)',
          }}
        >
          {[
            {
              icon: <Rocket size={13} />,
              label: panels.left === 'config' ? 'Close Config' : 'Open Config',
              onClick: () => {
                setPanels((p) => ({ ...p, left: p.left === 'config' ? null : 'config' }))
                setContextMenu(null)
              },
            },
            {
              icon: <FileText size={13} />,
              label: panels.right === 'analytics' ? 'Close Analytics' : 'Open Analytics',
              onClick: () => {
                setPanels((p) => ({ ...p, right: p.right === 'analytics' ? null : 'analytics' }))
                setContextMenu(null)
              },
            },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              style={ctxItemStyle}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          {contextMenu.nodeType === 'attack' && contextMenu.nodeId && (
            <>
              <div style={ctxSepStyle} />
              <button
                onClick={() => {
                  const attackType = contextMenu.nodeId!.replace('attack-', '')
                  setSelectedAttackType(attackType)
                  setPanels((p) => ({ ...p, right: 'attack-detail' }))
                  setContextMenu(null)
                }}
                style={ctxItemStyle}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                View Details
              </button>
              <button
                onClick={() => {
                  const attackType = contextMenu.nodeId!.replace('attack-', '')
                  void navigator.clipboard.writeText(attackType)
                  toast.success('Attack type copied')
                  setContextMenu(null)
                }}
                style={ctxItemStyle}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                <Copy size={13} /> Copy Attack Type
              </button>
            </>
          )}

          {contextMenu.nodeType === 'studio' && contextMenu.nodeId && (
            <>
              <div style={ctxSepStyle} />
              <button
                onClick={() => {
                  setSelectedStudioNodeId(contextMenu.nodeId!)
                  setPanels((p) => ({ ...p, right: 'studio-inspector' }))
                  setContextMenu(null)
                }}
                style={ctxItemStyle}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                Edit Node
              </button>
              <button
                onClick={() => {
                  const original = studioNodes.find((n) => n.id === contextMenu.nodeId)
                  if (original) {
                    const id = `node-${Date.now()}`
                    const clone: Node<StudioNodeData> = {
                      ...original,
                      id,
                      position: { x: original.position.x + 40, y: original.position.y + 40 },
                    }
                    setStudioNodes((cur) => [...cur, clone])
                    toast.success('Node duplicated')
                  }
                  setContextMenu(null)
                }}
                style={ctxItemStyle}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                <Copy size={13} /> Duplicate Node
              </button>
              <button
                onClick={() => {
                  deleteStudioNode(contextMenu.nodeId!)
                  toast.success('Node deleted')
                  setContextMenu(null)
                }}
                style={{ ...ctxItemStyle, color: 'rgba(248,113,113,0.85)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                <Trash2 size={13} /> Delete Node
              </button>
            </>
          )}

          <div style={ctxSepStyle} />
          <button
            onClick={() => {
              setCanvasMode(isAttack ? 'studio' : 'attack')
              setContextMenu(null)
            }}
            style={ctxItemStyle}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
          >
            {isAttack ? (
              <><Workflow size={13} /> Switch to Studio</>
            ) : (
              <><Swords size={13} /> Switch to Attack Canvas</>
            )}
          </button>
        </div>
      )}

      {/* ---- Floating status panel -- top right ---- */}
      <FloatingPanel position="top-right" className="p-4 w-64">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="space-y-2">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>Run Status</span>
            <span style={{
              ...badgeStyle,
              background: run?.status === 'running'
                ? 'rgba(34,197,94,0.15)'
                : run?.status === 'completed'
                  ? 'rgba(148,163,184,0.15)'
                  : 'rgba(255,255,255,0.06)',
              color: run?.status === 'running'
                ? 'rgba(74,222,128,0.9)'
                : run?.status === 'completed'
                  ? 'rgba(203,213,225,0.8)'
                  : 'rgba(255,255,255,0.45)',
              borderColor: run?.status === 'running'
                ? 'rgba(34,197,94,0.3)'
                : 'rgba(255,255,255,0.1)',
            }}>
              {run?.status ?? 'idle'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>Progress</span>
            <span style={monoStyle}>{run?.completed_attacks ?? 0}/{run?.total_attacks ?? 0}</span>
          </div>
          <div style={sepStyle} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>Spent</span>
            <span style={monoStyle}>${Number(telemetry?.cost?.spent_usd ?? run?.budget_spent_usd ?? 0).toFixed(3)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>Projected</span>
            <span style={monoStyle}>${Number(telemetry?.cost?.projected_final_usd ?? run?.estimated_final_cost_usd ?? 0).toFixed(3)}</span>
          </div>
          <div style={sepStyle} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>Stream</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: streaming ? 'rgb(52,211,153)' : 'rgba(255,255,255,0.25)',
              }} />
              <span style={{ ...monoStyle, color: streaming ? 'rgba(52,211,153,0.9)' : 'rgba(255,255,255,0.4)' }}>
                {streaming ? 'LIVE' : 'CLOSED'}
              </span>
            </div>
          </div>
        </motion.div>
      </FloatingPanel>

      {/* ---- Bottom Action Bar (Excalidraw-style) ---- */}
      <BottomActionBar
        activeMode={activeToolbarMode}
        onModeChange={handleModeChange}
        canvasMode={canvasMode}
        streaming={streaming}
        eventsOpen={panels.bottom === 'events'}
        onEventsToggle={() => setPanels((p) => ({ ...p, bottom: p.bottom === 'events' ? null : 'events' }))}
        onRefresh={() => void refreshAll()}
        onAddStudioNode={canvasMode === 'studio' ? addStudioNode : undefined}
      />

      {/* ---- Left Glass Panel: Config ---- */}
      <GlassPanel
        open={panels.left === 'config'}
        onClose={() => setPanels((p) => ({ ...p, left: null }))}
        side="left"
        title="Configuration"
      >
        <ConfigPanel onRunLaunched={handleRunLaunched} />
      </GlassPanel>

      {/* ---- Right Glass Panels ---- */}
      <GlassPanel
        open={panels.right === 'analytics'}
        onClose={() => setPanels((p) => ({ ...p, right: null }))}
        side="right"
        title="Analytics"
      >
        <AnalyticsPanel runId={runId} />
      </GlassPanel>

      <GlassPanel
        open={panels.right === 'settings'}
        onClose={() => setPanels((p) => ({ ...p, right: null }))}
        side="right"
        title="Settings"
      >
        <SettingsPanel />
      </GlassPanel>

      <GlassPanel
        open={panels.right === 'attack-detail'}
        onClose={() => setPanels((p) => ({ ...p, right: null }))}
        side="right"
        title="Attack Detail"
      >
        <AttackDetailPanel
          selectedAttack={selectedAttack}
          telemetry={telemetry}
          nodeTelemetry={nodeTelemetry}
          runId={runId || undefined}
          onResumeRun={runId ? () => {
            api.resumeRun(runId)
              .then((res) => {
                setRun(res)
                toast.success('Run resumed')
              })
              .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to resume run'))
          } : undefined}
        />
      </GlassPanel>

      <GlassPanel
        open={panels.right === 'studio-inspector'}
        onClose={() => setPanels((p) => ({ ...p, right: null }))}
        side="right"
        title="Studio Inspector"
      >
        <StudioInspectorPanel
          selectedNode={selectedStudioNode}
          onUpdateNode={updateStudioNode}
          workflowJson={exportWorkflowJson}
        />
      </GlassPanel>

      {/* ---- Bottom Drawer: Events ---- */}
      <EventsDrawer
        open={panels.bottom === 'events'}
        onOpenChange={(open) => setPanels((p) => ({ ...p, bottom: open ? 'events' : null }))}
        events={events}
        streaming={streaming}
      />

      {/* ---- Onboarding ---- */}
      <SpotlightWalkthrough />
    </CanvasBackground>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared style constants                                            */
/* ------------------------------------------------------------------ */

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'rgba(255,255,255,0.4)',
  letterSpacing: '0.02em',
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '11px',
  color: 'rgba(255,255,255,0.75)',
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 7px',
  borderRadius: '4px',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  border: '1px solid',
}

const sepStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  height: '1px',
  width: '100%',
}

const ctxItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '6px 10px',
  background: 'transparent',
  border: 'none',
  borderRadius: '5px',
  color: 'rgba(255,255,255,0.65)',
  fontSize: '12px',
  cursor: 'pointer',
  textAlign: 'left',
}

const ctxSepStyle: React.CSSProperties = {
  height: '1px',
  background: 'rgba(255,255,255,0.07)',
  margin: '3px 0',
}
