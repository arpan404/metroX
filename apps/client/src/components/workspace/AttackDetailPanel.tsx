import { useState } from 'react'
import {
  Target,
  BarChart3,
  Clock,
  Zap,
  Shield,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Send,
  ChevronDown,
  AlertTriangle,
  FileText,
  Loader2,
  Eye,
  Brain,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PanelShell, PanelSection, MetricRow, EmptyState } from './PanelShell'
import { useWorkspace } from '@/stores/workspace-store'
import { api } from '@/lib/api'
import type { AdjudicationCreate } from '@/lib/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function AttackDetailPanel() {
  const { state, dispatch } = useWorkspace()
  const isOpen = state.activePanel === 'attack-detail'
  const [adjReviewer, setAdjReviewer] = useState('')
  const [adjDecision, setAdjDecision] = useState<string>('')
  const [adjRationale, setAdjRationale] = useState('')
  const [adjExecutionId, setAdjExecutionId] = useState('')
  const [adjSubmitting, setAdjSubmitting] = useState(false)

  // Find selected attack data from summary
  const selectedType = state.selectedNodeId
  const attackData = state.attackSummary?.attack_types?.find(
    (a: { attack_type: string }) => a.attack_type === selectedType
  )

  // Get node telemetry from state
  const telemetryData = state.nodeTelemetry

  const handleAdjudicate = async () => {
    if (!adjExecutionId || !adjReviewer || !adjDecision) return
    setAdjSubmitting(true)
    try {
      await api.createAdjudication({
        run_id: state.currentRunId!,
        execution_id: adjExecutionId,
        reviewer: adjReviewer,
        decision: adjDecision as AdjudicationCreate['decision'],
        rationale: adjRationale || undefined,
      })
      toast.success('Adjudication submitted')
      setAdjRationale('')
    } catch (e: any) {
      toast.error(e.message || 'Adjudication failed')
    } finally {
      setAdjSubmitting(false)
    }
  }

  return (
    <PanelShell
      open={isOpen}
      onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
      position="left"
      title={attackData ? `Attack: ${attackData.attack_type}` : 'Attack Detail'}
      icon={<Target className="h-4 w-4" />}
      width="w-[400px] lg:w-[440px]"
    >
      {!selectedType || !attackData ? (
        <EmptyState
          icon={<Target className="h-8 w-8" />}
          title="No attack selected"
          description="Click an attack node on the canvas to view its details."
        />
      ) : (
        <div className="space-y-4">
          {/* Attack overview */}
          <PanelSection title="Overview">
            <div className="space-y-0.5">
              <MetricRow label="Attack Type" value={attackData.attack_type} />
              <MetricRow label="Total Attempts" value={attackData.total} />
              <MetricRow
                label="Pass"
                value={attackData.failure}
                color="text-emerald-400"
              />
              <MetricRow
                label="Fail"
                value={attackData.success}
                color="text-red-400"
              />
            </div>

            {/* ASR bar */}
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Attack Success Rate</span>
                <span className={cn(
                  'font-mono font-semibold',
                  (attackData.success_rate ?? 0) > 0.5 ? 'text-red-400' : (attackData.success_rate ?? 0) > 0.2 ? 'text-amber-400' : 'text-emerald-400'
                )}>
                  {((attackData.success_rate ?? 0) * 100).toFixed(1)}%
                </span>
              </div>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ transformOrigin: 'left' }}
              >
                <Progress value={(attackData.success_rate ?? 0) * 100} className="h-2" />
              </motion.div>
            </div>

            {/* Extra metrics */}
            {attackData.avg_confidence != null && (
              <div className="mt-3 space-y-0.5">
                <MetricRow label="Avg Confidence" value={attackData.avg_confidence.toFixed(3)} />
                {attackData.avg_disagreement != null && (
                  <MetricRow label="Avg Disagreement" value={attackData.avg_disagreement.toFixed(3)} />
                )}
                {attackData.avg_uncertainty != null && (
                  <MetricRow label="Avg Uncertainty" value={attackData.avg_uncertainty.toFixed(3)} />
                )}
              </div>
            )}
          </PanelSection>

          {/* Severity breakdown */}
          {attackData.severity_breakdown && Object.keys(attackData.severity_breakdown).length > 0 && (
            <PanelSection title="Severity Breakdown">
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(attackData.severity_breakdown).map(([sev, count]) => {
                  const colors: Record<string, string> = {
                    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
                    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
                    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  }
                  return (
                    <Badge key={sev} variant="outline" className={cn('text-[10px]', colors[sev] ?? '')}>
                      {sev}: {String(count)}
                    </Badge>
                  )
                })}
              </div>
            </PanelSection>
          )}

          {/* Detection votes for this attack type */}
          {state.detectorVotes.length > 0 && (() => {
            const votes = state.detectorVotes
            if (votes.length === 0) return null
            return (
              <PanelSection title="Detector Votes" badge={
                <Badge variant="outline" className="text-[10px] h-4">{votes.length}</Badge>
              }>
                <div className="space-y-1">
                  {votes.slice(0, 10).map((v, i) => {
                    const hasFail = Object.values(v.failure_flags).some(Boolean)
                    return (
                      <div key={i} className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">{v.detector_name}</span>
                        <div className="flex gap-2 font-mono">
                          <Badge variant={hasFail ? 'destructive' : 'default'} className="text-[9px] h-4">
                            {hasFail ? 'fail' : 'pass'}
                          </Badge>
                          <span className="text-muted-foreground">{v.confidence.toFixed(2)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </PanelSection>
            )
          })()}

          {/* Node telemetry */}
          {telemetryData && telemetryData.nodes.length > 0 && (
            <PanelSection title="Node Telemetry" description="Per-execution timing and metrics">
              <div className="overflow-x-auto -mx-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] h-7">Attack Type</TableHead>
                      <TableHead className="text-[9px] h-7 text-right">Latency</TableHead>
                      <TableHead className="text-[9px] h-7 text-right">Total</TableHead>
                      <TableHead className="text-[9px] h-7 text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {telemetryData.nodes
                      .filter((t) => t.attack_type === selectedType)
                      .slice(0, 15)
                      .map((t, i) => (
                        <TableRow key={i} className="cursor-pointer hover:bg-muted/30">
                          <TableCell className="text-[10px] py-1 font-mono">{t.attack_type}</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">{t.avg_latency_ms?.toFixed(0)}ms</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">{t.total}</TableCell>
                          <TableCell className="text-[10px] py-1 font-mono text-right">${t.effective_cost_usd?.toFixed(4) ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </PanelSection>
          )}

          {/* Adjudication form */}
          <PanelSection title="Adjudication" description="Review and adjudicate attack detections">
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Execution ID</label>
                <Input
                  value={adjExecutionId}
                  onChange={(e) => setAdjExecutionId(e.target.value)}
                  placeholder="execution-id..."
                  className="h-7 text-xs font-mono mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Reviewer</label>
                <Input
                  value={adjReviewer}
                  onChange={(e) => setAdjReviewer(e.target.value)}
                  placeholder="Your name"
                  className="h-7 text-xs mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Decision</label>
                <div className="flex gap-1.5 mt-0.5">
                  {[
                    { value: 'agree', label: 'Agree', icon: ThumbsUp, color: 'text-emerald-400' },
                    { value: 'disagree', label: 'Disagree', icon: ThumbsDown, color: 'text-red-400' },
                    { value: 'uncertain', label: 'Uncertain', icon: Minus, color: 'text-amber-400' },
                  ].map(({ value, label, icon: Icon, color }) => (
                    <Button
                      key={value}
                      variant={adjDecision === value ? 'default' : 'outline'}
                      size="sm"
                      className={cn('h-7 text-[10px] flex-1', adjDecision === value && color)}
                      onClick={() => setAdjDecision(value)}
                    >
                      <Icon className="h-3 w-3 mr-1" /> {label}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Rationale</label>
                <Textarea
                  value={adjRationale}
                  onChange={(e) => setAdjRationale(e.target.value)}
                  placeholder="Explain your reasoning..."
                  rows={3}
                  className="text-xs mt-0.5 resize-none"
                />
              </div>
              <Button
                size="sm"
                className="w-full h-7 text-[10px]"
                disabled={!adjExecutionId || !adjReviewer || !adjDecision || adjSubmitting}
                onClick={handleAdjudicate}
              >
                {adjSubmitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                Submit Adjudication
              </Button>
            </div>
          </PanelSection>
        </div>
      )}
    </PanelShell>
  )
}
