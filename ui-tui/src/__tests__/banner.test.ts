import { describe, expect, it } from 'vitest'

import { artWidth, logo, LOGO_WIDTH, PANERGOS_RELAY_WIDTH, panergosRelay } from '../banner.js'
import { DEFAULT_THEME } from '../theme.js'

describe('default banner', () => {
  it('renders the Panergos Agent wordmark as a complete six-line logo', () => {
    const lines = logo(DEFAULT_THEME.color)

    expect(DEFAULT_THEME.brand.name).toBe('Panergos Agent')
    expect(lines).toHaveLength(6)
    expect(lines[0]?.[1]).toMatch(/^██████╗ {2}█████╗/)
    expect(lines[0]?.[1]).toMatch(/█████╗ {2}██████╗ ███████╗███╗ {3}██╗████████╗$/)
    expect(lines.some(([, text]) => text.includes('undefined'))).toBe(false)
    expect(artWidth(lines)).toBe(LOGO_WIDTH)
  })

  it('renders the compact three-colour Panergos Relay', () => {
    const lines = panergosRelay(DEFAULT_THEME.color)
    const legacyStaff = String.fromCodePoint(0x2624)

    expect(lines.map(([, text]) => text)).toEqual(['━━━╲', '━━━━▶', '━━━╱'])
    expect(lines.map(([color]) => color)).toEqual([
      DEFAULT_THEME.color.primary,
      DEFAULT_THEME.color.warn,
      DEFAULT_THEME.color.ok
    ])
    expect(lines.some(([, text]) => text.includes(legacyStaff))).toBe(false)
    expect(artWidth(lines)).toBe(PANERGOS_RELAY_WIDTH)
  })
})
