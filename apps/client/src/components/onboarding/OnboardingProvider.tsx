import { createContext, useContext } from 'react'
import { useOnboarding } from '@/hooks/useOnboarding'

type OnboardingContextType = ReturnType<typeof useOnboarding>

const OnboardingContext = createContext<OnboardingContextType | null>(null)

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const state = useOnboarding()
  return (
    <OnboardingContext.Provider value={state}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboardingContext() {
  const ctx = useContext(OnboardingContext)
  if (!ctx)
    throw new Error(
      'useOnboardingContext must be used within OnboardingProvider',
    )
  return ctx
}
