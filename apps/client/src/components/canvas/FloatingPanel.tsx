import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'

type FloatingPanelProps = {
  children: React.ReactNode
  position:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'center'
  visible?: boolean
  className?: string
}

const positionClasses: Record<string, string> = {
  'top-left':     'top-20 left-4',
  'top-right':    'top-20 right-4',
  'bottom-left':  'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
}

export function FloatingPanel({
  children,
  position,
  visible = true,
  className,
}: FloatingPanelProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 6 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className={cn(
            'fixed z-40',
            'rounded-lg border border-border',
            'bg-card shadow-sm',
            positionClasses[position],
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
