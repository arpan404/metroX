import { cn } from '@/lib/utils'

export function CanvasBackground({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-onboarding="canvas"
      className={cn(
        'relative h-screen w-screen overflow-hidden bg-background',
        className,
      )}
    >
      {children}
    </div>
  )
}
