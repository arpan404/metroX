import { useOnboardingContext } from './OnboardingProvider'
import { onboardingSteps } from '@/lib/onboarding-steps'
import { SpotlightStep } from './SpotlightStep'

export function SpotlightWalkthrough() {
  const { active, currentStepIndex, next, finish } = useOnboardingContext()

  if (!active) return null

  const step = onboardingSteps[currentStepIndex]
  if (!step) return null

  return (
    <SpotlightStep
      selector={step.targetSelector}
      title={step.title}
      description={step.description}
      stepIndex={currentStepIndex}
      totalSteps={onboardingSteps.length}
      onNext={() => {
        if (currentStepIndex >= onboardingSteps.length - 1) {
          finish()
        } else {
          next()
        }
      }}
      onSkip={finish}
    />
  )
}
