import { describe, expect, it } from 'vitest'

import { artWidth, logo, LOGO_WIDTH, PANERGOS_KNOT_WIDTH, panergosKnot } from '../banner.js'
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

  it('renders the Panergos Knot hero without a legacy staff symbol', () => {
    const lines = panergosKnot(DEFAULT_THEME.color)
    const legacyStaff = String.fromCodePoint(0x2624)

    expect(lines).toHaveLength(14)
    expect(lines.some(([, text]) => text.includes(legacyStaff))).toBe(false)
    expect(artWidth(lines)).toBe(PANERGOS_KNOT_WIDTH)
  })
})
