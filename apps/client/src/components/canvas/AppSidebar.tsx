import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import {
  LayoutDashboard,
  SlidersHorizontal,
  BarChart3,
  Crosshair,
  Boxes,
  Swords,
  Workflow,
  Plus,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { ToolbarMode } from './FloatingToolbar'
import type { RunOut, RunTelemetryPayload } from '@/lib/types'

/* ------------------------------------------------------------------ */
/*  Nav items                                                           */
/* ------------------------------------------------------------------ */

const NAV_ITEMS: {
  value: ToolbarMode
  icon: React.ElementType
  label: string
  onboarding?: string
}[] = [
  { value: 'canvas',           icon: LayoutDashboard,   label: 'Canvas' },
  { value: 'config',           icon: SlidersHorizontal, label: 'Configuration', onboarding: 'config-trigger' },
  { value: 'analytics',        icon: BarChart3,          label: 'Analytics',     onboarding: 'analytics-trigger' },
  { value: 'attack-detail',    icon: Crosshair,         label: 'Test Detail' },
  { value: 'studio-inspector', icon: Boxes,             label: 'Studio Inspector' },
]

/* ------------------------------------------------------------------ */
/*  AppSidebar                                                          */
/* ------------------------------------------------------------------ */

export function AppSidebar({
  activeMode,
  onModeChange,
  canvasMode,
  onCanvasModeChange,
  onAddStudioNode,
  run,
  telemetry,
  streaming,
}: {
  activeMode: ToolbarMode
  onModeChange: (mode: ToolbarMode) => void
  canvasMode: 'attack' | 'studio'
  onCanvasModeChange: (mode: 'attack' | 'studio') => void
  onAddStudioNode?: (role: string) => void
  run: RunOut | null
  telemetry: RunTelemetryPayload | null
  streaming: boolean
}) {
  return (
    <Sidebar collapsible="icon" data-onboarding="toolbar">
      {/* ── Brand header ── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none select-none">
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-[10px] font-bold shrink-0">
                ART
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold text-sm">MetroX</span>
                <span className="text-[11px] text-muted-foreground">Test Ready Testing</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Nav ── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_ITEMS.map(({ value, icon: Icon, label, onboarding }) => {
              const isActive =
                value === 'canvas'
                  ? activeMode === 'canvas'
                  : activeMode === value
              return (
                <SidebarMenuItem key={value}>
                  <SidebarMenuButton
                    tooltip={label}
                    isActive={isActive}
                    data-onboarding={onboarding}
                    onClick={() => onModeChange(value)}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Studio node add buttons — only shown in studio mode */}
        {canvasMode === 'studio' && onAddStudioNode && (
          <SidebarGroup>
            <SidebarGroupLabel>Add Node</SidebarGroupLabel>
            <SidebarMenu>
              {(['attacker', 'critic', 'verifier', 'analyst', 'fraud_analyst'] as const).map((role) => (
                <SidebarMenuItem key={role}>
                  <SidebarMenuButton
                    tooltip={`Add ${role} node`}
                    onClick={() => onAddStudioNode(role)}
                  >
                    <Plus />
                    <span className="capitalize">{role}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer: run status + canvas mode ── */}
      <SidebarFooter>
        <SidebarSeparator />

        {/* Run status — hidden in collapsed (icon-only) state via group-data */}
        <div className="group-data-[collapsible=icon]:hidden px-2 py-1 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">
            Run Status
          </p>
          <div className="space-y-1">
            <StatusRow
              label="Status"
              value={
                <Badge
                  variant={
                    run?.status === 'running'
                      ? 'default'
                      : run?.status === 'completed'
                      ? 'secondary'
                      : 'outline'
                  }
                  className="text-[9px] h-4 px-1.5"
                >
                  {run?.status ?? 'idle'}
                </Badge>
              }
            />
            <StatusRow
              label="Progress"
              value={
                <span className="font-mono text-[11px]">
                  {run?.completed_attacks ?? 0}/{run?.total_attacks ?? 0}
                </span>
              }
            />
            <StatusRow
              label="Spent"
              value={
                <span className="font-mono text-[11px]">
                  ${Number(telemetry?.cost?.spent_usd ?? run?.budget_spent_usd ?? 0).toFixed(3)}
                </span>
              }
            />
            <StatusRow
              label="Stream"
              value={
                <div className="flex items-center gap-1">
                  <span
                    className={
                      streaming
                        ? 'size-1.5 rounded-full bg-emerald-500 animate-pulse inline-block'
                        : 'size-1.5 rounded-full bg-muted-foreground/50 inline-block'
                    }
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {streaming ? 'LIVE' : 'OFF'}
                  </span>
                </div>
              }
            />
          </div>
        </div>

        {/* Canvas mode toggle */}
        <SidebarMenu>
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  isActive={canvasMode === 'attack'}
                  onClick={() => onCanvasModeChange('attack')}
                >
                  <Swords />
                  <span>Test Canvas</span>
                </SidebarMenuButton>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Test Canvas</TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  isActive={canvasMode === 'studio'}
                  onClick={() => onCanvasModeChange('studio')}
                >
                  <Workflow />
                  <span>Studio</span>
                </SidebarMenuButton>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Studio</TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

/* ------------------------------------------------------------------ */
/*  StatusRow helper                                                    */
/* ------------------------------------------------------------------ */

function StatusRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {value}
    </div>
  )
}
