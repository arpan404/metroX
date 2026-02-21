import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ListOrdered,
  RefreshCw,
  Loader2,
  ArrowUp,
  ChevronsUp,
  Play,
  Square,
  RotateCcw,
  Clock3,
  CheckCircle2,
  Activity,
} from 'lucide-react'
import { PanelShell, PanelSection, MetricRow, EmptyState } from './PanelShell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useWorkspace } from '@/stores/workspace-store'
import { api } from '@/lib/api'
import type { QueuePendingItem, QueueRunItem, QueueRunsPayload } from '@/lib/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function statusTone(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'completed') return 'default'
  if (normalized === 'failed') return 'destructive'
  if (normalized === 'running') return 'secondary'
  if (normalized === 'queued') return 'outline'
  if (normalized === 'interrupted') return 'outline'
  return 'outline'
}

function progressLabel(run: QueueRunItem | null | undefined): string {
  const total = Math.max(0, Number(run?.total_attacks || 0))
  const completed = Math.max(0, Number(run?.completed_attacks || 0))
  if (total <= 0) return `${completed}`
  return `${completed}/${total}`
}

function RunMeta({ run }: { run: QueueRunItem | null | undefined }) {
  if (!run) {
    return <p className="text-[10px] text-muted-foreground">Run metadata unavailable</p>
  }
  const createdAt = run.created_at ? new Date(run.created_at).toLocaleString() : '--'
  return (
    <div className="grid grid-cols-3 gap-1.5 text-[10px] text-muted-foreground font-mono">
      <span>progress {progressLabel(run)}</span>
      <span>preset {run.preset}</span>
      <span>cost ${Number(run.budget_spent_usd || 0).toFixed(2)}</span>
      <span className="col-span-3">{createdAt}</span>
    </div>
  )
}

function PendingRow({
  row,
  activeRunId,
  busy,
  onOpen,
  onMoveUp,
  onMoveTop,
  onStop,
}: {
  row: QueuePendingItem
  activeRunId: string | null
  busy: boolean
  onOpen: () => void
  onMoveUp: () => void
  onMoveTop: () => void
  onStop: () => void
}) {
  const run = row.run
  const runId = row.run_id
  return (
    <div className={cn('rounded-lg border border-border/35 bg-background/35 p-2 space-y-2', activeRunId === runId && 'border-primary/60 bg-primary/10')}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={onOpen}>
          <p className="text-[11px] font-mono truncate">{runId}</p>
          <p className="text-[10px] text-muted-foreground">position {row.position} · attempt {row.attempt} · priority {row.priority}</p>
        </button>
        <Badge variant={statusTone(run?.status || 'queued')} className="h-5 text-[10px] font-mono">
          {run?.status || 'queued'}
        </Badge>
      </div>
      <RunMeta run={run} />
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={onOpen} disabled={busy}>
          <Play className="h-3 w-3 mr-1" /> Open
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={onMoveUp} disabled={busy}>
          <ArrowUp className="h-3 w-3 mr-1" /> Move Up
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={onMoveTop} disabled={busy}>
          <ChevronsUp className="h-3 w-3 mr-1" /> Top
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] text-destructive border-destructive/40 hover:bg-destructive/10" onClick={onStop} disabled={busy}>
          <Square className="h-3 w-3 mr-1" /> Stop
        </Button>
      </div>
    </div>
  )
}

function ActiveRow({
  run,
  activeRunId,
  busy,
  onOpen,
  onStop,
  onResume,
}: {
  run: QueueRunItem
  activeRunId: string | null
  busy: boolean
  onOpen: () => void
  onStop?: () => void
  onResume?: () => void
}) {
  const canResume = run.status === 'failed' || run.status === 'interrupted'
  return (
    <div className={cn('rounded-lg border border-border/35 bg-background/35 p-2 space-y-2', activeRunId === run.id && 'border-primary/60 bg-primary/10')}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={onOpen}>
          <p className="text-[11px] font-mono truncate">{run.id}</p>
          <p className="text-[10px] text-muted-foreground">{run.mode} · {run.strictness}</p>
        </button>
        <Badge variant={statusTone(run.status)} className="h-5 text-[10px] font-mono">
          {run.status}
        </Badge>
      </div>
      <RunMeta run={run} />
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={onOpen} disabled={busy}>
          <Play className="h-3 w-3 mr-1" /> Open
        </Button>
        {onStop && run.status === 'running' && (
          <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] text-destructive border-destructive/40 hover:bg-destructive/10" onClick={onStop} disabled={busy}>
            <Square className="h-3 w-3 mr-1" /> Stop
          </Button>
        )}
        {canResume && onResume && (
          <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={onResume} disabled={busy}>
            <RotateCcw className="h-3 w-3 mr-1" /> Resume
          </Button>
        )}
      </div>
    </div>
  )
}

export function QueueCenterPanel() {
  const { state, dispatch, actions } = useWorkspace()
  const isOpen = state.activePanel === 'queue-center'

  const [payload, setPayload] = useState<QueueRunsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyRunId, setBusyRunId] = useState<string | null>(null)

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [queueData] = await Promise.all([
        api.listQueueRuns(200),
        actions.fetchQueueStats(),
      ])
      setPayload(queueData)
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : 'Failed to load queue center')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [actions])

  useEffect(() => {
    if (!isOpen) return
    refresh().catch(() => {})
    const timer = setInterval(() => {
      refresh(true).catch(() => {})
    }, 2000)
    return () => clearInterval(timer)
  }, [isOpen, refresh])

  const pending = payload?.pending ?? []
  const running = payload?.running ?? []
  const completed = payload?.completed ?? []

  const counts = useMemo(() => ({
    pending: pending.length,
    running: running.length,
    completed: completed.length,
  }), [pending.length, running.length, completed.length])

  const openRun = useCallback((runId: string, status?: string) => {
    const normalized = String(runId || '').trim()
    if (!normalized) return
    dispatch({ type: 'SET_RUN_ID', runId: normalized })
    void actions.fetchRunData()
    const runStatus = String(status || '').toLowerCase()
    if (runStatus === 'queued' || runStatus === 'running') {
      actions.stopStreaming()
      actions.startStreaming(normalized)
    }
  }, [actions, dispatch])

  const withBusy = useCallback(async (runId: string, fn: () => Promise<void>) => {
    setBusyRunId(runId)
    try {
      await fn()
    } finally {
      setBusyRunId(null)
    }
  }, [])

  const handleStop = useCallback((runId: string) => {
    void withBusy(runId, async () => {
      const ok = await actions.stopRun(runId)
      if (ok) {
        toast.success(`Stop requested: ${runId.slice(0, 8)}`)
      } else {
        toast.error('Stop request failed')
      }
      await refresh(true)
    })
  }, [actions, refresh, withBusy])

  const handleMoveUp = useCallback((runId: string) => {
    void withBusy(runId, async () => {
      await api.moveQueueRunUp(runId)
      toast.success(`Moved up: ${runId.slice(0, 8)}`)
      await refresh(true)
    })
  }, [refresh, withBusy])

  const handleMoveTop = useCallback((runId: string) => {
    void withBusy(runId, async () => {
      await api.setQueueRunPriority(runId, 0)
      toast.success(`Moved to top priority: ${runId.slice(0, 8)}`)
      await refresh(true)
    })
  }, [refresh, withBusy])

  const handleResume = useCallback((runId: string) => {
    void withBusy(runId, async () => {
      const resumed = await api.resumeRun(runId)
      dispatch({ type: 'SET_RUN_ID', runId: resumed.id })
      actions.startStreaming(resumed.id)
      toast.success(`Resumed: ${runId.slice(0, 8)}`)
      await refresh(true)
    })
  }, [actions, dispatch, refresh, withBusy])

  const queueStats = state.queueStats

  return (
    <PanelShell
      open={isOpen}
      onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
      position="left"
      title="Queue Center"
      subtitle="Centralized run queue + task control"
      icon={<ListOrdered className="h-4 w-4" />}
      badge={<Badge variant="outline" className="h-5 text-[10px] font-mono">{counts.pending} pending</Badge>}
      width="w-[560px]"
      footer={(
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            backend {payload?.backend || queueStats?.backend || '--'}
          </p>
          <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => refresh()} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Refresh
          </Button>
        </div>
      )}
    >
      <PanelSection title="Queue Snapshot" description="Live queue depth, workers, and terminal workload overview">
        <MetricRow label="Pending queue" value={queueStats?.pending ?? counts.pending} />
        <MetricRow label="Running now" value={counts.running} />
        <MetricRow label="Completed tasks" value={counts.completed} />
        <MetricRow label="Workers" value={`${queueStats?.live_workers ?? '--'}/${queueStats?.workers ?? '--'}`} />
      </PanelSection>

      <PanelSection title="Pending Queue" description="Reorder queued jobs or stop before execution" badge={<Clock3 className="h-3.5 w-3.5 text-muted-foreground" />}>
        {loading && pending.length === 0 ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : pending.length === 0 ? (
          <EmptyState icon={<Clock3 className="h-5 w-5" />} title="No queued runs" description="Queued jobs will appear here with controls." />
        ) : (
          <div className="space-y-2">
            {pending.slice(0, 40).map((row) => {
              const runId = row.run_id
              const busy = busyRunId === runId
              const status = row.run?.status || 'queued'
              return (
                <PendingRow
                  key={`${row.run_id}-${row.position}`}
                  row={row}
                  activeRunId={state.currentRunId}
                  busy={busy}
                  onOpen={() => openRun(runId, status)}
                  onMoveUp={() => handleMoveUp(runId)}
                  onMoveTop={() => handleMoveTop(runId)}
                  onStop={() => handleStop(runId)}
                />
              )
            })}
          </div>
        )}
      </PanelSection>

      <PanelSection title="Running" description="Active executions you can inspect or interrupt" badge={<Activity className="h-3.5 w-3.5 text-muted-foreground" />}>
        {running.length === 0 ? (
          <EmptyState icon={<Activity className="h-5 w-5" />} title="No active runs" description="Running jobs appear here in real time." />
        ) : (
          <div className="space-y-2">
            {running.map((run) => {
              const busy = busyRunId === run.id
              return (
                <ActiveRow
                  key={run.id}
                  run={run}
                  activeRunId={state.currentRunId}
                  busy={busy}
                  onOpen={() => openRun(run.id, run.status)}
                  onStop={() => handleStop(run.id)}
                />
              )
            })}
          </div>
        )}
      </PanelSection>

      <PanelSection title="Completed Tasks" description="Recent finished runs across sessions" badge={<CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />}>
        {completed.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="No completed runs yet" description="Finished runs will appear here for review and resume." />
        ) : (
          <div className="space-y-2">
            {completed.slice(0, 60).map((run) => {
              const busy = busyRunId === run.id
              return (
                <ActiveRow
                  key={run.id}
                  run={run}
                  activeRunId={state.currentRunId}
                  busy={busy}
                  onOpen={() => openRun(run.id, run.status)}
                  onResume={run.status === 'failed' || run.status === 'interrupted' ? () => handleResume(run.id) : undefined}
                />
              )
            })}
          </div>
        )}
      </PanelSection>
    </PanelShell>
  )
}
