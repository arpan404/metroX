import { useCallback, useEffect, useMemo, useState } from 'react'
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
  RefreshCw,
  Activity,
  Plus,
  ListCollapse,
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
import { CanvasBackground } from '@/components/canvas/CanvasBackground'
import { FloatingPanel } from '@/components/canvas/FloatingPanel'
import { FloatingToolbar, type ToolbarMode } from '@/components/canvas/FloatingToolbar'
import { CommandPalette } from '@/components/CommandPalette'
import { GlassPanel } from '@/components/ui/sheet'
import { useOnboardingContext } from '@/components/onboarding/OnboardingProvider'
import { SpotlightWalkthrough } from '@/components/onboarding/SpotlightWalkthrough'

import { ConfigPanel } from '@/components/panels/ConfigPanel'
import { AnalyticsPanel } from '@/components/panels/AnalyticsPanel'
import { SettingsPanel } from '@/components/panels/SettingsPanel'
import { AttackDetailPanel } from '@/components/panels/AttackDetailPanel'
import { StudioInspectorPanel } from '@/components/panels/StudioInspectorPanel'
import { EventsDrawer } from '@/components/panels/EventsDrawer'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'

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

/* ------------------------------------------------------------------ */
/*  App                                                               */
/* ------------------------------------------------------------------ */

export default function App() {
  /* ---- panel state ---- */
  const [panels, setPanels] = useState<PanelState>({ left: null, right: null, bottom: null })
  const [commandOpen, setCommandOpen] = useState(false)
  const [canvasMode, setCanvasMode] = useState<'attack' | 'studio'>('attack')

  /* ---- onboarding ---- */
  const onboarding = useOnboardingContext()
  useEffect(() => {
    if (onboarding.completed) return
    /* Wait for canvas to fully mount, then verify a target element exists */
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

  /* ---- context menu node state ---- */
  const [contextNode, setContextNode] = useState<{ id: string; type: 'attack' | 'studio' } | null>(null)

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

      {/* ---- Canvas area with context menu ---- */}
      <ContextMenu>
        <ContextMenuTrigger className="absolute inset-0 pt-16">
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
              onNodeContextMenu={(_, node) => {
                if (node.id.startsWith('attack-')) {
                  setContextNode({ id: node.id, type: 'attack' })
                }
              }}
              fitView
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
              <Controls position="bottom-right" />
              <MiniMap className="hidden sm:block" pannable zoomable />
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
              onNodeContextMenu={(_, node) => {
                setContextNode({ id: node.id, type: 'studio' })
              }}
              fitView
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
              <Controls position="bottom-right" />
              <MiniMap className="hidden sm:block" pannable zoomable />
            </ReactFlow>
          )}
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={() => setPanels((p) => ({ ...p, left: p.left === 'config' ? null : 'config' }))}>
            <Rocket className="size-3.5 mr-2" /> {panels.left === 'config' ? 'Close Config' : 'Open Config'}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setPanels((p) => ({ ...p, right: p.right === 'analytics' ? null : 'analytics' }))}>
            <FileText className="size-3.5 mr-2" /> {panels.right === 'analytics' ? 'Close Analytics' : 'Open Analytics'}
          </ContextMenuItem>
          <ContextMenuSeparator />

          {contextNode?.type === 'attack' && (
            <>
              <ContextMenuItem
                onClick={() => {
                  const attackType = contextNode.id.replace('attack-', '')
                  setSelectedAttackType(attackType)
                  setPanels((p) => ({ ...p, right: 'attack-detail' }))
                }}
              >
                View Details
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  const attackType = contextNode.id.replace('attack-', '')
                  void navigator.clipboard.writeText(attackType)
                  toast.success('Attack type copied')
                }}
              >
                <Copy className="size-3.5 mr-2" /> Copy Attack Type
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          {contextNode?.type === 'studio' && (
            <>
              <ContextMenuItem
                onClick={() => {
                  setSelectedStudioNodeId(contextNode.id)
                  setPanels((p) => ({ ...p, right: 'studio-inspector' }))
                }}
              >
                Edit Node
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  const original = studioNodes.find((n) => n.id === contextNode.id)
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
                }}
              >
                <Copy className="size-3.5 mr-2" /> Duplicate Node
              </ContextMenuItem>
              <ContextMenuItem
                className="text-destructive"
                onClick={() => {
                  deleteStudioNode(contextNode.id)
                  toast.success('Node deleted')
                }}
              >
                <Trash2 className="size-3.5 mr-2" /> Delete Node
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}

          <ContextMenuItem onClick={() => setCanvasMode(isAttack ? 'studio' : 'attack')}>
            {isAttack ? (
              <><Workflow className="size-3.5 mr-2" /> Switch to Studio</>
            ) : (
              <><Swords className="size-3.5 mr-2" /> Switch to Attack Canvas</>
            )}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* ---- Floating status panel -- top left ---- */}
      <FloatingPanel position="top-left" className="p-4 w-64">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Run Status</span>
            <Badge
              variant={run?.status === 'running' ? 'default' : run?.status === 'completed' ? 'secondary' : 'outline'}
              className="text-[10px]"
            >
              {run?.status ?? 'idle'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Progress</span>
            <span className="font-mono text-xs text-foreground">
              {run?.completed_attacks ?? 0}/{run?.total_attacks ?? 0}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Spent</span>
            <span className="font-mono text-xs text-foreground">
              ${Number(telemetry?.cost?.spent_usd ?? run?.budget_spent_usd ?? 0).toFixed(3)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Projected</span>
            <span className="font-mono text-xs text-foreground">
              ${Number(telemetry?.cost?.projected_final_usd ?? run?.estimated_final_cost_usd ?? 0).toFixed(3)}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Stream</span>
            <div className="flex items-center gap-1.5">
              <span
                className={
                  streaming
                    ? 'inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse'
                    : 'inline-block size-1.5 rounded-full bg-muted-foreground'
                }
              />
              <span className={`text-[11px] font-mono text-foreground ${streaming ? 'live-pulse' : ''}`}>
                {streaming ? 'LIVE' : 'CLOSED'}
              </span>
            </div>
          </div>
        </motion.div>
      </FloatingPanel>

      {/* ---- Floating run input -- top right ---- */}
      <FloatingPanel position="top-right" className="p-3 w-72">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="flex items-center gap-2">
          <Input
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder="Paste run ID..."
            className="h-8 text-xs"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" onClick={() => void refreshAll()}>
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Refresh run data</TooltipContent>
          </Tooltip>
        </motion.div>
      </FloatingPanel>

      {/* ---- Floating bottom-left: mode toggle + studio actions ---- */}
      <FloatingPanel position="bottom-left" className="p-1.5">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={canvasMode}
            onValueChange={(v) => {
              if (v === 'attack' || v === 'studio') {
                setCanvasMode(v)
                setPanels((p) => ({ ...p, right: null }))
              }
            }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="attack" className="gap-1.5 text-xs">
              <Swords className="size-3.5" /> Attack Canvas
            </ToggleGroupItem>
            <ToggleGroupItem value="studio" className="gap-1.5 text-xs">
              <Workflow className="size-3.5" /> Studio
            </ToggleGroupItem>
          </ToggleGroup>

          {canvasMode === 'studio' && (
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1">
              <Separator orientation="vertical" className="h-5 mx-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="xs" onClick={() => addStudioNode('attacker')}>
                    <Plus className="size-3" /> Attacker
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Add attacker node</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="xs" onClick={() => addStudioNode('critic')}>
                    <Plus className="size-3" /> Critic
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Add critic node</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="xs" onClick={() => addStudioNode('verifier')}>
                    <Plus className="size-3" /> Verifier
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Add verifier node</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="xs" onClick={() => addStudioNode('analyst')}>
                    <Plus className="size-3" /> Analyst
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Add analyst node</TooltipContent>
              </Tooltip>
            </motion.div>
          )}

          <Separator orientation="vertical" className="h-5 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setPanels((p) => ({ ...p, bottom: p.bottom === 'events' ? null : 'events' }))}
                className="gap-1.5 text-xs"
              >
                <ListCollapse className="size-3.5" />
                Events
                {streaming && (
                  <span className="relative flex size-2 ml-0.5">
                    <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 animate-ping" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Toggle event timeline</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" onClick={() => void refreshAll()} className="gap-1.5 text-xs">
                <Activity className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Refresh data</TooltipContent>
          </Tooltip>
        </motion.div>
      </FloatingPanel>

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
