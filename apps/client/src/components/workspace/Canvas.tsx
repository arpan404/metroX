import { useCallback, useMemo, useEffect, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useWorkspace } from '@/stores/workspace-store'
import { nodeTypes } from './Nodes'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/* ------------------------------------------------------------------ */
/*  Build nodes/edges from attack summary                             */
/* ------------------------------------------------------------------ */

function buildEvaluateGraph(
  state: ReturnType<typeof useWorkspace>['state'],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const runData = state.runData
  const attackSummary = state.attackSummary
  const scorecard = state.scorecard

  // No run loaded — return empty so the "No active evaluation" overlay shows
  if (!runData) return { nodes: [], edges: [] }

  // Root target node
  nodes.push({
    id: 'target-root',
    type: 'target',
    position: { x: 300, y: 40 },
    data: {
      label: `Run ${runData.id.slice(0, 8)}`,
      model: (runData as any)?.summary_metrics?.model ?? '',
      status: runData.status === 'completed'
        ? 'completed'
        : runData.status === 'failed'
          ? 'failed'
          : runData.status === 'running'
            ? 'running'
            : 'idle',
      targetType: runData.preset,
      totalAttacks: runData.total_attacks,
      completedAttacks: runData.completed_attacks,
    },
  })

  // Attack type nodes
  if (attackSummary?.attack_types) {
    const types = attackSummary.attack_types
    const cols = Math.min(types.length, 4)
    const xSpacing = 260
    const startX = 300 - ((cols - 1) * xSpacing) / 2

    types.forEach((at, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const nodeId = `attack-${at.attack_type}`

      nodes.push({
        id: nodeId,
        type: 'attack',
        position: { x: startX + col * xSpacing, y: 200 + row * 220 },
        data: {
          attackType: at.attack_type,
          total: at.total,
          success: at.success,
          failure: at.failure,
          successRate: at.success_rate,
          avgConfidence: at.avg_confidence,
          severityBreakdown: at.severity_breakdown,
          status: runData?.status === 'running' ? 'active' : 'done',
        },
      })

      edges.push({
        id: `e-root-${nodeId}`,
        source: 'target-root',
        target: nodeId,
        animated: runData?.status === 'running',
      })
    })

    // Metrics summary node
    if (scorecard) {
      const metricsY = 200 + Math.ceil(types.length / cols) * 220
      nodes.push({
        id: 'metrics-summary',
        type: 'metrics',
        position: { x: 300, y: metricsY },
        data: {
          compositeScore: scorecard.metrics.composite_score ?? 0,
          gatePass: scorecard.gates.pass,
          gateReasons: scorecard.gates.reasons ?? [],
          metrics: scorecard.metrics,
          riskCount: state.riskCards?.risks?.length ?? 0,
        },
      })

      types.forEach((at) => {
        edges.push({
          id: `e-${at.attack_type}-metrics`,
          source: `attack-${at.attack_type}`,
          target: 'metrics-summary',
        })
      })
    }
  }

  return { nodes, edges }
}

/* ------------------------------------------------------------------ */
/*  Canvas Component                                                  */
/* ------------------------------------------------------------------ */

export function Canvas() {
  const { state, dispatch } = useWorkspace()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; node: Node } | null>(null)
  const [infoNode, setInfoNode] = useState<Node | null>(null)

  // Build graph from state
  const graphData = useMemo(() => {
    if (state.canvasMode === 'evaluate') {
      return buildEvaluateGraph(state)
    }
    // Studio mode — use studio nodes/edges directly
    return {
      nodes: state.studioNodes.map((n) => ({
        ...n,
        type: 'studioRole',
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
      })),
      edges: state.studioEdges.map((edge) => ({
        ...edge,
        animated: true,
        className: 'flow-edge',
        style: {
          stroke: '#22d3ee',
          strokeWidth: 2.8,
        },
      })),
    }
  }, [state.canvasMode, state.runData, state.attackSummary, state.scorecard, state.riskCards, state.studioNodes, state.studioEdges])

  // Sync graph data to ReactFlow state
  useEffect(() => {
    setNodes(graphData.nodes)
    setEdges(graphData.edges)
  }, [graphData, setNodes, setEdges])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds))
      if (state.canvasMode === 'studio') {
        dispatch({
          type: 'SET_STUDIO_EDGES',
          edges: [...state.studioEdges, {
            id: `e-${connection.source}-${connection.target}`,
            source: connection.source!,
            target: connection.target!,
          }],
        })
      }
    },
    [setEdges, state.canvasMode, state.studioEdges, dispatch],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const attackType = node.id.startsWith('attack-')
        ? node.id.replace('attack-', '')
        : null
      dispatch({ type: 'SELECT_NODE', nodeId: node.id, attackType })
      // Auto-open attack detail for attack nodes
      if (attackType) {
        dispatch({ type: 'OPEN_PANEL', panel: 'attack-detail' })
      } else if (state.canvasMode === 'studio' && node.type === 'studioRole') {
        dispatch({ type: 'OPEN_PANEL', panel: 'studio-inspector' })
      }
    },
    [dispatch, state.canvasMode],
  )

  const onPaneClick = useCallback(() => {
    dispatch({ type: 'SELECT_NODE', nodeId: null })
    setContextMenuPos(null)
    setNodeMenu(null)
  }, [dispatch])

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setNodeMenu(null)
    setContextMenuPos({ x: event.clientX, y: event.clientY })
  }, [])

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      event.stopPropagation()
      dispatch({ type: 'SELECT_NODE', nodeId: node.id })
      setContextMenuPos(null)
      setNodeMenu({ x: event.clientX, y: event.clientY, node })
    },
    [dispatch],
  )

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (state.canvasMode !== 'studio' || node.type !== 'studioRole') return
      dispatch({
        type: 'UPDATE_STUDIO_NODE_POSITION',
        nodeId: node.id,
        position: node.position,
      })
    },
    [dispatch, state.canvasMode],
  )

  return (
    <div
      className="absolute inset-0"
      data-onboarding="canvas"
      onClick={() => setContextMenuPos(null)}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        fitView={nodes.length > 0}
        fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={state.canvasMode === 'studio'}
        nodesConnectable={state.canvasMode === 'studio'}
        minZoom={0.15}
        maxZoom={2.5}
        className="workspace-canvas"
        data-canvas-mode={state.canvasMode}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="!bg-background"
        />
        <Controls
          showInteractive={state.canvasMode === 'studio'}
          className="!rounded-lg !border-border/60 !bg-background/80 !backdrop-blur-xl !shadow-lg"
        />
        <MiniMap
          zoomable
          pannable
          className="!rounded-lg !border-border/60 !bg-background/80 !backdrop-blur-xl"
          maskColor="rgba(0,0,0,0.2)"
          nodeColor={(node) => {
            if (node.type === 'target') return 'var(--primary)'
            if (node.type === 'metrics') return 'var(--chart-2)'
            if (node.type === 'studioRole') {
              const role = (node.data as { role?: string } | undefined)?.role
              if (role === 'attacker') return '#ef4444'
              if (role === 'critic') return '#f59e0b'
              if (role === 'verifier') return '#3b82f6'
              if (role === 'analyst') return '#10b981'
              if (role === 'entrypoint') return '#22d3ee'
              if (role === 'coordinator') return '#a855f7'
            }
            return 'var(--muted-foreground)'
          }}
        />

        {/* Empty state overlay */}
        {nodes.length === 0 && (
          <Panel position="top-center">
            <div className="mt-[30vh] text-center select-none">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/45 dark:bg-muted/30 mb-4">
                <Shield className="w-7 h-7 text-muted-foreground/70 dark:text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-[Syne] font-semibold text-muted-foreground/80 dark:text-muted-foreground/60 mb-1">
                No active evaluation
              </h3>
              <p className="text-sm text-muted-foreground/70 dark:text-muted-foreground/40 max-w-xs mx-auto">
                Open Configuration to set up a target and launch a run, or enter a Run ID to load results.
              </p>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Canvas context menu */}
      {contextMenuPos && (
        <CanvasContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onClose={() => setContextMenuPos(null)}
        />
      )}
      {nodeMenu && (
        <NodeContextMenu
          x={nodeMenu.x}
          y={nodeMenu.y}
          node={nodeMenu.node}
          onInfo={(node) => setInfoNode(node)}
          onClose={() => setNodeMenu(null)}
        />
      )}
      <NodeInfoDialog node={infoNode} onOpenChange={(open) => !open && setInfoNode(null)} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Inline canvas context menu                                        */
/* ------------------------------------------------------------------ */

import {
  Settings2,
  BarChart3,
  Sliders,
  FileText,
  RefreshCw,
  Maximize,
  Grid3X3,
  Play,
  RotateCcw,
  Download,
} from 'lucide-react'
import { Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

function CanvasContextMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const { state, dispatch, actions } = useWorkspace()

  const items = [
    {
      label: 'Open Configuration',
      icon: Sliders,
      action: () => dispatch({ type: 'TOGGLE_PANEL', panel: 'config' }),
      shortcut: '1',
    },
    {
      label: 'Open Analytics',
      icon: BarChart3,
      action: () => dispatch({ type: 'TOGGLE_PANEL', panel: 'analytics' }),
      shortcut: '2',
    },
    {
      label: 'Open Settings',
      icon: Settings2,
      action: () => dispatch({ type: 'TOGGLE_PANEL', panel: 'settings' }),
      shortcut: '3',
    },
    { separator: true } as const,
    {
      label: 'Refresh Data',
      icon: RefreshCw,
      action: () => { actions.fetchRunData(); actions.fetchAnalytics() },
    },
    ...(state.currentRunId
      ? [
          {
            label: 'Resume Run',
            icon: Play,
            action: () => actions.resumeRun(),
          },
          {
            label: 'Generate Report',
            icon: FileText,
            action: async () => {
              const result = await actions.generateReport()
              if (result) toast.success('Report generated')
            },
          },
        ]
      : []),
    { separator: true } as const,
    {
      label: state.canvasMode === 'evaluate' ? 'Switch to Studio' : 'Switch to Evaluate',
      icon: RotateCcw,
      action: () =>
        dispatch({ type: 'SET_CANVAS_MODE', mode: state.canvasMode === 'evaluate' ? 'studio' : 'evaluate' }),
    },
  ]

  // Clamp to viewport
  const menuX = Math.min(x, window.innerWidth - 220)
  const menuY = Math.min(y, window.innerHeight - items.length * 36 - 20)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className={cn(
        'fixed z-50 min-w-[200px] rounded-xl border border-border/60',
        'bg-background/90 backdrop-blur-2xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)]',
        'py-1.5 overflow-hidden',
      )}
      style={{ left: menuX, top: menuY }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if ('separator' in item) {
          return <div key={i} className="h-px bg-border/40 my-1" />
        }
        return (
          <button
            key={i}
            className={cn(
              'flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px]',
              'text-foreground/80 hover:text-foreground hover:bg-accent/60',
              'transition-colors duration-100',
            )}
            onClick={() => { item.action(); onClose() }}
          >
            <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">{item.label}</span>
            {'shortcut' in item && item.shortcut && (
              <kbd className="text-[10px] text-muted-foreground font-mono bg-muted/50 rounded px-1 py-0.5">
                {item.shortcut}
              </kbd>
            )}
          </button>
        )
      })}
    </motion.div>
  )
}

function NodeContextMenu({
  x,
  y,
  node,
  onInfo,
  onClose,
}: {
  x: number
  y: number
  node: Node
  onInfo: (node: Node) => void
  onClose: () => void
}) {
  const { state, dispatch, actions } = useWorkspace()
  const isStudioNode = state.canvasMode === 'studio' && node.type === 'studioRole'
  const nodeData = node.data as {
    label?: string
    role?: string
    model?: string
    description?: string
    enabled?: boolean
    runtime_provider?: string
    api_key_ref?: string
    base_url?: string
    instruction_file?: string
    instructions?: string
    auth_headers?: Record<string, string>
    extra?: Record<string, unknown>
  } | undefined
  const runStatus = state.runData?.status
  const canResume = runStatus === 'failed' || runStatus === 'interrupted'
  const canRerun = Boolean(state.runData)

  const handleDuplicate = () => {
    if (!isStudioNode || !nodeData?.label || !nodeData?.role) return
    const role = nodeData.role
    const id = `${node.id}-copy-${Math.random().toString(36).slice(2, 7)}`
    dispatch({
      type: 'ADD_STUDIO_NODE',
      node: {
        id,
        type: 'studioRole',
        position: { x: node.position.x + 56, y: node.position.y + 36 },
        data: {
          role,
          label: `${nodeData.label} Copy`,
          model: nodeData.model,
          description: nodeData.description,
          enabled: nodeData.enabled ?? true,
          runtime_provider: nodeData.runtime_provider,
          api_key_ref: nodeData.api_key_ref,
          base_url: nodeData.base_url,
          instruction_file: nodeData.instruction_file,
          instructions: nodeData.instructions,
          auth_headers: nodeData.auth_headers,
          extra: nodeData.extra,
        },
      },
    })
  }

  const handleDelete = () => {
    if (!isStudioNode) return
    dispatch({ type: 'REMOVE_STUDIO_NODE', nodeId: node.id })
  }

  const handleInfo = () => {
    const attackType = node.id.startsWith('attack-') ? node.id.replace('attack-', '') : null
    dispatch({ type: 'SELECT_NODE', nodeId: node.id, attackType })
    onInfo(node)
  }

  const handleRunOrRerun = async () => {
    if (canResume) {
      const resumed = await actions.resumeRun()
      if (resumed) toast.success('Run resumed')
      else toast.error('Failed to resume run')
      return
    }

    if (!state.runData) return
    try {
      const rerun = await api.createRun({
        session_id: state.runData.session_id,
        config_profile_id: state.runData.config_profile_id,
        preset: state.runData.preset,
        mode: state.runData.mode,
        strictness: state.runData.strictness,
        execute_now: true,
      })
      dispatch({ type: 'SET_RUN_ID', runId: rerun.id })
      dispatch({
        type: 'ADD_EVENT',
        event: {
          event_type: 'run_launched',
          message: `Run ${rerun.id.slice(0, 8)} launched (rerun)`,
          created_at: new Date().toISOString(),
          data: { run_id: rerun.id },
        },
      })
      actions.startStreaming()
      if (!state.eventsOpen) dispatch({ type: 'TOGGLE_EVENTS' })
      toast.success(`Rerun launched: ${rerun.id.slice(0, 8)}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to launch rerun'
      toast.error(message)
    }
  }

  const menuX = Math.min(x, window.innerWidth - 220)
  const menuY = Math.min(y, window.innerHeight - 180)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className={cn(
        'fixed z-50 min-w-[200px] rounded-xl border border-border/60',
        'bg-background/90 backdrop-blur-2xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)]',
        'py-1.5 overflow-hidden',
      )}
      style={{ left: menuX, top: menuY }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border/40 mb-1">
        {nodeData?.label ?? node.id}
      </div>
      <button
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px]',
          canResume || canRerun
            ? 'text-foreground/80 hover:text-foreground hover:bg-accent/60'
            : 'text-muted-foreground/50 cursor-not-allowed',
          'transition-colors duration-100',
        )}
        disabled={!canResume && !canRerun}
        onClick={() => { void handleRunOrRerun(); onClose() }}
      >
        <Play className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1">{canResume ? 'Run' : 'Rerun'}</span>
      </button>
      <div className="h-px bg-border/40 my-1" />
      <button
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px]',
          isStudioNode
            ? 'text-foreground/80 hover:text-foreground hover:bg-accent/60'
            : 'text-muted-foreground/50 cursor-not-allowed',
          'transition-colors duration-100',
        )}
        disabled={!isStudioNode}
        onClick={() => { handleDuplicate(); onClose() }}
      >
        <Download className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1">Duplicate</span>
      </button>
      <button
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px]',
          isStudioNode
            ? 'text-destructive/90 hover:text-destructive hover:bg-destructive/10'
            : 'text-muted-foreground/50 cursor-not-allowed',
          'transition-colors duration-100',
        )}
        disabled={!isStudioNode}
        onClick={() => { handleDelete(); onClose() }}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        <span className="flex-1">Delete</span>
      </button>
      <div className="h-px bg-border/40 my-1" />
      <button
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px]',
          'text-foreground/80 hover:text-foreground hover:bg-accent/60',
          'transition-colors duration-100',
        )}
        onClick={() => { handleInfo(); onClose() }}
      >
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1">Info</span>
      </button>
    </motion.div>
  )
}

function NodeInfoDialog({
  node,
  onOpenChange,
}: {
  node: Node | null
  onOpenChange: (open: boolean) => void
}) {
  const nodeData = (node?.data ?? {}) as Record<string, unknown>

  const rows: Array<{ label: string; value: string }> = []
  if (node) {
    rows.push({ label: 'Node ID', value: node.id })
    rows.push({ label: 'Type', value: node.type ?? 'unknown' })
  }
  if (typeof nodeData.label === 'string' && nodeData.label.trim()) rows.push({ label: 'Name', value: nodeData.label })
  if (typeof nodeData.role === 'string' && nodeData.role.trim()) rows.push({ label: 'Agent', value: nodeData.role })
  if (typeof nodeData.model === 'string' && nodeData.model.trim()) rows.push({ label: 'Model', value: nodeData.model })
  if (typeof nodeData.runtime_provider === 'string' && nodeData.runtime_provider.trim()) {
    rows.push({ label: 'Runtime Provider', value: nodeData.runtime_provider })
  }
  if (typeof nodeData.api_key_ref === 'string' && nodeData.api_key_ref.trim()) {
    rows.push({ label: 'API Key Ref', value: nodeData.api_key_ref })
  }
  if (typeof nodeData.base_url === 'string' && nodeData.base_url.trim()) {
    rows.push({ label: 'Base URL', value: nodeData.base_url })
  }
  if (typeof nodeData.instruction_file === 'string' && nodeData.instruction_file.trim()) {
    rows.push({ label: 'Instruction File', value: nodeData.instruction_file })
  }
  if (typeof nodeData.instructions === 'string' && nodeData.instructions.trim()) {
    rows.push({ label: 'Custom Instructions', value: nodeData.instructions })
  }
  if (typeof nodeData.attackType === 'string' && nodeData.attackType.trim()) rows.push({ label: 'Attack Type', value: nodeData.attackType })
  if (typeof nodeData.status === 'string' && nodeData.status.trim()) rows.push({ label: 'Status', value: nodeData.status })
  if (typeof nodeData.total === 'number') rows.push({ label: 'Total Samples', value: String(nodeData.total) })
  if (typeof nodeData.success === 'number') rows.push({ label: 'Failures', value: String(nodeData.success) })
  if (typeof nodeData.failure === 'number') rows.push({ label: 'Passes', value: String(nodeData.failure) })
  if (typeof nodeData.description === 'string' && nodeData.description.trim()) {
    rows.push({ label: 'Description', value: nodeData.description })
  }

  return (
    <Dialog open={Boolean(node)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{(typeof nodeData.label === 'string' && nodeData.label) || 'Node Info'}</DialogTitle>
          <DialogDescription>
            Details for the selected node and agent configuration.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="rounded-md border border-border/40 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{row.label}</p>
              <p className="text-sm">{row.value}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
