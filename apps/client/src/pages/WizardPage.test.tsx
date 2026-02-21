import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WizardPage from './WizardPage'

vi.mock('../lib/api', () => ({
  api: {
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
  it('submits wizard and shows launched run', async () => {
    render(<WizardPage />)

    await userEvent.click(screen.getByRole('button', { name: /save config \+ start run/i }))

    await waitFor(() => {
      expect(screen.getByText(/run launched/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/session: s-1/i)).toBeInTheDocument()
    expect(screen.getByText(/run: r-1/i)).toBeInTheDocument()
  })
})
