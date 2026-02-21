import { Handle, Position, type NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type StudioNodeData = {
  label: string
  role: string
  model: string
  description: string
}

const roleColors: Record<string, string> = {
  attacker: 'border-red-500/30',
  critic: 'border-amber-500/30',
  verifier: 'border-blue-500/30',
  analyst: 'border-emerald-500/30',
  entrypoint: 'border-primary/50',
}

export function StudioRoleNode({
  data,
  selected,
}: NodeProps<StudioNodeData>) {
  return (
    <div
      className={cn(
        'w-48 rounded-lg border-2 bg-background p-3 transition-all duration-200',
        roleColors[data.role] ?? 'border-border',
        selected && 'ring-2 ring-primary shadow-md',
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          {data.label}
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {data.role}
        </Badge>
      </div>
      <div className="font-mono text-[11px] text-muted-foreground">
        {data.model}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export const studioNodeTypes = {
  studioNode: StudioRoleNode,
}
