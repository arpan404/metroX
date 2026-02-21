import { useOnboardingContext } from './OnboardingProvider'
import { onboardingSteps } from '@/lib/onboarding-steps'
import { SpotlightStep } from './SpotlightStep'

export function SpotlightWalkthrough() {
  const { active, currentStepIndex, next, prev, finish } = useOnboardingContext()

  if (!active) return null

  const step = onboardingSteps[currentStepIndex]

  /* If we've gone past the last step, finish */
  if (!step) {
    finish()
    return null
  }

  return (
    <SpotlightStep
      selector={step.targetSelector}
      title={step.title}
      description={step.description}
      placement={step.placement}
      stepIndex={currentStepIndex}
      totalSteps={onboardingSteps.length}
      onNext={() => {
        if (currentStepIndex >= onboardingSteps.length - 1) {
          finish()
        } else {
          next()
        }
      }}
      onPrev={prev}
      onSkip={finish}
    />
  )
}
