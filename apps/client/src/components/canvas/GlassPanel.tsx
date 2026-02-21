import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'

type GlassPanelProps = {
  open: boolean
  onClose: () => void
  side: 'left' | 'right'
  title: string
  children: React.ReactNode
}

export function GlassPanel({ open, onClose, side, title, children }: GlassPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: side === 'left' ? -420 : 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: side === 'left' ? -420 : 420, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            style={{
              position: 'fixed',
              top: '48px',
              bottom: 0,
              [side]: 0,
              width: '380px',
              zIndex: 61,
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(10,10,16,0.9)',
              backdropFilter: 'blur(20px)',
              borderRight: side === 'left' ? '1px solid rgba(255,255,255,0.08)' : undefined,
              borderLeft: side === 'right' ? '1px solid rgba(255,255,255,0.08)' : undefined,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.85)',
                  letterSpacing: '0.03em',
                }}
              >
                {title}
              </span>
              <button
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '26px',
                  height: '26px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '5px',
                  color: 'rgba(255,255,255,0.45)',
                  cursor: 'pointer',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)'
                }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Content */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 16px',
              }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
