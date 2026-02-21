import { useEffect, useMemo, useState } from 'react'
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { FileText, FlaskConical, Play } from 'lucide-react'

import { api } from '@/lib/api'
import { getChartColors } from '@/lib/chart-theme'
import type {
  ClusterPayload,
  CostSummaryPayload,
  CostTimeseriesPayload,
  DetectorVote,
  DriftPayload,
  ExecutionSlicesPayload,
  FeaturePayload,
  ForecastPayload,
  MitigationExperimentOut,
  PolicyEvent,
  RiskCards,
  Scorecard,
} from '@/lib/types'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const stagger = (i: number) => ({ duration: 0.35, delay: i * 0.05 })

/* ------------------------------------------------------------------ */
/*  Chart sub-components                                              */
/* ------------------------------------------------------------------ */

function CostTrendChart({
  points,
}: {
  points: Array<{ step: number; cumulative_cost_usd: number; cost_usd: number }>
}) {
  const colors = useMemo(() => getChartColors(), [])
  if (!points.length)
    return <p className="text-xs text-muted-foreground">No chart data.</p>
  return (
    <div role="img" aria-label="cost trend chart">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={points} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis dataKey="step" tick={{ fill: colors.axis, fontSize: 10 }} />
          <YAxis tick={{ fill: colors.axis, fontSize: 10 }} />
          <RechartsTooltip
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: number) => [`$${Number(value).toFixed(4)}`, 'cumulative']}
          />
          <Line type="monotone" dataKey="cumulative_cost_usd" stroke={colors.chart1} strokeWidth={2} dot={false} />
          <Brush dataKey="step" height={14} stroke={colors.chart4} travellerWidth={6} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ReliabilityDiagram({ bins }: { bins: Array<Record<string, unknown>> }) {
  const colors = useMemo(() => getChartColors(), [])
  const points = bins
    .map((row) => ({
      confidence: Number(row.avg_confidence ?? 0),
      accuracy: Number(row.avg_accuracy ?? 0),
      count: Number(row.count ?? 0),
    }))
    .filter((p) => Number.isFinite(p.confidence) && Number.isFinite(p.accuracy))
  if (!points.length)
    return <p className="text-xs text-muted-foreground">No reliability bins.</p>
  return (
    <div role="img" aria-label="reliability diagram">
      <ResponsiveContainer width="100%" height={180}>
        <ScatterChart margin={{ top: 12, right: 8, left: 4, bottom: 8 }}>
          <CartesianGrid stroke={colors.grid} />
          <XAxis type="number" dataKey="confidence" domain={[0, 1]} tick={{ fill: colors.axis, fontSize: 10 }} name="Confidence" />
          <YAxis type="number" dataKey="accuracy" domain={[0, 1]} tick={{ fill: colors.axis, fontSize: 10 }} name="Accuracy" />
          <RechartsTooltip
            cursor={{ strokeDasharray: '4 4' }}
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 11,
            }}
          />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={colors.chart4} strokeDasharray="4 4" />
          <Scatter name="Calibration bins" data={points} fill={colors.chart2} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

function EffectSizeMatrix({ tests }: { tests: Array<Record<string, unknown>> }) {
  if (!tests.length) return <p className="text-xs text-muted-foreground">No inference tests.</p>
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {tests.slice(0, 16).map((row, idx) => {
        const effect = Number(row.effect_size ?? 0)
        const adjustedP = Number(row.adjusted_p_value ?? 1)
        const intensity = Math.min(1, Math.abs(effect) * 4)
        const bg = effect >= 0
          ? `oklch(0.55 ${(0.04 + intensity * 0.12).toFixed(3)} 162 / ${(0.2 + intensity * 0.4).toFixed(2)})`
          : `oklch(0.60 ${(0.04 + intensity * 0.12).toFixed(3)} 25 / ${(0.2 + intensity * 0.4).toFixed(2)})`
        const significant = adjustedP <= 0.1
        return (
          <div
            key={`${String(row.metric_name)}-${idx}`}
            className={`rounded-md border p-2 text-[10px] transition-colors ${significant ? 'border-primary/50' : 'border-border'}`}
            style={{ background: bg }}
          >
            <div className="font-semibold text-foreground truncate">{String(row.metric_name ?? 'metric')}</div>
            <div className="font-mono text-muted-foreground">d={effect.toFixed(3)} p={adjustedP.toFixed(3)}</div>
          </div>
        )
      })}
    </div>
  )
}

function CooccurrenceExplorer({
  nodes,
  edges,
}: {
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
}) {
  const [minWeight, setMinWeight] = useState(0)
  const [activeNode, setActiveNode] = useState<string | null>(null)

  const filteredEdges = useMemo(
    () => edges.filter((edge) => Number(edge.weight ?? 0) >= minWeight),
    [edges, minWeight],
  )

  const connectedNodes = useMemo(() => {
    const ids = new Set<string>()
    filteredEdges.forEach((edge) => {
      ids.add(String(edge.source ?? ''))
      ids.add(String(edge.target ?? ''))
    })
    return ids
  }, [filteredEdges])

  const displayNodes = useMemo(
    () => nodes.filter((node) => connectedNodes.has(String(node.id ?? node.label ?? ''))),
    [connectedNodes, nodes],
  )

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[10px]">Edge Weight Threshold</Label>
        <Input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={minWeight}
          onChange={(e) => setMinWeight(Number(e.target.value))}
          className="h-2"
        />
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">
        min: {minWeight.toFixed(2)} | nodes: {displayNodes.length} | edges: {filteredEdges.length}
      </p>
      <div className="flex flex-wrap gap-1">
        {displayNodes.slice(0, 24).map((node, idx) => {
          const id = String(node.id ?? node.label ?? `node-${idx}`)
          return (
            <Badge
              key={id}
              variant={activeNode === id ? 'default' : 'outline'}
              className="cursor-pointer text-[10px]"
              onClick={() => setActiveNode(id)}
            >
              {id}
            </Badge>
          )
        })}
      </div>
      {activeNode && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Source</TableHead>
                <TableHead className="text-[10px]">Target</TableHead>
                <TableHead className="text-[10px]">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEdges
                .filter((e) => String(e.source ?? '') === activeNode || String(e.target ?? '') === activeNode)
                .slice(0, 16)
                .map((edge, idx) => (
                  <TableRow key={`${activeNode}-${idx}`}>
                    <TableCell className="font-mono text-[10px]">{String(edge.source ?? '')}</TableCell>
                    <TableCell className="font-mono text-[10px]">{String(edge.target ?? '')}</TableCell>
                    <TableCell className="font-mono text-[10px]">{Number(edge.weight ?? 0).toFixed(3)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main AnalyticsPanel                                               */
/* ------------------------------------------------------------------ */

export function AnalyticsPanel({ runId }: { runId: string }) {
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [riskCards, setRiskCards] = useState<RiskCards | null>(null)
  const [clusters, setClusters] = useState<ClusterPayload | null>(null)
  const [drift, setDrift] = useState<DriftPayload | null>(null)
  const [costSummary, setCostSummary] = useState<CostSummaryPayload | null>(null)
  const [costTimeseries, setCostTimeseries] = useState<CostTimeseriesPayload | null>(null)
  const [executionSlices, setExecutionSlices] = useState<ExecutionSlicesPayload | null>(null)
  const [inference, setInference] = useState<{ tests?: Array<Record<string, unknown>> } | null>(null)
  const [calibration, setCalibration] = useState<{ bins?: Array<Record<string, unknown>>; summaries?: Array<Record<string, unknown>> } | null>(null)
  const [cooccurrence, setCooccurrence] = useState<{ nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> } | null>(null)
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(null)
  const [detectorVotes, setDetectorVotes] = useState<DetectorVote[]>([])
  const [features, setFeatures] = useState<FeaturePayload | null>(null)
  const [forecast, setForecast] = useState<ForecastPayload | null>(null)
  const [policyEvents, setPolicyEvents] = useState<PolicyEvent[]>([])
  const [baselineRunId, setBaselineRunId] = useState('')
  const [filterAttack, setFilterAttack] = useState('all')
  const [filterProvider, setFilterProvider] = useState('all')
  const [filterModel, setFilterModel] = useState('all')
  const [loading, setLoading] = useState(false)

  /* Mitigation experiment state */
  const [mitigationName, setMitigationName] = useState('')
  const [mitigationBaseline, setMitigationBaseline] = useState('')
  const [mitigationResult, setMitigationResult] = useState<MitigationExperimentOut | null>(null)
  const [mitigationBusy, setMitigationBusy] = useState(false)

  const sliceOptions = useMemo(() => {
    const rows = executionSlices?.slices ?? []
    return {
      attacks: Array.from(new Set(rows.map((r) => r.attack_type))).sort(),
      providers: Array.from(new Set(rows.map((r) => r.provider_name))).sort(),
      models: Array.from(new Set(rows.map((r) => r.model))).sort(),
    }
  }, [executionSlices])

  const filteredSlices = useMemo(() => {
    return (executionSlices?.slices ?? []).filter((row) => {
      if (filterAttack !== 'all' && row.attack_type !== filterAttack) return false
      if (filterProvider !== 'all' && row.provider_name !== filterProvider) return false
      if (filterModel !== 'all' && row.model !== filterModel) return false
      return true
    })
  }, [executionSlices, filterAttack, filterProvider, filterModel])

  useEffect(() => {
    if (!runId) return
    setLoading(true)
    Promise.all([
      api.getScorecard(runId).catch(() => null),
      api.getRiskCards(runId).catch(() => null),
      api.getClusters(runId).catch(() => null),
      api.getDrift(runId).catch(() => null),
      api.getCostSummary(runId).catch(() => null),
      api.getCostTimeseries(runId).catch(() => null),
      api.getExecutionSlices(runId).catch(() => null),
      api.getInference(runId).catch(() => ({ tests: [] })),
      api.getCalibration(runId).catch(() => ({ bins: [], summaries: [] })),
      api.getCooccurrence(runId).catch(() => ({ nodes: [], edges: [] })),
      api.getDetectorVotes(runId).catch(() => ({ votes: [] })),
      api.getFeatures(runId).catch(() => null),
      api.getForecast(runId).catch(() => null),
      api.getPolicyEvents(runId).catch(() => ({ events: [] })),
    ])
      .then(([sc, risks, cl, dr, cost, series, slices, inf, cal, co, dv, feat, fc, pe]) => {
        setScorecard(sc)
        setRiskCards(risks)
        setClusters(cl)
        setDrift(dr)
        setCostSummary(cost)
        setCostTimeseries(series)
        setExecutionSlices(slices)
        setInference(inf)
        setCalibration(cal)
        setCooccurrence(co)
        setDetectorVotes((dv as { votes: DetectorVote[] } | null)?.votes ?? [])
        setFeatures(feat as FeaturePayload | null)
        setForecast(fc as ForecastPayload | null)
        setPolicyEvents((pe as { events: PolicyEvent[] } | null)?.events ?? [])
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [runId])

  async function compare() {
    if (!baselineRunId || !runId) return
    try {
      const payload = await api.compareRuns(baselineRunId, runId)
      setComparison(payload)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Comparison failed')
    }
  }

  async function generateReport() {
    if (!runId) return
    try {
      const payload = await api.generateReport(runId)
      toast.success(`Report generated: ${payload.path}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Report generation failed')
    }
  }

  async function createMitigation() {
    if (!mitigationName || !mitigationBaseline || !runId) return
    setMitigationBusy(true)
    try {
      const result = await api.createMitigationExperiment({
        name: mitigationName,
        baseline_run_id: mitigationBaseline,
        candidate_run_id: runId,
      })
      setMitigationResult(result)
      toast.success(`Experiment "${result.name}" created`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create experiment')
    } finally {
      setMitigationBusy(false)
    }
  }

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No run selected. Launch a run from the Config panel.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="space-y-2 text-center">
          <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 px-4 pt-14 pb-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(0)} className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analytics</p>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{runId}</p>
          </div>
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={generateReport}>
            <FileText className="size-3" /> Report
          </Button>
        </motion.div>

        {/* Scorecard */}
        {scorecard && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(1)}>
            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Scorecard</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(scorecard.metrics).map(([key, value]) => (
                    <div key={key} className="rounded-md border bg-muted/30 p-2">
                      <p className="text-[10px] text-muted-foreground truncate">{key}</p>
                      <p className="text-sm font-semibold font-mono">{typeof value === 'number' ? value.toFixed(4) : value}</p>
                    </div>
                  ))}
                </div>
                <div className={`text-xs font-semibold ${scorecard.gates.pass ? 'text-emerald-500' : 'text-destructive'}`}>
                  Gate: {scorecard.gates.pass ? 'PASS' : 'FAIL'}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Cost Trend */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(2)}>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Cost Trend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {costSummary && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border bg-muted/30 p-2">
                    <p className="text-[10px] text-muted-foreground">Effective</p>
                    <p className="text-xs font-semibold font-mono">${costSummary.totals.effective_cost.toFixed(4)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <p className="text-[10px] text-muted-foreground">Provider</p>
                    <p className="text-xs font-semibold font-mono">${costSummary.totals.provider_cost.toFixed(4)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <p className="text-[10px] text-muted-foreground">Estimated</p>
                    <p className="text-xs font-semibold font-mono">${costSummary.totals.estimated_cost.toFixed(4)}</p>
                  </div>
                </div>
              )}
              <CostTrendChart
                points={(costTimeseries?.points ?? []).map((pt, i) => ({
                  step: i + 1,
                  cumulative_cost_usd: pt.cumulative_cost_usd,
                  cost_usd: pt.cost_usd,
                }))}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Risk Cards */}
        {riskCards && riskCards.risks.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(3)}>
            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Risk Cards</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {riskCards.risks.map((risk) => (
                  <div key={risk.failure_type} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-foreground">{risk.failure_type}</span>
                      <Badge variant={risk.risk_probability > 0.5 ? 'destructive' : 'secondary'} className="text-[9px]">
                        {(risk.risk_probability * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <Progress value={risk.risk_probability * 100} className="h-1" />
                    <p className="text-[9px] text-muted-foreground">{risk.top_drivers.join(', ') || 'n/a'}</p>
                    <Separator />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Detector Votes */}
        {detectorVotes.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(3.5)}>
            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Detector Votes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Detector</TableHead>
                        <TableHead className="text-[10px]">Execution</TableHead>
                        <TableHead className="text-[10px] text-right">Confidence</TableHead>
                        <TableHead className="text-[10px] text-right">Latency</TableHead>
                        <TableHead className="text-[10px]">Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detectorVotes.slice(0, 50).map((vote) => (
                        <TableRow key={vote.id}>
                          <TableCell className="text-[10px] font-mono">{vote.detector_name}</TableCell>
                          <TableCell className="text-[10px] font-mono truncate max-w-[80px]">{vote.execution_id}</TableCell>
                          <TableCell className="text-[10px] font-mono text-right">{vote.confidence.toFixed(3)}</TableCell>
                          <TableCell className="text-[10px] font-mono text-right">{vote.latency_ms.toFixed(0)}ms</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-0.5">
                              {Object.entries(vote.failure_flags)
                                .filter(([, v]) => v)
                                .map(([flag]) => (
                                  <Badge key={flag} variant="destructive" className="text-[8px]">{flag}</Badge>
                                ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Policy Events */}
        {policyEvents.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(3.7)}>
            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Policy Events</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {policyEvents.slice(0, 30).map((evt) => (
                  <div key={evt.id} className="flex items-start gap-2 rounded-md border px-2.5 py-1.5">
                    <Badge variant={evt.event_type === 'run_paused' ? 'destructive' : evt.event_type === 'run_resumed' ? 'default' : 'secondary'} className="text-[9px] shrink-0 mt-0.5">
                      {evt.event_type}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">step {evt.step}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{evt.message}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Features */}
        {features && features.features.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(3.9)}>
            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Features</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(features.features[0] ?? {}).slice(0, 6).map((key) => (
                          <TableHead key={key} className="text-[10px]">{key}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {features.features.slice(0, 20).map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.values(row).slice(0, 6).map((val, ci) => (
                            <TableCell key={ci} className="text-[10px] font-mono">
                              {typeof val === 'number' ? val.toFixed(4) : String(val)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Forecast */}
        {forecast && forecast.forecasts.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(4)}>
            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Forecast</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {forecast.forecasts.slice(0, 10).map((fc, idx) => (
                    <div key={idx} className="rounded-md border bg-muted/30 p-2">
                      <div className="grid grid-cols-2 gap-1">
                        {Object.entries(fc).map(([key, value]) => (
                          <div key={key}>
                            <p className="text-[9px] text-muted-foreground">{key}</p>
                            <p className="text-[10px] font-mono">{typeof value === 'number' ? value.toFixed(4) : String(value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Clusters */}
        {clusters && clusters.clusters.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(4.5)}>
            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Clusters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {clusters.clusters.map((c) => (
                  <div key={c.cluster_id} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold">Cluster {c.cluster_id}</span>
                      <Badge variant="outline" className="text-[9px]">{c.size}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{c.label}</p>
                    <Separator />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Slice Filters */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(5)}>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Execution Slices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Attack</Label>
                  <Select value={filterAttack} onValueChange={setFilterAttack}>
                    <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">all</SelectItem>
                      {sliceOptions.attacks.map((v) => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Provider</Label>
                  <Select value={filterProvider} onValueChange={setFilterProvider}>
                    <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">all</SelectItem>
                      {sliceOptions.providers.map((v) => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Model</Label>
                  <Select value={filterModel} onValueChange={setFilterModel}>
                    <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">all</SelectItem>
                      {sliceOptions.models.map((v) => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {filteredSlices.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Attack</TableHead>
                        <TableHead className="text-[10px]">Provider</TableHead>
                        <TableHead className="text-[10px] text-right">Count</TableHead>
                        <TableHead className="text-[10px] text-right">ms</TableHead>
                        <TableHead className="text-[10px] text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSlices.slice(0, 24).map((row, idx) => (
                        <TableRow key={`${row.attack_type}-${row.provider_name}-${idx}`}>
                          <TableCell className="text-[10px]">{row.attack_type}</TableCell>
                          <TableCell className="text-[10px]">{row.provider_name}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{row.count}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{row.avg_latency_ms.toFixed(1)}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">${row.effective_cost_usd.toFixed(4)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No slices.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Drift */}
        {drift && drift.drift_signals.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(6)}>
            <Card className="bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Drift Signals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Feature</TableHead>
                        <TableHead className="text-[10px] text-right">PSI</TableHead>
                        <TableHead className="text-[10px] text-right">KS</TableHead>
                        <TableHead className="text-[10px]">Level</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drift.drift_signals.map((s) => (
                        <TableRow key={s.feature_name}>
                          <TableCell className="text-[10px] font-mono">{s.feature_name}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{s.psi.toFixed(4)}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{s.ks_pvalue.toExponential(2)}</TableCell>
                          <TableCell>
                            <Badge variant={s.drift_level === 'high' ? 'destructive' : s.drift_level === 'medium' ? 'default' : 'secondary'} className="text-[9px]">
                              {s.drift_level}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Effect Size + Reliability */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(7)}>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Effect Size Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <EffectSizeMatrix tests={inference?.tests ?? []} />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(8)}>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Reliability Diagram</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ReliabilityDiagram bins={calibration?.bins ?? []} />
              {(calibration?.summaries ?? []).length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Failure</TableHead>
                        <TableHead className="text-[10px] text-right">ECE</TableHead>
                        <TableHead className="text-[10px] text-right">MCE</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(calibration?.summaries ?? []).map((row, idx) => (
                        <TableRow key={`${String(row.failure_type)}-${idx}`}>
                          <TableCell className="text-[10px]">{String(row.failure_type ?? 'unknown')}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{Number(row.ece ?? 0).toFixed(4)}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{Number(row.mce ?? 0).toFixed(4)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Co-occurrence */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(9)}>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Co-occurrence Graph</CardTitle>
            </CardHeader>
            <CardContent>
              <CooccurrenceExplorer nodes={cooccurrence?.nodes ?? []} edges={cooccurrence?.edges ?? []} />
            </CardContent>
          </Card>
        </motion.div>

        {/* Run Comparison */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(10)}>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Run Comparison</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-[10px]">Baseline Run</Label>
                  <Input value={baselineRunId} onChange={(e) => setBaselineRunId(e.target.value)} className="h-7 text-xs" />
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={compare}>Compare</Button>
              </div>
              {comparison && (
                <pre className="rounded-md border bg-muted/30 p-2 text-[10px] font-mono overflow-x-auto max-h-48 overflow-y-auto">
                  {JSON.stringify(comparison, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Mitigation Experiment */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(11)}>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <FlaskConical className="size-3" /> Mitigation Experiment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-[10px] text-muted-foreground">Compare this run against a baseline to generate mitigation recommendations.</p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Experiment Name</Label>
                  <Input value={mitigationName} onChange={(e) => setMitigationName(e.target.value)} className="h-7 text-xs" placeholder="e.g. v2-vs-v1 mitigation" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Baseline Run ID</Label>
                  <Input value={mitigationBaseline} onChange={(e) => setMitigationBaseline(e.target.value)} className="h-7 text-xs" />
                </div>
              </div>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={createMitigation} disabled={mitigationBusy || !mitigationName || !mitigationBaseline}>
                <Play className="size-3" /> {mitigationBusy ? 'Creating...' : 'Create Experiment'}
              </Button>
              {mitigationResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">{mitigationResult.status}</Badge>
                    <span className="text-[10px] font-mono text-muted-foreground">{mitigationResult.id}</span>
                  </div>
                  {mitigationResult.effects.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground">Effects</p>
                      {mitigationResult.effects.map((effect, idx) => (
                        <pre key={idx} className="rounded-md border bg-muted/30 p-1.5 text-[9px] font-mono overflow-x-auto">
                          {JSON.stringify(effect, null, 2)}
                        </pre>
                      ))}
                    </div>
                  )}
                  {mitigationResult.recommendations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground">Recommendations</p>
                      {mitigationResult.recommendations.map((rec, idx) => (
                        <pre key={idx} className="rounded-md border bg-muted/30 p-1.5 text-[9px] font-mono overflow-x-auto">
                          {JSON.stringify(rec, null, 2)}
                        </pre>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </ScrollArea>
  )
}
