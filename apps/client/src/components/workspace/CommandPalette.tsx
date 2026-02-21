import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Search,
  Settings2,
  Boxes,
  BarChart3,
  Wrench,
  Radio,
  Target,
  Play,
  Pause,
  RotateCw,
  FileText,
  Moon,
  Sun,
  MonitorSmartphone,
  Zap,
  Layers,
  Cpu,
  Download,
  Clipboard,
  Wifi,
  WifiOff,
  Layout,
  Maximize,
  Grid3X3,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useWorkspace } from '@/stores/workspace-store'
import { configTemplates } from '@/lib/config-templates'
import { toast } from 'sonner'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const { state, dispatch, actions } = useWorkspace()
  const { setTheme, theme } = useTheme()

  // ⌘K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const runAction = useCallback((fn: () => void) => {
    fn()
    setOpen(false)
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* ── Panels ── */}
        <CommandGroup heading="Panels">
          <CommandItem onSelect={() => runAction(() => dispatch({ type: 'TOGGLE_PANEL', panel: 'config' }))}>
            <Wrench className="mr-2 h-4 w-4" />
            <span>Toggle Config Panel</span>
            <kbd className="ml-auto pointer-events-none text-[10px] text-muted-foreground border px-1 rounded">1</kbd>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => dispatch({ type: 'TOGGLE_PANEL', panel: 'analytics' }))}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>Toggle Analytics Panel</span>
            <kbd className="ml-auto pointer-events-none text-[10px] text-muted-foreground border px-1 rounded">2</kbd>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => dispatch({ type: 'TOGGLE_PANEL', panel: 'settings' }))}>
            <Settings2 className="mr-2 h-4 w-4" />
            <span>Toggle Settings Panel</span>
            <kbd className="ml-auto pointer-events-none text-[10px] text-muted-foreground border px-1 rounded">3</kbd>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => dispatch({ type: 'TOGGLE_PANEL', panel: 'studio-inspector' }))}>
            <Boxes className="mr-2 h-4 w-4" />
            <span>Toggle Studio Inspector</span>
            <kbd className="ml-auto pointer-events-none text-[10px] text-muted-foreground border px-1 rounded">4</kbd>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => dispatch({ type: 'TOGGLE_EVENTS' }))}>
            <Radio className="mr-2 h-4 w-4" />
            <span>Toggle Events Panel</span>
            <kbd className="ml-auto pointer-events-none text-[10px] text-muted-foreground border px-1 rounded">E</kbd>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* ── Canvas ── */}
        <CommandGroup heading="Canvas">
          <CommandItem onSelect={() => runAction(() => dispatch({ type: 'SET_CANVAS_MODE', mode: 'evaluate' }))}>
            <Target className="mr-2 h-4 w-4" />
            <span>Evaluate Mode</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => dispatch({ type: 'SET_CANVAS_MODE', mode: 'studio' }))}>
            <Layers className="mr-2 h-4 w-4" />
            <span>Studio Mode</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* ── Run Actions ── */}
        <CommandGroup heading="Run">
          <CommandItem
            onSelect={() => runAction(() => {
              if (state.isStreaming) { actions.stopStreaming(); toast.info('Streaming stopped') }
              else if (state.currentRunId) { actions.startStreaming(); toast.success('Streaming started') }
            })}
          >
            {state.isStreaming ? <WifiOff className="mr-2 h-4 w-4" /> : <Wifi className="mr-2 h-4 w-4" />}
            <span>{state.isStreaming ? 'Stop Streaming' : 'Start Streaming'}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(async () => {
              if (state.currentRunId) {
                await actions.fetchRunData()
                toast.success('Run data refreshed')
              }
            })}
            disabled={!state.currentRunId}
          >
            <RotateCw className="mr-2 h-4 w-4" />
            <span>Refresh Run Data</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(async () => {
              if (state.currentRunId) {
                const resumed = await actions.resumeRun()
                if (resumed) toast.success('Run resumed')
                else toast.error('Failed to resume run')
              }
            })}
            disabled={!state.currentRunId}
          >
            <Play className="mr-2 h-4 w-4" />
            <span>Resume Run</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(async () => {
              const r = await actions.generateReport()
              if (r) toast.success(`Report: ${r.path}`)
            })}
            disabled={!state.currentRunId}
          >
            <FileText className="mr-2 h-4 w-4" />
            <span>Generate Report</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* ── Templates ── */}
        <CommandGroup heading="Quick Templates">
          {configTemplates.map((tpl) => (
            <CommandItem
              key={tpl.name}
              onSelect={() => runAction(() => {
                dispatch({ type: 'APPLY_TEMPLATE', template: tpl })
                toast.success(`Template applied: ${tpl.name}`)
              })}
            >
              <Zap className="mr-2 h-4 w-4" />
              <span>{tpl.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* ── Theme ── */}
        <CommandGroup heading="Appearance">
          <CommandItem onSelect={() => runAction(() => setTheme('light'))}>
            <Sun className="mr-2 h-4 w-4" />
            <span>Light Theme</span>
            {theme === 'light' && <span className="ml-auto text-primary text-[10px]">Active</span>}
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => setTheme('dark'))}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Dark Theme</span>
            {theme === 'dark' && <span className="ml-auto text-primary text-[10px]">Active</span>}
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => setTheme('system'))}>
            <MonitorSmartphone className="mr-2 h-4 w-4" />
            <span>System Theme</span>
            {theme === 'system' && <span className="ml-auto text-primary text-[10px]">Active</span>}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
