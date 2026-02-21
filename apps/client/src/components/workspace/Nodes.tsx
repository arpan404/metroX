import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { motion } from 'motion/react'
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Crosshair,
  Brain,
  Eye,
  BarChart3,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Target Node — Root node representing the system under test        */
/* ------------------------------------------------------------------ */

type TargetNodeData = {
  label: string
  model: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  targetType?: string
  totalAttacks?: number
  completedAttacks?: number
}

export const TargetNode = memo(function TargetNode({ data, selected }: NodeProps<TargetNodeData>) {
  const progress = data.totalAttacks ? Math.round((data.completedAttacks ?? 0) / data.totalAttacks * 100) : 0
  const statusColor = {
    idle: 'text-muted-foreground',
    running: 'text-primary',
    completed: 'text-emerald-400',
    failed: 'text-destructive',
  }[data.status]

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'relative rounded-xl border bg-background/90 backdrop-blur-xl px-5 py-4 min-w-[220px]',
        'shadow-[0_4px_24px_-8px_rgba(0,0,0,0.3)]',
        'transition-shadow duration-200',
        selected ? 'border-primary ring-1 ring-primary/30 shadow-primary/10' : 'border-border/60',
      )}
    >
      {/* Status indicator */}
      <div className="absolute -top-1.5 -right-1.5">
        {data.status === 'running' && (
          <span className="relative flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary border-2 border-background" />
          </span>
        )}
        {data.status === 'completed' && (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        )}
        {data.status === 'failed' && (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className={cn('p-2 rounded-lg bg-primary/10', statusColor)}>
          <Shield className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{data.label}</p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">{data.model}</p>
        </div>
      </div>

      {data.status === 'running' && data.totalAttacks ? (
        <div className="space-y-1.5">
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>{data.completedAttacks}/{data.totalAttacks}</span>
            <span>{progress}%</span>
          </div>
        </div>
      ) : data.targetType ? (
        <Badge variant="secondary" className="text-[10px] font-mono">{data.targetType}</Badge>
      ) : null}

      <Handle type="source" position={Position.Bottom} className="!bg-primary !border-background !w-2 !h-2" />
    </motion.div>
  )
})

/* ------------------------------------------------------------------ */
/*  Attack Node — Represents an attack type with results              */
/* ------------------------------------------------------------------ */

type AttackNodeData = {
  attackType: string
  total: number
  success: number
  failure: number
  successRate: number
  avgConfidence: number
  severityBreakdown: Record<string, number>
  status?: 'pending' | 'active' | 'done'
}

const attackTypeIcons: Record<string, typeof Shield> = {
  prompt_injection: ShieldAlert,
  jailbreak: Crosshair,
  hallucination: Brain,
  toxicity: AlertTriangle,
  tool_misuse: Zap,
  unsafe_output: Eye,
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    case 'medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'low': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    default: return 'bg-muted text-muted-foreground'
  }
}

export const AttackNode = memo(function AttackNode({ data, selected }: NodeProps<AttackNodeData>) {
  const Icon = attackTypeIcons[data.attackType] ?? ShieldAlert
  const rateColor = data.successRate > 0.3 ? 'text-red-400' : data.successRate > 0.15 ? 'text-amber-400' : 'text-emerald-400'
  const severityEntries = Object.entries(data.severityBreakdown || {}).filter(([, v]) => v > 0)

  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'relative rounded-xl border bg-background/90 backdrop-blur-xl px-4 py-3 min-w-[200px] max-w-[240px]',
        'shadow-[0_2px_16px_-6px_rgba(0,0,0,0.3)]',
        'transition-all duration-200 hover:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.35)]',
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border/50',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="p-1.5 rounded-md bg-muted/60">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold truncate capitalize">
            {data.attackType.replace(/_/g, ' ')}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono">{data.total} attacks</p>
        </div>
        {data.status === 'active' && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 mb-2.5">
        <div className="text-center">
          <p className={cn('text-sm font-mono font-semibold tabular-nums', rateColor)}>
            {(data.successRate * 100).toFixed(0)}%
          </p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">ASR</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-mono font-semibold tabular-nums text-emerald-400">{data.failure}</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pass</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-mono font-semibold tabular-nums text-red-400">{data.success}</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Fail</p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>Confidence</span>
          <span className="font-mono">{(data.avgConfidence * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary/70 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${data.avgConfidence * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Severity pills */}
      {severityEntries.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {severityEntries.map(([sev, count]) => (
            <span
              key={sev}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-medium',
                getSeverityColor(sev),
              )}
            >
              {sev} {count}
            </span>
          ))}
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !border-background !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !border-background !w-2 !h-2" />
    </motion.div>
  )
})

/* ------------------------------------------------------------------ */
/*  Metrics Node — Composite score & gate result summary              */
/* ------------------------------------------------------------------ */

type MetricsNodeData = {
  compositeScore: number
  gatePass: boolean
  gateReasons: string[]
  metrics: Record<string, number>
  riskCount?: number
}

export const MetricsNode = memo(function MetricsNode({ data, selected }: NodeProps<MetricsNodeData>) {
  const scoreColor = data.compositeScore >= 70 ? 'text-emerald-400' : data.compositeScore >= 40 ? 'text-amber-400' : 'text-red-400'
  const scoreBg = data.compositeScore >= 70 ? 'from-emerald-500/10' : data.compositeScore >= 40 ? 'from-amber-500/10' : 'from-red-500/10'

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28, delay: 0.1 }}
      className={cn(
        'relative rounded-xl border bg-background/90 backdrop-blur-xl px-5 py-4 min-w-[200px]',
        'shadow-[0_4px_24px_-8px_rgba(0,0,0,0.3)]',
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border/50',
      )}
    >
      <div className={cn('absolute inset-0 rounded-xl bg-gradient-to-b to-transparent opacity-60', scoreBg)} />
      <div className="relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-muted/60">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs font-semibold">Evaluation Summary</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge
                variant={data.gatePass ? 'default' : 'destructive'}
                className="text-[9px] h-4 px-1.5"
              >
                {data.gatePass ? 'PASS' : 'FAIL'}
              </Badge>
              {data.riskCount !== undefined && data.riskCount > 0 && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                  {data.riskCount} risks
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Composite score */}
        <div className="text-center py-2">
          <p className={cn('text-3xl font-mono font-bold tabular-nums', scoreColor)}>
            {data.compositeScore.toFixed(1)}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Composite Score</p>
        </div>

        {/* Key metrics */}
        {Object.entries(data.metrics).length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 pt-2 border-t border-border/30">
            {Object.entries(data.metrics).slice(0, 6).map(([key, val]) => (
              <div key={key} className="flex justify-between text-[10px]">
                <span className="text-muted-foreground truncate mr-2">{key.replace(/_/g, ' ')}</span>
                <span className="font-mono tabular-nums">{typeof val === 'number' ? (val < 1 ? (val * 100).toFixed(1) + '%' : val.toFixed(1)) : val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Gate reasons */}
        {!data.gatePass && data.gateReasons.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-border/30 space-y-1">
            {data.gateReasons.slice(0, 3).map((reason, i) => (
              <p key={i} className="text-[9px] text-destructive/80 flex items-start gap-1">
                <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{reason}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !border-background !w-2 !h-2" />
    </motion.div>
  )
})

/* ------------------------------------------------------------------ */
/*  Studio Role Node — For workflow builder canvas mode               */
/* ------------------------------------------------------------------ */

type StudioRoleNodeData = {
  label: string
  role: 'attacker' | 'critic' | 'verifier' | 'analyst' | 'entrypoint' | 'coordinator'
  model?: string
  description?: string
}

const roleStyles: Record<string, { color: string; border: string; icon: typeof Shield }> = {
  attacker: { color: 'text-red-400', border: 'border-red-500/40', icon: Crosshair },
  critic: { color: 'text-amber-400', border: 'border-amber-500/40', icon: Eye },
  verifier: { color: 'text-blue-400', border: 'border-blue-500/40', icon: ShieldCheck },
  analyst: { color: 'text-emerald-400', border: 'border-emerald-500/40', icon: TrendingUp },
  entrypoint: { color: 'text-primary', border: 'border-primary/40', icon: Activity },
  coordinator: { color: 'text-violet-400', border: 'border-violet-500/40', icon: Brain },
}

export const StudioRoleNode = memo(function StudioRoleNode({ data, selected }: NodeProps<StudioRoleNodeData>) {
  const style = roleStyles[data.role] ?? roleStyles.entrypoint
  const Icon = style.icon

  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'relative rounded-xl border-2 bg-background/90 backdrop-blur-xl px-4 py-3 min-w-[180px] max-w-[220px]',
        'shadow-[0_2px_16px_-6px_rgba(0,0,0,0.25)]',
        style.border,
        selected && 'ring-2 ring-primary/30',
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn('h-3.5 w-3.5', style.color)} />
        <p className="text-[11px] font-semibold truncate">{data.label}</p>
      </div>
      <Badge variant="outline" className={cn('text-[9px] mb-1', style.color)}>{data.role}</Badge>
      {data.model && (
        <p className="text-[10px] text-muted-foreground font-mono truncate">{data.model}</p>
      )}
      {data.description && (
        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{data.description}</p>
      )}

      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !border-background !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !border-background !w-2 !h-2" />
    </motion.div>
  )
})

/* ------------------------------------------------------------------ */
/*  Node type map for ReactFlow                                       */
/* ------------------------------------------------------------------ */

export const nodeTypes = {
  target: TargetNode,
  attack: AttackNode,
  metrics: MetricsNode,
  studioRole: StudioRoleNode,
}
