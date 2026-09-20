import { PassThrough } from 'stream'

import { renderSync } from '@panergos/ink'
import { stripAnsi } from '@panergos/shared/ansi'
import React, { type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { logo, LOGO_WIDTH, PANERGOS_KNOT_WIDTH, panergosKnot } from '../banner.js'
import { Banner, SessionPanel } from '../components/branding.js'
import { DEFAULT_THEME } from '../theme.js'
import type { SessionInfo } from '../types.js'

const KNOT_ART = panergosKnot(DEFAULT_THEME.color)
const KNOT_TOP = KNOT_ART[0]![1]
const KNOT_TRANSPARENT_PREFIX = [...KNOT_TOP].findIndex(char => char !== '\u2800')
const KNOT_SENTINEL = KNOT_TOP.slice(KNOT_TRANSPARENT_PREFIX, KNOT_TRANSPARENT_PREFIX + 2)

const render = (node: ReactElement, columns: number) => {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()
  let output = ''

  Object.assign(stdout, { columns, isTTY: false, rows: 50 })
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

describe('branding alignment', () => {
  it('centres the full wordmark as one fixed-width block', () => {
    const columns = 132
    const lines = render(<Banner maxWidth={columns} t={DEFAULT_THEME} />, columns)
    const logoText = logo(DEFAULT_THEME.color).find(([, text]) => text.length === LOGO_WIDTH)![1]
    const logoLine = lines.find(line => line.includes(logoText))
    const tagline = '◆ Panergos · Durable intelligence at work'
    const taglineLine = lines.find(line => line.includes(tagline))
    const logoLeft = logoLine?.indexOf(logoText) ?? -1
    const taglineLeft = taglineLine?.indexOf(tagline) ?? -1

    expect(logoLine, lines.join('\n')).toBeDefined()
    expect(Math.abs(logoLeft - (columns - logoLeft - logoText.length))).toBeLessThanOrEqual(1)
    expect(Math.abs(taglineLeft - (columns - taglineLeft - tagline.length))).toBeLessThanOrEqual(1)
  })

  it('switches from the compact banner only when the full wordmark fits', () => {
    const firstLogoText = logo(DEFAULT_THEME.color)[0]![1]
    const compactColumns = LOGO_WIDTH + 1
    const fullColumns = LOGO_WIDTH + 2
    const compact = render(<Banner maxWidth={compactColumns} t={DEFAULT_THEME} />, compactColumns)
    const full = render(<Banner maxWidth={fullColumns} t={DEFAULT_THEME} />, fullColumns)

    expect(compact.some(line => line.includes(firstLogoText))).toBe(false)
    expect(full.some(line => line.includes(firstLogoText))).toBe(true)
    expect(Math.max(...compact.map(line => line.length))).toBeLessThanOrEqual(compactColumns)
    expect(Math.max(...full.map(line => line.length))).toBeLessThanOrEqual(fullColumns)
  })

  it('centres the knot art inside its wide-layout track', () => {
    const info: SessionInfo = {
      model: 'test/model',
      skills: {},
      tools: { file: ['read_file'] }
    }

    const columns = 120
    const lines = render(<SessionPanel info={info} sid="test" t={DEFAULT_THEME} />, columns)
    const knotTop = lines.find(line => line.includes(KNOT_SENTINEL))
    const panelInset = 3 // one border cell + paddingX=2
    const heroTrackWidth = PANERGOS_KNOT_WIDTH + 4
    const artInset = Math.floor((heroTrackWidth - PANERGOS_KNOT_WIDTH) / 2)

    expect(PANERGOS_KNOT_WIDTH).toBe(Math.max(...KNOT_ART.map(([, text]) => text.length)))
    expect(KNOT_TRANSPARENT_PREFIX).toBeGreaterThan(0)
    expect(knotTop?.indexOf(KNOT_SENTINEL)).toBe(panelInset + artInset + KNOT_TRANSPARENT_PREFIX)
  })

  it('shows the knot only when the wide layout fits without overflowing', () => {
    const info: SessionInfo = { model: 'test/model', skills: {}, tools: {} }
    const narrow = render(<SessionPanel info={info} t={DEFAULT_THEME} />, 89)
    const wide = render(<SessionPanel info={info} t={DEFAULT_THEME} />, 90)

    expect(narrow.some(line => line.includes(KNOT_SENTINEL))).toBe(false)
    expect(wide.some(line => line.includes(KNOT_SENTINEL))).toBe(true)
    expect(Math.max(...narrow.map(line => line.length))).toBeLessThanOrEqual(89)
    expect(Math.max(...wide.map(line => line.length))).toBeLessThanOrEqual(90)
  })
})
