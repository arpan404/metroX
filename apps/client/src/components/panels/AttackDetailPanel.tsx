import type { RunTelemetryPayload, NodeTelemetryPayload } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type AttackData = {
  attack_type: string
  total: number
  success: number
  failure: number
  success_rate: number
  avg_confidence: number
  severity_breakdown: Record<string, number>
}

export function AttackDetailPanel({
  selectedAttack,
  telemetry,
  nodeTelemetry,
}: {
  selectedAttack: AttackData | null
  telemetry: RunTelemetryPayload | null
  nodeTelemetry: NodeTelemetryPayload | null
}) {
  if (!selectedAttack) {
    return (
      <ScrollArea className="h-full">
        <div className="px-4 pt-14 pb-6 space-y-4">
          <h3 className="text-sm font-semibold">Node Details</h3>
          <p className="text-xs text-muted-foreground">Click an attack node on the canvas to inspect analytics.</p>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </ScrollArea>
    )
  }

  const riskPercent = Math.round(selectedAttack.success_rate * 100)

  return (
    <ScrollArea className="h-full">
      <div className="px-4 pt-14 pb-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">{selectedAttack.attack_type.replace(/_/g, ' ').toUpperCase()}</h3>
          <p className="text-xs text-muted-foreground">Attack analytics and telemetry</p>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border bg-muted/30 p-2.5">
            <p className="text-[10px] text-muted-foreground">Total</p>
            <p className="text-lg font-semibold font-mono">{selectedAttack.total}</p>
          </div>
          <div className="rounded-md border bg-muted/30 p-2.5">
            <p className="text-[10px] text-muted-foreground">Success Rate</p>
            <p className="text-lg font-semibold font-mono">{riskPercent}%</p>
          </div>
          <div className="rounded-md border bg-emerald-500/10 p-2.5">
            <p className="text-[10px] text-emerald-500">Success</p>
            <p className="text-lg font-semibold font-mono text-emerald-500">{selectedAttack.success}</p>
          </div>
          <div className="rounded-md border bg-destructive/10 p-2.5">
            <p className="text-[10px] text-destructive">Failure</p>
            <p className="text-lg font-semibold font-mono text-destructive">{selectedAttack.failure}</p>
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-2.5">
          <p className="text-[10px] text-muted-foreground">Avg Confidence</p>
          <p className="text-lg font-semibold font-mono">{selectedAttack.avg_confidence.toFixed(3)}</p>
        </div>

        <Separator />

        {/* Severity Breakdown */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Severity</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(selectedAttack.severity_breakdown).map(([level, count]) => (
              <Badge
                key={level}
                variant={level === 'critical' || level === 'high' ? 'destructive' : 'secondary'}
                className="text-[10px]"
              >
                {level}: {count}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Telemetry counters */}
        {telemetry && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Event Counters</p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Event</TableHead>
                    <TableHead className="text-xs text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(telemetry.event_counts).map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell className="text-xs font-mono">{key}</TableCell>
                      <TableCell className="text-xs font-mono text-right">{value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <Separator />

        {/* Node telemetry */}
        {nodeTelemetry && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Node Telemetry</p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">OK</TableHead>
                    <TableHead className="text-xs text-right">Fail</TableHead>
                    <TableHead className="text-xs text-right">ms</TableHead>
                    <TableHead className="text-xs text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nodeTelemetry.nodes.map((node) => (
                    <TableRow key={node.attack_type}>
                      <TableCell className="text-xs font-mono">{node.attack_type}</TableCell>
                      <TableCell className="text-xs font-mono text-right">{node.success}</TableCell>
                      <TableCell className="text-xs font-mono text-right">{node.failure}</TableCell>
                      <TableCell className="text-xs font-mono text-right">{node.avg_latency_ms.toFixed(0)}</TableCell>
                      <TableCell className="text-xs font-mono text-right">${node.effective_cost_usd.toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
