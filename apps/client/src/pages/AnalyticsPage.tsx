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

import { api } from '../lib/api'
import { loadState } from '../lib/state'
import type {
  ClusterPayload,
  CostSummaryPayload,
  CostTimeseriesPayload,
  DriftPayload,
  ExecutionSlicesPayload,
  RiskCards,
  Scorecard,
} from '../lib/types'

function CostTrendChart({
  points,
}: {
  points: Array<{ step: number; cumulative_cost_usd: number; cost_usd: number }>
}) {
  if (!points.length) return <p className="caption">No chart data.</p>
  return (
    <div className="chart-box" role="img" aria-label="cost trend chart">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 12, right: 10, left: 8, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="step" tick={{ fill: '#8fa0b3', fontSize: 11 }} />
          <YAxis tick={{ fill: '#8fa0b3', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#0c141f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8 }}
            formatter={(value: number) => [`$${Number(value).toFixed(4)}`, 'cumulative']}
          />
          <Line type="monotone" dataKey="cumulative_cost_usd" stroke="#17a2b8" strokeWidth={2} dot={false} />
          <Brush dataKey="step" height={18} stroke="#f8cb52" travellerWidth={8} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ReliabilityDiagram({ bins }: { bins: Array<Record<string, unknown>> }) {
  const points = bins
    .map((row) => ({
      confidence: Number(row.avg_confidence ?? 0),
      accuracy: Number(row.avg_accuracy ?? 0),
      count: Number(row.count ?? 0),
      failure_type: String(row.failure_type ?? 'unknown'),
    }))
    .filter((p) => Number.isFinite(p.confidence) && Number.isFinite(p.accuracy))
  if (!points.length) return <p className="caption">No reliability bins.</p>

  return (
    <div className="chart-box" role="img" aria-label="reliability diagram">
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{ top: 16, right: 14, left: 8, bottom: 12 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.1)" />
          <XAxis
            type="number"
            dataKey="confidence"
            domain={[0, 1]}
            tick={{ fill: '#8fa0b3', fontSize: 11 }}
            name="Confidence"
          />
          <YAxis
            type="number"
            dataKey="accuracy"
            domain={[0, 1]}
            tick={{ fill: '#8fa0b3', fontSize: 11 }}
            name="Accuracy"
          />
          <Tooltip
            cursor={{ strokeDasharray: '4 4' }}
            contentStyle={{ background: '#0c141f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8 }}
          />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#f8cb52" strokeDasharray="4 4" />
          <Scatter name="Calibration bins" data={points} fill="rgba(0,179,164,0.8)" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

function EffectSizeMatrix({ tests }: { tests: Array<Record<string, unknown>> }) {
  if (!tests.length) return <p className="caption">No inference tests.</p>

  return (
    <div className="matrix-grid">
      {tests.slice(0, 24).map((row, idx) => {
        const effect = Number(row.effect_size ?? 0)
        const adjustedP = Number(row.adjusted_p_value ?? 1)
        const intensity = Math.min(1, Math.abs(effect) * 4)
        const bg = effect >= 0
          ? `rgba(48,200,143,${0.15 + intensity * 0.45})`
          : `rgba(255,123,109,${0.15 + intensity * 0.45})`
        const border = adjustedP <= 0.1 ? '1px solid rgba(248,203,82,0.7)' : '1px solid rgba(255,255,255,0.14)'

        return (
          <article key={`${String(row.metric_name)}-${idx}`} className="matrix-cell" style={{ background: bg, border }}>
            <strong>{String(row.metric_name ?? 'metric')}</strong>
            <small>effect {effect.toFixed(3)}</small>
            <small>adj p {adjustedP.toFixed(3)}</small>
            <small>power {Number(row.power ?? 0).toFixed(2)}</small>
          </article>
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
    <div className="stack-md">
      <label>
        Edge Weight Threshold
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={minWeight}
          onChange={(event) => setMinWeight(Number(event.target.value))}
        />
      </label>
      <p className="caption">min weight: {minWeight.toFixed(2)} | nodes: {displayNodes.length} | edges: {filteredEdges.length}</p>
      <div className="chips">
        {displayNodes.slice(0, 32).map((node, idx) => {
          const id = String(node.id ?? node.label ?? `node-${idx}`)
          const selected = activeNode === id
          return (
            <button key={id} type="button" className={selected ? 'chip active' : 'chip'} onClick={() => setActiveNode(id)}>
              {id}
            </button>
          )
        })}
      </div>
      {activeNode && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Target</th>
                <th>Weight</th>
                <th>Relation</th>
              </tr>
            </thead>
            <tbody>
              {filteredEdges
                .filter((edge) => String(edge.source ?? '') === activeNode || String(edge.target ?? '') === activeNode)
                .slice(0, 24)
                .map((edge, idx) => (
                  <tr key={`${activeNode}-${idx}`}>
                    <td>{String(edge.source ?? '')}</td>
                    <td>{String(edge.target ?? '')}</td>
                    <td>{Number(edge.weight ?? 0).toFixed(3)}</td>
                    <td>{String(edge.relation ?? '')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
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
    <section className="stack-lg">
      <div className="panel stack-md">
        <div className="row gap-lg wrap">
          <label className="grow">
            Run ID
            <input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="Run id" />
          </label>
          <button type="button" className="primary" onClick={loadAnalytics}>Load Analytics</button>
          <button type="button" className="ghost" onClick={makeReport}>Generate Report</button>
        </div>
        {reportPath && <p className="caption">Report: {reportPath}</p>}
      </div>

      {scorecard && (
        <div className="panel stack-md">
          <h2>Scorecard</h2>
          <div className="grid three">
            {Object.entries(scorecard.metrics).map(([key, value]) => (
              <div key={key} className="metric-card">
                <p>{key}</p>
                <h3>{typeof value === 'number' ? value.toFixed(4) : value}</h3>
              </div>
            ))}
          </div>
          <p className={scorecard.gates.pass ? 'success' : 'error'}>Gate: {scorecard.gates.pass ? 'PASS' : 'FAIL'}</p>
        </div>
      )}

      <div className="grid two">
        <div className="panel stack-md">
          <h2>Slice Filters</h2>
          <div className="row gap-md wrap">
            <label>
              Attack
              <select value={filterAttack} onChange={(e) => setFilterAttack(e.target.value)}>
                <option value="all">all</option>
                {sliceOptions.attacks.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Provider
              <select value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)}>
                <option value="all">all</option>
                {sliceOptions.providers.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Model
              <select value={filterModel} onChange={(e) => setFilterModel(e.target.value)}>
                <option value="all">all</option>
                {sliceOptions.models.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          {filteredSlices.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Attack</th><th>Provider</th><th>Model</th><th>Count</th><th>Avg ms</th><th>Cost</th></tr>
                </thead>
                <tbody>
                  {filteredSlices.slice(0, 32).map((row, idx) => (
                    <tr key={`${row.attack_type}-${row.provider_name}-${row.model}-${idx}`}>
                      <td>{row.attack_type}</td>
                      <td>{row.provider_name}</td>
                      <td>{row.model}</td>
                      <td>{row.count}</td>
                      <td>{row.avg_latency_ms.toFixed(1)}</td>
                      <td>${row.effective_cost_usd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="caption">No slices for selected filters.</p>
          )}
        </div>

        <div className="panel stack-md">
          <h2>Cost Trend</h2>
          {costSummary ? (
            <>
              <p>Effective: ${costSummary.totals.effective_cost.toFixed(4)}</p>
              <p>Provider: ${costSummary.totals.provider_cost.toFixed(4)}</p>
              <p>Estimated: ${costSummary.totals.estimated_cost.toFixed(4)}</p>
            </>
          ) : <p className="caption">No cost summary loaded.</p>}
          <CostTrendChart
            points={(costTimeseries?.points ?? []).map((point, idx) => ({
              step: idx + 1,
              cumulative_cost_usd: point.cumulative_cost_usd,
              cost_usd: point.cost_usd,
            }))}
          />
        </div>
      </div>

      <div className="grid two">
        <div className="panel stack-md">
          <h2>Risk Cards</h2>
          {riskCards?.risks.map((risk) => (
            <article key={risk.failure_type} className="risk-row">
              <div className="row between">
                <strong>{risk.failure_type}</strong>
                <span>{(risk.risk_probability * 100).toFixed(1)}%</span>
              </div>
              <small>{risk.top_drivers.join(', ') || 'n/a'}</small>
            </article>
          ))}
        </div>

        <div className="panel stack-md">
          <h2>Clusters</h2>
          {clusters?.clusters.map((cluster) => (
            <article key={cluster.cluster_id} className="risk-row">
              <div className="row between">
                <strong>Cluster {cluster.cluster_id}</strong>
                <span>{cluster.size}</span>
              </div>
              <p>{cluster.label}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="panel stack-md">
        <h2>Drift</h2>
        {drift?.drift_signals.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Feature</th><th>PSI</th><th>KS</th><th>KL</th><th>Level</th></tr>
              </thead>
              <tbody>
                {drift.drift_signals.map((signal) => (
                  <tr key={signal.feature_name}>
                    <td>{signal.feature_name}</td>
                    <td>{signal.psi.toFixed(4)}</td>
                    <td>{signal.ks_pvalue.toExponential(2)}</td>
                    <td>{signal.kl_divergence.toFixed(4)}</td>
                    <td>{signal.drift_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="caption">No drift signals.</p>}
      </div>

      <div className="grid two">
        <div className="panel stack-md">
          <h2>Effect Size Matrix</h2>
          <EffectSizeMatrix tests={inference?.tests ?? []} />
        </div>

        <div className="panel stack-md">
          <h2>Reliability Diagram</h2>
          <ReliabilityDiagram bins={calibration?.bins ?? []} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Failure</th><th>ECE</th><th>MCE</th></tr>
              </thead>
              <tbody>
                {(calibration?.summaries ?? []).map((row, idx) => (
                  <tr key={`${String(row.failure_type)}-${idx}`}>
                    <td>{String(row.failure_type ?? 'unknown')}</td>
                    <td>{Number(row.ece ?? 0).toFixed(4)}</td>
                    <td>{Number(row.mce ?? 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel stack-md">
        <h2>Co-occurrence Graph</h2>
        <CooccurrenceExplorer nodes={cooccurrence?.nodes ?? []} edges={cooccurrence?.edges ?? []} />
      </div>

      <div className="panel stack-md">
        <h2>Run Comparison</h2>
        <div className="row gap-lg wrap">
          <label className="grow">Baseline Run<input value={baselineRunId} onChange={(event) => setBaselineRunId(event.target.value)} /></label>
          <label className="grow">Candidate Run<input value={candidateRunId} onChange={(event) => setCandidateRunId(event.target.value)} /></label>
          <button type="button" className="primary" onClick={compare}>Compare</button>
        </div>
        {comparison && <pre className="json">{JSON.stringify(comparison, null, 2)}</pre>}
      </div>

      {error && <p className="error">{error}</p>}
    </section>
  )
}
