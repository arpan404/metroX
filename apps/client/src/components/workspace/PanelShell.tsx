import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type PanelPosition = 'left' | 'right'

type PanelShellProps = {
  open: boolean
  onClose: () => void
  position?: PanelPosition
  title: string
  subtitle?: string
  icon?: ReactNode
  badge?: ReactNode
  children: ReactNode
  className?: string
  width?: string
  footer?: ReactNode
}

const slideVariants = {
  left: {
    hidden: { x: -20, opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit: { x: -20, opacity: 0 },
  },
  right: {
    hidden: { x: 20, opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit: { x: 20, opacity: 0 },
  },
}

export function PanelShell({
  open,
  onClose,
  position = 'left',
  title,
  subtitle,
  icon,
  badge,
  children,
  className,
  width = 'w-[420px]',
  footer,
}: PanelShellProps) {
  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          data-slot="panel-shell"
          className={cn(
            'absolute top-14 z-30 flex flex-col',
            'rounded-xl border border-border/60 bg-background/80 backdrop-blur-2xl backdrop-saturate-150',
            'shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)]',
            width,
            position === 'left' ? 'left-3 bottom-16' : 'right-3 bottom-16',
            className,
          )}
          variants={slideVariants[position]}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
            {icon && <span className="text-muted-foreground">{icon}</span>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight truncate font-[Syne]">{title}</h3>
                {badge}
              </div>
              {subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4">{children}</div>
          </ScrollArea>

          {/* Footer */}
          {footer && (
            <div className="border-t border-border/40 px-4 py-3">{footer}</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Section                                                           */
/* ------------------------------------------------------------------ */

type SectionProps = {
  title: string
  description?: string
  children: ReactNode
  defaultOpen?: boolean
  badge?: ReactNode
}

export function PanelSection({ title, description, children, badge }: SectionProps) {
  return (
    <div className="space-y-3 pb-5 mb-5 border-b border-border/30 last:border-0 last:mb-0 last:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
          {description && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{description}</p>}
        </div>
        {badge}
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Metric Row                                                        */
/* ------------------------------------------------------------------ */

type MetricRowProps = {
  label: string
  value: string | number
  sub?: string
  color?: string
}

export function MetricRow({ label, value, sub, color }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn('text-sm font-mono font-medium tabular-nums', color)}>{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Field                                                             */
/* ------------------------------------------------------------------ */

type FieldGroupProps = {
  label: ReactNode
  hint?: string
  children: ReactNode
  horizontal?: boolean
}

export function FieldGroup({ label, hint, children, horizontal }: FieldGroupProps) {
  return (
    <div className={cn(horizontal ? 'flex items-center justify-between gap-3' : 'space-y-1.5')}>
      <div className={cn(horizontal && 'shrink-0')}>
        <div className="text-xs font-medium text-foreground/80">{label}</div>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                       */
/* ------------------------------------------------------------------ */

type EmptyStateProps = {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-muted-foreground/50 mb-3">{icon}</div>}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
