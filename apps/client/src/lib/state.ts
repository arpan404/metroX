export type AppState = {
  sessionId?: string
  configProfileId?: string
  currentRunId?: string
  baselineRunId?: string
}

const KEY = 'autoredteam-state-v1'

export function loadState(): AppState {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AppState) : {}
  } catch {
    return {}
  }
}

export function saveState(next: AppState): void {
  window.localStorage.setItem(KEY, JSON.stringify(next))
}
