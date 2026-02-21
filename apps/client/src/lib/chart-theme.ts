/**
 * Reads CSS custom property values from the document for Recharts theming.
 * Recharts doesn't support CSS variables directly, so we resolve them at render time.
 */
export function getChartColors() {
  if (typeof window === 'undefined') {
    return {
      chart1: '#14b8a6',
      chart2: '#22c55e',
      chart3: '#ef4444',
      chart4: '#eab308',
      chart5: '#8b5cf6',
      grid: 'rgba(255,255,255,0.08)',
      axis: '#64748b',
      tooltipBg: '#0c141f',
      tooltipBorder: 'rgba(255,255,255,0.12)',
    }
  }

  const resolve = (cssVar: string, fallback: string) => {
    const el = document.createElement('div')
    el.style.color = `var(${cssVar}, ${fallback})`
    document.body.appendChild(el)
    const computed = getComputedStyle(el).color
    document.body.removeChild(el)
    return computed
  }

  return {
    chart1: resolve('--chart-1', '#14b8a6'),
    chart2: resolve('--chart-2', '#22c55e'),
    chart3: resolve('--chart-3', '#ef4444'),
    chart4: resolve('--chart-4', '#eab308'),
    chart5: resolve('--chart-5', '#8b5cf6'),
    grid: resolve('--border', 'rgba(255,255,255,0.08)'),
    axis: resolve('--muted-foreground', '#64748b'),
    tooltipBg: resolve('--card', '#0c141f'),
    tooltipBorder: resolve('--border', 'rgba(255,255,255,0.12)'),
  }
}
