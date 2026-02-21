import { useState } from 'react'
import type { RunTelemetryPayload, NodeTelemetryPayload, AdjudicationCreate } from '@/lib/types'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
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

const DECISION_OPTIONS: AdjudicationCreate['decision'][] = [
  'none',
  'hallucination',
  'jailbreak_success',
  'prompt_injection_success',
  'tool_misuse',
  'toxicity',
]

export function AttackDetailPanel({
  selectedAttack,
  telemetry,
  nodeTelemetry,
  runId,
  onResumeRun,
}: {
  selectedAttack: AttackData | null
  telemetry: RunTelemetryPayload | null
  nodeTelemetry: NodeTelemetryPayload | null
  runId?: string
  onResumeRun?: () => void
}) {
  const [executionId, setExecutionId] = useState('')
  const [reviewer, setReviewer] = useState('ui-reviewer')
  const [decision, setDecision] = useState<AdjudicationCreate['decision']>('none')
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastAdjudicationId, setLastAdjudicationId] = useState<string | null>(null)

  async function handleSubmitAdjudication() {
    if (!runId) {
      toast.error('No run ID available')
      return
    }
    if (!executionId.trim()) {
      toast.error('Execution ID is required')
      return
    }

    const payload: AdjudicationCreate = {
      run_id: runId,
      execution_id: executionId.trim(),
      reviewer: reviewer.trim() || 'ui-reviewer',
      decision,
      ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
    }

    setSubmitting(true)
    try {
      const result = await api.createAdjudication(payload)
      setLastAdjudicationId(result.id)
      toast.success('Adjudication submitted successfully')
      setExecutionId('')
      setRationale('')
      setDecision('none')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit adjudication')
    } finally {
      setSubmitting(false)
    }
  }

  if (!selectedAttack) {
    return (
      <ScrollArea className="h-full">
        <div className="px-4 pt-5 pb-6 space-y-4">
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
      <div className="px-4 pt-5 pb-6 space-y-4">
        {/* Header with optional Resume Run button */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{selectedAttack.attack_type.replace(/_/g, ' ').toUpperCase()}</h3>
            <p className="text-xs text-muted-foreground">Attack analytics and telemetry</p>
          </div>
          {runId && onResumeRun && (
            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={onResumeRun}>
              Resume Run
            </Button>
          )}
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

        <Separator />

        {/* Adjudication Form */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">Submit Adjudication</p>

          <Card className="bg-card/60 p-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="adj-execution-id" className="text-[10px] text-muted-foreground">
                Execution ID
              </Label>
              <Input
                id="adj-execution-id"
                className="h-7 text-xs"
                placeholder="execution-uuid"
                value={executionId}
                onChange={(e) => setExecutionId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-reviewer" className="text-[10px] text-muted-foreground">
                Reviewer
              </Label>
              <Input
                id="adj-reviewer"
                className="h-7 text-xs"
                placeholder="ui-reviewer"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-decision" className="text-[10px] text-muted-foreground">
                Decision
              </Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as AdjudicationCreate['decision'])}>
                <SelectTrigger id="adj-decision" className="h-8 text-xs">
                  <SelectValue placeholder="Select decision" />
                </SelectTrigger>
                <SelectContent>
                  {DECISION_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs">
                      {opt.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-rationale" className="text-[10px] text-muted-foreground">
                Rationale (optional)
              </Label>
              <Textarea
                id="adj-rationale"
                className="text-xs min-h-[56px]"
                placeholder="Why this decision was made..."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />
            </div>

            <Button
              size="sm"
              className="h-8 w-full text-xs"
              disabled={submitting || !executionId.trim() || !runId}
              onClick={handleSubmitAdjudication}
            >
              {submitting ? 'Submitting...' : 'Submit Adjudication'}
            </Button>

            {lastAdjudicationId && (
              <p className="text-[10px] text-muted-foreground">
                Last submitted: <span className="font-mono">{lastAdjudicationId}</span>
              </p>
            )}
          </Card>
        </div>
      </div>
    </ScrollArea>
  )
}
