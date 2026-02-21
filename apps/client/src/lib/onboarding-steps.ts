import type { OnboardingStep } from '@/hooks/useOnboarding'

export const onboardingSteps: OnboardingStep[] = [
  {
    id: 'canvas',
    title: 'Welcome to AutoRedTeam',
    description:
      'This is your single-page canvas workspace. Attack flows, configuration, analytics, and settings all open as glass panels over this canvas.',
    targetSelector: '[data-onboarding="canvas"]',
    placement: 'bottom',
  },
  {
    id: 'toolbar',
    title: 'Mode Toolbar',
    description:
      'Toggle panels on and off. Canvas mode closes all panels. Config, Analytics, and Settings each open a side panel.',
    targetSelector: '[data-onboarding="toolbar"]',
    placement: 'bottom',
  },
  {
    id: 'config-panel',
    title: 'Configuration Panel',
    description:
      'Click Config to open the left panel. Choose a quick-start template or customize your target, benchmark, and budget. Launch a run from the bottom of the panel.',
    targetSelector: '[data-onboarding="config-trigger"]',
    placement: 'bottom',
  },
  {
    id: 'launch',
    title: 'Launch a Run',
    description:
      'When your configuration is ready, hit Launch Run. Attack nodes will appear on the canvas in real-time as the evaluation progresses.',
    targetSelector: '[data-onboarding="launch-button"]',
    placement: 'left',
  },
  {
    id: 'analytics',
    title: 'Analytics Panel',
    description:
      'After a run completes, open Analytics to explore scorecards, risk cards, drift signals, cost breakdowns, and more in a scrollable right panel.',
    targetSelector: '[data-onboarding="analytics-trigger"]',
    placement: 'bottom',
  },
]
