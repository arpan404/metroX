import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Database,
  Loader2,
  Minus,
  Send,
  Target,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import {
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { getChartColors } from '@/lib/chart-theme'
import type { AdjudicationCreate, DetectorVote, DetectorVoteSummaryPayload } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/stores/workspace-store'
import { toast } from 'sonner'
import { EmptyState, MetricRow, PanelSection, PanelShell } from './PanelShell'

function hasFailure(flags: Record<string, boolean> | undefined): boolean {
  return Object.values(flags ?? {}).some(Boolean)
}

function failureLabel(flags: Record<string, boolean> | undefined): string {
  const found = Object.entries(flags ?? {}).find(([, value]) => Boolean(value))
  return found ? found[0].replace(/_/g, ' ') : 'none'
}

export function AttackDetailPanel() {
  const { state, dispatch } = useWorkspace()
  const isOpen = state.activePanel === 'attack-detail'
  const selectedType = state.selectedAttackType
  const runId = state.currentRunId
  const colors = useMemo(() => getChartColors(), [])

  const [summary, setSummary] = useState<DetectorVoteSummaryPayload | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [adjReviewer, setAdjReviewer] = useState('')
  const [adjDecision, setAdjDecision] = useState<string>('')
  const [adjRationale, setAdjRationale] = useState('')
  const [adjExecutionId, setAdjExecutionId] = useState('')
  const [adjSubmitting, setAdjSubmitting] = useState(false)

  const attackData = state.attackSummary?.attack_types?.find((row) => row.attack_type === selectedType) ?? null

  useEffect(() => {
    if (!isOpen || !runId || !selectedType) {
      setSummary(null)
      setSummaryError(null)
      setSummaryLoading(false)
      return
    }

    let cancelled = false
    setSummaryLoading(true)
    setSummaryError(null)

    api.getDetectorVotesSummary(runId, selectedType, 200)
      .then((payload) => {
        if (cancelled) return
        setSummary(payload)
      })
      .catch((err) => {
        if (cancelled) return
        setSummary(null)
        setSummaryError(err instanceof Error ? err.message : 'Failed to load scoped detector summary')
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, runId, selectedType])

  const fallbackVotes = useMemo(() => {
    const votes = state.detectorVotes
    if (!selectedType) return votes
    const scoped = votes.filter((vote) => !vote.attack_type || vote.attack_type === selectedType)
    return scoped
  }, [selectedType, state.detectorVotes])

  const rawVotes: DetectorVote[] = useMemo(() => {
    if (summary?.raw_sample?.length) return summary.raw_sample
    return fallbackVotes.slice(0, 200)
  }, [summary, fallbackVotes])

  const telemetryRow = useMemo(() => {
    if (!selectedType) return null
    return state.nodeTelemetry?.nodes.find((row) => row.attack_type === selectedType) ?? null
  }, [state.nodeTelemetry, selectedType])

  const detectorChartData = useMemo(
    () =>
      (summary?.detectors ?? []).map((detector) => ({
        detector_name: detector.detector_name,
        fail_rate_pct: Number((detector.fail_rate * 100).toFixed(2)),
        votes: detector.votes,
      })),
    [summary],
  )

  const handleAdjudicate = async () => {
    if (!runId || !adjExecutionId || !adjReviewer || !adjDecision) return
    setAdjSubmitting(true)
    try {
      await api.createAdjudication({
        run_id: runId,
        execution_id: adjExecutionId,
        reviewer: adjReviewer,
        decision: adjDecision as AdjudicationCreate['decision'],
        rationale: adjRationale || undefined,
      })
      toast.success('Adjudication submitted')
      setAdjRationale('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Adjudication failed'
      toast.error(message)
    } finally {
      setAdjSubmitting(false)
    }
  }

  return (
    <PanelShell
      open={isOpen}
      onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
      position="left"
      title={attackData ? `Attack: ${attackData.attack_type}` : 'Attack Detail'}
      icon={<Target className="h-4 w-4" />}
      width="w-[420px] lg:w-[500px]"
    >
      {!selectedType || !attackData ? (
        <EmptyState
          icon={<Target className="h-8 w-8" />}
          title="No attack selected"
          description="Click an attack node on the canvas to inspect scoped analytics."
        />
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid h-8 w-full grid-cols-4">
            <TabsTrigger value="overview" className="text-[10px]">Overview</TabsTrigger>
            <TabsTrigger value="detectors" className="text-[10px]">Detectors</TabsTrigger>
            <TabsTrigger value="raw" className="text-[10px]">Raw Votes</TabsTrigger>
            <TabsTrigger value="telemetry" className="text-[10px]">Telemetry</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-0">
            <PanelSection
              title="Attack KPI"
              badge={
                <Badge variant="outline" className="h-4 text-[10px]">{attackData.total} cases</Badge>
              }
            >
              <div className="space-y-0.5">
                <MetricRow label="Attack Type" value={attackData.attack_type} />
                <MetricRow label="Total Attempts" value={attackData.total} />
                <MetricRow label="Blocked (Pass)" value={attackData.failure} color="text-emerald-400" />
                <MetricRow label="Compromised (Fail)" value={attackData.success} color="text-red-400" />
                <MetricRow label="Avg Confidence" value={attackData.avg_confidence.toFixed(3)} />
                <MetricRow
                  label="Avg Disagreement"
                  value={(attackData.avg_disagreement ?? summary?.consensus.avg_disagreement ?? 0).toFixed(3)}
                />
                <MetricRow
                  label="Avg Uncertainty"
                  value={(attackData.avg_uncertainty ?? summary?.consensus.avg_uncertainty ?? 0).toFixed(3)}
                />
              </div>
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Attack Success Rate</span>
                  <span
                    className={cn(
                      'font-mono font-semibold',
                      attackData.success_rate > 0.5
                        ? 'text-red-400'
                        : attackData.success_rate > 0.2
                          ? 'text-amber-400'
                          : 'text-emerald-400',
                    )}
                  >
                    {(attackData.success_rate * 100).toFixed(1)}%
                  </span>
                </div>
                <Progress value={attackData.success_rate * 100} className="h-2" />
              </div>
            </PanelSection>

            <PanelSection title="Severity Breakdown">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(attackData.severity_breakdown ?? {}).map(([sev, count]) => {
                  const tone: Record<string, string> = {
                    critical: 'bg-red-500/10 text-red-400 border-red-500/30',
                    high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
                    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                    low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                  }
                  return (
                    <Badge key={sev} variant="outline" className={cn('text-[10px] capitalize', tone[sev] ?? '')}>
                      {sev}: {String(count)}
                    </Badge>
                  )
                })}
              </div>
            </PanelSection>
          </TabsContent>

          <TabsContent value="detectors" className="space-y-4 mt-0">
            <PanelSection
              title="Detector Consensus"
              description="Scoped to this attack type"
              badge={
                summaryLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : (
                  <Badge variant="outline" className="h-4 text-[10px]">
                    {summary?.totals.votes ?? fallbackVotes.length} votes
                  </Badge>
                )
              }
            >
              {summaryError ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-300">
                  <div className="flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Summary endpoint unavailable, showing fallback raw votes only.</span>
                  </div>
                </div>
              ) : null}

              {detectorChartData.length > 0 ? (
                <div className="space-y-3">
                  <div className="h-44 rounded-lg border border-border/40 bg-muted/20 px-2 py-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ReBarChart data={detectorChartData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                        <XAxis dataKey="detector_name" tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                        <ReTooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
                        <Bar dataKey="fail_rate_pct" fill={colors.chart3} radius={[6, 6, 0, 0]} />
                      </ReBarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="overflow-x-auto -mx-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-7 text-[9px]">Detector</TableHead>
                          <TableHead className="h-7 text-[9px] text-right">Votes</TableHead>
                          <TableHead className="h-7 text-[9px] text-right">Fail Rate</TableHead>
                          <TableHead className="h-7 text-[9px] text-right">Confidence</TableHead>
                          <TableHead className="h-7 text-[9px] text-right">Latency</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(summary?.detectors ?? []).map((detector) => (
                          <TableRow key={detector.detector_name}>
                            <TableCell className="py-1 font-mono text-[10px]">{detector.detector_name}</TableCell>
                            <TableCell className="py-1 text-right font-mono text-[10px]">{detector.votes}</TableCell>
                            <TableCell className="py-1 text-right font-mono text-[10px]">
                              {(detector.fail_rate * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className="py-1 text-right font-mono text-[10px]">
                              {(detector.avg_confidence * 100).toFixed(1)}%
                            </TableCell>
                            <TableCell className="py-1 text-right font-mono text-[10px]">
                              {detector.avg_latency_ms.toFixed(1)}ms
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<BarChart3 className="h-7 w-7" />}
                  title="No scoped detector summary"
                  description="Run analytics are still loading for this attack type."
                />
              )}
            </PanelSection>
          </TabsContent>

          <TabsContent value="raw" className="space-y-4 mt-0">
            <PanelSection
              title="Raw Detector Votes"
              description="Per-execution vote sample for debugging"
              badge={<Badge variant="outline" className="h-4 text-[10px]">{rawVotes.length}</Badge>}
            >
              {rawVotes.length ? (
                <div className="overflow-x-auto -mx-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-7 text-[9px]">Detector</TableHead>
                        <TableHead className="h-7 text-[9px]">Outcome</TableHead>
                        <TableHead className="h-7 text-[9px] text-right">Confidence</TableHead>
                        <TableHead className="h-7 text-[9px] text-right">Latency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rawVotes.slice(0, 100).map((vote) => {
                        const failed = hasFailure(vote.failure_flags)
                        return (
                          <TableRow key={vote.id}>
                            <TableCell className="py-1 font-mono text-[10px]">{vote.detector_name}</TableCell>
                            <TableCell className="py-1 text-[10px]">
                              <Badge variant={failed ? 'destructive' : 'default'} className="h-4 text-[9px]">
                                {failed ? `fail (${failureLabel(vote.failure_flags)})` : 'pass'}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-1 text-right font-mono text-[10px]">
                              {(vote.confidence * 100).toFixed(1)}%
                            </TableCell>
                            <TableCell className="py-1 text-right font-mono text-[10px]">
                              {vote.latency_ms.toFixed(1)}ms
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={<Database className="h-7 w-7" />}
                  title="No detector votes"
                  description="No raw vote rows available for the selected attack type."
                />
              )}
            </PanelSection>

            <PanelSection title="Manual Adjudication" description="Review and adjudicate specific executions">
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Execution ID</label>
                  <Input
                    value={adjExecutionId}
                    onChange={(e) => setAdjExecutionId(e.target.value)}
                    placeholder="execution-id..."
                    className="mt-0.5 h-7 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground">Reviewer</label>
                  <Input
                    value={adjReviewer}
                    onChange={(e) => setAdjReviewer(e.target.value)}
                    placeholder="your name"
                    className="mt-0.5 h-7 text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground">Decision</label>
                  <div className="mt-0.5 flex gap-1.5">
                    {[
                      { value: 'agree', label: 'Agree', icon: ThumbsUp, color: 'text-emerald-400' },
                      { value: 'disagree', label: 'Disagree', icon: ThumbsDown, color: 'text-red-400' },
                      { value: 'uncertain', label: 'Uncertain', icon: Minus, color: 'text-amber-400' },
                    ].map(({ value, label, icon: Icon, color }) => (
                      <Button
                        key={value}
                        variant={adjDecision === value ? 'default' : 'outline'}
                        size="sm"
                        className={cn('h-7 flex-1 text-[10px]', adjDecision === value && color)}
                        onClick={() => setAdjDecision(value)}
                      >
                        <Icon className="mr-1 h-3 w-3" /> {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground">Rationale</label>
                  <Textarea
                    value={adjRationale}
                    onChange={(e) => setAdjRationale(e.target.value)}
                    placeholder="Optional review rationale"
                    className="mt-0.5 min-h-[64px] text-xs"
                  />
                </div>

                <Button
                  size="sm"
                  className="h-7 w-full text-[10px]"
                  onClick={handleAdjudicate}
                  disabled={adjSubmitting || !adjExecutionId || !adjReviewer || !adjDecision}
                >
                  {adjSubmitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                  Submit Adjudication
                </Button>
              </div>
            </PanelSection>
          </TabsContent>

          <TabsContent value="telemetry" className="space-y-4 mt-0">
            <PanelSection title="Node Telemetry" description="Latency, cost, and policy counters for this attack type">
              {telemetryRow ? (
                <div className="space-y-0.5">
                  <MetricRow label="Attack Type" value={telemetryRow.attack_type} />
                  <MetricRow label="Executions" value={telemetryRow.total} />
                  <MetricRow label="Blocked (Pass)" value={telemetryRow.failure} color="text-emerald-400" />
                  <MetricRow label="Compromised (Fail)" value={telemetryRow.success} color="text-red-400" />
                  <MetricRow label="Avg Latency" value={`${telemetryRow.avg_latency_ms.toFixed(1)}ms`} />
                  <MetricRow
                    label="Effective Cost"
                    value={`$${Number(telemetryRow.effective_cost_usd ?? telemetryRow.cost_usd ?? 0).toFixed(4)}`}
                  />
                  <MetricRow label="Policy Events" value={telemetryRow.policy_events ?? telemetryRow.policy_decisions ?? 0} />
                  <MetricRow label="Tool Events" value={telemetryRow.tool_events} />
                </div>
              ) : (
                <EmptyState
                  icon={<Database className="h-7 w-7" />}
                  title="No telemetry"
                  description="No telemetry rows found for the selected attack type."
                />
              )}
            </PanelSection>
          </TabsContent>
        </Tabs>
      )}
    </PanelShell>
  )
}
