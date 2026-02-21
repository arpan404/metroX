import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
  type Dispatch,
} from 'react'
import { api } from '@/lib/api'
import { loadState, saveState } from '@/lib/state'
import { createDefaultStudioMap, resolveStudioRoleModel } from '@/lib/studio-defaults'
import type {
  RunOut,
  Scorecard,
  AttackSummaryPayload,
  RiskCards,
  CostSummaryPayload,
  CostTimeseriesPayload,
  ClusterPayload,
  DriftPayload,
  ExecutionSlicesPayload,
  RunTelemetryPayload,
  NodeTelemetryPayload,
  FeaturePayload,
  ForecastPayload,
  PolicyEvent,
  DetectorVote,
  QueueStats,
  AfkCapabilities,
} from '@/lib/types'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type PanelId = 'config' | 'analytics' | 'settings' | 'attack-detail'
export type CanvasMode = 'evaluate' | 'studio'

export type RunEvent = {
  id?: number
  event_type: string
  step?: number
  message?: string
  data?: Record<string, unknown>
  created_at?: string
}

export type WorkspaceState = {
  // Session/profile identifiers
  sessionId: string | null
  configProfileId: string | null
  currentRunId: string | null
  baselineRunId: string | null

  // Canvas
  canvasMode: CanvasMode
  selectedNodeId: string | null
  selectedAttackType: string | null

  // Panels — one side panel at a time, events independently
  activePanel: PanelId | null
  eventsOpen: boolean

  // Streaming
  isStreaming: boolean

  // Run data
  runData: RunOut | null
  scorecard: Scorecard | null
  attackSummary: AttackSummaryPayload | null
  riskCards: RiskCards | null
  costSummary: CostSummaryPayload | null
  costTimeseries: CostTimeseriesPayload | null
  clusters: ClusterPayload | null
  drift: DriftPayload | null
  executionSlices: ExecutionSlicesPayload | null
  telemetry: RunTelemetryPayload | null
  nodeTelemetry: NodeTelemetryPayload | null
  features: FeaturePayload | null
  forecasts: ForecastPayload | null
  policyEvents: PolicyEvent[]
  detectorVotes: DetectorVote[]
  queueStats: QueueStats | null
  afkCapabilities: AfkCapabilities | null

  // Events timeline
  events: RunEvent[]

  // Loading/error
  isLoadingRun: boolean
  isLoadingAnalytics: boolean

  // Studio workflow nodes/edges
  studioNodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: { label: string; role: string; model?: string; description?: string }
  }>
  studioEdges: Array<{
    id: string
    source: string
    target: string
  }>
}

/* ------------------------------------------------------------------ */
/*  Actions                                                           */
/* ------------------------------------------------------------------ */

export type WorkspaceAction =
  | { type: 'SET_SESSION'; sessionId: string; configProfileId?: string }
  | { type: 'SET_CONFIG_PROFILE'; configProfileId: string }
  | { type: 'SET_RUN_ID'; runId: string | null }
  | { type: 'SET_BASELINE_RUN_ID'; runId: string | null }
  | { type: 'SET_CANVAS_MODE'; mode: CanvasMode }
  | { type: 'SELECT_NODE'; nodeId: string | null; attackType?: string | null }
  | { type: 'OPEN_PANEL'; panel: PanelId }
  | { type: 'CLOSE_PANEL' }
  | { type: 'TOGGLE_PANEL'; panel: PanelId }
  | { type: 'TOGGLE_EVENTS' }
  | { type: 'SET_STREAMING'; active: boolean }
  | { type: 'SET_RUN_DATA'; data: RunOut }
  | { type: 'SET_SCORECARD'; data: Scorecard }
  | { type: 'SET_ATTACK_SUMMARY'; data: AttackSummaryPayload }
  | { type: 'SET_RISK_CARDS'; data: RiskCards }
  | { type: 'SET_COST_SUMMARY'; data: CostSummaryPayload }
  | { type: 'SET_COST_TIMESERIES'; data: CostTimeseriesPayload }
  | { type: 'SET_CLUSTERS'; data: ClusterPayload }
  | { type: 'SET_DRIFT'; data: DriftPayload }
  | { type: 'SET_EXECUTION_SLICES'; data: ExecutionSlicesPayload }
  | { type: 'SET_TELEMETRY'; data: RunTelemetryPayload }
  | { type: 'SET_NODE_TELEMETRY'; data: NodeTelemetryPayload }
  | { type: 'SET_FEATURES'; data: FeaturePayload }
  | { type: 'SET_FORECASTS'; data: ForecastPayload }
  | { type: 'SET_POLICY_EVENTS'; data: PolicyEvent[] }
  | { type: 'SET_DETECTOR_VOTES'; data: DetectorVote[] }
  | { type: 'SET_QUEUE_STATS'; data: QueueStats }
  | { type: 'SET_AFK_CAPABILITIES'; data: AfkCapabilities }
  | { type: 'ADD_EVENT'; event: RunEvent }
  | { type: 'SET_EVENTS'; events: RunEvent[] }
  | { type: 'CLEAR_EVENTS' }
  | { type: 'SET_LOADING_RUN'; loading: boolean }
  | { type: 'SET_LOADING_ANALYTICS'; loading: boolean }
  | { type: 'ADD_STUDIO_NODE'; node: WorkspaceState['studioNodes'][0] }
  | { type: 'UPDATE_STUDIO_NODE'; nodeId: string; data: Partial<WorkspaceState['studioNodes'][0]['data']> }
  | { type: 'UPDATE_STUDIO_NODE_POSITION'; nodeId: string; position: { x: number; y: number } }
  | { type: 'REMOVE_STUDIO_NODE'; nodeId: string }
  | { type: 'SET_STUDIO_EDGES'; edges: WorkspaceState['studioEdges'] }
  | { type: 'APPLY_TEMPLATE'; template: { name: string; config: Record<string, unknown> } }
  | { type: 'RESET' }

/* ------------------------------------------------------------------ */
/*  Initial State                                                     */
/* ------------------------------------------------------------------ */

const persisted = loadState()

const initialState: WorkspaceState = {
  sessionId: persisted.sessionId ?? null,
  configProfileId: persisted.configProfileId ?? null,
  currentRunId: persisted.currentRunId ?? null,
  baselineRunId: persisted.baselineRunId ?? null,

  canvasMode: 'evaluate',
  selectedNodeId: null,
  selectedAttackType: null,

  activePanel: null,
  eventsOpen: false,
  isStreaming: false,

  runData: null,
  scorecard: null,
  attackSummary: null,
  riskCards: null,
  costSummary: null,
  costTimeseries: null,
  clusters: null,
  drift: null,
  executionSlices: null,
  telemetry: null,
  nodeTelemetry: null,
  features: null,
  forecasts: null,
  policyEvents: [],
  detectorVotes: [],
  queueStats: null,
  afkCapabilities: null,
  events: [],
  isLoadingRun: false,
  isLoadingAnalytics: false,

  studioNodes: [],
  studioEdges: [],
}

/* ------------------------------------------------------------------ */
/*  Reducer                                                           */
/* ------------------------------------------------------------------ */

function reducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_SESSION':
      return { ...state, sessionId: action.sessionId, configProfileId: action.configProfileId ?? state.configProfileId }
    case 'SET_CONFIG_PROFILE':
      return { ...state, configProfileId: action.configProfileId }
    case 'SET_RUN_ID':
      return {
        ...state,
        currentRunId: action.runId,
        // clear cached analytics when run changes
        scorecard: null,
        attackSummary: null,
        riskCards: null,
        costSummary: null,
        costTimeseries: null,
        clusters: null,
        drift: null,
        executionSlices: null,
        telemetry: null,
        nodeTelemetry: null,
        features: null,
        forecasts: null,
        policyEvents: [],
        detectorVotes: [],
        events: [],
        runData: null,
      }
    case 'SET_BASELINE_RUN_ID':
      return { ...state, baselineRunId: action.runId }
    case 'SET_CANVAS_MODE':
      if (action.mode === 'studio' && state.studioNodes.length === 0) {
        const defaults = createDefaultStudioMap()
        return {
          ...state,
          canvasMode: action.mode,
          selectedNodeId: null,
          selectedAttackType: null,
          studioNodes: defaults.nodes,
          studioEdges: defaults.edges,
        }
      }
      return { ...state, canvasMode: action.mode, selectedNodeId: null, selectedAttackType: null }
    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.nodeId, selectedAttackType: action.attackType ?? null }
    case 'OPEN_PANEL':
      return { ...state, activePanel: action.panel }
    case 'CLOSE_PANEL':
      return { ...state, activePanel: null }
    case 'TOGGLE_PANEL':
      return { ...state, activePanel: state.activePanel === action.panel ? null : action.panel }
    case 'TOGGLE_EVENTS':
      return { ...state, eventsOpen: !state.eventsOpen }
    case 'SET_STREAMING':
      return { ...state, isStreaming: action.active }
    case 'SET_RUN_DATA':
      return { ...state, runData: action.data, isLoadingRun: false }
    case 'SET_SCORECARD':
      return { ...state, scorecard: action.data }
    case 'SET_ATTACK_SUMMARY':
      return { ...state, attackSummary: action.data }
    case 'SET_RISK_CARDS':
      return { ...state, riskCards: action.data }
    case 'SET_COST_SUMMARY':
      return { ...state, costSummary: action.data }
    case 'SET_COST_TIMESERIES':
      return { ...state, costTimeseries: action.data }
    case 'SET_CLUSTERS':
      return { ...state, clusters: action.data }
    case 'SET_DRIFT':
      return { ...state, drift: action.data }
    case 'SET_EXECUTION_SLICES':
      return { ...state, executionSlices: action.data }
    case 'SET_TELEMETRY':
      return { ...state, telemetry: action.data }
    case 'SET_NODE_TELEMETRY':
      return { ...state, nodeTelemetry: action.data }
    case 'SET_FEATURES':
      return { ...state, features: action.data }
    case 'SET_FORECASTS':
      return { ...state, forecasts: action.data }
    case 'SET_POLICY_EVENTS':
      return { ...state, policyEvents: action.data }
    case 'SET_DETECTOR_VOTES':
      return { ...state, detectorVotes: action.data }
    case 'SET_QUEUE_STATS':
      return { ...state, queueStats: action.data }
    case 'SET_AFK_CAPABILITIES':
      return { ...state, afkCapabilities: action.data }
    case 'ADD_EVENT':
      return { ...state, events: [...state.events, action.event] }
    case 'SET_EVENTS':
      return { ...state, events: action.events }
    case 'CLEAR_EVENTS':
      return { ...state, events: [] }
    case 'SET_LOADING_RUN':
      return { ...state, isLoadingRun: action.loading }
    case 'SET_LOADING_ANALYTICS':
      return { ...state, isLoadingAnalytics: action.loading }
    case 'ADD_STUDIO_NODE':
      return {
        ...state,
        studioNodes: [
          ...state.studioNodes,
          {
            ...action.node,
            data: {
              ...action.node.data,
              model: resolveStudioRoleModel(action.node.data.role, action.node.data.model),
            },
          },
        ],
      }
    case 'UPDATE_STUDIO_NODE':
      return {
        ...state,
        studioNodes: state.studioNodes.map((n) =>
          n.id === action.nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...action.data,
                  model:
                    action.data.model !== undefined
                      ? resolveStudioRoleModel(n.data.role, action.data.model)
                      : n.data.model,
                },
              }
            : n,
        ),
      }
    case 'UPDATE_STUDIO_NODE_POSITION':
      return {
        ...state,
        studioNodes: state.studioNodes.map((n) =>
          n.id === action.nodeId
            ? {
                ...n,
                position: action.position,
              }
            : n,
        ),
      }
    case 'REMOVE_STUDIO_NODE':
      return {
        ...state,
        studioNodes: state.studioNodes.filter((n) => n.id !== action.nodeId),
        studioEdges: state.studioEdges.filter((e) => e.source !== action.nodeId && e.target !== action.nodeId),
      }
    case 'SET_STUDIO_EDGES':
      return { ...state, studioEdges: action.edges }
    case 'APPLY_TEMPLATE':
      // Template data stored in activePanel config via side-effect; just open config panel
      return { ...state, activePanel: 'config' }
    case 'RESET':
      return { ...initialState, sessionId: null, configProfileId: null, currentRunId: null, baselineRunId: null }
    default:
      return state
  }
}

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

type WorkspaceContextValue = {
  state: WorkspaceState
  dispatch: Dispatch<WorkspaceAction>
  actions: WorkspaceActions
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

/* ------------------------------------------------------------------ */
/*  Action helpers bound to dispatch                                  */
/* ------------------------------------------------------------------ */

type WorkspaceActions = ReturnType<typeof createActions>

function createActions(dispatch: Dispatch<WorkspaceAction>, stateRef: React.MutableRefObject<WorkspaceState>) {
  const streamCleanupRef = { current: null as (() => void) | null }
  // In-flight guards to prevent concurrent fetches
  let fetchingRun = false
  let fetchingAnalytics = false
  let fetchedCapabilities = false

  const mergeEvents = (current: RunEvent[], incoming: RunEvent[]): RunEvent[] => {
    const keyFor = (event: RunEvent) =>
      event.id != null
        ? `id:${event.id}`
        : `sig:${event.event_type}|${event.step ?? ''}|${event.created_at ?? ''}|${event.message ?? ''}`

    const map = new Map<string, RunEvent>()
    for (const event of current) map.set(keyFor(event), event)
    for (const event of incoming) map.set(keyFor(event), event)

    return Array.from(map.values()).sort((a, b) => {
      if (a.id != null && b.id != null) return a.id - b.id
      const at = a.created_at ? Date.parse(a.created_at) : 0
      const bt = b.created_at ? Date.parse(b.created_at) : 0
      return at - bt
    })
  }

  return {
    setRunId(runId: string | null) {
      dispatch({ type: 'SET_RUN_ID', runId })
    },

    openPanel(panel: PanelId) {
      dispatch({ type: 'OPEN_PANEL', panel })
    },

    closePanel() {
      dispatch({ type: 'CLOSE_PANEL' })
    },

    togglePanel(panel: PanelId) {
      dispatch({ type: 'TOGGLE_PANEL', panel })
    },

    toggleEvents() {
      dispatch({ type: 'TOGGLE_EVENTS' })
    },

    async fetchRunData() {
      const runId = stateRef.current.currentRunId
      if (!runId || fetchingRun) return
      fetchingRun = true
      dispatch({ type: 'SET_LOADING_RUN', loading: true })
      try {
        const [runData, attackSummary, recentEvents] = await Promise.all([
          api.getRun(runId),
          api.getAttackSummary(runId).catch(() => null),
          api.getRunEventsRecent(runId, 300).catch(() => null),
        ])
        dispatch({ type: 'SET_RUN_DATA', data: runData })
        if (attackSummary) dispatch({ type: 'SET_ATTACK_SUMMARY', data: attackSummary })
        if (recentEvents?.events) {
          const merged = mergeEvents(
            stateRef.current.events,
            recentEvents.events as RunEvent[],
          )
          dispatch({ type: 'SET_EVENTS', events: merged })
        }
      } catch {
        dispatch({ type: 'SET_LOADING_RUN', loading: false })
      } finally {
        fetchingRun = false
      }
    },

    async fetchAnalytics() {
      const runId = stateRef.current.currentRunId
      if (!runId || fetchingAnalytics) return
      fetchingAnalytics = true
      dispatch({ type: 'SET_LOADING_ANALYTICS', loading: true })
      try {
        const results = await Promise.allSettled([
          api.getScorecard(runId),
          api.getRiskCards(runId),
          api.getCostSummary(runId),
          api.getCostTimeseries(runId),
          api.getClusters(runId),
          api.getDrift(runId),
          api.getExecutionSlices(runId),
          api.getRunTelemetry(runId),
          api.getNodeTelemetry(runId),
          api.getFeatures(runId),
          api.getForecast(runId),
          api.getPolicyEvents(runId),
          api.getDetectorVotes(runId),
        ])
        const val = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null)
        const scorecard = val(results[0]) as Scorecard | null
        if (scorecard) dispatch({ type: 'SET_SCORECARD', data: scorecard })
        const riskCards = val(results[1]) as RiskCards | null
        if (riskCards) dispatch({ type: 'SET_RISK_CARDS', data: riskCards })
        const costSummary = val(results[2]) as CostSummaryPayload | null
        if (costSummary) dispatch({ type: 'SET_COST_SUMMARY', data: costSummary })
        const costTimeseries = val(results[3]) as CostTimeseriesPayload | null
        if (costTimeseries) dispatch({ type: 'SET_COST_TIMESERIES', data: costTimeseries })
        const clusters = val(results[4]) as ClusterPayload | null
        if (clusters) dispatch({ type: 'SET_CLUSTERS', data: clusters })
        const drift = val(results[5]) as DriftPayload | null
        if (drift) dispatch({ type: 'SET_DRIFT', data: drift })
        const slices = val(results[6]) as ExecutionSlicesPayload | null
        if (slices) dispatch({ type: 'SET_EXECUTION_SLICES', data: slices })
        const telemetry = val(results[7]) as RunTelemetryPayload | null
        if (telemetry) dispatch({ type: 'SET_TELEMETRY', data: telemetry })
        const nodeTelemetry = val(results[8]) as NodeTelemetryPayload | null
        if (nodeTelemetry) dispatch({ type: 'SET_NODE_TELEMETRY', data: nodeTelemetry })
        const features = val(results[9]) as FeaturePayload | null
        if (features) dispatch({ type: 'SET_FEATURES', data: features })
        const forecasts = val(results[10]) as ForecastPayload | null
        if (forecasts) dispatch({ type: 'SET_FORECASTS', data: forecasts })
        const pe = val(results[11]) as { run_id: string; events: PolicyEvent[] } | null
        if (pe) dispatch({ type: 'SET_POLICY_EVENTS', data: pe.events })
        const dv = val(results[12]) as { run_id: string; votes: DetectorVote[] } | null
        if (dv) dispatch({ type: 'SET_DETECTOR_VOTES', data: dv.votes })
      } finally {
        dispatch({ type: 'SET_LOADING_ANALYTICS', loading: false })
        fetchingAnalytics = false
      }
    },

    async fetchQueueStats() {
      try {
        const stats = await api.getQueueStats()
        dispatch({ type: 'SET_QUEUE_STATS', data: stats })
      } catch { /* ignore */ }
    },

    async fetchCapabilities() {
      if (fetchedCapabilities) return
      fetchedCapabilities = true
      try {
        const caps = await api.getCapabilities()
        dispatch({ type: 'SET_AFK_CAPABILITIES', data: caps })
      } catch { /* ignore */ }
    },

    startStreaming() {
      const runId = stateRef.current.currentRunId
      if (!runId) return
      // Stop any existing stream
      streamCleanupRef.current?.()
      dispatch({ type: 'SET_STREAMING', active: true })

      // Try WebSocket first, fall back to SSE
      let settled = false
      const wsCleanup = api.streamRunEventsWs(
        runId,
        (evt) => {
          settled = true
          dispatch({ type: 'ADD_EVENT', event: evt as RunEvent })
        },
        () => {
          dispatch({ type: 'SET_STREAMING', active: false })
        },
      )

      // If WS doesn't fire within 2s, add SSE fallback
      const fallbackTimer = setTimeout(() => {
        if (!settled) {
          wsCleanup()
          const sseCleanup = api.streamRunEvents(
            runId,
            (evt) => dispatch({ type: 'ADD_EVENT', event: evt as RunEvent }),
            () => dispatch({ type: 'SET_STREAMING', active: false }),
          )
          streamCleanupRef.current = sseCleanup
        }
      }, 2000)

      streamCleanupRef.current = () => {
        clearTimeout(fallbackTimer)
        wsCleanup()
      }
    },

    stopStreaming() {
      streamCleanupRef.current?.()
      streamCleanupRef.current = null
      dispatch({ type: 'SET_STREAMING', active: false })
    },

    async resumeRun() {
      const runId = stateRef.current.currentRunId
      if (!runId) return
      try {
        const data = await api.resumeRun(runId)
        dispatch({ type: 'SET_RUN_DATA', data })
      } catch { /* handled by caller */ }
    },

    async generateReport() {
      const runId = stateRef.current.currentRunId
      if (!runId) return null
      try {
        return await api.generateReport(runId)
      } catch {
        return null
      }
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state

  // useMemo (NOT useCallback+invoke) so `actions` is a stable reference across renders.
  // useCallback(() => fn, [])() would call the factory on every render, producing a new
  // object each time and causing every useEffect that depends on `actions` to re-fire.
  const actions = useMemo(() => createActions(dispatch, stateRef), [])

  // Persist identifiers to localStorage
  useEffect(() => {
    saveState({
      sessionId: state.sessionId ?? undefined,
      configProfileId: state.configProfileId ?? undefined,
      currentRunId: state.currentRunId ?? undefined,
      baselineRunId: state.baselineRunId ?? undefined,
    })
  }, [state.sessionId, state.configProfileId, state.currentRunId, state.baselineRunId])

  // Fetch run data when runId changes
  useEffect(() => {
    if (state.currentRunId) {
      actions.fetchRunData()
    }
  }, [state.currentRunId, actions])

  // Auto-poll when run is active
  useEffect(() => {
    if (!state.currentRunId || !state.runData) return
    const isActive = ['queued', 'running'].includes(state.runData.status)
    if (!isActive) return
    const interval = setInterval(() => {
      actions.fetchRunData()
    }, 3000)
    return () => clearInterval(interval)
  }, [state.currentRunId, state.runData?.status, actions])

  // Fetch analytics when run completes
  useEffect(() => {
    if (state.runData?.status === 'completed') {
      actions.fetchAnalytics()
    }
  }, [state.runData?.status, actions])

  return (
    <WorkspaceContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                             */
/* ------------------------------------------------------------------ */

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}

export function useWorkspaceState() {
  return useWorkspace().state
}

export function useWorkspaceActions() {
  return useWorkspace().actions
}

export function useWorkspaceDispatch() {
  return useWorkspace().dispatch
}
