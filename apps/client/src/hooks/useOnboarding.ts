import { useCallback, useEffect, useState } from 'react'

const ONBOARDING_KEY = 'metrox-onboarding-v2'

export type OnboardingStep = {
  id: string
  title: string
  description: string
  targetSelector: string
  placement: 'top' | 'bottom' | 'left' | 'right'
}

export function useOnboarding() {
  const [completed, setCompleted] = useState(
    () => window.localStorage.getItem(ONBOARDING_KEY) === 'true',
  )
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [active, setActive] = useState(false)

  const start = useCallback(() => {
    setCurrentStepIndex(0)
    setActive(true)
  }, [])

  const next = useCallback(() => {
    setCurrentStepIndex((prev) => prev + 1)
  }, [])

  const prev = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1))
  }, [])

  const goTo = useCallback((index: number) => {
    setCurrentStepIndex(index)
  }, [])

  const finish = useCallback(() => {
    setActive(false)
    setCompleted(true)
    window.localStorage.setItem(ONBOARDING_KEY, 'true')
  }, [])

  const reset = useCallback(() => {
    window.localStorage.removeItem(ONBOARDING_KEY)
    setCompleted(false)
    setCurrentStepIndex(0)
  }, [])

  /* Keyboard: Escape to dismiss, ArrowRight/Enter for next, ArrowLeft for prev */
  useEffect(() => {
    if (!active) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        finish()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        next()
      } else if (e.key === 'ArrowLeft') {
        prev()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [active, finish, next, prev])

  return { completed, active, currentStepIndex, start, next, prev, goTo, finish, reset }
}
