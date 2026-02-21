import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export type SpotlightStepProps = {
  selector: string
  title: string
  description: string
  placement: 'top' | 'bottom' | 'left' | 'right'
  stepIndex: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}

type Rect = { x: number; y: number; width: number; height: number }

const PAD = 8
const TOOLTIP_W = 320
const TOOLTIP_GAP = 12
/* Conservative estimate — real measurement replaces this after first paint */
const MIN_TOOLTIP_H = 220

function computeTooltipPos(
  rect: Rect,
  placement: 'top' | 'bottom' | 'left' | 'right',
  tooltipHeight: number,
) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const h = Math.max(tooltipHeight, MIN_TOOLTIP_H)

  let top = 0
  let left = 0

  /*
   * If the target covers most of the viewport (e.g. full-page canvas),
   * always show the tooltip near the top-center regardless of placement.
   */
  const targetCoversViewport = rect.height > vh * 0.7 && rect.width > vw * 0.7
  if (targetCoversViewport) {
    top = 80
    left = vw / 2 - TOOLTIP_W / 2
    return { top, left }
  }

  switch (placement) {
    case 'bottom':
      top = rect.y + rect.height + TOOLTIP_GAP
      left = rect.x + rect.width / 2 - TOOLTIP_W / 2
      break
    case 'top':
      top = rect.y - h - TOOLTIP_GAP
      left = rect.x + rect.width / 2 - TOOLTIP_W / 2
      break
    case 'right':
      top = rect.y + rect.height / 2 - h / 2
      left = rect.x + rect.width + TOOLTIP_GAP
      break
    case 'left':
      top = rect.y + rect.height / 2 - h / 2
      left = rect.x - TOOLTIP_W - TOOLTIP_GAP
      break
  }

  /* Clamp so tooltip stays fully on screen */
  left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8))
  top = Math.max(8, Math.min(top, vh - h - 8))

  return { top, left }
}

export function SpotlightStep({
  selector,
  title,
  description,
  placement,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: SpotlightStepProps) {
  const [rect, setRect] = useState<Rect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipHeight, setTooltipHeight] = useState(160)

  /* Measure target element */
  useLayoutEffect(() => {
    const el = document.querySelector(selector)
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({
      x: r.x - PAD,
      y: r.y - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    })
  }, [selector])

  /* Re-measure on resize / scroll */
  useEffect(() => {
    function measure() {
      const el = document.querySelector(selector)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({
        x: r.x - PAD,
        y: r.y - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      })
    }
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [selector])

  /* Measure tooltip height for proper positioning */
  useEffect(() => {
    if (tooltipRef.current) {
      setTooltipHeight(tooltipRef.current.offsetHeight)
    }
  }, [title, description, stepIndex])

  /* If target doesn't exist, auto-advance after brief delay */
  useEffect(() => {
    if (!rect) {
      const timer = setTimeout(onNext, 100)
      return () => clearTimeout(timer)
    }
  }, [rect, onNext])

  if (!rect) return null

  const pos = computeTooltipPos(rect, placement, tooltipHeight)

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`spotlight-${stepIndex}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9999] pointer-events-none"
        data-testid="onboarding-overlay"
      >
        {/* Highlight ring around target — purely visual, pointer-events-none */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="absolute rounded-xl ring-2 ring-primary/70 ring-offset-2 ring-offset-background/50 shadow-[0_0_24px_-4px] shadow-primary/30"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          }}
        />

        {/* Tooltip card — this IS interactive */}
        <motion.div
          ref={tooltipRef}
          initial={{ opacity: 0, y: placement === 'top' ? -8 : placement === 'bottom' ? 8 : 0, x: placement === 'left' ? -8 : placement === 'right' ? 8 : 0 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="absolute pointer-events-auto"
          style={{ top: pos.top, left: pos.left, width: TOOLTIP_W }}
          data-testid="onboarding-tooltip"
        >
          <Card className="bg-card/95 backdrop-blur-xl shadow-2xl border-primary/20">
            <CardHeader className="pb-1.5 pr-10">
              <CardTitle className="text-sm">{title}</CardTitle>
              {/* Close button */}
              <button
                onClick={onSkip}
                className="absolute top-3 right-3 rounded-md p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close tour"
                data-testid="onboarding-close"
              >
                <X className="size-3.5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-1.5">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <span
                    key={i}
                    className={`size-1.5 rounded-full transition-colors ${
                      i === stepIndex ? 'bg-primary' : i < stepIndex ? 'bg-primary/40' : 'bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSkip}
                  className="text-xs text-muted-foreground"
                  data-testid="onboarding-skip"
                >
                  Skip tour
                </Button>
                <div className="flex items-center gap-1">
                  {stepIndex > 0 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onPrev}
                      data-testid="onboarding-prev"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={onNext}
                    className="text-xs gap-1"
                    data-testid="onboarding-next"
                  >
                    {stepIndex === totalSteps - 1 ? 'Finish' : 'Next'}
                    {stepIndex < totalSteps - 1 && <ChevronRight className="size-3" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
