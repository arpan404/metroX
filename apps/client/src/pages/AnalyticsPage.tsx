import { useMemo, useState } from 'react'
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

function InteractiveBars({
  items,
  color,
  active,
  onHover,
}: {
  items: Array<{ label: string; value: number }>
  color: string
  active: string | null
  onHover: (label: string | null) => void
}) {
  const max = Math.max(1, ...items.map((item) => item.value))
  return (
    <div className="stack-sm">
      {items.map((item) => (
        <div
          key={item.label}
          className="bar-row"
          onMouseEnter={() => onHover(item.label)}
          onMouseLeave={() => onHover(null)}
        >
          <span className="bar-label">{item.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
          </div>
          <span className="bar-value">{item.value.toFixed(3)}</span>
          {active === item.label ? <span className="pill">hover</span> : null}
        </div>
      ))}
    </div>
  )
}

function AxisLine({ points }: { points: number[] }) {
  if (!points.length) return <p className="caption">No chart data.</p>
  const width = 420
  const height = 140
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const line = points
    .map((value, idx) => {
      const x = (idx / Math.max(points.length - 1, 1)) * width
      const y = height - ((value - min) / span) * height
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={width} height={height + 24} className="chart-svg" role="img" aria-label="line chart with axis">
      <line x1="0" y1={height} x2={width} y2={height} stroke="#2f3d52" />
      <line x1="0" y1="0" x2="0" y2={height} stroke="#2f3d52" />
      <polyline fill="none" stroke="#17a2b8" strokeWidth="2" points={line} />
      <text x="0" y={height + 16} fill="#8fa0b3" fontSize="10">step 1</text>
      <text x={width - 48} y={height + 16} fill="#8fa0b3" fontSize="10">latest</text>
    </svg>
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
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(null)
  const [reportPath, setReportPath] = useState<string>('')
  const [filterAttack, setFilterAttack] = useState<string>('all')
  const [filterProvider, setFilterProvider] = useState<string>('all')
  const [filterModel, setFilterModel] = useState<string>('all')
  const [hoveredBar, setHoveredBar] = useState<string | null>(null)
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
      const [sc, risks, cl, dr, cost, series, slices] = await Promise.all([
        api.getScorecard(runId),
        api.getRiskCards(runId),
        api.getClusters(runId),
        api.getDrift(runId),
        api.getCostSummary(runId),
        api.getCostTimeseries(runId),
        api.getExecutionSlices(runId),
      ])
      setScorecard(sc)
      setRiskCards(risks)
      setClusters(cl)
      setDrift(dr)
      setCostSummary(cost)
      setCostTimeseries(series)
      setExecutionSlices(slices)
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
            <InteractiveBars
              items={filteredSlices.map((row) => ({
                label: `${row.attack_type}:${row.provider_name}`,
                value: row.count,
              }))}
              color="#fb8500"
              active={hoveredBar}
              onHover={setHoveredBar}
            />
          ) : (
            <p className="caption">No slices for selected filters.</p>
          )}
          {hoveredBar && <p className="caption">Tooltip: {hoveredBar}</p>}
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
          <AxisLine points={(costTimeseries?.points ?? []).map((point) => point.cumulative_cost_usd)} />
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
