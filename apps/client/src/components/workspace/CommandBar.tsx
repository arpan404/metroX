import { motion } from 'motion/react'
import {
  Sliders,
  BarChart3,
  Settings2,
  ListOrdered,
  Crosshair,
  Brain,
  Eye,
  Activity,
  TrendingUp,
  Plus,
  ToggleLeft,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useWorkspace, type PanelId, type CanvasMode } from '@/stores/workspace-store'
import { cn } from '@/lib/utils'

export function CommandBar() {
  const { state, dispatch } = useWorkspace()

  const togglePanel = (panel: PanelId) => dispatch({ type: 'TOGGLE_PANEL', panel })
  const toggleEvents = () => dispatch({ type: 'TOGGLE_EVENTS' })
  const isActive = (panel: PanelId) => state.activePanel === panel

  const studioAddNode = (role: string) => {
    const id = `${role}-${Date.now()}`
    dispatch({
      type: 'ADD_STUDIO_NODE',
      node: {
        id,
        type: 'studioRole',
        position: { x: 200 + Math.random() * 300, y: 200 + Math.random() * 200 },
        data: { label: `${role.charAt(0).toUpperCase() + role.slice(1)} Node`, role, model: '', description: '' },
      },
    })
  }

  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.05 }}
      className={cn(
        'absolute bottom-3 left-1/2 -translate-x-1/2 z-40',
        'flex items-center gap-1 px-2 h-10',
        'rounded-xl border border-border/50 bg-background/75 backdrop-blur-2xl backdrop-saturate-150',
        'shadow-[0_4px_24px_-8px_rgba(0,0,0,0.35)]',
      )}
      data-onboarding="command-bar"
    >
      {/* Mode toggle */}
      <ToggleGroup
        type="single"
        value={state.canvasMode}
        onValueChange={(v) => v && dispatch({ type: 'SET_CANVAS_MODE', mode: v as CanvasMode })}
        className="gap-0"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="evaluate" className="h-7 px-2.5 text-[11px] rounded-lg data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
              <Activity className="h-3 w-3 mr-1" />
              Evaluate
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Attack evaluation canvas</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="studio" className="h-7 px-2.5 text-[11px] rounded-lg data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
              <Workflow className="h-3 w-3 mr-1" />
              Studio
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Workflow builder</TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <div className="h-5 w-px bg-border/40" />

      {/* Panel toggles */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', isActive('config') && 'bg-primary/15 text-primary')}
            onClick={() => togglePanel('config')}
            data-onboarding="config-trigger"
          >
            <Sliders className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Configuration <kbd className="ml-1 font-mono text-[10px]">1</kbd>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', isActive('analytics') && 'bg-primary/15 text-primary')}
            onClick={() => togglePanel('analytics')}
            data-onboarding="analytics-trigger"
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Analytics <kbd className="ml-1 font-mono text-[10px]">2</kbd>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', isActive('settings') && 'bg-primary/15 text-primary')}
            onClick={() => togglePanel('settings')}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Settings <kbd className="ml-1 font-mono text-[10px]">3</kbd>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7 relative', state.eventsOpen && 'bg-primary/15 text-primary')}
            onClick={toggleEvents}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            {state.isStreaming && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Events <kbd className="ml-1 font-mono text-[10px]">E</kbd>
        </TooltipContent>
      </Tooltip>

      {/* Studio mode — node add buttons */}
      {state.canvasMode === 'studio' && (
        <>
          <div className="h-5 w-px bg-border/40" />
          {(['attacker', 'critic', 'verifier', 'analyst'] as const).map((role) => {
            const Icon = { attacker: Crosshair, critic: Eye, verifier: Brain, analyst: TrendingUp }[role]
            const color = {
              attacker: 'hover:text-red-400',
              critic: 'hover:text-amber-400',
              verifier: 'hover:text-blue-400',
              analyst: 'hover:text-emerald-400',
            }[role]
            return (
              <Tooltip key={role}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-7 w-7', color)}
                    onClick={() => studioAddNode(role)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs capitalize">Add {role}</TooltipContent>
              </Tooltip>
            )
          })}
        </>
      )}

      {/* Event count badge */}
      {state.events.length > 0 && (
        <>
          <div className="h-5 w-px bg-border/40" />
          <Badge variant="secondary" className="text-[10px] h-5 px-2 font-mono">
            {state.events.length} events
          </Badge>
        </>
      )}
    </motion.div>
  )
}
