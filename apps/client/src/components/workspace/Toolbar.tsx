import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Search,
  Command,
  Moon,
  Sun,
  RefreshCw,
  Play,
  Pause,
  SkipForward,
  Radio,
  ChevronDown,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useWorkspace } from '@/stores/workspace-store'
import { cn } from '@/lib/utils'

export function Toolbar({ onCommandPalette }: { onCommandPalette?: () => void }) {
  const { state, dispatch, actions } = useWorkspace()
  const { theme, setTheme } = useTheme()
  const [runIdInput, setRunIdInput] = useState(state.currentRunId ?? '')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleLoadRun = useCallback(() => {
    const id = runIdInput.trim()
    if (id) {
      dispatch({ type: 'SET_RUN_ID', runId: id })
    }
  }, [runIdInput, dispatch])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await actions.fetchRunData()
    await actions.fetchAnalytics()
    setTimeout(() => setIsRefreshing(false), 600)
  }, [actions])

  const runStatus = state.runData?.status
  const progress = state.runData
    ? state.runData.total_attacks > 0
      ? Math.round((state.runData.completed_attacks / state.runData.total_attacks) * 100)
      : 0
    : null

  return (
    <motion.div
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'absolute top-3 left-3 right-3 z-40 h-11',
        'flex items-center gap-2 px-3',
        'rounded-xl border border-border/70 bg-background/95 dark:border-border/50 dark:bg-background/75 backdrop-blur-2xl backdrop-saturate-150',
        'shadow-[0_2px_20px_-8px_rgba(0,0,0,0.3)]',
      )}
      data-onboarding="toolbar"
    >
      {/* Brand */}
      <div className="flex items-center gap-2 mr-2 shrink-0">
        <img
          src="/favicon.svg"
          alt="MetroX"
          className="opacity-95 dark:opacity-80 transition-opacity duration-300 hover:opacity-100"
          style={{ height: '24px', width: '24px', objectFit: 'contain' }}
        />
        <span className="text-sm font-display font-semibold tracking-tight hidden sm:block opacity-95 dark:opacity-80">MetroX</span>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-border/40 shrink-0" />

      {/* Run ID input */}
      <div className="flex items-center gap-1.5 flex-1 max-w-xs">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={runIdInput}
            onChange={(e) => setRunIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadRun()}
            placeholder="Run ID..."
            className="h-7 pl-7 pr-2 text-xs font-mono bg-transparent border-border/40 focus-visible:ring-1 focus-visible:ring-primary/30"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleLoadRun}
          disabled={!runIdInput.trim()}
        >
          <Play className="h-3 w-3" />
        </Button>
      </div>

      {/* Run status pills */}
      {state.runData && (
        <>
          <div className="h-5 w-px bg-border/40 shrink-0 hidden md:block" />
          <div className="hidden md:flex items-center gap-1.5">
            <Badge
              variant={runStatus === 'completed' ? 'default' : runStatus === 'failed' ? 'destructive' : 'secondary'}
              className="text-[10px] h-5 px-2 font-mono"
            >
              {runStatus}
            </Badge>
            {progress !== null && runStatus === 'running' && (
              <Badge variant="outline" className="text-[10px] h-5 px-2 font-mono">
                {progress}%
              </Badge>
            )}
            {state.runData.budget_spent_usd > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 px-2 font-mono hidden lg:flex">
                ${state.runData.budget_spent_usd.toFixed(2)}
              </Badge>
            )}
          </div>
        </>
      )}

      {/* Streaming indicator */}
      <AnimatePresence>
        {state.isStreaming && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="flex items-center gap-1.5"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-[10px] text-emerald-400 font-mono hidden lg:block">LIVE</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-0.5">
        {/* Refresh */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleRefresh}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Refresh data</TooltipContent>
        </Tooltip>

        {/* Resume run */}
        {state.runData?.status === 'interrupted' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => actions.resumeRun()}
              >
                <SkipForward className="h-3.5 w-3.5 text-amber-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Resume run</TooltipContent>
          </Tooltip>
        )}

        <div className="h-5 w-px bg-border/40 mx-0.5" />

        {/* Command palette */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                if (onCommandPalette) {
                  onCommandPalette()
                } else {
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
                }
              }}
            >
              <Command className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Command palette <kbd className="ml-1 font-mono text-[10px]">⌘K</kbd>
          </TooltipContent>
        </Tooltip>

        {/* Theme toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={theme}
                  initial={{ rotate: -30, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 30, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </motion.div>
              </AnimatePresence>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Toggle theme</TooltipContent>
        </Tooltip>
      </div>
    </motion.div>
  )
}
