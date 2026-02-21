import { useEffect, useLayoutEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type SpotlightStepProps = {
  selector: string
  title: string
  description: string
  stepIndex: number
  totalSteps: number
  onNext: () => void
  onSkip: () => void
}

type Rect = { x: number; y: number; width: number; height: number }

const PAD = 8

export function SpotlightStep({
  selector,
  title,
  description,
  stepIndex,
  totalSteps,
  onNext,
  onSkip,
}: SpotlightStepProps) {
  const [rect, setRect] = useState<Rect | null>(null)

  useLayoutEffect(() => {
    const el = document.querySelector(selector)
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ x: r.x - PAD, y: r.y - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }, [selector])

  useEffect(() => {
    function handleResize() {
      const el = document.querySelector(selector)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ x: r.x - PAD, y: r.y - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [selector])

  if (!rect) return null

  const tooltipTop = rect.y + rect.height + 16
  const tooltipLeft = Math.min(Math.max(16, rect.x), window.innerWidth - 336)

  return (
    <AnimatePresence>
      <motion.div
        key="spotlight-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[9999]"
      >
        {/* SVG mask overlay */}
        <svg className="absolute inset-0 h-full w-full">
          <defs>
            <mask id="spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx={12}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.6)"
            mask="url(#spotlight-mask)"
          />
        </svg>

        {/* Spotlight ring */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="absolute rounded-xl border-2 border-primary/60 pointer-events-none"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          }}
        />

        {/* Tooltip card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className="absolute z-[10000]"
          style={{ top: tooltipTop, left: tooltipLeft }}
        >
          <Card className="w-80 bg-card/95 backdrop-blur-xl shadow-2xl border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{title}</CardTitle>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {stepIndex + 1}/{totalSteps}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={onSkip} className="text-xs">
                  Skip tour
                </Button>
                <Button size="sm" onClick={onNext} className="text-xs">
                  {stepIndex === totalSteps - 1 ? 'Finish' : 'Next'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
