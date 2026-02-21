import { motion, AnimatePresence } from 'motion/react'
import { Rocket, BarChart2, Swords, ListCollapse, Plus, Activity } from 'lucide-react'
import type { ToolbarMode } from './FloatingToolbar'

type BottomActionBarProps = {
  activeMode: ToolbarMode
  onModeChange: (mode: ToolbarMode) => void
  canvasMode: 'attack' | 'studio'
  streaming: boolean
  eventsOpen: boolean
  onEventsToggle: () => void
  onRefresh: () => void
  onAddStudioNode?: (role: string) => void
}

const attackActions: { mode: ToolbarMode; label: string; icon: React.ReactNode; title: string }[] = [
  { mode: 'config',   label: 'Config',     icon: <Rocket size={15} />,   title: 'Launch config' },
  { mode: 'analytics', label: 'Analytics', icon: <BarChart2 size={15} />, title: 'Analytics' },
]

const studioRoles = ['attacker', 'critic', 'verifier', 'analyst'] as const

export function BottomActionBar({
  activeMode,
  onModeChange,
  canvasMode,
  streaming,
  eventsOpen,
  onEventsToggle,
  onRefresh,
  onAddStudioNode,
}: BottomActionBarProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '18px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      {/* Main action pill */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 36, delay: 0.1 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          padding: '4px',
          background: 'rgba(10, 14, 26, 0.82)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          border: '1px solid rgba(171, 187, 214, 0.18)',
          borderRadius: '12px',
          boxShadow: '0 8px 40px -8px rgba(0,0,0,0.65), inset 0 1px 0 0 rgba(232,240,255,0.09)',
        }}
      >
        {/* Attack panel toggles */}
        {attackActions.map(({ mode, label, icon, title }) => (
          <ActionBtn
            key={mode}
            active={activeMode === mode}
            title={title}
            onClick={() => onModeChange(mode)}
          >
            {icon}
            <span style={{ fontSize: '11px', fontWeight: 500 }}>{label}</span>
          </ActionBtn>
        ))}

        {/* Attack detail — only in attack mode */}
        <AnimatePresence>
          {canvasMode === 'attack' && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <ActionBtn
                active={activeMode === 'attack-detail'}
                title="Attack detail"
                onClick={() => onModeChange('attack-detail')}
              >
                <Swords size={15} />
                <span style={{ fontSize: '11px', fontWeight: 500 }}>Detail</span>
              </ActionBtn>
            </motion.div>
          )}
        </AnimatePresence>

        <Divider />

        {/* Studio node add buttons — only in studio mode */}
        <AnimatePresence>
          {canvasMode === 'studio' && onAddStudioNode && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: '2px', overflow: 'hidden' }}
            >
              {studioRoles.map((role) => (
                <ActionBtn
                  key={role}
                  active={false}
                  title={`Add ${role} node`}
                  onClick={() => onAddStudioNode(role)}
                >
                  <Plus size={12} />
                  <span style={{ fontSize: '11px', fontWeight: 500, textTransform: 'capitalize' }}>{role}</span>
                </ActionBtn>
              ))}
              <Divider />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Events toggle */}
        <ActionBtn
          active={eventsOpen}
          title="Event timeline"
          onClick={onEventsToggle}
        >
          <ListCollapse size={15} />
          <span style={{ fontSize: '11px', fontWeight: 500 }}>Events</span>
          {streaming && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#818cf8',
                flexShrink: 0,
                boxShadow: '0 0 6px rgba(129,140,248,0.7)',
              }}
            />
          )}
        </ActionBtn>

        {/* Refresh */}
        <ActionBtn
          active={false}
          title="Refresh data"
          onClick={onRefresh}
          iconOnly
        >
          <Activity size={14} />
        </ActionBtn>
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ActionBtn({
  children,
  active,
  onClick,
  title,
  iconOnly = false,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  title?: string
  iconOnly?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: iconOnly ? '6px 8px' : '6px 10px',
        background: active ? 'rgba(130, 165, 235, 0.18)' : 'transparent',
        border: active ? '1px solid rgba(130, 165, 235, 0.35)' : '1px solid transparent',
        borderRadius: '8px',
        color: active ? 'rgba(186, 210, 255, 0.95)' : 'rgba(184, 196, 214, 0.65)',
        cursor: 'pointer',
        transition: 'all 0.15s cubic-bezier(0.22,1,0.36,1)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(130, 165, 235, 0.10)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(184, 210, 255, 0.85)'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(130, 165, 235, 0.18)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(184, 196, 214, 0.65)'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'
        }
      }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return (
    <div
      style={{
        width: '1px',
        height: '20px',
        background: 'rgba(171, 187, 214, 0.14)',
        margin: '0 2px',
        flexShrink: 0,
      }}
    />
  )
}
