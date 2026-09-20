import { describe, expect, it } from 'vitest'

import { padPhase, PHASE_PAD_LEN } from '../components/appChrome.js'
import { RELAY_PHASES } from '../content/verbs.js'

describe('RelayTicker phase padding', () => {
  it('pads every phase to the same width', () => {
    for (const phase of RELAY_PHASES) {
      expect(padPhase(phase)).toHaveLength(PHASE_PAD_LEN)
    }
  })

  it('keeps trailing ellipsis attached', () => {
    for (const phase of RELAY_PHASES) {
      expect(padPhase(phase).startsWith(`${phase}…`)).toBe(true)
    }
  })
})
