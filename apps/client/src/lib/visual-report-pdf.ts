import { jsPDF } from 'jspdf'
import type { DetectorVote, ForecastPayload } from './types'

type AttackSummaryPayload = {
  attack_types?: Array<{
    attack_type: string
    total: number
    success: number
    failure: number
    success_rate: number
    avg_confidence: number
    avg_disagreement?: number
    avg_uncertainty?: number
  }>
}

type ExecutionSlicesPayload = {
  slices?: Array<{
    attack_type: string
    provider_name: string
    model: string
    count: number
    avg_latency_ms: number
    effective_cost_usd: number
  }>
}

type ScorecardLike = {
  metrics?: Record<string, number>
  gates?: { pass?: boolean; reasons?: string[] }
}

type ComprehensivePayload = {
  executions?: Array<{
    execution_id?: string
    attack_type?: string
    status?: string
    failed_reasons?: string[]
    latency_ms?: number
    effective_cost_usd?: number
    model_resolved?: string
    provider_name?: string
    tool_calls?: Array<unknown>
    detector_votes?: Array<Record<string, unknown>>
    prompt?: string
    response?: string
  }>
  events?: Array<{
    id?: number
    event_type?: string
    step?: number
    message?: string
    created_at?: string
  }>
}

export type VisualReportInput = {
  runId: string
  scorecard: ScorecardLike | null
  attackSummary: AttackSummaryPayload | null
  executionSlices: ExecutionSlicesPayload | null
  detectorVotes: DetectorVote[]
  forecasts: ForecastPayload | null
  narrativeSummary: {
    executive_summary?: string
    non_technical_explanation?: string
    advisories?: Array<Record<string, unknown>>
  } | null
  comprehensivePayload?: ComprehensivePayload | null
}

function humanize(text: string): string {
  const normalized = String(text || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return 'Unknown'
  return normalized
    .split(' ')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : `${w[0].toUpperCase()}${w.slice(1)}`))
    .join(' ')
}

function clampText(input: string, max = 160): string {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function prettyJsonLike(input: unknown, maxChars = 1200): string {
  const raw = typeof input === 'string' ? input.trim() : JSON.stringify(input ?? '', null, 2)
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return clampText(JSON.stringify(parsed, null, 2), maxChars)
  } catch {
    return clampText(raw, maxChars)
  }
}

export function buildVisualRunPdf(input: VisualReportInput): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  let y = margin

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  const section = (title: string, subtitle?: string) => {
    ensureSpace(52)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(17, 24, 39)
    doc.text(title, margin, y)
    y += 16
    if (subtitle) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(107, 114, 128)
      doc.text(subtitle, margin, y)
      y += 12
    }
    y += 8
  }

  const card = (x: number, top: number, w: number, h: number, label: string, value: string, accent: [number, number, number]) => {
    doc.setDrawColor(226, 232, 240)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, top, w, h, 8, 8, 'FD')
    doc.setFillColor(...accent)
    doc.rect(x, top, 5, h, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(10)
    doc.text(label, x + 12, top + 16)
    doc.setFontSize(18)
    doc.text(value, x + 12, top + 38)
  }

  const barChart = (
    title: string,
    rows: Array<{ label: string; value: number }>,
    color: [number, number, number],
    maxValue?: number,
  ) => {
    section(title)
    if (!rows.length) {
      doc.setFontSize(10)
      doc.setTextColor(107, 114, 128)
      doc.text('No data available.', margin, y)
      y += 20
      return
    }
    const w = pageWidth - margin * 2
    const chartH = Math.max(160, rows.length * 24 + 24)
    ensureSpace(chartH + 20)
    const chartTop = y
    const labelW = 170
    const barW = w - labelW - 24
    const peak = maxValue ?? Math.max(...rows.map((r) => r.value), 1)
    doc.setDrawColor(229, 231, 235)
    doc.setFillColor(249, 250, 251)
    doc.roundedRect(margin, chartTop, w, chartH, 10, 10, 'FD')
    rows.forEach((row, idx) => {
      const rowY = chartTop + 18 + idx * 24
      const width = Math.max(2, (Math.max(0, row.value) / Math.max(peak, 1)) * (barW - 8))
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(55, 65, 81)
      doc.setFontSize(9)
      doc.text(clampText(row.label, 28), margin + 10, rowY + 9)
      doc.setFillColor(...color)
      doc.roundedRect(margin + labelW, rowY, width, 10, 3, 3, 'F')
      doc.setTextColor(15, 23, 42)
      doc.text(row.value.toFixed(1), margin + labelW + barW - 4, rowY + 9, { align: 'right' })
    })
    y += chartH + 16
  }

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 86, 'F')
  doc.setTextColor(240, 249, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text('MetroX Reliability Report', margin, 40)
  doc.setFontSize(11)
  doc.setTextColor(148, 163, 184)
  doc.text(`Run ${input.runId} • Generated ${new Date().toISOString()}`, margin, 60)
  y = 106

  const metrics = input.scorecard?.metrics ?? {}
  const composite = Number(metrics.composite_score ?? 0)
  const asr = Number(metrics.asr ?? 0) * 100
  const toxicity = Number(metrics.toxicity_rate ?? 0) * 100
  const hallucination = Number(metrics.hallucination_rate ?? 0) * 100
  const cardW = (pageWidth - margin * 2 - 18) / 2
  ensureSpace(130)
  card(margin, y, cardW, 54, 'Composite Score', composite.toFixed(1), [20, 184, 166])
  card(margin + cardW + 18, y, cardW, 54, 'Attack Success Rate', `${asr.toFixed(1)}%`, [251, 146, 60])
  y += 64
  card(margin, y, cardW, 54, 'Hallucination Rate', `${hallucination.toFixed(1)}%`, [168, 85, 247])
  card(margin + cardW + 18, y, cardW, 54, 'Toxicity Rate', `${toxicity.toFixed(1)}%`, [239, 68, 68])
  y += 74

  const execSummary = input.narrativeSummary?.executive_summary || ''
  const explanation = input.narrativeSummary?.non_technical_explanation || ''
  section('Executive Advisory')
  const advisoryText = [clampText(execSummary, 360), clampText(explanation, 420)].filter(Boolean)
  if (!advisoryText.length) advisoryText.push('No narrative advisory available for this run.')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(31, 41, 55)
  advisoryText.forEach((line) => {
    ensureSpace(16)
    const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2 - 8) as string[]
    doc.text(wrapped, margin, y)
    y += wrapped.length * 12 + 4
  })
  y += 6

  const attacks = (input.attackSummary?.attack_types ?? []).map((row) => ({
    label: humanize(row.attack_type),
    value: Number(row.success_rate ?? 0) * 100,
  }))
  barChart('Attack-Type ASR Distribution', attacks, [244, 114, 182], 100)

  const detectorBuckets = new Map<string, { total: number; fails: number }>()
  for (const vote of input.detectorVotes) {
    const key = String(vote.detector_name || 'unknown')
    const bucket = detectorBuckets.get(key) ?? { total: 0, fails: 0 }
    bucket.total += 1
    if (Object.values(vote.failure_flags ?? {}).some(Boolean)) bucket.fails += 1
    detectorBuckets.set(key, bucket)
  }
  const detectorRows = Array.from(detectorBuckets.entries()).map(([name, b]) => ({
    label: humanize(name),
    value: b.total > 0 ? (b.fails / b.total) * 100 : 0,
  }))
  barChart('Detector Fail-Rate Matrix', detectorRows, [14, 165, 233], 100)

  const sliceRows = (input.executionSlices?.slices ?? [])
  const modelCount = new Map<string, number>()
  for (const slice of sliceRows) {
    const key = `${humanize(slice.model)} • ${humanize(slice.provider_name)}`
    modelCount.set(key, (modelCount.get(key) ?? 0) + Number(slice.count || 0))
  }
  barChart(
    'Execution Volume by Model/Provider',
    Array.from(modelCount.entries()).map(([label, value]) => ({ label, value })),
    [16, 185, 129],
  )

  section('Latency vs Cost Frontier', 'Average latency and effective cost by attack type')
  ensureSpace(190)
  const scatterW = pageWidth - margin * 2
  const scatterH = 170
  const left = margin
  const top = y
  doc.setDrawColor(229, 231, 235)
  doc.setFillColor(249, 250, 251)
  doc.roundedRect(left, top, scatterW, scatterH, 10, 10, 'FD')
  const points = new Map<string, { latency: number; cost: number }>()
  for (const row of sliceRows) {
    const key = String(row.attack_type || 'unknown')
    const existing = points.get(key) ?? { latency: 0, cost: 0 }
    existing.latency += Number(row.avg_latency_ms || 0)
    existing.cost += Number(row.effective_cost_usd || 0)
    points.set(key, existing)
  }
  const pointRows = Array.from(points.entries()).map(([name, v]) => ({ name, ...v }))
  const maxLatency = Math.max(...pointRows.map((p) => p.latency), 1)
  const maxCost = Math.max(...pointRows.map((p) => p.cost), 0.001)
  for (const p of pointRows) {
    const px = left + 30 + (p.latency / maxLatency) * (scatterW - 70)
    const py = top + scatterH - 24 - (p.cost / maxCost) * (scatterH - 48)
    doc.setFillColor(59, 130, 246)
    doc.circle(px, py, 3, 'F')
    doc.setFontSize(8)
    doc.setTextColor(75, 85, 99)
    doc.text(clampText(humanize(p.name), 16), px + 5, py + 3)
  }
  y += scatterH + 14

  const forecastRows = (input.forecasts?.forecasts ?? []).map((row) => ({
    label: humanize(String(row.metric_name || 'metric')),
    value: Number(row.predicted_value || 0),
  }))
  barChart('Predicted Risk/Score Signals', forecastRows, [245, 158, 11])

  section('Execution Diagnostics', 'Why failures happened, with tool-call context')
  const allExecutions = input.comprehensivePayload?.executions ?? []
  const failedExecutions = allExecutions
    .filter((row) => String(row.status || '').toLowerCase() === 'failed')
    .slice(0, 32)
  if (!failedExecutions.length) {
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('No failed executions captured in this run.', margin, y)
    y += 16
  } else {
    for (const row of failedExecutions) {
      ensureSpace(42)
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(margin, y, pageWidth - margin * 2, 34, 6, 6)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(15, 23, 42)
      const title = `${String(row.execution_id || '').slice(0, 8)} • ${humanize(String(row.attack_type || 'unknown'))}`
      doc.text(title, margin + 8, y + 13)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(71, 85, 105)
      const reason = (row.failed_reasons ?? []).map((r) => humanize(String(r))).join(', ') || 'Policy failure'
      const detail = `Reason: ${clampText(reason, 80)} | tools: ${Array.isArray(row.tool_calls) ? row.tool_calls.length : 0} | latency: ${Number(row.latency_ms || 0).toFixed(0)}ms`
      doc.text(detail, margin + 8, y + 26)
      y += 40
    }
  }

  const advisories = input.narrativeSummary?.advisories ?? []
  if (advisories.length) {
    section('AI Suggestions', 'Prioritized recommendations')
    for (const item of advisories.slice(0, 8)) {
      ensureSpace(30)
      const priority = Number(item.priority ?? 0)
      const action = String(item.action ?? 'Action')
      const why = String(item.why ?? '')
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(17, 24, 39)
      doc.setFontSize(10)
      doc.text(`P${priority}: ${clampText(action, 82)}`, margin, y)
      y += 12
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(75, 85, 99)
      const wrapped = doc.splitTextToSize(clampText(why, 180), pageWidth - margin * 2 - 8) as string[]
      doc.text(wrapped, margin, y)
      y += wrapped.length * 11 + 4
    }
  }

  section('Detailed Execution Ledger', 'Complete run-level appendix (all executions)')
  if (!allExecutions.length) {
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('No execution-level rows available.', margin, y)
    y += 16
  } else {
    for (let i = 0; i < allExecutions.length; i += 1) {
      const row = allExecutions[i]
      const reasons = Array.isArray(row.failed_reasons) && row.failed_reasons.length
        ? row.failed_reasons.map((r) => humanize(String(r))).join(', ')
        : 'none'
      const metaLine = [
        `provider=${String(row.provider_name || 'unknown')}`,
        `model=${String(row.model_resolved || 'unknown')}`,
        `latency=${Number(row.latency_ms || 0).toFixed(0)}ms`,
        `cost=$${Number(row.effective_cost_usd || 0).toFixed(5)}`,
        `tools=${Array.isArray(row.tool_calls) ? row.tool_calls.length : 0}`,
        `votes=${Array.isArray(row.detector_votes) ? row.detector_votes.length : 0}`,
      ].join(' | ')
      const promptPretty = prettyJsonLike(String(row.prompt || ''), 700)
      const responsePretty = prettyJsonLike(String(row.response || ''), 1400)
      const textWidth = pageWidth - margin * 2 - 28
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      const metaLines = doc.splitTextToSize(clampText(metaLine, 240), textWidth) as string[]
      const reasonLines = doc.splitTextToSize(`failed reasons: ${clampText(reasons, 220)}`, textWidth) as string[]
      const promptLines = doc.splitTextToSize(`prompt:\n${promptPretty || 'n/a'}`, textWidth) as string[]
      const responseLines = doc.splitTextToSize(`response:\n${responsePretty || 'n/a'}`, textWidth) as string[]
      const maxBlockLines = 16
      const blockLines = [
        ...metaLines.slice(0, 2),
        ...reasonLines.slice(0, 2),
        ...promptLines.slice(0, 5),
        ...responseLines.slice(0, 7),
      ].slice(0, maxBlockLines)
      const rowHeight = Math.max(108, 34 + blockLines.length * 10)
      ensureSpace(rowHeight + 10)
      doc.setDrawColor(226, 232, 240)
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(margin, y, pageWidth - margin * 2, rowHeight, 8, 8, 'FD')

      const status = String(row.status || '').toLowerCase() === 'failed' ? 'FAILED' : 'PASSED'
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(status === 'FAILED' ? 220 : 16, status === 'FAILED' ? 38 : 185, status === 'FAILED' ? 38 : 129)
      doc.text(status, margin + pageWidth - margin * 2 - 12, y + 16, { align: 'right' })

      doc.setTextColor(15, 23, 42)
      doc.text(
        `${String(i + 1).padStart(3, '0')} • ${String(row.execution_id || '').slice(0, 12)} • ${humanize(String(row.attack_type || 'unknown'))}`,
        margin + 12,
        y + 17,
      )

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(71, 85, 105)
      let lineY = y + 31
      for (const line of blockLines) {
        doc.text(line, margin + 12, lineY)
        lineY += 10
      }
      y += rowHeight + 8
    }
  }

  const eventRows = input.comprehensivePayload?.events ?? []
  section('Run Timeline', 'Recent orchestrator and worker events')
  if (!eventRows.length) {
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('No event records available.', margin, y)
    y += 16
  } else {
    const capped = eventRows.slice(-120)
    for (const row of capped) {
      ensureSpace(16)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(71, 85, 105)
      const eventLine = [
        String(row.created_at || '').replace('T', ' ').replace('Z', ''),
        `${String(row.event_type || 'event')}#${Number(row.step || 0)}`,
        clampText(String(row.message || ''), 120),
      ].join(' | ')
      doc.text(eventLine, margin, y)
      y += 11
    }
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('Generated by MetroX Analytics', margin, pageHeight - 18)

  return doc.output('blob')
}
