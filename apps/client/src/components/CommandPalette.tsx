import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  LayoutDashboard,
  SlidersHorizontal,
  BarChart3,
  KeyRound,
  Sun,
  Moon,
  RotateCcw,
} from 'lucide-react'
import { useTheme } from 'next-themes'

export function CommandPalette({
  open,
  onOpenChange,
  onReplayTour,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReplayTour?: () => void
}) {
  const navigate = useNavigate()
  const { setTheme, resolvedTheme } = useTheme()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  const runCommand = (fn: () => void) => {
    onOpenChange(false)
    fn()
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => navigate('/'))}>
            <LayoutDashboard className="mr-2 size-4" />
            Canvas
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/config'))}
          >
            <SlidersHorizontal className="mr-2 size-4" />
            Configuration
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/analytics'))}
          >
            <BarChart3 className="mr-2 size-4" />
            Analytics
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/settings'))}
          >
            <KeyRound className="mr-2 size-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() =>
              runCommand(() =>
                setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
              )
            }
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="mr-2 size-4" />
            ) : (
              <Moon className="mr-2 size-4" />
            )}
            Toggle Theme
          </CommandItem>
          {onReplayTour && (
            <CommandItem onSelect={() => runCommand(onReplayTour)}>
              <RotateCcw className="mr-2 size-4" />
              Replay Walkthrough
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
