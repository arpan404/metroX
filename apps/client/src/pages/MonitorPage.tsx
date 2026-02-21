import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { loadState, saveState } from '../lib/state'
import type { RunOut } from '../lib/types'

type EventRow = {
  id: number
  event_type: string
  step: number
  message?: string
  data?: Record<string, unknown>
  created_at: string
}

export default function MonitorPage() {
  const persisted = useMemo(() => loadState(), [])
  const [runId, setRunId] = useState(persisted.currentRunId ?? '')
  const [run, setRun] = useState<RunOut | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refreshRun() {
    if (!runId) {
      return
    }
    try {
      const data = await api.getRun(runId)
      setRun(data)
      saveState({ ...loadState(), currentRunId: runId })
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to load run')
    }
  }

  useEffect(() => {
    if (!runId) return

    setEvents([])
    setError(null)
    setStreaming(true)

    const stop = api.streamRunEvents(
      runId,
      (incoming) => {
        const row = incoming as unknown as EventRow
        setEvents((current) => {
          if (current.some((item) => item.id === row.id)) {
            return current
          }
          return [row, ...current].slice(0, 200)
        })
      },
      () => setStreaming(false),
    )

    refreshRun()
    const interval = window.setInterval(refreshRun, 2000)

    return () => {
      stop()
      window.clearInterval(interval)
    }
  }, [runId])

  return (
    <section className="panel stack-lg">
      <div className="row gap-lg wrap">
        <label className="grow">
          Run ID
          <input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="Paste run id" />
        </label>
        <button type="button" className="primary" onClick={refreshRun}>
          Refresh
        </button>
      </div>

      {run && (
        <div className="grid three">
          <div className="metric-card">
            <p>Status</p>
            <h3>{run.status}</h3>
          </div>
          <div className="metric-card">
            <p>Progress</p>
            <h3>
              {run.completed_attacks}/{run.total_attacks}
            </h3>
          </div>
          <div className="metric-card">
            <p>Stream</p>
            <h3>{streaming ? 'Live' : 'Closed'}</h3>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="events">
        {events.map((event) => (
          <article key={event.id} className="event-row">
            <div className="row between">
              <strong>{event.event_type}</strong>
              <span>step {event.step}</span>
            </div>
            {event.message && <p>{event.message}</p>}
            <small>{new Date(event.created_at).toLocaleString()}</small>
          </article>
        ))}
        {events.length === 0 && <p className="caption">Waiting for run events...</p>}
      </div>
    </section>
  )
}
