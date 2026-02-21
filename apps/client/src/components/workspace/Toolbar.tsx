import { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Check,
  ChevronsUpDown,
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
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command as CommandMenu, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useWorkspace } from '@/stores/workspace-store'
import { api } from '@/lib/api'
import type { RunOut } from '@/lib/types'
import { cn } from '@/lib/utils'

export function Toolbar({ onCommandPalette }: { onCommandPalette?: () => void }) {
  const { state, dispatch, actions } = useWorkspace()
  const { theme, setTheme } = useTheme()
  const [runSelectorOpen, setRunSelectorOpen] = useState(false)
  const [runIdInput, setRunIdInput] = useState(state.currentRunId ?? '')
  const [runOptions, setRunOptions] = useState<RunOut[]>([])
  const [isLoadingRuns, setIsLoadingRuns] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleLoadRun = useCallback(() => {
    const id = runIdInput.trim()
    if (id) {
      dispatch({ type: 'SET_RUN_ID', runId: id })
    }
  }, [runIdInput, dispatch])

  const loadRunOptions = useCallback(async () => {
    setIsLoadingRuns(true)
    try {
      const payload = await api.listRuns({ limit: 30, offset: 0 })
      setRunOptions(payload.runs ?? [])
    } catch {
      // Best-effort for toolbar UX.
    } finally {
      setIsLoadingRuns(false)
    }
  }, [])

  useEffect(() => {
    void loadRunOptions()
  }, [loadRunOptions, state.currentRunId])

  useEffect(() => {
    if (state.currentRunId) {
      setRunIdInput(state.currentRunId)
    }
  }, [state.currentRunId])

  const selectorLabel = useMemo(() => {
    const id = runIdInput.trim()
    if (!id) return 'Select run'
    if (id.length <= 18) return id
    return `${id.slice(0, 8)}…${id.slice(-6)}`
  }, [runIdInput])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await actions.fetchRunData()
    await actions.fetchAnalytics()
    setTimeout(() => setIsRefreshing(false), 600)
  }, [actions])

  const runStatus = state.runData?.status
  const canResumeRun = runStatus === 'interrupted' || runStatus === 'failed'
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
        'rounded-xl border border-transparent bg-transparent backdrop-blur-sm',
        'shadow-none',
      )}
      data-onboarding="toolbar"
    >
      {/* Brand */}
      <Link to="/" className="flex items-center gap-2 mr-2 shrink-0">
        <img
          src="/favicon.svg"
          alt="MetroX"
          className="opacity-95 dark:opacity-80 transition-opacity duration-300 hover:opacity-100"
          style={{ height: '24px', width: '24px', objectFit: 'contain' }}
        />
        <span className="text-sm font-display font-semibold tracking-tight hidden sm:block opacity-95 dark:opacity-80">MetroX</span>
      </Link>

      {/* Divider */}
      <div className="h-5 w-px bg-border/40 shrink-0" />

      {/* Run selector */}
      <div className="flex items-center gap-2 flex-1 max-w-[460px] min-w-[280px]">
        <Popover open={runSelectorOpen} onOpenChange={setRunSelectorOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={runSelectorOpen}
              className="h-7 w-full justify-between border-border/35 bg-background/45 dark:bg-background/25 text-xs font-mono"
            >
              <span className="truncate">{selectorLabel}</span>
              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="start">
            <CommandMenu>
              <CommandInput placeholder="Search run ID..." />
              <CommandList>
                <CommandEmpty>{isLoadingRuns ? 'Loading runs...' : 'No runs found.'}</CommandEmpty>
                <CommandGroup heading="Recent Runs">
                  {runOptions.map((run) => (
                    <CommandItem
                      key={run.id}
                      value={`${run.id} ${run.status} ${run.preset}`}
                      onSelect={() => {
                        setRunIdInput(run.id)
                        dispatch({ type: 'SET_RUN_ID', runId: run.id })
                        setRunSelectorOpen(false)
                      }}
                      className="font-mono text-xs"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-3.5 w-3.5',
                          runIdInput === run.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="flex-1 truncate">{run.id}</span>
                      <Badge
                        variant={run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'}
                        className="ml-2 h-4 px-1.5 text-[9px] font-mono"
                      >
                        {run.status}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </CommandMenu>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-md border border-border/35 bg-background/45 dark:bg-background/25 hover:bg-background/60"
          onClick={handleLoadRun}
          disabled={!runIdInput.trim()}
        >
          <Play className="h-3 w-3" />
        </Button>
      </div>

      {/* Run status pills */}
      {state.runData && (
        <>
          <div className="h-5 w-px bg-border/40 shrink-0 hidden md:block mx-1" />
          <div className="hidden md:flex items-center gap-2 ml-1">
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
        {canResumeRun && (
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
