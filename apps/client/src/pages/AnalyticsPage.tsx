import { useMemo, useState } from 'react'
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion } from 'motion/react'

import { api } from '@/lib/api'
import { getChartColors } from '@/lib/chart-theme'
import { loadState } from '@/lib/state'
import type {
  ClusterPayload,
  CostSummaryPayload,
  CostTimeseriesPayload,
  DriftPayload,
  ExecutionSlicesPayload,
  RiskCards,
  Scorecard,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
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

const stagger = (i: number) => ({ duration: 0.4, delay: i * 0.06 })

function CostTrendChart({
  points,
}: {
  points: Array<{ step: number; cumulative_cost_usd: number; cost_usd: number }>
}) {
  const colors = useMemo(() => getChartColors(), [])
  if (!points.length) return <p className="text-sm text-muted-foreground">No chart data.</p>
  return (
    <div role="img" aria-label="cost trend chart">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 12, right: 10, left: 8, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis dataKey="step" tick={{ fill: colors.axis, fontSize: 11 }} />
          <YAxis tick={{ fill: colors.axis, fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              borderRadius: 8,
            }}
            formatter={(value: number) => [`$${Number(value).toFixed(4)}`, 'cumulative']}
          />
          <Line type="monotone" dataKey="cumulative_cost_usd" stroke={colors.chart1} strokeWidth={2} dot={false} />
          <Brush dataKey="step" height={18} stroke={colors.chart4} travellerWidth={8} />
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
      failure_type: String(row.failure_type ?? 'unknown'),
    }))
    .filter((p) => Number.isFinite(p.confidence) && Number.isFinite(p.accuracy))
  if (!points.length) return <p className="text-sm text-muted-foreground">No reliability bins.</p>

  return (
    <div role="img" aria-label="reliability diagram">
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{ top: 16, right: 14, left: 8, bottom: 12 }}>
          <CartesianGrid stroke={colors.grid} />
          <XAxis
            type="number"
            dataKey="confidence"
            domain={[0, 1]}
            tick={{ fill: colors.axis, fontSize: 11 }}
            name="Confidence"
          />
          <YAxis
            type="number"
            dataKey="accuracy"
            domain={[0, 1]}
            tick={{ fill: colors.axis, fontSize: 11 }}
            name="Accuracy"
          />
          <Tooltip
            cursor={{ strokeDasharray: '4 4' }}
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              borderRadius: 8,
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
  if (!tests.length) return <p className="text-sm text-muted-foreground">No inference tests.</p>

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {tests.slice(0, 24).map((row, idx) => {
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
            className={`rounded-md border p-2.5 text-xs transition-colors ${significant ? 'border-primary/50' : 'border-border'}`}
            style={{ background: bg }}
          >
            <div className="font-semibold text-foreground truncate">{String(row.metric_name ?? 'metric')}</div>
            <div className="font-mono text-muted-foreground">effect {effect.toFixed(3)}</div>
            <div className="font-mono text-muted-foreground">adj p {adjustedP.toFixed(3)}</div>
            <div className="font-mono text-muted-foreground">power {Number(row.power ?? 0).toFixed(2)}</div>
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
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Edge Weight Threshold</Label>
        <Input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={minWeight}
          onChange={(event) => setMinWeight(Number(event.target.value))}
          className="h-2"
        />
      </div>
      <p className="text-xs text-muted-foreground font-mono">
        min weight: {minWeight.toFixed(2)} | nodes: {displayNodes.length} | edges: {filteredEdges.length}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {displayNodes.slice(0, 32).map((node, idx) => {
          const id = String(node.id ?? node.label ?? `node-${idx}`)
          const selected = activeNode === id
          return (
            <Badge
              key={id}
              variant={selected ? 'default' : 'outline'}
              className="cursor-pointer"
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
                <TableHead>Source</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Relation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEdges
                .filter((edge) => String(edge.source ?? '') === activeNode || String(edge.target ?? '') === activeNode)
                .slice(0, 24)
                .map((edge, idx) => (
                  <TableRow key={`${activeNode}-${idx}`}>
                    <TableCell className="font-mono text-xs">{String(edge.source ?? '')}</TableCell>
                    <TableCell className="font-mono text-xs">{String(edge.target ?? '')}</TableCell>
                    <TableCell className="font-mono text-xs">{Number(edge.weight ?? 0).toFixed(3)}</TableCell>
                    <TableCell className="text-xs">{String(edge.relation ?? '')}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export default function AnalyticsPage() {
  const persisted = useMemo(() => loadState(), [])
  const [runId, setRunId] = useState(persisted.currentRunId ?? '')
  const [baselineRunId, setBaselineRunId] = useState(persisted.baselineRunId ?? '')
  const [candidateRunId, setCandidateRunId] = useState(persisted.currentRunId ?? '')

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
  const [reportPath, setReportPath] = useState<string>('')
  const [filterAttack, setFilterAttack] = useState<string>('all')
  const [filterProvider, setFilterProvider] = useState<string>('all')
  const [filterModel, setFilterModel] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)

  const sliceOptions = useMemo(() => {
    const rows = executionSlices?.slices ?? []
    const attacks = Array.from(new Set(rows.map((row) => row.attack_type))).sort()
    const providers = Array.from(new Set(rows.map((row) => row.provider_name))).sort()
    const models = Array.from(new Set(rows.map((row) => row.model))).sort()
    return { attacks, providers, models }
  }, [executionSlices])

  const filteredSlices = useMemo(() => {
    return (executionSlices?.slices ?? []).filter((row) => {
      if (filterAttack !== 'all' && row.attack_type !== filterAttack) return false
      if (filterProvider !== 'all' && row.provider_name !== filterProvider) return false
      if (filterModel !== 'all' && row.model !== filterModel) return false
      return true
    })
  }, [executionSlices, filterAttack, filterProvider, filterModel])

  async function loadAnalytics() {
    if (!runId) return
    setError(null)
    try {
      const [sc, risks, cl, dr, cost, series, slices, inf, cal, co] = await Promise.all([
        api.getScorecard(runId),
        api.getRiskCards(runId),
        api.getClusters(runId),
        api.getDrift(runId),
        api.getCostSummary(runId),
        api.getCostTimeseries(runId),
        api.getExecutionSlices(runId),
        api.getInference(runId).catch(() => ({ tests: [] })),
        api.getCalibration(runId).catch(() => ({ bins: [], summaries: [] })),
        api.getCooccurrence(runId).catch(() => ({ nodes: [], edges: [] })),
      ])
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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load analytics')
    }
  }

  async function compare() {
    if (!baselineRunId || !candidateRunId) return
    setError(null)
    try {
      const payload = await api.compareRuns(baselineRunId, candidateRunId)
      setComparison(payload)
    } catch (compareError) {
      setError(compareError instanceof Error ? compareError.message : 'Failed to compare runs')
    }
  }

  async function makeReport() {
    if (!runId) return
    setError(null)
    try {
      const payload = await api.generateReport(runId)
      setReportPath(payload.path)
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Failed to generate report')
    }
  }

  return (
    <div className="absolute inset-0 overflow-y-auto pt-20 pb-8 px-4 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6" data-onboarding="analytics-trigger">
        {/* Run ID bar */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(0)}>
          <Card className="bg-card/90 backdrop-blur-xl">
            <CardContent className="flex flex-wrap items-end gap-4 p-4">
              <div className="flex-1 min-w-[200px] space-y-1.5">
                <Label>Run ID</Label>
                <Input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="Run id" />
              </div>
              <Button onClick={loadAnalytics}>Load Analytics</Button>
              <Button variant="outline" onClick={makeReport}>Generate Report</Button>
              {reportPath && <p className="w-full text-sm text-muted-foreground font-mono">Report: {reportPath}</p>}
            </CardContent>
          </Card>
        </motion.div>

        {/* Scorecard */}
        {scorecard && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(1)}>
            <Card className="bg-card/90 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-sm">Scorecard</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {Object.entries(scorecard.metrics).map(([key, value]) => (
                    <div key={key} className="rounded-md border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground truncate">{key}</p>
                      <p className="text-lg font-semibold font-mono">{typeof value === 'number' ? value.toFixed(4) : value}</p>
                    </div>
                  ))}
                </div>
                <div className={`text-sm font-semibold ${scorecard.gates.pass ? 'text-emerald-500' : 'text-destructive'}`}>
                  Gate: {scorecard.gates.pass ? 'PASS' : 'FAIL'}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Slice Filters + Cost Trend */}
        <div className="grid gap-6 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(2)}>
            <Card className="bg-card/90 backdrop-blur-xl h-full">
              <CardHeader>
                <CardTitle className="text-sm">Slice Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Attack</Label>
                    <Select value={filterAttack} onValueChange={setFilterAttack}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">all</SelectItem>
                        {sliceOptions.attacks.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Provider</Label>
                    <Select value={filterProvider} onValueChange={setFilterProvider}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">all</SelectItem>
                        {sliceOptions.providers.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Model</Label>
                    <Select value={filterModel} onValueChange={setFilterModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">all</SelectItem>
                        {sliceOptions.models.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {filteredSlices.length ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Attack</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Model</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Avg ms</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSlices.slice(0, 32).map((row, idx) => (
                          <TableRow key={`${row.attack_type}-${row.provider_name}-${row.model}-${idx}`}>
                            <TableCell className="text-xs">{row.attack_type}</TableCell>
                            <TableCell className="text-xs">{row.provider_name}</TableCell>
                            <TableCell className="text-xs font-mono">{row.model}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{row.count}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{row.avg_latency_ms.toFixed(1)}</TableCell>
                            <TableCell className="text-right text-xs font-mono">${row.effective_cost_usd.toFixed(4)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No slices for selected filters.</p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(3)}>
            <Card className="bg-card/90 backdrop-blur-xl h-full">
              <CardHeader>
                <CardTitle className="text-sm">Cost Trend</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {costSummary ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-md border bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Effective</p>
                      <p className="text-sm font-semibold font-mono">${costSummary.totals.effective_cost.toFixed(4)}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Provider</p>
                      <p className="text-sm font-semibold font-mono">${costSummary.totals.provider_cost.toFixed(4)}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Estimated</p>
                      <p className="text-sm font-semibold font-mono">${costSummary.totals.estimated_cost.toFixed(4)}</p>
                    </div>
                  </div>
                ) : <p className="text-sm text-muted-foreground">No cost summary loaded.</p>}
                <CostTrendChart
                  points={(costTimeseries?.points ?? []).map((point, idx) => ({
                    step: idx + 1,
                    cumulative_cost_usd: point.cumulative_cost_usd,
                    cost_usd: point.cost_usd,
                  }))}
                />
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Risk Cards + Clusters */}
        <div className="grid gap-6 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(4)}>
            <Card className="bg-card/90 backdrop-blur-xl h-full">
              <CardHeader>
                <CardTitle className="text-sm">Risk Cards</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {riskCards?.risks.map((risk) => (
                  <div key={risk.failure_type} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{risk.failure_type}</span>
                      <Badge variant={risk.risk_probability > 0.5 ? 'destructive' : 'secondary'} className="text-[10px]">
                        {(risk.risk_probability * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <Progress value={risk.risk_probability * 100} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground">{risk.top_drivers.join(', ') || 'n/a'}</p>
                    <Separator />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(5)}>
            <Card className="bg-card/90 backdrop-blur-xl h-full">
              <CardHeader>
                <CardTitle className="text-sm">Clusters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {clusters?.clusters.map((cluster) => (
                  <div key={cluster.cluster_id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Cluster {cluster.cluster_id}</span>
                      <Badge variant="outline" className="text-[10px]">{cluster.size}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{cluster.label}</p>
                    <Separator />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Drift */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(6)}>
          <Card className="bg-card/90 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-sm">Drift</CardTitle>
            </CardHeader>
            <CardContent>
              {drift?.drift_signals.length ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Feature</TableHead>
                        <TableHead className="text-right">PSI</TableHead>
                        <TableHead className="text-right">KS</TableHead>
                        <TableHead className="text-right">KL</TableHead>
                        <TableHead>Level</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drift.drift_signals.map((signal) => (
                        <TableRow key={signal.feature_name}>
                          <TableCell className="text-xs font-mono">{signal.feature_name}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{signal.psi.toFixed(4)}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{signal.ks_pvalue.toExponential(2)}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{signal.kl_divergence.toFixed(4)}</TableCell>
                          <TableCell>
                            <Badge variant={signal.drift_level === 'high' ? 'destructive' : signal.drift_level === 'medium' ? 'default' : 'secondary'} className="text-[10px]">
                              {signal.drift_level}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : <p className="text-sm text-muted-foreground">No drift signals.</p>}
            </CardContent>
          </Card>
        </motion.div>

        {/* Effect Size + Reliability */}
        <div className="grid gap-6 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(7)}>
            <Card className="bg-card/90 backdrop-blur-xl h-full">
              <CardHeader>
                <CardTitle className="text-sm">Effect Size Matrix</CardTitle>
              </CardHeader>
              <CardContent>
                <EffectSizeMatrix tests={inference?.tests ?? []} />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(8)}>
            <Card className="bg-card/90 backdrop-blur-xl h-full">
              <CardHeader>
                <CardTitle className="text-sm">Reliability Diagram</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ReliabilityDiagram bins={calibration?.bins ?? []} />
                {(calibration?.summaries ?? []).length > 0 && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Failure</TableHead>
                          <TableHead className="text-right">ECE</TableHead>
                          <TableHead className="text-right">MCE</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(calibration?.summaries ?? []).map((row, idx) => (
                          <TableRow key={`${String(row.failure_type)}-${idx}`}>
                            <TableCell className="text-xs">{String(row.failure_type ?? 'unknown')}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{Number(row.ece ?? 0).toFixed(4)}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{Number(row.mce ?? 0).toFixed(4)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Co-occurrence */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(9)}>
          <Card className="bg-card/90 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-sm">Co-occurrence Graph</CardTitle>
            </CardHeader>
            <CardContent>
              <CooccurrenceExplorer nodes={cooccurrence?.nodes ?? []} edges={cooccurrence?.edges ?? []} />
            </CardContent>
          </Card>
        </motion.div>

        {/* Run Comparison */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(10)}>
          <Card className="bg-card/90 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-sm">Run Comparison</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[180px] space-y-1.5">
                  <Label className="text-xs">Baseline Run</Label>
                  <Input value={baselineRunId} onChange={(event) => setBaselineRunId(event.target.value)} />
                </div>
                <div className="flex-1 min-w-[180px] space-y-1.5">
                  <Label className="text-xs">Candidate Run</Label>
                  <Input value={candidateRunId} onChange={(event) => setCandidateRunId(event.target.value)} />
                </div>
                <Button onClick={compare}>Compare</Button>
              </div>
              {comparison && (
                <pre className="rounded-md border bg-muted/30 p-3 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
                  {JSON.stringify(comparison, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-destructive text-center"
          >
            {error}
          </motion.p>
        )}
      </div>
    </div>
  )
}
