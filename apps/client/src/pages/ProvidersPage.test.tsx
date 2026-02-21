import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProvidersPage from './ProvidersPage'

vi.mock('../lib/api', () => ({
  api: {
    listProviderCredentials: vi.fn(async () => ({
      credentials: [
        {
          id: 'cred-1',
          name: 'main-openai',
          provider_type: 'openai_compatible',
          key_version: 'v1',
          status: 'active',
          created_at: '2026-02-21T00:00:00Z',
          last_validated_at: null,
        },
      ],
    })),
    createProviderCredential: vi.fn(async () => ({
      id: 'cred-2',
      name: 'new-key',
      provider_type: 'openai_compatible',
      key_version: 'v1',
      status: 'active',
      created_at: '2026-02-21T00:00:00Z',
      last_validated_at: null,
    })),
    rotateProviderCredential: vi.fn(async () => ({
      id: 'cred-1',
      name: 'main-openai',
      provider_type: 'openai_compatible',
      key_version: 'v2',
      status: 'active',
      created_at: '2026-02-21T00:00:00Z',
      last_validated_at: null,
    })),
    validateProvider: vi.fn(async () => ({
      valid: true,
      provider_type: 'openai_compatible',
      model: 'gpt-4.1-mini',
      discovered_models: ['gpt-4.1-mini'],
    })),
  },
}))

describe('ProvidersPage', () => {
  it('loads credentials and validates provider', async () => {
    render(<ProvidersPage />)

    await waitFor(() => {
      expect(screen.getByText(/provider credentials/i)).toBeInTheDocument()
      expect(screen.getAllByText(/main-openai/i).length).toBeGreaterThan(0)
    })

    await userEvent.click(screen.getByRole('button', { name: /validate provider/i }))

    await waitFor(() => {
      expect(screen.getByText(/status: valid/i)).toBeInTheDocument()
      expect(screen.getByText(/discovered models/i)).toBeInTheDocument()
    })
  })
})
