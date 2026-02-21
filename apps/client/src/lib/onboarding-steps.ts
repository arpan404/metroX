import type { OnboardingStep } from '@/hooks/useOnboarding'

export const onboardingSteps: OnboardingStep[] = [
  {
    id: 'canvas',
    title: 'Welcome to AutoRedTeam',
    description:
      'This is your reliability testing canvas. Attack flows, configuration, and analytics all overlay this workspace.',
    targetSelector: '[data-onboarding="canvas"]',
    placement: 'bottom',
  },
  {
    id: 'toolbar',
    title: 'Mode Toolbar',
    description:
      'Switch between Canvas, Config, Analytics, and Settings. Each mode loads a different view over the canvas.',
    targetSelector: '[data-onboarding="toolbar"]',
    placement: 'bottom',
  },
  {
    id: 'config-panel',
    title: 'Configuration',
    description:
      'Set up your target model, benchmark taxonomy, scoring thresholds, and budget from the Config mode.',
    targetSelector: '[data-onboarding="config-trigger"]',
    placement: 'bottom',
  },
  {
    id: 'launch',
    title: 'Launch a Run',
    description:
      'When your configuration is ready, launch a reliability evaluation. Watch attack nodes appear in real-time on the canvas.',
    targetSelector: '[data-onboarding="launch-button"]',
    placement: 'left',
  },
  {
    id: 'analytics',
    title: 'Analytics & Reports',
    description:
      'After a run completes, switch to Analytics to explore scorecards, risk cards, drift signals, and cost breakdowns.',
    targetSelector: '[data-onboarding="analytics-trigger"]',
    placement: 'bottom',
  },
]
