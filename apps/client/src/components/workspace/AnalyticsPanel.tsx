import { useState, useEffect, useMemo } from 'react'
import {
  BarChart3,
  RefreshCw,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  DollarSign,
  Brain,
  Activity,
  Target,
  Loader2,
  ArrowRight,
  ChevronDown,
  BarChart,
  PieChart,
  Layers,
  Gauge,
  GitCompare,
  Beaker,
  LineChart,
  Network,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import {
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar,
  ScatterChart,
  Scatter,
  Cell,
  ComposedChart,
  AreaChart,
  Area,
  ZAxis,
  ReferenceLine,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PanelShell, PanelSection, MetricRow, EmptyState } from './PanelShell'
import { useWorkspace } from '@/stores/workspace-store'
import { api } from '@/lib/api'
import { getChartColors } from '@/lib/chart-theme'
import { buildVisualRunPdf } from '@/lib/visual-report-pdf'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const DETECTOR_LABELS: Record<string, string> = {
  afk_judge: 'AI Tested',
  retrieval_consistency: 'Retrieval Consistency',
  rule: 'Rule-Based',
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

export function AnalyticsPanel() {
  const { state, dispatch, actions } = useWorkspace()
  const isOpen = state.activePanel === 'analytics'
  const [activeTab, setActiveTab] = useState('overview')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Comparison state
  const [compBaselineId, setCompBaselineId] = useState(state.baselineRunId ?? '')
  const [compCandidateId, setCompCandidateId] = useState(state.currentRunId ?? '')
  const [compResult, setCompResult] = useState<any>(null)

  // Mitigation state
  const [mitigationName, setMitigationName] = useState('')
  const [mitigationResult, setMitigationResult] = useState<any>(null)

  // Calibration & inference (lazy loaded)
  const [calibration, setCalibration] = useState<any>(null)
  const [inference, setInference] = useState<any>(null)
  const [cooccurrence, setCooccurrence] = useState<any>(null)
  const [narrativeSummary, setNarrativeSummary] = useState<any>(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)

  const colors = useMemo(() => getChartColors(), [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await actions.fetchAnalytics()
    setTimeout(() => setIsRefreshing(false), 600)
  }

  // Lazy-load tab-specific data
  useEffect(() => {
    if (!state.currentRunId) return
    if (activeTab === 'calibration' && !calibration) {
      api.getCalibration(state.currentRunId).then(setCalibration).catch(() => {})
    }
    if (activeTab === 'inference' && !inference) {
      api.getInference(state.currentRunId).then(setInference).catch(() => {})
    }
    if (activeTab === 'cooccurrence' && !cooccurrence) {
      api.getCooccurrence(state.currentRunId).then(setCooccurrence).catch(() => {})
    }
  }, [activeTab, state.currentRunId, calibration, inference, cooccurrence])

  useEffect(() => {
    if (!state.currentRunId) {
      setNarrativeSummary(null)
      return
    }
    setNarrativeLoading(true)
    api
      .getNarrativeSummary(state.currentRunId)
      .then(setNarrativeSummary)
      .catch(() => setNarrativeSummary(null))
      .finally(() => setNarrativeLoading(false))
  }, [state.currentRunId])

  const handleCompare = async () => {
    if (!compBaselineId || !compCandidateId) return
    try {
      const result = await api.compareRuns(compBaselineId, compCandidateId)
      setCompResult(result)
      toast.success('Comparison complete')
    } catch (e: any) {
      toast.error(e.message || 'Compare failed')
    }
  }

  const handleMitigation = async () => {
    if (!compBaselineId || !compCandidateId || !mitigationName) return
    try {
      const result = await api.createMitigationExperiment({
        name: mitigationName,
        baseline_run_id: compBaselineId,
        candidate_run_id: compCandidateId,
      })
      setMitigationResult(result)
      toast.success('Mitigation experiment created')
    } catch (e: any) {
      toast.error(e.message || 'Mitigation failed')
    }
  }

  const handleGenerateReport = async () => {
    if (!state.currentRunId) return
    const result = await actions.generateReport()
    if (!result) {
      toast.error('Failed to generate report')
      return
    }
    try {
      const jsonBlob = await api.downloadReport(state.currentRunId, 'json')
      let comprehensivePayload: any = null
      try {
        comprehensivePayload = JSON.parse(await jsonBlob.text())
      } catch {
        comprehensivePayload = null
      }
      const blob = buildVisualRunPdf({
        runId: state.currentRunId,
        scorecard,
        attackSummary: state.attackSummary,
        executionSlices,
        detectorVotes,
        forecasts,
        narrativeSummary,
        comprehensivePayload,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `run-${state.currentRunId}-visual-report.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success(`Visual report ready: ${result.execution_count ?? 0} executions`)
    } catch (error: any) {
      toast.error(error?.message || 'Report export failed')
    }
  }

  const handleGenerateNarrative = async (regenerate = false) => {
    if (!state.currentRunId) return
    setNarrativeLoading(true)
    try {
      const payload = await api.generateNarrativeSummary(state.currentRunId, regenerate)
      setNarrativeSummary(payload)
      toast.success(regenerate ? 'Advisory regenerated' : 'Advisory generated')
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate advisory')
    } finally {
      setNarrativeLoading(false)
    }
  }

  const handleExportNarrative = () => {
    if (!narrativeSummary || !state.currentRunId) return
    const blob = new Blob([JSON.stringify(narrativeSummary, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `run-${state.currentRunId}-narrative.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const buildNarrativeMarkdown = () => {
    if (!narrativeSummary || !state.currentRunId) return ''
    const lines: string[] = []
    const issuedAt = narrativeSummary.generated_at ? new Date(narrativeSummary.generated_at).toISOString() : new Date().toISOString()
    lines.push(`# MetroX Advisory Summary`)
    lines.push(``)
    lines.push(`- Run ID: \`${state.currentRunId}\``)
    lines.push(`- Generated At: ${issuedAt}`)
    lines.push(``)
    lines.push(`## Executive Summary`)
    lines.push(String(narrativeSummary.executive_summary ?? ''))
    lines.push(``)
    lines.push(`## Plain-Language Explanation`)
    lines.push(String(narrativeSummary.non_technical_explanation ?? ''))
    lines.push(``)
    lines.push(`## Top Vulnerabilities`)
    if (Array.isArray(narrativeSummary.top_vulnerabilities) && narrativeSummary.top_vulnerabilities.length > 0) {
      for (const vuln of narrativeSummary.top_vulnerabilities) {
        lines.push(`- **${String(vuln.title ?? 'Untitled')}** (${String(vuln.severity ?? 'unknown')})`)
        lines.push(`  - Evidence: ${String(vuln.evidence ?? 'n/a')}`)
      }
    } else {
      lines.push(`- No vulnerabilities listed.`)
    }
    lines.push(``)
    lines.push(`## Recommended Actions`)
    if (Array.isArray(narrativeSummary.advisories) && narrativeSummary.advisories.length > 0) {
      for (const adv of narrativeSummary.advisories) {
        lines.push(`- **[P${String(adv.priority ?? '?')}] ${String(adv.action ?? 'Action')}**`)
        lines.push(`  - Why: ${String(adv.why ?? 'n/a')}`)
      }
    } else {
      lines.push(`- No advisories listed.`)
    }
    lines.push(``)
    lines.push(`---`)
    lines.push(`Generated by MetroX`)
    return lines.join('\n')
  }

  const handleExportNarrativeMarkdown = () => {
    if (!state.currentRunId || !narrativeSummary) return
    const markdown = buildNarrativeMarkdown()
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `run-${state.currentRunId}-advisory.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExportNarrativePdf = () => {
    if (!state.currentRunId || !narrativeSummary) return
    const markdown = buildNarrativeMarkdown()
    const win = window.open('', '_blank', 'noopener,noreferrer')
    if (!win) {
      toast.error('Enable popups to export PDF.')
      return
    }
    const escaped = markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    win.document.open()
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>MetroX Advisory ${state.currentRunId}</title>
          <style>
            body { font-family: "IBM Plex Sans", "Segoe UI", sans-serif; margin: 32px; color: #111827; }
            h1 { font-size: 24px; margin: 0 0 16px; }
            pre { white-space: pre-wrap; font-family: "IBM Plex Mono", "SFMono-Regular", monospace; font-size: 12px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <h1>MetroX Advisory Summary</h1>
          <pre>${escaped}</pre>
        </body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 250)
  }

  const { scorecard, riskCards, costSummary, costTimeseries, clusters, drift, executionSlices, features, forecasts, telemetry, nodeTelemetry, detectorVotes, policyEvents } = state

  const noData = !scorecard && !state.attackSummary
  const attackDistribution = useMemo(
    () =>
      (state.attackSummary?.attack_types ?? []).map((row) => ({
        attack_type: row.attack_type,
        attack_label: humanizeIdentifier(row.attack_type),
        blocked: row.failure,
        compromised: row.success,
      })),
    [state.attackSummary],
  )
  const detectorFailRate = useMemo(() => {
    const buckets: Record<string, { detector_name: string; votes: number; fail_votes: number }> = {}
    for (const vote of detectorVotes) {
      const key = vote.detector_name
      const bucket = buckets[key] ?? { detector_name: key, votes: 0, fail_votes: 0 }
      bucket.votes += 1
      if (Object.values(vote.failure_flags ?? {}).some(Boolean)) bucket.fail_votes += 1
      buckets[key] = bucket
    }
    return Object.values(buckets)
      .map((bucket) => ({
        ...bucket,
        detector_label: detectorLabel(bucket.detector_name),
        fail_rate_pct: (bucket.fail_votes / Math.max(bucket.votes, 1)) * 100,
      }))
      .sort((a, b) => b.fail_rate_pct - a.fail_rate_pct)
  }, [detectorVotes])
  const disagreementUncertainty = useMemo(
    () =>
      (state.attackSummary?.attack_types ?? []).map((row) => ({
        attack_type: row.attack_type,
        attack_label: humanizeIdentifier(row.attack_type),
        avg_disagreement: row.avg_disagreement ?? 0,
        avg_uncertainty: row.avg_uncertainty ?? 0,
      })),
    [state.attackSummary],
  )
  const latencyCostFrontier = useMemo(
    () =>
      (nodeTelemetry?.nodes ?? []).map((row) => ({
        attack_type: row.attack_type,
        attack_label: humanizeIdentifier(row.attack_type),
        avg_latency_ms: row.avg_latency_ms,
        effective_cost_usd: row.effective_cost_usd ?? row.cost_usd ?? 0,
        total: row.total,
      })),
    [nodeTelemetry],
  )
  const dsKpis = useMemo(() => {
    const attackRows = state.attackSummary?.attack_types ?? []
    const totalCases = attackRows.reduce((acc, row) => acc + row.total, 0)
    const totalCompromised = attackRows.reduce((acc, row) => acc + row.success, 0)
    const avgConfidence =
      attackRows.length > 0
        ? attackRows.reduce((acc, row) => acc + (row.avg_confidence ?? 0), 0) / attackRows.length
        : 0
    const avgDisagreement = state.attackSummary?.detector_summary?.avg_disagreement ?? 0
    const avgUncertainty = state.attackSummary?.detector_summary?.avg_uncertainty ?? 0
    return {
      totalCases,
      compromisedRatePct: totalCases > 0 ? (totalCompromised / totalCases) * 100 : 0,
      avgConfidence,
      avgDisagreement,
      avgUncertainty,
    }
  }, [state.attackSummary])
  const attackRiskProfile = useMemo(
    () =>
      (state.attackSummary?.attack_types ?? [])
        .map((row) => ({
          attack_type: row.attack_type,
          attack_label: humanizeIdentifier(row.attack_type),
          asr_pct: row.success_rate * 100,
          avg_confidence_pct: (row.avg_confidence ?? 0) * 100,
          total: row.total,
        }))
        .sort((a, b) => b.asr_pct - a.asr_pct),
    [state.attackSummary],
  )
  const detectorQuality = useMemo(() => {
    const grouped: Record<string, { detector_name: string; votes: number; fail_votes: number; confidence_total: number }> = {}
    for (const vote of detectorVotes) {
      const key = vote.detector_name || 'unknown'
      const existing = grouped[key] ?? { detector_name: key, votes: 0, fail_votes: 0, confidence_total: 0 }
      existing.votes += 1
      existing.confidence_total += vote.confidence ?? 0
      if (Object.values(vote.failure_flags ?? {}).some(Boolean)) existing.fail_votes += 1
      grouped[key] = existing
    }
    return Object.values(grouped).map((row) => ({
      ...row,
      detector_label: detectorLabel(row.detector_name),
      fail_rate_pct: row.votes > 0 ? (row.fail_votes / row.votes) * 100 : 0,
      avg_confidence_pct: row.votes > 0 ? (row.confidence_total / row.votes) * 100 : 0,
    }))
  }, [detectorVotes])

  return (
    <PanelShell
      open={isOpen}
      onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
      position="right"
      title="Analytics"
      icon={<BarChart3 className="h-4 w-4" />}
      badge={scorecard && (
        <Badge
          variant={scorecard.gates.pass ? 'default' : 'destructive'}
          className="text-[10px] h-4"
        >
          {scorecard.gates.pass ? 'PASS' : 'FAIL'}
        </Badge>
      )}
      width="w-[440px] lg:w-[500px]"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn('h-3 w-3 mr-1', isRefreshing && 'animate-spin')} /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={handleGenerateReport} disabled={!state.currentRunId}>
            <FileText className="h-3 w-3 mr-1" /> Report
          </Button>
        </div>
      }
    >
      {noData ? (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title="No analytics data"
          description="Load a run ID or launch a run to view analytics."
        />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-5 h-8 mb-4">
            <TabsTrigger value="overview" className="text-[10px]">Overview</TabsTrigger>
            <TabsTrigger value="data-science" className="text-[10px]">Analytics</TabsTrigger>
            <TabsTrigger value="cost" className="text-[10px]">Cost</TabsTrigger>
            <TabsTrigger value="risk" className="text-[10px]">Risk</TabsTrigger>
            <TabsTrigger value="compare" className="text-[10px]">Compare</TabsTrigger>
          </TabsList>

          {/* ─── Overview Tab ─── */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            {/* Scorecard */}
            {scorecard && (
              <PanelSection title="Scorecard">
                <div className="text-center py-2 mb-2">
                  <span className={cn(
                    'text-4xl font-mono font-bold tabular-nums',
                    (scorecard.metrics.composite_score ?? 0) >= 70 ? 'text-emerald-400' :
                    (scorecard.metrics.composite_score ?? 0) >= 40 ? 'text-amber-400' : 'text-red-400'
                  )}>
                    {(scorecard.metrics.composite_score ?? 0).toFixed(1)}
                  </span>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Composite Score</p>
                </div>
                <div className="space-y-0.5">
                      {Object.entries(scorecard.metrics).filter(([k]) => k !== 'composite_score').map(([key, val]) => (
                        <MetricRow
                          key={key}
                          label={humanizeIdentifier(key)}
                          value={typeof val === 'number' ? (val < 1 ? `${(val * 100).toFixed(1)}%` : val.toFixed(2)) : String(val)}
                          sub={scorecard.ci[key] ? `[${(scorecard.ci[key].low * 100).toFixed(1)}–${(scorecard.ci[key].high * 100).toFixed(1)}%]` : undefined}
                        />
                  ))}
                </div>
                {!scorecard.gates.pass && scorecard.gates.reasons.length > 0 && (
                  <div className="mt-3 p-2 rounded-lg bg-destructive/10 border border-destructive/20 space-y-1">
                    {scorecard.gates.reasons.map((r, i) => (
                      <p key={i} className="text-[10px] text-destructive flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> {r}
                      </p>
                    ))}
                  </div>
                )}
              </PanelSection>
            )}

            <PanelSection
              title="Executive Advisory"
              description="Narrative summary for stakeholders"
              badge={
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 rounded-full px-2.5 text-[9px]"
                    onClick={() => handleGenerateNarrative(Boolean(narrativeSummary))}
                    disabled={!state.currentRunId || narrativeLoading}
                  >
                    {narrativeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : narrativeSummary ? 'Regenerate' : 'Generate'}
                  </Button>
                  {narrativeSummary ? (
                    <>
                      <Button variant="outline" size="sm" className="h-6 rounded-full px-2.5 text-[9px]" onClick={handleExportNarrativeMarkdown}>
                        <FileText className="h-3 w-3 mr-1" />
                        Markdown
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 rounded-full px-2.5 text-[9px]" onClick={handleExportNarrativePdf}>
                        <Download className="h-3 w-3 mr-1" />
                        PDF
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 rounded-full px-2.5 text-[9px]" onClick={handleExportNarrative}>
                        <Download className="h-3 w-3 mr-1" />
                        JSON
                      </Button>
                    </>
                  ) : null}
                </div>
              }
            >
              {!narrativeSummary && !narrativeLoading ? (
                <p className="text-xs text-muted-foreground">No advisory generated yet for this run.</p>
              ) : narrativeLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading advisory...
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3.5">
                    <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Executive Summary</p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/95">{String(narrativeSummary.executive_summary ?? '')}</p>
                  </div>
                  <div className="rounded-xl border border-border/25 bg-background/35 px-3.5 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Stakeholder Brief</p>
                    <p className="mt-1.5 text-[11px] leading-6 text-foreground/90">{String(narrativeSummary.non_technical_explanation ?? '')}</p>
                  </div>
                  {Array.isArray(narrativeSummary.top_vulnerabilities) && narrativeSummary.top_vulnerabilities.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Top Vulnerabilities</p>
                      {narrativeSummary.top_vulnerabilities.slice(0, 4).map((item: any, index: number) => (
                        <div key={index} className="rounded-xl border border-border/25 bg-background/30 px-3 py-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] font-semibold tracking-tight">{String(item.title ?? 'Untitled')}</p>
                            <Badge
                              variant="outline"
                              className={cn(
                                'h-5 rounded-full border px-2 text-[9px] uppercase',
                                String(item.severity ?? '').toLowerCase() === 'high' && 'border-red-400/45 text-red-300',
                                String(item.severity ?? '').toLowerCase() === 'medium' && 'border-amber-400/45 text-amber-300',
                                !['high', 'medium'].includes(String(item.severity ?? '').toLowerCase()) && 'border-emerald-400/35 text-emerald-300',
                              )}
                            >
                              {String(item.severity ?? 'unknown')}
                            </Badge>
                          </div>
                          <p className="mt-1.5 border-l border-border/35 pl-2 text-[10px] leading-5 text-muted-foreground">
                            {String(item.evidence ?? '')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {Array.isArray(narrativeSummary.advisories) && narrativeSummary.advisories.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">AI Suggestions</p>
                      {narrativeSummary.advisories.slice(0, 4).map((item: any, index: number) => (
                        <div key={index} className="rounded-xl border border-border/25 bg-gradient-to-r from-background/40 to-transparent px-3 py-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] font-semibold tracking-tight">{String(item.action ?? 'Action')}</p>
                            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[9px]">
                              P{String(item.priority ?? index + 1)}
                            </Badge>
                          </div>
                          <p className="mt-1.5 text-[10px] leading-5 text-muted-foreground">{String(item.why ?? '')}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </PanelSection>

            {/* Clusters */}
            {clusters && clusters.clusters.length > 0 && (
              <PanelSection title="Failure Clusters" badge={
                <Badge variant="outline" className="text-[10px] h-4">{clusters.clusters.length}</Badge>
              }>
                <div className="space-y-2">
                  {clusters.clusters.map((c) => (
                    <div key={c.cluster_id} className="p-2 rounded-lg border border-border/30 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium">{c.label}</span>
                        <Badge variant="secondary" className="text-[9px] h-4">{c.size} items</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {c.top_terms.slice(0, 5).map((t) => (
                          <span key={t} className="text-[9px] text-muted-foreground bg-muted/40 rounded px-1 py-0.5">{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </PanelSection>
            )}

            {/* Forecasts */}
            {forecasts && forecasts.forecasts.length > 0 && (
              <PanelSection title="Forecasts" description="EWMA-based 7-step predictions">
                <div className="space-y-1">
                  {forecasts.forecasts.map((f: any, i: number) => (
                    <MetricRow
                      key={i}
                      label={f.metric_name}
                      value={typeof f.predicted_value === 'number' ? f.predicted_value.toFixed(3) : f.predicted_value}
                      sub={`[${f.low?.toFixed(3)}–${f.high?.toFixed(3)}]`}
                    />
                  ))}
                </div>
              </PanelSection>
            )}

            {/* Execution slices */}
            {executionSlices && executionSlices.slices.length > 0 && (
              <PanelSection title="Execution Slices" description="By attack type × provider × model">
                <div className="overflow-x-auto -mx-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[9px] h-7">Attack</TableHead>
                        <TableHead className="text-[9px] h-7">Model</TableHead>
                        <TableHead className="text-[9px] h-7 text-right">Count</TableHead>
                        <TableHead className="text-[9px] h-7 text-right">Latency</TableHead>
                        <TableHead className="text-[9px] h-7 text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {executionSlices.slices.slice(0, 10).map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[10px] py-1">{humanizeIdentifier(s.attack_type)}</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono">{s.model}</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">{s.count}</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">{s.avg_latency_ms.toFixed(0)}ms</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">${s.effective_cost_usd.toFixed(4)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </PanelSection>
            )}

            {/* Drift Signals */}
            {drift && drift.drift_signals.length > 0 && (
              <PanelSection title="Drift Signals" description="Feature distribution changes vs baseline">
                <div className="space-y-1.5">
                  {drift.drift_signals.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <Badge
                        variant={d.drift_level === 'high' ? 'destructive' : d.drift_level === 'medium' ? 'default' : 'secondary'}
                        className="text-[9px] h-4 w-12 justify-center"
                      >
                        {d.drift_level}
                      </Badge>
                      <span className="flex-1 text-muted-foreground font-mono truncate">{d.feature_name}</span>
                      <span className="font-mono text-muted-foreground">PSI: {d.psi.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </PanelSection>
            )}

            {/* Detector votes summary */}
            {detectorVotes.length > 0 && (
              <PanelSection title="Detector Votes" badge={
                <Badge variant="outline" className="text-[10px] h-4">{detectorVotes.length}</Badge>
              }>
                {(() => {
                  const byDetector = detectorVotes.reduce<Record<string, { count: number; avgConf: number }>>((acc, v) => {
                    if (!acc[v.detector_name]) acc[v.detector_name] = { count: 0, avgConf: 0 }
                    acc[v.detector_name].count++
                    acc[v.detector_name].avgConf += v.confidence
                    return acc
                  }, {})
                  return (
                    <div className="space-y-1">
                      {Object.entries(byDetector).map(([name, { count, avgConf }]) => (
                        <MetricRow
                          key={name}
                          label={detectorLabel(name)}
                          value={count}
                          sub={`avg: ${(avgConf / count).toFixed(2)}`}
                        />
                      ))}
                    </div>
                  )
                })()}
              </PanelSection>
            )}

            {/* Features */}
            {features && features.features.length > 0 && (
              <PanelSection title="Feature Table" badge={
                <Badge variant="outline" className="text-[10px] h-4">{features.features.length} rows</Badge>
              }>
                <div className="overflow-x-auto -mx-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(features.features[0] || {}).slice(0, 5).map((k) => (
                          <TableHead key={k} className="text-[9px] h-7">{k.replace(/_/g, ' ')}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {features.features.slice(0, 8).map((f, i) => (
                        <TableRow key={i}>
                          {Object.values(f).slice(0, 5).map((v, j) => (
                            <TableCell key={j} className="text-[10px] py-1 font-mono">
                              {typeof v === 'number' ? v.toFixed(2) : String(v).slice(0, 12)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </PanelSection>
            )}

            {/* Policy events */}
            {policyEvents.length > 0 && (
              <PanelSection title="Policy Events" badge={
                <Badge variant="outline" className="text-[10px] h-4">{policyEvents.length}</Badge>
              }>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {policyEvents.slice(0, 20).map((e) => (
                    <div key={e.id} className="flex items-start gap-2 text-[10px]">
                      <Badge variant={e.event_type.includes('denied') ? 'destructive' : 'secondary'} className="text-[9px] h-4 shrink-0">
                        {e.event_type}
                      </Badge>
                      <span className="text-muted-foreground line-clamp-1">{e.message}</span>
                    </div>
                  ))}
                </div>
              </PanelSection>
            )}
          </TabsContent>

          {/* ─── Data Science Tab ─── */}
          <TabsContent value="data-science" className="space-y-4 mt-0">
            <PanelSection title="Model Risk Snapshot" description="High-level DS indicators for this run">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/40 bg-background/50 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Cases</p>
                  <p className="mt-1 text-lg font-mono tabular-nums">{dsKpis.totalCases.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-background/50 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Compromised Rate</p>
                  <p className={cn('mt-1 text-lg font-mono tabular-nums', dsKpis.compromisedRatePct > 10 ? 'text-red-400' : 'text-emerald-400')}>
                    {dsKpis.compromisedRatePct.toFixed(2)}%
                  </p>
                </div>
                <div className="rounded-lg border border-border/40 bg-background/50 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Detector Confidence</p>
                  <p className="mt-1 text-lg font-mono tabular-nums">{(dsKpis.avgConfidence * 100).toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-background/50 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Consensus Quality</p>
                  <p className="mt-1 text-sm font-mono tabular-nums">
                    d={dsKpis.avgDisagreement.toFixed(3)} u={dsKpis.avgUncertainty.toFixed(3)}
                  </p>
                </div>
              </div>
            </PanelSection>

            <PanelSection title="Test Outcome Distribution" description="Compromised vs blocked counts per test type">
              {attackDistribution.length > 0 ? (
                <div className="h-[220px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReBarChart data={attackDistribution}>
                      <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="attack_label" tick={{ fontSize: 9, fill: colors.axis }} />
                      <YAxis tick={{ fontSize: 9, fill: colors.axis }} />
                      <ReTooltip contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 10 }} />
                      <Bar dataKey="blocked" stackId="outcome" fill={colors.chart2} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="compromised" stackId="outcome" fill={colors.chart3} radius={[4, 4, 0, 0]} />
                    </ReBarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No test distribution data.</p>
              )}
            </PanelSection>

            <PanelSection title="Test-Type Risk Profile" description="ASR and confidence profile by test type">
              {attackRiskProfile.length > 0 ? (
                <div className="h-[220px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={attackRiskProfile}>
                      <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="attack_label" tick={{ fontSize: 9, fill: colors.axis }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 9, fill: colors.axis }} tickFormatter={(v) => `${v}%`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: colors.axis }} />
                      <ReTooltip
                        contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 10 }}
                      />
                      <Bar yAxisId="left" dataKey="asr_pct" fill={colors.chart3} radius={[4, 4, 0, 0]} />
                      <Line yAxisId="left" dataKey="avg_confidence_pct" stroke={colors.chart2} strokeWidth={2} dot={false} />
                      <Line yAxisId="right" dataKey="total" stroke={colors.chart4} strokeWidth={1.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No risk-profile data.</p>
              )}
            </PanelSection>

            <PanelSection title="Detector Quality Matrix" description="Fail rate vs confidence, aggregated by detector">
              {detectorQuality.length > 0 ? (
                <div className="h-[200px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={detectorQuality}>
                      <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="detector_label" tick={{ fontSize: 9, fill: colors.axis }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 9, fill: colors.axis }} tickFormatter={(v) => `${v}%`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: colors.axis }} tickFormatter={(v) => `${v}%`} />
                      <ReTooltip
                        formatter={(_value: number, _name: string, ctx: any) => {
                          const row = ctx?.payload ?? {}
                          return [
                            `fail=${Number(row.fail_rate_pct ?? 0).toFixed(2)}%, conf=${Number(row.avg_confidence_pct ?? 0).toFixed(2)}%`,
                            `${row.detector_label ?? ''} (${row.fail_votes ?? 0}/${row.votes ?? 0})`,
                          ]
                        }}
                        contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 10 }}
                      />
                      <Bar yAxisId="left" dataKey="fail_rate_pct" fill={colors.chart3} radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" dataKey="avg_confidence_pct" stroke={colors.chart1} strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No detector vote data.</p>
              )}
            </PanelSection>

            <PanelSection title="Disagreement vs Uncertainty" description="Per-test consensus diagnostics">
              {disagreementUncertainty.length > 0 ? (
                <div className="h-[200px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
                      <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                      <ReferenceLine x={0.2} stroke={colors.axis} strokeDasharray="3 3" />
                      <ReferenceLine y={0.2} stroke={colors.axis} strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="avg_disagreement" name="disagreement" tick={{ fontSize: 9, fill: colors.axis }} />
                      <YAxis type="number" dataKey="avg_uncertainty" name="uncertainty" tick={{ fontSize: 9, fill: colors.axis }} />
                      <ReTooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        formatter={(_value, _name, ctx: any) => [ctx?.payload?.attack_label ?? '', `d=${ctx?.payload?.avg_disagreement?.toFixed(3)} u=${ctx?.payload?.avg_uncertainty?.toFixed(3)}`]}
                        contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 10 }}
                      />
                      <Scatter data={disagreementUncertainty} fill={colors.chart4} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No disagreement/uncertainty data.</p>
              )}
            </PanelSection>

            <PanelSection title="Latency-Cost Frontier" description="Test type efficiency frontier (bubble size = case count)">
              {latencyCostFrontier.length > 0 ? (
                <div className="h-[220px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
                      <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="avg_latency_ms" name="latency" tick={{ fontSize: 9, fill: colors.axis }} />
                      <YAxis type="number" dataKey="effective_cost_usd" name="cost" tick={{ fontSize: 9, fill: colors.axis }} />
                      <ZAxis type="number" dataKey="total" range={[40, 260]} />
                      <ReTooltip
                        formatter={(_value, _name, ctx: any) => [ctx?.payload?.attack_label ?? '', `latency=${ctx?.payload?.avg_latency_ms?.toFixed(1)}ms cost=$${ctx?.payload?.effective_cost_usd?.toFixed(4)}`]}
                        contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 10 }}
                      />
                      <Scatter data={latencyCostFrontier} fill={colors.chart1}>
                        {latencyCostFrontier.map((row, index) => (
                          <Cell key={`${row.attack_type}-${index}`} fill={colors.chart1} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No latency-cost telemetry data.</p>
              )}
            </PanelSection>

            <PanelSection title="Cost Trend Envelope" description="Cumulative spend progression over execution steps">
              {costTimeseries && costTimeseries.points.length > 0 ? (
                <div className="h-[200px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={costTimeseries.points}>
                      <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="step" tick={{ fontSize: 9, fill: colors.axis }} />
                      <YAxis tick={{ fontSize: 9, fill: colors.axis }} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
                      <ReTooltip contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 10 }} />
                      <Area type="monotone" dataKey="cumulative_cost_usd" stroke={colors.chart1} fill={colors.chart1} fillOpacity={0.22} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No cumulative cost trend available.</p>
              )}
            </PanelSection>
          </TabsContent>

          {/* ─── Cost Tab ─── */}
          <TabsContent value="cost" className="space-y-4 mt-0">
            {costSummary && (
              <PanelSection title="Cost Summary">
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <MetricRow label="Effective Cost" value={`$${costSummary.totals.effective_cost.toFixed(4)}`} />
                  <MetricRow label="Provider Cost" value={`$${costSummary.totals.provider_cost.toFixed(4)}`} />
                  <MetricRow label="Prompt Tokens" value={costSummary.totals.prompt_tokens.toLocaleString()} />
                  <MetricRow label="Completion Tokens" value={costSummary.totals.completion_tokens.toLocaleString()} />
                </div>
                {costSummary.cost_gate && (
                  <div className={cn(
                    'mt-2 p-2 rounded-lg border',
                    costSummary.cost_gate.pass ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-destructive/20 bg-destructive/5'
                  )}>
                    <div className="flex items-center justify-between text-[10px]">
                      <span>Cost Gate</span>
                      <Badge variant={costSummary.cost_gate.pass ? 'default' : 'destructive'} className="text-[9px] h-4">
                        {costSummary.cost_gate.pass ? 'PASS' : 'FAIL'}
                      </Badge>
                    </div>
                    {costSummary.cost_gate.budget_usd && (
                      <Progress
                        value={Math.min(((costSummary.cost_gate.spent_usd ?? 0) / costSummary.cost_gate.budget_usd) * 100, 100)}
                        className="h-1 mt-1.5"
                      />
                    )}
                  </div>
                )}
              </PanelSection>
            )}

            {/* Cost breakdown */}
            {costSummary?.breakdown && Object.keys(costSummary.breakdown).length > 0 && (
              <PanelSection title="Breakdown by Model">
                <div className="space-y-1">
                  {Object.entries(costSummary.breakdown).map(([model, data]: [string, any]) => (
                    <MetricRow
                      key={model}
                      label={model}
                      value={`$${data.cost?.toFixed(4)}`}
                      sub={`${data.count} calls`}
                    />
                  ))}
                </div>
              </PanelSection>
            )}

            {/* Cost timeseries chart */}
            {costTimeseries && costTimeseries.points.length > 0 && (
              <PanelSection title="Cost Over Time">
                <div className="h-[180px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReLineChart data={costTimeseries.points}>
                      <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="step" tick={{ fontSize: 9, fill: colors.axis }} />
                      <YAxis tick={{ fontSize: 9, fill: colors.axis }} tickFormatter={(v) => `$${v}`} />
                      <ReTooltip
                        contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 10 }}
                      />
                      <Line type="monotone" dataKey="cumulative_cost_usd" stroke={colors.chart1} strokeWidth={2} dot={false} />
                    </ReLineChart>
                  </ResponsiveContainer>
                </div>
              </PanelSection>
            )}

            {/* Cost sources */}
            {costSummary?.sources && (
              <PanelSection title="Cost Sources">
                <div className="space-y-0.5">
                  <MetricRow label="Provider reported" value={costSummary.sources.provider} />
                  <MetricRow label="Estimated (fallback)" value={costSummary.sources.fallback} />
                  <MetricRow label="Mixed" value={costSummary.sources.mixed} />
                </div>
              </PanelSection>
            )}
          </TabsContent>

          {/* ─── Risk Tab ─── */}
          <TabsContent value="risk" className="space-y-4 mt-0">
            {riskCards && riskCards.risks.length > 0 ? (
              <PanelSection title="Risk Cards" description="Calibrated risk predictions per failure type">
                <div className="space-y-3">
                  {riskCards.risks.map((r) => {
                    const riskPct = r.risk_probability * 100
                    const riskColor = riskPct > 50 ? 'text-red-400' : riskPct > 25 ? 'text-amber-400' : 'text-emerald-400'
                    return (
                      <div key={r.failure_type} className="p-3 rounded-lg border border-border/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium">{humanizeIdentifier(r.failure_type)}</span>
                          <span className={cn('text-sm font-mono font-semibold', riskColor)}>{riskPct.toFixed(1)}%</span>
                        </div>
                        <Progress value={riskPct} className="h-1.5" />
                        <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                          <span>CI: [{(r.uncertainty_band.low * 100).toFixed(1)}–{(r.uncertainty_band.high * 100).toFixed(1)}%]</span>
                          <span>n={r.sample_size}</span>
                        </div>
                        {r.top_drivers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.top_drivers.slice(0, 4).map((d) => (
                              <span key={d} className="text-[9px] bg-muted/40 text-muted-foreground rounded px-1.5 py-0.5">{d}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </PanelSection>
            ) : (
              <EmptyState icon={<Gauge className="h-8 w-8" />} title="No risk data" description="Risk predictions appear after run completes." />
            )}

            {/* Calibration */}
            {calibration?.reports && calibration.reports.length > 0 && (
              <PanelSection title="Calibration" description="Model calibration metrics">
                <div className="space-y-1">
                  {calibration.reports.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{humanizeIdentifier(String(r.failure_type ?? ''))}</span>
                      <div className="flex gap-3 font-mono">
                        <span>ECE: {r.ece?.toFixed(3)}</span>
                        <span>Brier: {r.brier?.toFixed(3)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </PanelSection>
            )}

            {/* Statistical inference */}
            {inference?.tests && inference.tests.length > 0 && (
              <PanelSection title="Statistical Inference" description="Effect sizes and p-values">
                <div className="overflow-x-auto -mx-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[9px] h-7">Metric</TableHead>
                        <TableHead className="text-[9px] h-7 text-right">Effect</TableHead>
                        <TableHead className="text-[9px] h-7 text-right">p-value</TableHead>
                        <TableHead className="text-[9px] h-7 text-right">Power</TableHead>
                        <TableHead className="text-[9px] h-7 text-right">CI</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inference.tests.map((t: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-[10px] py-1">{t.metric_name}</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">{t.effect_size?.toFixed(4)}</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">{t.p_value?.toFixed(4)}</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">{t.power?.toFixed(3)}</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">[{t.ci_low?.toFixed(3)},{t.ci_high?.toFixed(3)}]</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </PanelSection>
            )}

            {/* Co-occurrence graph */}
            {cooccurrence?.edges && cooccurrence.edges.length > 0 && (
              <PanelSection title="Co-occurrence Graph" description="Failure × tool co-occurrence">
                <div className="space-y-1">
                  {cooccurrence.edges.slice(0, 10).map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="font-mono text-muted-foreground">{e.source}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                      <span className="font-mono text-muted-foreground">{e.target}</span>
                      <span className="ml-auto font-mono">{e.weight?.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </PanelSection>
            )}
          </TabsContent>

          {/* ─── Compare Tab ─── */}
          <TabsContent value="compare" className="space-y-4 mt-0">
            <PanelSection title="Run Comparison" description="Statistical comparison of two runs">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Baseline Run</label>
                    <Input value={compBaselineId} onChange={(e) => setCompBaselineId(e.target.value)} placeholder="run-id..." className="h-7 text-xs font-mono mt-0.5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Candidate Run</label>
                    <Input value={compCandidateId} onChange={(e) => setCompCandidateId(e.target.value)} placeholder="run-id..." className="h-7 text-xs font-mono mt-0.5" />
                  </div>
                </div>
                <Button size="sm" className="w-full h-7 text-[10px]" onClick={handleCompare} disabled={!compBaselineId || !compCandidateId}>
                  <GitCompare className="h-3 w-3 mr-1" /> Compare Runs
                </Button>
              </div>
              {compResult && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Composite Delta</span>
                    <span className={cn(
                      'text-sm font-mono font-semibold',
                      (compResult.summary?.composite_delta ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
                    )}>
                      {(compResult.summary?.composite_delta ?? 0) >= 0 ? '+' : ''}{compResult.summary?.composite_delta?.toFixed(2)}
                    </span>
                  </div>
                  {compResult.tests && Object.entries(compResult.tests).map(([metric, test]: [string, any]) => (
                    <div key={metric} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{metric}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className={test.significant ? 'text-amber-400' : 'text-muted-foreground'}>
                          Δ{test.delta?.toFixed(4)}
                        </span>
                        <span className="text-muted-foreground">p={test.p_value?.toFixed(4)}</span>
                        {test.significant && <AlertTriangle className="h-3 w-3 text-amber-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PanelSection>

            <PanelSection title="Mitigation Experiment" description="Compare baseline vs candidate with recommendations">
              <div className="space-y-2">
                <Input value={mitigationName} onChange={(e) => setMitigationName(e.target.value)} placeholder="Experiment name..." className="h-7 text-xs" />
                <Button size="sm" className="w-full h-7 text-[10px]" onClick={handleMitigation} disabled={!mitigationName || !compBaselineId || !compCandidateId}>
                  <Beaker className="h-3 w-3 mr-1" /> Create Experiment
                </Button>
              </div>
              {mitigationResult && (
                <div className="mt-3 space-y-2">
                  <Badge variant="outline" className="text-[10px]">{mitigationResult.status}</Badge>
                  {mitigationResult.effects?.length > 0 && (
                    <div className="space-y-1">
                      {mitigationResult.effects.map((e: any, i: number) => (
                        <MetricRow
                          key={i}
                          label={e.metric_name ?? `Effect ${i + 1}`}
                          value={`${(e.uplift ?? 0) >= 0 ? '+' : ''}${(e.uplift ?? 0).toFixed(4)}`}
                          sub={`p=${e.p_value?.toFixed(4)}`}
                          color={(e.uplift ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
                        />
                      ))}
                    </div>
                  )}
                  {mitigationResult.recommendations?.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      <p className="text-[10px] font-medium text-muted-foreground">Recommendations:</p>
                      {mitigationResult.recommendations.map((r: any, i: number) => (
                        <div key={i} className="p-2 rounded-lg border border-border/30 text-[10px]">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{r.title}</span>
                            <Badge variant="secondary" className="text-[9px] h-4">#{r.rank}</Badge>
                          </div>
                          <p className="text-muted-foreground mt-0.5">{r.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </PanelSection>
          </TabsContent>
        </Tabs>
      )}
    </PanelShell>
  )
}
