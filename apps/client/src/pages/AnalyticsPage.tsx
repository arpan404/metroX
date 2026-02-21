import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { loadState } from '../lib/state'
import type { ClusterPayload, CostSummaryPayload, CostTimeseriesPayload, DriftPayload, RiskCards, Scorecard } from '../lib/types'

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
  const [inference, setInference] = useState<Record<string, unknown> | null>(null)
  const [calibration, setCalibration] = useState<Record<string, unknown> | null>(null)
  const [cooccurrence, setCooccurrence] = useState<Record<string, unknown> | null>(null)
  const [forecast, setForecast] = useState<Record<string, unknown> | null>(null)
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(null)
  const [reportPath, setReportPath] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  async function loadAnalytics() {
    if (!runId) return
    setError(null)
    try {
      const [sc, risks, cl, dr, cost, series, inf, cal, co, fc] = await Promise.all([
        api.getScorecard(runId),
        api.getRiskCards(runId),
        api.getClusters(runId),
        api.getDrift(runId),
        api.getCostSummary(runId),
        api.getCostTimeseries(runId),
        api.getInference(runId),
        api.getCalibration(runId),
        api.getCooccurrence(runId),
        api.getForecast(runId),
      ])
      setScorecard(sc)
      setRiskCards(risks)
      setClusters(cl)
      setDrift(dr)
      setCostSummary(cost)
      setCostTimeseries(series)
      setInference(inf)
      setCalibration(cal)
      setCooccurrence(co)
      setForecast(fc)
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
          <button type="button" className="primary" onClick={loadAnalytics}>
            Load Analytics
          </button>
          <button type="button" className="ghost" onClick={makeReport}>
            Generate Report
          </button>
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
          <p className={scorecard.gates.pass ? 'success' : 'error'}>
            Gate: {scorecard.gates.pass ? 'PASS' : 'FAIL'}
          </p>
          {!scorecard.gates.pass && (
            <ul>
              {scorecard.gates.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid two">
        <div className="panel stack-md">
          <h2>Calibrated Risk Cards</h2>
          {riskCards?.risks.map((risk) => (
            <article key={risk.failure_type} className="risk-row">
              <div className="row between">
                <strong>{risk.failure_type}</strong>
                <span>{(risk.risk_probability * 100).toFixed(1)}%</span>
              </div>
              <p>
                Uncertainty: {(risk.uncertainty_band.low * 100).toFixed(1)}% -{' '}
                {(risk.uncertainty_band.high * 100).toFixed(1)}%
              </p>
              <small>Drivers: {risk.top_drivers.join(', ') || 'n/a'}</small>
            </article>
          ))}
          {!riskCards && <p className="caption">Load a run to see risk cards.</p>}
        </div>

        <div className="panel stack-md">
          <h2>Failure Clusters</h2>
          {clusters?.clusters.map((cluster) => (
            <article key={cluster.cluster_id} className="risk-row">
              <div className="row between">
                <strong>Cluster {cluster.cluster_id}</strong>
                <span>{cluster.size} samples</span>
              </div>
              <p>{cluster.label}</p>
              <small>{cluster.top_terms.join(', ')}</small>
            </article>
          ))}
          {!clusters && <p className="caption">No cluster summary loaded.</p>}
        </div>
      </div>

      <div className="panel stack-md">
        <h2>Drift Intelligence</h2>
        {drift?.drift_signals.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>PSI</th>
                  <th>KS p-value</th>
                  <th>KL</th>
                  <th>Level</th>
                </tr>
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
        ) : (
          <p className="caption">No drift baseline linked or no drift signals available.</p>
        )}
      </div>

      <div className="grid two">
        <div className="panel stack-md">
          <h2>Cost Intelligence</h2>
          {costSummary ? (
            <>
              <p>Effective Cost: ${costSummary.totals.effective_cost.toFixed(4)}</p>
              <p>Provider Cost: ${costSummary.totals.provider_cost.toFixed(4)}</p>
              <p>Estimated Cost: ${costSummary.totals.estimated_cost.toFixed(4)}</p>
              <p>
                Sources: provider {costSummary.sources.provider}, fallback {costSummary.sources.fallback}, mixed {costSummary.sources.mixed}
              </p>
            </>
          ) : (
            <p className="caption">No cost summary loaded.</p>
          )}
          {costTimeseries && <p className="caption">Cost points: {costTimeseries.points.length}</p>}
        </div>

        <div className="panel stack-md">
          <h2>Inference + Calibration</h2>
          {inference && <pre className="json">{JSON.stringify(inference, null, 2)}</pre>}
          {calibration && <pre className="json">{JSON.stringify(calibration, null, 2)}</pre>}
        </div>
      </div>

      <div className="grid two">
        <div className="panel stack-md">
          <h2>Failure Path Graph</h2>
          {cooccurrence ? <pre className="json">{JSON.stringify(cooccurrence, null, 2)}</pre> : <p className="caption">No graph payload loaded.</p>}
        </div>
        <div className="panel stack-md">
          <h2>Forecast</h2>
          {forecast ? <pre className="json">{JSON.stringify(forecast, null, 2)}</pre> : <p className="caption">No forecast payload loaded.</p>}
        </div>
      </div>

      <div className="panel stack-md">
        <h2>Run Comparison</h2>
        <div className="row gap-lg wrap">
          <label className="grow">
            Baseline Run
            <input value={baselineRunId} onChange={(event) => setBaselineRunId(event.target.value)} />
          </label>
          <label className="grow">
            Candidate Run
            <input value={candidateRunId} onChange={(event) => setCandidateRunId(event.target.value)} />
          </label>
          <button type="button" className="primary" onClick={compare}>
            Compare
          </button>
        </div>
        {comparison && (
          <pre className="json">{JSON.stringify(comparison, null, 2)}</pre>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </section>
  )
}
