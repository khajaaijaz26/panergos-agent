import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

const getCustomEndpoints = vi.fn(async (_profile?: unknown) => ({
  current: { base_url: '', model: '', provider: '' },
  endpoints: []
}))

const getProviderDirectory = vi.fn(async (_profile?: unknown) => ({
  providers: [
    {
      base_url: 'https://api.nebula.test/v1',
      configured: false,
      id: 'nebula',
      key_env: 'NEBULA_API_KEY',
      models: ['nebula-fast', 'nebula-pro'],
      name: 'Nebula AI',
      setup_kind: 'custom_endpoint',
      total_models: 2
    }
  ]
}))

vi.mock('@/panergos', () => ({
  activateCustomEndpoint: vi.fn(),
  deleteCustomEndpoint: vi.fn(),
  getCustomEndpoints: (profile?: unknown) => getCustomEndpoints(profile),
  getProviderDirectory: (profile?: unknown) => getProviderDirectory(profile),
  saveCustomEndpoint: vi.fn(),
  validateCustomEndpoint: vi.fn()
}))

vi.mock('./profile-scope', () => ({ SettingsProfileScope: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CustomEndpointsSettings', () => {
  it('shows provider model names and prefills the prominent API-key form', async () => {
    const { CustomEndpointsSettings } = await import('./custom-endpoints-settings')
    render(
      <I18nProvider>
        <CustomEndpointsSettings onOpenAccounts={vi.fn()} onOpenApiKeys={vi.fn()} profile="worker" />
      </I18nProvider>
    )

    expect(await screen.findByText('Nebula AI')).toBeTruthy()
    expect(screen.getByText(/nebula-fast, nebula-pro/)).toBeTruthy()
    expect(getProviderDirectory).toHaveBeenCalledWith('worker')

    fireEvent.click(screen.getByRole('button', { name: 'Set up Nebula AI' }))

    await waitFor(() => {
      expect((screen.getByLabelText(/API Key \(NEBULA_API_KEY\)/) as HTMLInputElement).type).toBe('password')
      expect((screen.getByPlaceholderText('gpt-5.4') as HTMLInputElement).value).toBe('nebula-fast')
      expect((screen.getByPlaceholderText('axet-proxy') as HTMLInputElement).value).toBe('nebula')
    })
  })
})
