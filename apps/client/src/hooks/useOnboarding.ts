import { useCallback, useState } from 'react'

const ONBOARDING_KEY = 'autoredteam-onboarding-v2'

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

  return { completed, active, currentStepIndex, start, next, finish, reset }
}
