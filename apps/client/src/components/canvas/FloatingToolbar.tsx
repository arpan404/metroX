import { useState, useRef, useEffect } from 'react'
import { RefreshCw, Menu, X, Rocket, Activity, BarChart2, Settings, Swords, Workflow } from 'lucide-react'

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

const menuItems: { mode: ToolbarMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'config', label: 'Config', icon: <Rocket size={14} /> },
  { mode: 'analytics', label: 'Analytics', icon: <BarChart2 size={14} /> },
  { mode: 'settings', label: 'Settings', icon: <Settings size={14} /> },
]

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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

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
        padding: '0 14px',
        background: 'rgba(10,10,14,0.72)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Hamburger + dropdown */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            background: menuOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          title="Menu"
        >
          {menuOpen ? <X size={16} /> : <Menu size={16} />}
        </button>

        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '38px',
              left: 0,
              minWidth: '160px',
              background: 'rgba(14,14,20,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              padding: '4px',
              backdropFilter: 'blur(16px)',
            }}
          >
            {menuItems.map(({ mode, label, icon }) => (
              <button
                key={mode}
                onClick={() => {
                  onModeChange(mode)
                  setMenuOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '7px 10px',
                  background: activeMode === mode ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none',
                  borderRadius: '5px',
                  color: activeMode === mode ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (activeMode !== mode) {
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
                    ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeMode !== mode) {
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)'
                  }
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* App name */}
      <span
        style={{
          fontSize: '13px',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.85)',
          letterSpacing: '0.06em',
          userSelect: 'none',
        }}
      >
        metroX
      </span>

      {/* Canvas mode toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '7px',
          padding: '2px',
        }}
      >
        {(['attack', 'studio'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onCanvasModeChange(mode)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              background: canvasMode === mode ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: 'none',
              borderRadius: '5px',
              color: canvasMode === mode ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)',
              fontSize: '12px',
              fontWeight: canvasMode === mode ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {mode === 'attack' ? <Swords size={12} /> : <Workflow size={12} />}
            {mode === 'attack' ? 'Attack' : 'Studio'}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Run ID search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Activity
            size={13}
            style={{
              position: 'absolute',
              left: '9px',
              color: 'rgba(255,255,255,0.3)',
              pointerEvents: 'none',
            }}
          />
          <input
            value={runId}
            onChange={(e) => onRunIdChange(e.target.value)}
            placeholder="Paste run ID..."
            style={{
              height: '30px',
              width: '200px',
              paddingLeft: '28px',
              paddingRight: '10px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '12px',
              outline: 'none',
              fontFamily: 'monospace',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.25)')}
            onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)')}
          />
        </div>
        <button
          onClick={onRefresh}
          title="Refresh run data"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '30px',
            height: '30px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)')}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Command palette trigger */}
      <button
        onClick={onCommandPalette}
        title="Command palette (⌘K)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          height: '30px',
          padding: '0 10px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
          color: 'rgba(255,255,255,0.45)',
          fontSize: '11px',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.09)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)')}
      >
        <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>⌘K</span>
      </button>
    </div>
  )
}
