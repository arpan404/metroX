import { useEffect } from 'react'
import { AnimatePresence } from 'motion/react'
import { ReactFlowProvider } from 'reactflow'
import 'reactflow/dist/style.css'

import { WorkspaceProvider, useWorkspace, type PanelId } from '@/stores/workspace-store'
import { Canvas } from '@/components/workspace/Canvas'
import { Toolbar } from '@/components/workspace/Toolbar'
import { CommandBar } from '@/components/workspace/CommandBar'
import { ConfigPanel } from '@/components/workspace/ConfigPanel'
import { AnalyticsPanel } from '@/components/workspace/AnalyticsPanel'
import { SettingsPanel } from '@/components/workspace/SettingsPanel'
import { EventsPanel } from '@/components/workspace/EventsPanel'
import { AttackDetailPanel } from '@/components/workspace/AttackDetailPanel'
import { StudioInspectorPanel } from '@/components/workspace/StudioInspectorPanel'
import { CommandPalette } from '@/components/workspace/CommandPalette'

/* ── Keyboard Shortcuts ── */
function useKeyboardShortcuts() {
  const { dispatch, state } = useWorkspace()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const panelKeys: Record<string, PanelId> = {
        '1': 'config',
        '2': 'analytics',
        '3': 'settings',
        '4': 'studio-inspector',
      }

      if (panelKeys[e.key]) {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_PANEL', panel: panelKeys[e.key] })
        return
      }

      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_EVENTS' })
        return
      }

      // Escape to close panels
      if (e.key === 'Escape') {
        if (state.activePanel) {
          dispatch({ type: 'CLOSE_PANEL' })
        } else if (state.eventsOpen) {
          dispatch({ type: 'TOGGLE_EVENTS' })
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [dispatch, state.activePanel, state.eventsOpen])
}

/* ── Inner workspace (needs context) ── */
function WorkspaceInner() {
  useKeyboardShortcuts()

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Canvas: full-screen base layer */}
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>

      {/* Toolbar: top-center floating bar */}
      <Toolbar />

      {/* CommandBar: bottom-center floating pill */}
      <CommandBar />

      {/* Side panels (animated, floating) */}
      <AnimatePresence>
        <ConfigPanel key="config" />
        <AnalyticsPanel key="analytics" />
        <SettingsPanel key="settings" />
        <AttackDetailPanel key="attack-detail" />
        <StudioInspectorPanel key="studio-inspector" />
      </AnimatePresence>

      {/* Events panel: bottom pop-up */}
      <AnimatePresence>
        <EventsPanel />
      </AnimatePresence>

      {/* Command palette: ⌘K overlay */}
      <CommandPalette />
    </div>
  )
}

/* ── Exported page component ── */
export function AppPage() {
  return (
    <WorkspaceProvider>
      <WorkspaceInner />
    </WorkspaceProvider>
  )
}
