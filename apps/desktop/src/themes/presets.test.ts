import { describe, expect, it } from 'vitest'

import {
  BUILTIN_THEME_LIST,
  BUILTIN_THEMES,
  DEFAULT_SKIN_NAME,
  DEFAULT_TYPOGRAPHY,
  EMOJI_FALLBACK,
  legacyBlueTheme
} from './presets'

// #40364: none of the UI text/mono fonts carry emoji glyphs, so every font
// stack must end with a color-emoji fallback or emoji render as tofu on
// platforms whose default font lacks them (e.g. Linux).
describe('theme typography emoji fallback (#40364)', () => {
  const stacks: Array<[string, string]> = [
    ['DEFAULT_TYPOGRAPHY.fontSans', DEFAULT_TYPOGRAPHY.fontSans],
    ['DEFAULT_TYPOGRAPHY.fontMono', DEFAULT_TYPOGRAPHY.fontMono],
    // A theme may override only fontMono (fontSans then falls back to the
    // default, which already carries the emoji stack), so skip undefined.
    ...BUILTIN_THEME_LIST.flatMap(theme =>
      (
        [
          [`${theme.name}.fontSans`, theme.typography?.fontSans],
          [`${theme.name}.fontMono`, theme.typography?.fontMono]
        ] as Array<[string, string | undefined]>
      ).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  ]

  it.each(stacks)('%s includes a color-emoji font', (_label, stack) => {
    expect(stack).toMatch(/Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji|(^|,\s*)emoji\b/)
  })

  it('EMOJI_FALLBACK lists the major platform emoji fonts', () => {
    expect(EMOJI_FALLBACK).toContain('Apple Color Emoji')
    expect(EMOJI_FALLBACK).toContain('Segoe UI Emoji')
    expect(EMOJI_FALLBACK).toContain('Noto Color Emoji')
  })
})

// The legacy blue palette stays available as legacy-blue; the compatibility key
// `eclipse` now carries Panergos's first-party identity.
describe('legacy-blue is the legacy palette, not the default', () => {
  it('is registered under its own name and leaves eclipse as the default', () => {
    expect(DEFAULT_SKIN_NAME).toBe('eclipse')
    expect(BUILTIN_THEMES['legacy-blue']).toBe(legacyBlueTheme)
    expect(BUILTIN_THEMES.eclipse).not.toBe(legacyBlueTheme)
    expect(legacyBlueTheme.darkColors?.background).toBe('#0D2F86')
    expect(BUILTIN_THEMES.eclipse.darkColors?.background).toBe('#120b1f')
    expect(BUILTIN_THEMES.eclipse.darkColors?.primary).toBe('#ff6b5e')
  })
})
