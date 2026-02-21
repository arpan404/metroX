import { useRef, useEffect, useMemo } from 'react'
import {
  Radio,
  Wifi,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Zap,
  AlertTriangle,
  Shield,
  Info,
  Clock,
  Filter,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkspace } from '@/stores/workspace-store'
import { cn } from '@/lib/utils'

const eventIconMap: Record<string, any> = {
  attack_start: Zap,
  attack_end: Zap,
  detection: Shield,
  policy_violation: AlertTriangle,
  error: AlertTriangle,
  info: Info,
  stream_start: Radio,
  stream_end: Radio,
}

const eventColorMap: Record<string, string> = {
  attack_start: 'text-amber-400 bg-amber-400/10',
  attack_end: 'text-emerald-400 bg-emerald-400/10',
  detection: 'text-blue-400 bg-blue-400/10',
  policy_violation: 'text-red-400 bg-red-400/10',
  error: 'text-red-400 bg-red-400/10',
  info: 'text-muted-foreground bg-muted/40',
  stream_start: 'text-cyan-400 bg-cyan-400/10',
  stream_end: 'text-cyan-400 bg-cyan-400/10',
}

function formatTimestamp(ts: string | number | undefined) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function EventItem({ event, index }: { event: any; index: number }) {
  const type = event.event_type ?? event.type ?? 'info'
  const Icon = eventIconMap[type] ?? CircleDot
  const color = eventColorMap[type] ?? 'text-muted-foreground bg-muted/20'

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.3) }}
      className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/20 transition group"
    >
      {/* Timeline dot */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5">
        <div className={cn('rounded-full p-0.5', color)}>
          <Icon className="h-3 w-3" />
        </div>
        <div className="w-px flex-1 bg-border/20 min-h-[8px]" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={cn('text-[9px] h-4 px-1 border-current/20', color.split(' ')[0])}>
            {type.replace(/_/g, ' ')}
          </Badge>
          {event.step != null && (
            <span className="text-[9px] text-muted-foreground/50 font-mono">#{event.step}</span>
          )}
          <span className="text-[9px] text-muted-foreground/40 font-mono ml-auto">
            {formatTimestamp(event.timestamp ?? event.created_at)}
          </span>
        </div>

        {/* Message */}
        {(event.message || event.data?.attack_type) && (
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
            {event.message || event.data?.attack_type}
          </p>
        )}

        {/* Metric badge */}
        {event.data?.asr != null && (
          <div className="flex gap-1.5 mt-1">
            <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted/30">
              ASR: {(event.data.asr * 100).toFixed(1)}%
            </span>
            {event.data?.confidence != null && (
              <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted/30">
                conf: {event.data.confidence.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export function EventsPanel() {
  const { state, dispatch } = useWorkspace()
  const isOpen = state.eventsOpen
  const scrollRef = useRef<HTMLDivElement>(null)
  const events = state.events

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      const el = scrollRef.current
      // Only auto-scroll if already near bottom
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
      if (isNearBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      }
    }
  }, [events.length, isOpen])

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      className={cn(
        'fixed bottom-16 left-1/2 -translate-x-1/2 z-30',
        'w-[90vw] max-w-[600px] max-h-[300px]',
        'rounded-2xl border border-border/30 overflow-hidden',
        'bg-background/80 backdrop-blur-xl shadow-2xl',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">Events</span>
          <Badge variant="secondary" className="text-[9px] h-4">{events.length}</Badge>
          {state.isStreaming && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              LIVE
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => dispatch({ type: 'CLEAR_EVENTS' })}
            title="Clear events"
          >
            <Filter className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => dispatch({ type: 'TOGGLE_EVENTS' })}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Event list */}
      <div ref={scrollRef} className="overflow-y-auto max-h-[240px] px-1 py-1">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/40">
            <Radio className="h-6 w-6 mb-2" />
            <p className="text-[11px]">No events yet</p>
            <p className="text-[10px]">Events appear here during run execution</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((event, i) => (
              <EventItem key={event.id ?? `event-${i}`} event={event} index={i} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  )
}
