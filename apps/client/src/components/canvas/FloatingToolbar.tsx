import { RefreshCw, Activity, Settings, Swords, Workflow } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

/* ToolbarMode is the shared panel/navigation mode type used across the app */
export type ToolbarMode =
  | 'canvas'
  | 'config'
  | 'analytics'
  | 'settings'
  | 'attack-detail'
  | 'studio-inspector'

type FloatingToolbarProps = {
  activeMode: ToolbarMode
  onModeChange: (mode: ToolbarMode) => void
  onCommandPalette: () => void
  runId: string
  onRunIdChange: (id: string) => void
  onRefresh: () => void
  canvasMode: 'attack' | 'studio'
  onCanvasModeChange: (mode: 'attack' | 'studio') => void
}

export function FloatingToolbar({
  activeMode,
  onModeChange,
  onCommandPalette,
  runId,
  onRunIdChange,
  onRefresh,
  canvasMode,
  onCanvasModeChange,
}: FloatingToolbarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 12px',
        background: 'rgba(7, 10, 18, 0.78)',
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        borderBottom: '1px solid rgba(171, 187, 214, 0.12)',
        boxShadow: '0 1px 0 0 rgba(232, 240, 255, 0.04)',
      }}
    >
      {/* Brand */}
      <span
        style={{
          fontSize: '13px',
          fontWeight: 700,
          color: 'rgba(238, 241, 248, 0.92)',
          letterSpacing: '0.07em',
          userSelect: 'none',
          fontFamily: "'Syne', sans-serif",
          flexShrink: 0,
        }}
      >
        metroX
      </span>

      {/* Canvas mode toggle — centered */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          background: 'rgba(13, 20, 33, 0.65)',
          border: '1px solid rgba(171, 187, 214, 0.14)',
          borderRadius: '9px',
          padding: '2px',
        }}
      >
        {(['attack', 'studio'] as const).map((mode) => (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onCanvasModeChange(mode)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 12px',
                  background: canvasMode === mode ? 'rgba(130, 165, 235, 0.18)' : 'transparent',
                  border: canvasMode === mode ? '1px solid rgba(130, 165, 235, 0.28)' : '1px solid transparent',
                  borderRadius: '7px',
                  color: canvasMode === mode ? 'rgba(186, 210, 255, 0.95)' : 'rgba(184, 196, 214, 0.5)',
                  fontSize: '12px',
                  fontWeight: canvasMode === mode ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  if (canvasMode !== mode) {
                    ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(184, 210, 255, 0.78)'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(130, 165, 235, 0.08)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (canvasMode !== mode) {
                    ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(184, 196, 214, 0.5)'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }
                }}
              >
                {mode === 'attack' ? <Swords size={12} /> : <Workflow size={12} />}
                {mode === 'attack' ? 'Attack' : 'Studio'}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {mode === 'attack' ? 'Attack canvas' : 'Studio canvas'}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Run ID input */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Activity
          size={12}
          style={{
            position: 'absolute',
            left: '8px',
            color: 'rgba(111, 125, 147, 0.7)',
            pointerEvents: 'none',
          }}
        />
        <input
          value={runId}
          onChange={(e) => onRunIdChange(e.target.value)}
          placeholder="Paste run ID…"
          style={{
            height: '30px',
            width: '190px',
            paddingLeft: '26px',
            paddingRight: '10px',
            background: 'rgba(13, 20, 33, 0.55)',
            border: '1px solid rgba(171, 187, 214, 0.12)',
            borderRadius: '7px',
            color: 'rgba(238, 241, 248, 0.82)',
            fontSize: '11.5px',
            outline: 'none',
            fontFamily: "'IBM Plex Mono', monospace",
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'rgba(130, 165, 235, 0.38)')}
          onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = 'rgba(171, 187, 214, 0.12)')}
        />
      </div>

      {/* Refresh */}
      <Tooltip>
        <TooltipTrigger asChild>
          <TopBarIconBtn onClick={onRefresh}>
            <RefreshCw size={13} />
          </TopBarIconBtn>
        </TooltipTrigger>
        <TooltipContent side="bottom">Refresh run data</TooltipContent>
      </Tooltip>

      {/* Command palette */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onCommandPalette}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '30px',
              padding: '0 9px',
              background: 'rgba(13, 20, 33, 0.55)',
              border: '1px solid rgba(171, 187, 214, 0.12)',
              borderRadius: '7px',
              color: 'rgba(111, 125, 147, 0.75)',
              fontSize: '10px',
              cursor: 'pointer',
              userSelect: 'none',
              letterSpacing: '0.04em',
              fontFamily: "'IBM Plex Mono', monospace",
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(28, 40, 68, 0.7)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(171, 187, 214, 0.2)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(13, 20, 33, 0.55)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(171, 187, 214, 0.12)'
            }}
          >
            ⌘K
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Command palette</TooltipContent>
      </Tooltip>

      {/* Settings — top right */}
      <Tooltip>
        <TooltipTrigger asChild>
          <TopBarIconBtn
            onClick={() => onModeChange('settings')}
            active={activeMode === 'settings'}
          >
            <Settings size={14} />
          </TopBarIconBtn>
        </TooltipTrigger>
        <TooltipContent side="bottom">Settings</TooltipContent>
      </Tooltip>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function TopBarIconBtn({
  children,
  onClick,
  active = false,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '30px',
        height: '30px',
        background: active ? 'rgba(130, 165, 235, 0.18)' : 'rgba(13, 20, 33, 0.55)',
        border: active
          ? '1px solid rgba(130, 165, 235, 0.35)'
          : '1px solid rgba(171, 187, 214, 0.12)',
        borderRadius: '7px',
        color: active ? 'rgba(186, 210, 255, 0.95)' : 'rgba(111, 125, 147, 0.75)',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(28, 40, 68, 0.7)'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(171, 187, 214, 0.2)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(184, 210, 255, 0.72)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(13, 20, 33, 0.55)'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(171, 187, 214, 0.12)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(111, 125, 147, 0.75)'
        }
      }}
    >
      {children}
    </button>
  )
}
