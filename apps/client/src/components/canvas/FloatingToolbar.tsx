import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { motion } from 'motion/react'
import {
  LayoutDashboard,
  SlidersHorizontal,
  BarChart3,
  KeyRound,
  Command,
  Sun,
  Moon,
} from 'lucide-react'
import { useTheme } from 'next-themes'

export type ToolbarMode = 'canvas' | 'config' | 'analytics' | 'settings'

const modes: { value: ToolbarMode; icon: typeof LayoutDashboard; label: string }[] = [
  { value: 'canvas',    icon: LayoutDashboard,   label: 'Canvas' },
  { value: 'config',    icon: SlidersHorizontal, label: 'Config' },
  { value: 'analytics', icon: BarChart3,          label: 'Analytics' },
  { value: 'settings',  icon: KeyRound,           label: 'Settings' },
]

export function FloatingToolbar({
  activeMode,
  onModeChange,
  onCommandPalette,
}: {
  activeMode: ToolbarMode
  onModeChange: (mode: ToolbarMode) => void
  onCommandPalette?: () => void
}) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <motion.div
      data-onboarding="toolbar"
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 32 }}
      className="fixed top-4 left-1/2 z-50 -translate-x-1/2"
    >
      <div className={[
        'flex items-center gap-0.5',
        'rounded-full border border-border',
        'bg-card',
        'px-2 py-1.5',
        'shadow-[0_2px_12px_-2px_rgb(0_0_0_/_0.12),0_1px_3px_-1px_rgb(0_0_0_/_0.08)]',
        'dark:shadow-[0_2px_12px_-2px_rgb(0_0_0_/_0.5),0_1px_3px_-1px_rgb(0_0_0_/_0.3)]',
      ].join(' ')}>

        {/* Brand wordmark */}
        <span className="px-3 text-[11px] font-bold tracking-[0.22em] text-foreground/40 uppercase select-none">
          ART
        </span>

        <div className="mx-1.5 h-4 w-px bg-border" />

        {/* Mode nav */}
        <ToggleGroup
          type="single"
          value={activeMode}
          onValueChange={(value) => {
            if (value) onModeChange(value as ToolbarMode)
          }}
          className="gap-0.5"
        >
          {modes.map((mode) => (
            <Tooltip key={mode.value}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={mode.value}
                  size="sm"
                  className={[
                    'rounded-full px-3 h-8 gap-1.5 text-[12px] font-medium',
                    'text-muted-foreground',
                    'transition-all duration-150',
                    /* Active: invert — black pill with white text in light, white pill with black text in dark */
                    'data-[state=on]:bg-foreground data-[state=on]:text-background',
                    'hover:text-foreground hover:bg-muted',
                  ].join(' ')}
                  data-onboarding={
                    mode.value === 'config'    ? 'config-trigger'    :
                    mode.value === 'analytics' ? 'analytics-trigger' :
                    undefined
                  }
                >
                  <mode.icon className="size-3.5 shrink-0" />
                  <span className="hidden sm:inline">{mode.label}</span>
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {mode.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <div className="mx-1.5 h-4 w-px bg-border" />

        {/* Command palette */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={onCommandPalette}
            >
              <Command className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Command Palette (⌘K)
          </TooltipContent>
        </Tooltip>

        {/* Theme toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="size-3.5" />
              ) : (
                <Moon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Toggle theme
          </TooltipContent>
        </Tooltip>
      </div>
    </motion.div>
  )
}
