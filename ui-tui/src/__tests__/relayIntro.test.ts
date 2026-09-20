import { describe, expect, it } from 'vitest'

import {
  RELAY_INTRO_LAST_TICK,
  relayIntroFrame,
  relayWordmarkRows,
  shouldPlayRelayIntro,
  usesWideRelayWordmark
} from '../components/relayIntro.js'

describe('Relay intro', () => {
  it('traces the brand before resolving the Relay signal', () => {
    expect(relayIntroFrame(0)).toMatchObject({ brand: 'P', relay: '', resolved: false })
    expect(relayIntroFrame(7).brand).toBe('PANERGOS')
    expect(relayWordmarkRows(1).every(row => row.length > 0)).toBe(true)
    expect(relayWordmarkRows(8).every((row, index) => row.length > relayWordmarkRows(1)[index]!.length)).toBe(true)
    expect(relayIntroFrame(RELAY_INTRO_LAST_TICK)).toEqual({
      brand: 'PANERGOS',
      relay: '╱  ▶',
      resolved: true
    })
  })

  it('uses the single-line fallback until the padded wordmark fits', () => {
    expect(usesWideRelayWordmark(41)).toBe(false)
    expect(usesWideRelayWordmark(42)).toBe(true)
  })

  it('only plays on an interactive terminal', () => {
    expect(shouldPlayRelayIntro({}, true, true)).toBe(true)
    expect(shouldPlayRelayIntro({ CI: '1' }, true, true)).toBe(false)
    expect(shouldPlayRelayIntro({ TERM: 'dumb' }, true, true)).toBe(true)
    expect(shouldPlayRelayIntro({ PANERGOS_TUI_QUERY: 'run this' }, true, true)).toBe(false)
    expect(shouldPlayRelayIntro({ PANERGOS_TUI_IMAGE: 'diagram.png' }, true, true)).toBe(false)
    expect(shouldPlayRelayIntro({ PANERGOS_TUI_RESUME: 'session-id' }, true, true)).toBe(true)
    expect(shouldPlayRelayIntro({}, false, true)).toBe(false)
    expect(shouldPlayRelayIntro({}, true, false)).toBe(false)
  })
})
