import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WizardPage from './WizardPage'

vi.mock('../lib/api', () => ({
  api: {
    getConfigProfile: vi.fn(async () => ({
      id: 'p-1',
      name: 'profile',
      target_config: { target_type: 'managed_llm_runtime', model: 'gpt-4.1-mini' },
      benchmark_config: { taxonomy: ['prompt_injection'], seed: 42, curated_ratio: 0.6 },
      runtime_config: { preset: 'standard', budget_usd: 5 },
    })),
    validateProvider: vi.fn(async () => ({ valid: true, capability_confidence: 1, model_discovery_mode: 'inferred' })),
    createSession: vi.fn(async () => ({ id: 's-1' })),
    createConfigProfile: vi.fn(async () => ({ id: 'p-1' })),
    createRun: vi.fn(async () => ({ id: 'r-1' })),
  },
}))

vi.mock('../lib/state', () => ({
  loadState: () => ({}),
  saveState: vi.fn(),
}))

describe('WizardPage', () => {
  it('completes onboarding and launches run', async () => {
    render(<WizardPage />)

    await userEvent.click(screen.getByRole('button', { name: /start setup/i }))
    await userEvent.click(screen.getByRole('button', { name: /run now/i }))

    await waitFor(() => {
      expect(screen.getByText(/run launched:/i)).toBeInTheDocument()
    })
  })
})
