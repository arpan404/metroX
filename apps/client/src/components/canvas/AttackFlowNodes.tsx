import { Handle, Position, type NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

export type AttackNodeData = {
  label: string
  attackType: string
  total: number
  success: number
  failure: number
  successRate: number
  confidence: number
  severity: Record<string, number>
}

export type RootNodeData = {
  label: string
  model: string
  completed: number
  total: number
  status: string
}

export type AnalyticsNodeData = {
  label: string
  composite: number
  gatePass: boolean
  riskCount: number
}

export function AttackNode({ data, selected }: NodeProps<AttackNodeData>) {
  const riskPercent = Math.round(data.successRate * 100)
  return (
    <div
      className={cn(
        'w-52 rounded-lg border bg-card p-3 shadow-sm transition-all duration-200',
        selected && 'ring-2 ring-primary shadow-md',
        riskPercent > 50 && 'border-destructive/40',
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate text-foreground">
          {data.label}
        </span>
        <Badge
          variant={riskPercent > 50 ? 'destructive' : 'secondary'}
          className="text-[10px] px-1.5 py-0"
        >
          {riskPercent}%
        </Badge>
      </div>
      <Progress value={riskPercent} className="mb-2 h-1.5" />
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>
          {data.success}/{data.total} pass
        </span>
        <span>{data.failure} fail</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function RootNode({ data, selected }: NodeProps<RootNodeData>) {
  return (
    <div
      className={cn(
        'w-48 rounded-lg border-2 border-primary/40 bg-card p-3 shadow-sm transition-all duration-200',
        selected && 'ring-2 ring-primary',
      )}
    >
      <Handle type="source" position={Position.Right} />
      <div className="mb-1.5 text-xs font-semibold text-foreground">
        {data.label}
      </div>
      <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
        <div className="truncate">Model: {data.model || 'unknown'}</div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-block size-1.5 rounded-full',
              data.status === 'running'
                ? 'bg-primary animate-pulse'
                : data.status === 'completed'
                  ? 'bg-emerald-500'
                  : 'bg-muted-foreground',
            )}
          />
          {data.status}
        </div>
        <div>
          {data.completed}/{data.total} attacks
        </div>
      </div>
    </div>
  )
}

export function AnalyticsNode({
  data,
  selected,
}: NodeProps<AnalyticsNodeData>) {
  return (
    <div
      className={cn(
        'w-44 rounded-lg border bg-card p-3 shadow-sm transition-all duration-200',
        selected && 'ring-2 ring-primary',
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div className="mb-1.5 text-xs font-semibold text-foreground">
        {data.label}
      </div>
      <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
        <div>Score: {data.composite.toFixed(1)}</div>
        <div
          className={cn(
            'font-semibold',
            data.gatePass ? 'text-emerald-500' : 'text-destructive',
          )}
        >
          Gate: {data.gatePass ? 'PASS' : 'FAIL'}
        </div>
        <div>{data.riskCount} risks</div>
      </div>
    </div>
  )
}

export const attackNodeTypes = {
  rootNode: RootNode,
  attackNode: AttackNode,
  analyticsNode: AnalyticsNode,
}
