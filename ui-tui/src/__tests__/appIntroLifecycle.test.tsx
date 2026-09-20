import { PassThrough } from 'stream'

import { renderSync } from '@panergos/ink'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../app.js'
import type { GatewayClient } from '../gatewayClient.js'

const useMainApp = vi.hoisted(() => vi.fn())

vi.mock('signal-exit', () => ({ onExit: () => () => undefined }))
vi.mock('../app/useMainApp.js', () => ({ useMainApp }))
vi.mock('../components/appLayout.js', () => ({ AppLayout: () => null }))
vi.mock('../components/relayIntro.js', () => ({
  RelayIntro: () => null,
  shouldPlayRelayIntro: () => true
}))

const mounted: Array<() => void> = []

afterEach(() => {
  mounted.splice(0).forEach(cleanup => cleanup())
  vi.clearAllMocks()
})

describe('App startup intro lifecycle', () => {
  it('mounts the gateway listeners while the intro is visible', () => {
    const gateway = {} as GatewayClient
    useMainApp.mockReturnValue({
      appActions: {},
      appComposer: {},
      appProgress: {},
      appStatus: {},
      appTranscript: {},
      gateway
    })

    const stdin = Object.assign(new PassThrough(), { isTTY: false })
    const stdout = Object.assign(new PassThrough(), { columns: 80, isTTY: false, rows: 24 })
    const stderr = Object.assign(new PassThrough(), { isTTY: false })

    const instance = renderSync(<App gw={gateway} />, {
      patchConsole: false,
      stderr: stderr as NodeJS.WriteStream,
      stdin: stdin as NodeJS.ReadStream,
      stdout: stdout as NodeJS.WriteStream
    })

    mounted.push(() => {
      instance.unmount()
      instance.cleanup()
    })

    expect(useMainApp).toHaveBeenCalledWith(gateway)
  })
})
