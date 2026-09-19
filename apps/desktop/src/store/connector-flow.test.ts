import { describe, expect, it, vi } from 'vitest'

import { createConnectorFlow } from './connector-flow'

const listed = (connected: boolean) => ({
  available: true,
  connectors: [{ connector: 'telegram', connected, enabled: true }]
})

function flowWith(responses: { list: () => unknown; connect?: () => unknown }) {
  const open = vi.fn(async () => {})

  const request = vi.fn(async (method: string) =>
    method === 'connectors.list' ? responses.list() : (responses.connect?.() ?? { results: [] })
  )

  const flow = createConnectorFlow('session', [{ connector: 'telegram' }], {
    request: request as never,
    open,
    delay: async () => {},
    now: () => 0
  })

  return { flow, open, request }
}

describe('the connector setup guide', () => {
  it('opens the guide and polls until local configuration is ready', async () => {
    let connected = false

    const { flow, open } = flowWith({
      list: () => listed(connected),
      connect: () => ({
        results: [{ connector: 'telegram', status: 'setup_required', setup_url: 'https://docs.test/setup' }]
      })
    })

    open.mockImplementation(async () => {
      connected = true
    })

    await flow.refresh()
    await flow.connect('telegram')

    expect(open).toHaveBeenCalledWith('https://docs.test/setup')
    expect(flow.state.get().rows[0].phase).toBe('connected')
  })

  it('reports an error when no real setup guide is available', async () => {
    const { flow, open } = flowWith({
      list: () => listed(false),
      connect: () => ({ results: [{ connector: 'telegram', status: 'unavailable' }] })
    })

    await flow.refresh()
    await flow.connect('telegram')

    expect(open).not.toHaveBeenCalled()
    expect(flow.state.get().rows[0].phase).toBe('error')
  })

  it('does not open a guide when the connector is already active', async () => {
    const { flow, open } = flowWith({
      list: () => listed(true),
      connect: () => ({ results: [{ connector: 'telegram', status: 'active' }] })
    })

    await flow.refresh()
    await flow.connect('telegram')

    expect(open).not.toHaveBeenCalled()
  })

  it('continues polling when the user keeps waiting after a timeout', async () => {
    let clock = 0
    const open = vi.fn(async () => {})

    const request = vi.fn(async (method: string) =>
      method === 'connectors.list'
        ? listed(false)
        : {
            results: [
              { connector: 'telegram', status: 'setup_required', setup_url: 'https://docs.test/setup' }
            ]
          }
    )

    const flow = createConnectorFlow('session', [{ connector: 'telegram' }], {
      request: request as never,
      open,
      delay: async () => {
        clock += 120001
      },
      now: () => clock
    })

    await flow.refresh()
    await flow.connect('telegram')
    expect(flow.state.get().rows[0].phase).toBe('timeout')

    await flow.keepWaiting('telegram')
    expect(request.mock.calls.filter(([method]) => method === 'connectors.list')).toHaveLength(3)
  })

  it('asks the gateway to reconfigure expired or revoked state', async () => {
    const { flow, request } = flowWith({
      list: () => ({
        available: true,
        connectors: [
          { connector: 'telegram', connected: false, enabled: true, connectionStatus: 'expired' }
        ]
      }),
      connect: () => ({ results: [{ connector: 'telegram', status: 'active' }] })
    })

    await flow.refresh()
    await flow.connect('telegram')

    expect(request).toHaveBeenCalledWith('connectors.connect', expect.objectContaining({ reconnect: true }))
  })
})
