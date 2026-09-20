import { PassThrough } from 'stream'

import { renderSync } from '@panergos/ink'
import { stripAnsi } from '@panergos/shared/ansi'
import React, { type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { panergosWordmark } from '../banner.js'
import { Banner, SessionPanel } from '../components/branding.js'
import { relayWordmarkRows } from '../components/relayIntro.js'
import { DEFAULT_THEME } from '../theme.js'
import type { SessionInfo } from '../types.js'

const render = (node: ReactElement, columns: number, rows = 50) => {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()
  let output = ''

  Object.assign(stdout, { columns, isTTY: false, rows })
  Object.assign(stdin, { isTTY: false })
  Object.assign(stderr, { isTTY: false })
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns')
  Object.defineProperty(process.stdout, 'columns', { configurable: true, value: columns })

  try {
    const view = renderSync(node, {
      patchConsole: false,
      stderr: stderr as NodeJS.WriteStream,
      stdin: stdin as NodeJS.ReadStream,
      stdout: stdout as NodeJS.WriteStream
    })

    view.unmount()
    view.cleanup()
  } finally {
    if (originalColumns) {
      Object.defineProperty(process.stdout, 'columns', originalColumns)
    } else {
      delete (process.stdout as NodeJS.WriteStream & { columns?: number }).columns
    }
  }

  return stripAnsi(output).split('\n')
}

const info: SessionInfo = {
  branch: 'main',
  cwd: 'C:\\work\\atlas',
  fast: true,
  model: 'openrouter/fast-model',
  profile_name: 'work',
  provider: 'openrouter',
  service_tier: 'priority',
  skills: { core: ['planning', 'memory'] },
  stored_session_id: 'stored-test',
  tools: { file: ['read_file', 'write_file'] },
  usage: { avg_latency_s: 0.8, avg_tps: 72, cache_hit_pct: 88, context_percent: 24 },
  version: '0.1.0'
}

describe('branding alignment', () => {
  it('keeps the completed Relay wordmark centered above the workspace', () => {
    const columns = 80
    const lines = render(<Banner maxWidth={columns} t={DEFAULT_THEME} />, columns, 24)
    const wordmark = panergosWordmark(DEFAULT_THEME.color).map(([, text]) => text)

    wordmark.forEach(row => expect(lines.join('\n')).toContain(row))
    expect(lines.join('\n')).toContain('RELAY / READY')
    expect(lines.find(line => line.includes(wordmark[0]))?.indexOf(wordmark[0])).toBe(
      Math.floor((columns - wordmark[0].length) / 2)
    )
  })

  it('uses the narrow wordmark fallback without overflowing', () => {
    const tiny = render(<Banner maxWidth={34} t={DEFAULT_THEME} />, 34)
    const mid = render(<Banner maxWidth={50} t={DEFAULT_THEME} />, 50)
    const wide = render(<Banner maxWidth={70} t={DEFAULT_THEME} />, 70)
    const full = render(<Banner maxWidth={72} t={DEFAULT_THEME} />, 72)

    expect(tiny.join('\n')).toContain('PANERGOS')
    expect(tiny.join('\n')).toContain('RELAY / READY')
    expect(mid.join('\n')).toContain(relayWordmarkRows()[0])
    expect(wide.join('\n')).toContain(relayWordmarkRows()[0])
    expect(full.join('\n')).toContain(panergosWordmark(DEFAULT_THEME.color)[0]![1])
    expect(Math.max(...tiny.map(line => line.length))).toBeLessThanOrEqual(34)
    expect(Math.max(...mid.map(line => line.length))).toBeLessThanOrEqual(50)
    expect(Math.max(...wide.map(line => line.length))).toBeLessThanOrEqual(70)
    expect(Math.max(...full.map(line => line.length))).toBeLessThanOrEqual(72)
  })

  it('keeps custom skin identity and hero art live', () => {
    const custom = {
      ...DEFAULT_THEME,
      bannerHero: '[#ff0000]CUSTOM HERO[/]',
      brand: { ...DEFAULT_THEME.brand, icon: 'N', name: 'Nova Ops' }
    }

    const banner = render(<Banner maxWidth={80} t={custom} />, 80).join('\n')
    const workstream = render(<SessionPanel info={info} t={custom} />, 100).join('\n')

    expect(banner).toContain('━━━━▶ N NOVA OPS')
    expect(workstream).toContain('CUSTOM HERO')
  })

  it('surfaces work, routing, memory and real actions instead of a hero tool list', () => {
    const lines = render(<SessionPanel info={info} sid="session-test" t={DEFAULT_THEME} />, 120)
    const frame = lines.join('\n')

    expect(frame).toContain('LIVE WORKSTREAM')
    expect(frame).toContain('01 / MODEL')
    expect(frame).toContain('02 / ROUTE')
    expect(frame).toContain('03 / WORKSPACE')
    expect(frame).toContain('04 / MEMORY')
    expect(frame).toContain('88% cache hit')
    expect(frame).toContain('72 t/s')
    expect(frame).toContain('GO / COMMAND LANE')
    expect(frame).toContain('Ctrl+O model')
    expect(frame).toContain('Capability map')
    expect(frame).not.toContain('Available Tools')
    expect(Math.max(...lines.map(line => line.length))).toBeLessThanOrEqual(120)
  })

  it('moves workstream signals from two columns to one when space is tight', () => {
    const narrow = render(<SessionPanel info={info} t={DEFAULT_THEME} />, 58)
    const wide = render(<SessionPanel info={info} t={DEFAULT_THEME} />, 100)
    const narrowModelLine = narrow.find(line => line.includes('01 / MODEL'))
    const wideModelLine = wide.find(line => line.includes('01 / MODEL'))

    expect(narrowModelLine).not.toContain('02 / ROUTE')
    expect(wideModelLine).toContain('02 / ROUTE')
    expect(Math.max(...narrow.map(line => line.length))).toBeLessThanOrEqual(58)
    expect(Math.max(...wide.map(line => line.length))).toBeLessThanOrEqual(100)
  })
})
