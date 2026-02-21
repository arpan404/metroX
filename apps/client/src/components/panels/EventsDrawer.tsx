import { motion } from 'motion/react'
import { Activity } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'

type EventItem = {
  id: number
  event_type: string
  step: number
  message?: string
  data?: Record<string, unknown>
  created_at: string
}

export function EventsDrawer({
  open,
  onOpenChange,
  events,
  streaming,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  events: EventItem[]
  streaming: boolean
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="flex items-center gap-3">
          <Activity className="size-4 text-muted-foreground" />
          <DrawerTitle className="text-sm">Event Timeline</DrawerTitle>
          <Badge variant="secondary" className="text-[10px]">{events.length}</Badge>
          {streaming && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span className="text-[11px] font-mono text-foreground live-pulse">LIVE</span>
            </div>
          )}
        </DrawerHeader>
        <ScrollArea className="h-64 px-4 pb-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No events received yet.</p>
          ) : (
            <div className="space-y-1.5">
              {events.slice(-200).map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-2 rounded-md border px-2.5 py-1.5"
                >
                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                    {event.event_type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    step {event.step}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {event.message ?? JSON.stringify(event.data ?? {}).slice(0, 80)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  )
}
