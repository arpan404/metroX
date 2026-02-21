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
  { value: 'canvas', icon: LayoutDashboard, label: 'Canvas' },
  { value: 'config', icon: SlidersHorizontal, label: 'Config' },
  { value: 'analytics', icon: BarChart3, label: 'Analytics' },
  { value: 'settings', icon: KeyRound, label: 'Settings' },
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
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed top-4 left-1/2 z-50 -translate-x-1/2"
    >
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/80 px-2 py-1.5 shadow-lg backdrop-blur-xl">
        <span className="px-2.5 text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase select-none">
          ART
        </span>

        <div className="mx-1 h-4 w-px bg-border" />

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
                  className="rounded-full px-3 h-8 gap-1.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-colors"
                  data-onboarding={
                    mode.value === 'config'
                      ? 'config-trigger'
                      : mode.value === 'analytics'
                        ? 'analytics-trigger'
                        : undefined
                  }
                >
                  <mode.icon className="size-3.5" />
                  <span className="hidden sm:inline">{mode.label}</span>
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {mode.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <div className="mx-1 h-4 w-px bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              onClick={onCommandPalette}
            >
              <Command className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Command Palette (Cmd+K)
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              onClick={() =>
                setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
              }
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="size-3.5" />
              ) : (
                <Moon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Toggle Theme
          </TooltipContent>
        </Tooltip>
      </div>
    </motion.div>
  )
}
