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
import {
  RefreshCw,
  Activity,
  Plus,
  ListCollapse,
  Swords,
  Workflow,
  Copy,
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
import { FloatingPanel } from '@/components/canvas/FloatingPanel'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/* ------------------------------------------------------------------ */
/*  Local types                                                       */
/* ------------------------------------------------------------------ */

type EventRow = {
  id: number
  event_type: string
  step: number
  message?: string
  data?: Record<string, unknown>
  created_at: string
}

/* ------------------------------------------------------------------ */
/*  MonitorPage                                                       */
/* ------------------------------------------------------------------ */

export default function MonitorPage() {
  /* ---- persisted & core state ---- */
  const persisted = useMemo(() => loadState(), [])
  const [runId, setRunId] = useState(persisted.currentRunId ?? '')
  const [run, setRun] = useState<RunOut | null>(null)
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [attackSummary, setAttackSummary] = useState<AttackSummaryPayload | null>(null)
  const [riskCards, setRiskCards] = useState<RiskCards | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [telemetry, setTelemetry] = useState<RunTelemetryPayload | null>(null)
  const [nodeTelemetry, setNodeTelemetry] = useState<NodeTelemetryPayload | null>(null)
  const [selectedAttackType, setSelectedAttackType] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'attack' | 'studio'>('attack')

  /* ---- UI overlay state ---- */
  const [sheetOpen, setSheetOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  /* ---- studio initial data ---- */
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

  /* ---- derived data ---- */
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
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to load run analytics')
    }
  }, [runId, selectedAttackType])

  /* ---- WebSocket / SSE streaming ---- */
  useEffect(() => {
    if (!runId) return
    setEvents([])
    setError(null)
    setStreaming(true)
    let receivedAnyEvent = false

    let stop = api.streamRunEventsWs(
      runId,
      (incoming) => {
        receivedAnyEvent = true
        const row = incoming as unknown as EventRow
        setEvents((current) => {
          if (current.some((item) => item.id === row.id)) return current
          return [row, ...current].slice(0, 200)
        })
      },
      () => setStreaming(false),
    )
    const wsFallback = window.setTimeout(() => {
      if (receivedAnyEvent) return
      stop()
      stop = api.streamRunEvents(
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
    }, 1800)

    void refreshAll()
    const interval = window.setInterval(() => void refreshAll(), 2500)

    return () => {
      stop()
      window.clearTimeout(wsFallback)
      window.clearInterval(interval)
    }
  }, [runId, refreshAll])

  /* ---- studio callbacks ---- */
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

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  const isAttack = activeTab === 'attack'

  return (
    <div className="absolute inset-0 pt-16">
      {/* ---- ReactFlow canvas (fills entire viewport) ---- */}
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
              setSheetOpen(true)
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
            setSheetOpen(true)
          }}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <Controls position="bottom-right" />
          <MiniMap className="hidden sm:block" pannable zoomable />
        </ReactFlow>
      )}

      {/* ---- Floating status panel -- top left ---- */}
      <FloatingPanel position="top-left" className="p-4 w-64">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Run Status</span>
            <Badge
              variant={
                run?.status === 'running'
                  ? 'default'
                  : run?.status === 'completed'
                    ? 'secondary'
                    : 'outline'
              }
              className="text-[10px]"
            >
              {run?.status ?? 'unknown'}
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

          {error && (
            <p className="text-[11px] text-destructive mt-1 leading-tight">{error}</p>
          )}
        </motion.div>
      </FloatingPanel>

      {/* ---- Floating run input -- top right ---- */}
      <FloatingPanel position="top-right" className="p-3 w-72">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-2"
        >
          <Input
            value={runId}
            onChange={(event) => setRunId(event.target.value)}
            placeholder="Paste run ID..."
            className="h-8 text-xs"
          />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => void refreshAll()}
            title="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </motion.div>
      </FloatingPanel>

      {/* ---- Floating bottom-left: mode toggle + studio actions ---- */}
      <FloatingPanel position="bottom-left" className="p-1.5">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2"
        >
          <ToggleGroup
            type="single"
            value={activeTab}
            onValueChange={(value) => {
              if (value === 'attack' || value === 'studio') {
                setActiveTab(value)
                setSheetOpen(false)
              }
            }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="attack" className="gap-1.5 text-xs">
              <Swords className="size-3.5" />
              Attack Canvas
            </ToggleGroupItem>
            <ToggleGroupItem value="studio" className="gap-1.5 text-xs">
              <Workflow className="size-3.5" />
              Studio
            </ToggleGroupItem>
          </ToggleGroup>

          {activeTab === 'studio' && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1"
            >
              <Separator orientation="vertical" className="h-5 mx-1" />
              <Button variant="ghost" size="xs" onClick={() => addStudioNode('attacker')}>
                <Plus className="size-3" /> Attacker
              </Button>
              <Button variant="ghost" size="xs" onClick={() => addStudioNode('critic')}>
                <Plus className="size-3" /> Critic
              </Button>
              <Button variant="ghost" size="xs" onClick={() => addStudioNode('verifier')}>
                <Plus className="size-3" /> Verifier
              </Button>
              <Button variant="ghost" size="xs" onClick={() => addStudioNode('analyst')}>
                <Plus className="size-3" /> Analyst
              </Button>
            </motion.div>
          )}

          <Separator orientation="vertical" className="h-5 mx-1" />

          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDrawerOpen(true)}
            className="gap-1.5 text-xs"
          >
            <ListCollapse className="size-3.5" />
            Events
          </Button>
        </motion.div>
      </FloatingPanel>

      {/* ---- Right Sheet for details ---- */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-96 overflow-y-auto">
          {isAttack ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selectedAttack
                    ? selectedAttack.attack_type.replaceAll('_', ' ').toUpperCase()
                    : 'Node Details'}
                </SheetTitle>
                <SheetDescription>
                  {selectedAttack
                    ? 'Attack analytics and telemetry for this node'
                    : 'Click an attack node on the canvas to inspect analytics.'}
                </SheetDescription>
              </SheetHeader>

              {!selectedAttack && !run && (
                <div className="space-y-3 px-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}

              {selectedAttack && (
                <ScrollArea className="flex-1 px-4 pb-6">
                  <div className="space-y-4">
                    {/* --- Attack metrics --- */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">Metrics</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md border p-2">
                          <span className="text-muted-foreground">Total</span>
                          <p className="font-mono font-semibold">{selectedAttack.total}</p>
                        </div>
                        <div className="rounded-md border p-2">
                          <span className="text-muted-foreground">Success</span>
                          <p className="font-mono font-semibold text-emerald-500">{selectedAttack.success}</p>
                        </div>
                        <div className="rounded-md border p-2">
                          <span className="text-muted-foreground">Failure</span>
                          <p className="font-mono font-semibold text-destructive">{selectedAttack.failure}</p>
                        </div>
                        <div className="rounded-md border p-2">
                          <span className="text-muted-foreground">Success Rate</span>
                          <p className="font-mono font-semibold">{(selectedAttack.success_rate * 100).toFixed(2)}%</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md border p-2">
                          <span className="text-muted-foreground">Avg Confidence</span>
                          <p className="font-mono font-semibold">{(selectedAttack.avg_confidence * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* --- Severity breakdown --- */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">Severity Breakdown</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(selectedAttack.severity_breakdown).map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-[11px] gap-1">
                            {key}: <span className="font-mono">{value}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* --- Telemetry counters --- */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">Telemetry Counters</h4>
                      {Object.keys(telemetry?.event_counts ?? {}).length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Event</TableHead>
                              <TableHead className="text-xs text-right">Count</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(telemetry?.event_counts ?? {}).map(([name, count]) => (
                              <TableRow key={name}>
                                <TableCell className="text-xs font-mono">{name}</TableCell>
                                <TableCell className="text-xs font-mono text-right">{count}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-xs text-muted-foreground">No telemetry counters yet.</p>
                      )}
                    </div>

                    <Separator />

                    {/* --- Node telemetry --- */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">Node Telemetry</h4>
                      {(nodeTelemetry?.nodes ?? []).length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Attack</TableHead>
                              <TableHead className="text-xs text-right">Pass</TableHead>
                              <TableHead className="text-xs text-right">Fail</TableHead>
                              <TableHead className="text-xs text-right">Avg ms</TableHead>
                              <TableHead className="text-xs text-right">Cost</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(nodeTelemetry?.nodes ?? []).slice(0, 12).map((row) => (
                              <TableRow key={row.attack_type}>
                                <TableCell className="text-xs font-mono">{row.attack_type}</TableCell>
                                <TableCell className="text-xs font-mono text-right">{row.success}</TableCell>
                                <TableCell className="text-xs font-mono text-right">{row.failure}</TableCell>
                                <TableCell className="text-xs font-mono text-right">{row.avg_latency_ms.toFixed(1)}</TableCell>
                                <TableCell className="text-xs font-mono text-right">${row.effective_cost_usd.toFixed(3)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-xs text-muted-foreground">No node telemetry yet.</p>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              )}
            </>
          ) : (
            /* ---- Studio node inspector ---- */
            <>
              <SheetHeader>
                <SheetTitle>Workflow Inspector</SheetTitle>
                <SheetDescription>
                  {selectedStudioNode
                    ? `Editing "${selectedStudioNode.data.label}"`
                    : 'Select a workflow node to configure it.'}
                </SheetDescription>
              </SheetHeader>

              {selectedStudioNode && (
                <ScrollArea className="flex-1 px-4 pb-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Label</label>
                      <Input
                        value={selectedStudioNode.data.label}
                        onChange={(event) => updateStudioNode({ label: event.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Role</label>
                      <Input
                        value={selectedStudioNode.data.role}
                        onChange={(event) => updateStudioNode({ role: event.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Model</label>
                      <Input
                        value={selectedStudioNode.data.model}
                        onChange={(event) => updateStudioNode({ model: event.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Description</label>
                      <Textarea
                        rows={4}
                        value={selectedStudioNode.data.description}
                        onChange={(event) => updateStudioNode({ description: event.target.value })}
                        className="text-sm"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">Workflow JSON</h4>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            void navigator.clipboard.writeText(exportWorkflowJson)
                          }}
                          title="Copy JSON"
                        >
                          <Copy className="size-3" />
                        </Button>
                      </div>
                      <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] font-mono leading-relaxed">
                        {exportWorkflowJson}
                      </pre>
                    </div>
                  </div>
                </ScrollArea>
              )}

              {!selectedStudioNode && (
                <div className="space-y-3 px-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ---- Bottom Drawer for events timeline ---- */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Activity className="size-4" />
              Event Timeline
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {events.length} events
              </Badge>
              {streaming && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </Badge>
              )}
            </DrawerTitle>
          </DrawerHeader>

          <ScrollArea className="h-64 px-4 pb-4">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
                No events received yet.
              </div>
            ) : (
              <div className="space-y-1">
                {events.slice(0, 20).map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 rounded-md border px-3 py-2 text-xs"
                  >
                    <Badge variant="outline" className="shrink-0 text-[10px] mt-0.5">
                      {event.event_type}
                    </Badge>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      step {event.step}
                    </span>
                    {event.message && (
                      <span className="truncate text-foreground">{event.message}</span>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
