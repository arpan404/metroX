import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Database,
  Loader2,
  Target,
  Sparkles,
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
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { getChartColors } from '@/lib/chart-theme'
import type { DetectorVote, DetectorVoteSummaryPayload } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/stores/workspace-store'
import { EmptyState, MetricRow, PanelSection, PanelShell } from './PanelShell'

const DETECTOR_LABELS: Record<string, string> = {
  afk_judge: 'AI Tested',
  retrieval_consistency: 'Retrieval Consistency',
  rule: 'Rule-Based',
}

function hasFailure(flags: Record<string, boolean> | undefined): boolean {
  return Object.values(flags ?? {}).some(Boolean)
}

function detectorLabel(name: string): string {
  const key = String(name || '').trim()
  if (!key) return 'Unknown'
  return DETECTOR_LABELS[key] ?? key.replace(/_/g, ' ')
}

function humanizeIdentifier(value: string): string {
  const text = String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  if (!text) return 'Unknown'
  return text
    .split(/\s+/)
    .map((word) => (word.length <= 3 ? word.toUpperCase() : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(' ')
}

function failureLabel(flags: Record<string, boolean> | undefined): string {
  const found = Object.entries(flags ?? {}).find(([, value]) => Boolean(value))
  return found ? humanizeIdentifier(found[0]) : 'none'
}

function asrWaldCi95(successes: number, total: number): { low: number; high: number } {
  const n = Math.max(0, Math.trunc(Number(total || 0)))
  const kRaw = Math.max(0, Math.trunc(Number(successes || 0)))
  if (n === 0) return { low: 0, high: 0 }
  const k = Math.min(kRaw, n)
  const pHat = k / n
  const margin = 1.96 * Math.sqrt((pHat * (1 - pHat)) / n)
  return {
    low: Math.max(0, pHat - margin),
    high: Math.min(1, pHat + margin),
  }
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

  const attackData = state.attackSummary?.attack_types?.find((row) => row.attack_type === selectedType) ?? null
  const asrCi95 = useMemo(() => {
    if (!attackData) return { low: 0, high: 0 }
    if (attackData.asr_ci_95) return attackData.asr_ci_95
    return asrWaldCi95(attackData.success, attackData.total)
  }, [attackData])

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
        detector_label: detectorLabel(detector.detector_name),
        fail_rate_pct: Number((detector.fail_rate * 100).toFixed(2)),
        votes: detector.votes,
      })),
    [summary],
  )

  return (
    <PanelShell
      open={isOpen}
      onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
      position="left"
      title={attackData ? `Test: ${humanizeIdentifier(attackData.attack_type)}` : 'Test Detail'}
      icon={<Target className="h-4 w-4" />}
      width="w-[420px] lg:w-[500px]"
    >
      {!selectedType || !attackData ? (
        <EmptyState
          icon={<Target className="h-8 w-8" />}
          title="No test selected"
          description="Click a test node on the canvas to inspect scoped analytics."
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
              title="Test KPI"
              badge={
                <Badge variant="outline" className="h-4 text-[10px]">{attackData.total} cases</Badge>
              }
            >
              <div className="space-y-0.5">
                <MetricRow label="Test Type" value={humanizeIdentifier(attackData.attack_type)} />
                <MetricRow label="Total Attempts" value={attackData.total} />
                <MetricRow label="Blocked (Pass)" value={attackData.failure} color="text-emerald-400" />
                <MetricRow label="Compromised (Fail)" value={attackData.success} color="text-red-400" />
                <MetricRow
                  label="ASR 95% CI"
                  value={`${(asrCi95.low * 100).toFixed(1)}% - ${(asrCi95.high * 100).toFixed(1)}%`}
                />
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
                  <span className="text-muted-foreground">Test Success Rate</span>
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
              description="Scoped to this test type"
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
                        <XAxis dataKey="detector_label" tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                        <ReTooltip
                          formatter={(value: number) => `${value.toFixed(2)}%`}
                          labelFormatter={(label) => `${label}`}
                          position={{ x: 14, y: 10 }}
                          wrapperStyle={{ pointerEvents: 'none' }}
                          contentStyle={{
                            background: 'transparent',
                            border: 'none',
                            boxShadow: 'none',
                            padding: 0,
                          }}
                          labelStyle={{
                            color: 'hsl(var(--foreground) / 0.86)',
                            fontSize: '10px',
                            fontWeight: 600,
                            marginBottom: '2px',
                          }}
                          itemStyle={{
                            color: 'hsl(var(--foreground) / 0.78)',
                            fontSize: '10px',
                            fontWeight: 600,
                            lineHeight: '1.15',
                            padding: 0,
                            margin: 0,
                          }}
                          cursor={{ fill: 'rgba(34, 211, 238, 0.08)' }}
                        />
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
                            <TableCell className="py-1 text-[10px]">{detectorLabel(detector.detector_name)}</TableCell>
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
                  description="Run analytics are still loading for this test type."
                />
              )}
            </PanelSection>
          </TabsContent>

          <TabsContent value="raw" className="space-y-4 mt-0">
            <div className="space-y-3">
              <div className="mb-3 rounded-lg border border-border/50 bg-background/45 px-3 py-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <div className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.04em] uppercase text-foreground/90">Vote Snapshot</p>
                    <p className="text-[10px] text-muted-foreground">Clean summary for this selected test type</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded-md border border-border/35 bg-background/35 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Total Votes</p>
                    <p className="text-xs font-semibold">{rawVotes.length}</p>
                  </div>
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/8 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-wide text-emerald-400/90">Pass</p>
                    <p className="text-xs font-semibold text-emerald-300">
                      {rawVotes.filter((vote) => !hasFailure(vote.failure_flags)).length}
                    </p>
                  </div>
                  <div className="rounded-md border border-red-500/30 bg-red-500/8 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-wide text-red-400/90">Fail</p>
                    <p className="text-xs font-semibold text-red-300">
                      {rawVotes.filter((vote) => hasFailure(vote.failure_flags)).length}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/35 bg-background/35 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Avg Confidence</p>
                    <p className="text-xs font-semibold">
                      {rawVotes.length
                        ? `${((rawVotes.reduce((sum, vote) => sum + vote.confidence, 0) / rawVotes.length) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </p>
                  </div>
                </div>
              </div>

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
                            <TableCell className="py-1 text-[10px]">{detectorLabel(vote.detector_name)}</TableCell>
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
                  description="No raw vote rows available for the selected test type."
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="telemetry" className="space-y-4 mt-0">
            <PanelSection title="Node Telemetry" description="Latency, cost, and policy counters for this test type">
              {telemetryRow ? (
                <div className="space-y-0.5">
                  <MetricRow label="Test Type" value={humanizeIdentifier(telemetryRow.attack_type)} />
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
                  description="No telemetry rows found for the selected test type."
                />
              )}
            </PanelSection>
          </TabsContent>
        </Tabs>
      )}
    </PanelShell>
  )
}
