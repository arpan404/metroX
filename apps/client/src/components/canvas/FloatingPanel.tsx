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
  'top-left': 'top-20 left-4',
  'top-right': 'top-20 right-4',
  'bottom-left': 'bottom-4 left-4',
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
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className={cn(
            'fixed z-40 rounded-xl border border-border/60 bg-card/90 shadow-lg backdrop-blur-xl',
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
