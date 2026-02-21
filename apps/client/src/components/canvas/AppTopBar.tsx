import { AnimatePresence, motion } from 'motion/react'
import { Sun, Moon, Settings2, Command, RefreshCw, Search, Download } from 'lucide-react'
import { useTheme } from 'next-themes'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function AppTopBar({
  runId,
  onRunIdChange,
  onRefresh,
  onCommandPalette,
  onSettings,
}: {
  runId: string
  onRunIdChange: (id: string) => void
  onRefresh: () => void
  onCommandPalette?: () => void
  onSettings?: () => void
}) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-sm px-3 z-30">
      {/* Sidebar toggle */}
      <SidebarTrigger className="-ml-1 size-8 text-muted-foreground" />

      <Separator orientation="vertical" className="h-4" />

      {/* Search / Run ID — takes available center space */}
      <div className="relative flex-1 max-w-[360px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={runId}
          onChange={(e) => onRunIdChange(e.target.value)}
          placeholder="Search or paste run ID…"
          className="pl-8 h-8 text-xs bg-muted/40 border-transparent focus-visible:border-border focus-visible:ring-0"
        />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onRefresh}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Refresh run data</TooltipContent>
      </Tooltip>

      {/* Push right-side actions to the end */}
      <div className="flex-1" />

      {/* Export — placeholder */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground/50 cursor-not-allowed"
            disabled
          >
            <Download className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Export report (coming soon)</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4" />

      {/* Command palette */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={onCommandPalette}
          >
            <Command className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Command Palette (⌘K)</TooltipContent>
      </Tooltip>

      {/* Settings */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={onSettings}
          >
            <Settings2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Settings</TooltipContent>
      </Tooltip>

      {/* Theme toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            <AnimatePresence mode="wait" initial={false}>
              {resolvedTheme === 'dark' ? (
                <motion.span
                  key="sun"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex"
                >
                  <Sun className="size-3.5" />
                </motion.span>
              ) : (
                <motion.span
                  key="moon"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex"
                >
                  <Moon className="size-3.5" />
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Toggle theme</TooltipContent>
      </Tooltip>
    </header>
  )
}
