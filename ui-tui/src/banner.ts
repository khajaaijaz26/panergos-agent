import type { ThemeColors } from './theme.js'

const RICH_RE = /\[(?:bold\s+)?(?:dim\s+)?(#(?:[0-9a-fA-F]{3,8}))\]([\s\S]*?)(\[\/\])/g

export function parseRichMarkup(markup: string): Line[] {
  const lines: Line[] = []

  for (const raw of markup.split('\n')) {
    const trimmed = raw.trimEnd()

    if (!trimmed) {
      lines.push(['', ' '])

      continue
    }

    const matches = [...trimmed.matchAll(RICH_RE)]

    if (!matches.length) {
      lines.push(['', trimmed])

      continue
    }

    let cursor = 0

    for (const m of matches) {
      const before = trimmed.slice(cursor, m.index)

      if (before) {
        lines.push(['', before])
      }

      lines.push([m[1]!, m[2]!])
      cursor = m.index! + m[0].length
    }

    if (cursor < trimmed.length) {
      lines.push(['', trimmed.slice(cursor)])
    }
  }

  return lines
}

const PANERGOS_ART = [
  '██████╗  █████╗ ███╗   ██╗███████╗██████╗  ██████╗  ██████╗ ███████╗',
  '██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔══██╗██╔════╝ ██╔═══██╗██╔════╝',
  '██████╔╝███████║██╔██╗ ██║█████╗  ██████╔╝██║  ███╗██║   ██║███████╗',
  '██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██╔══██╗██║   ██║██║   ██║╚════██║',
  '██║     ██║  ██║██║ ╚████║███████╗██║  ██║╚██████╔╝╚██████╔╝███████║',
  '╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝'
]

const AGENT_ART = [
  '█████╗  ██████╗ ███████╗███╗   ██╗████████╗',
  '██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝',
  '███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║',
  '██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║',
  '██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║',
  '╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝'
]

const LOGO_ART = PANERGOS_ART.map((line, i) => `${line}       ${AGENT_ART[i]}`)

// Cell-safe reduction of the canonical Panergos Relay: coral and jade work
// lanes converge into one amber execution path.
const PANERGOS_RELAY_ART = ['━━━╲', '━━━━▶', '━━━╱']

const LOGO_GRADIENT = [0, 0, 1, 1, 2, 2] as const
const RELAY_GRADIENT = [0, 5, 4] as const

const colorize = (art: string[], gradient: readonly number[], c: ThemeColors): Line[] => {
  const p = [c.primary, c.accent, c.border, c.muted, c.ok, c.warn]

  return art.map((text, i) => [p[gradient[i]!] ?? c.muted, text])
}

export const LOGO_WIDTH = Math.max(...LOGO_ART.map(line => line.length))
export const PANERGOS_RELAY_WIDTH = Math.max(...PANERGOS_RELAY_ART.map(line => line.length))

export const logo = (c: ThemeColors, customLogo?: string): Line[] =>
  customLogo ? parseRichMarkup(customLogo) : colorize(LOGO_ART, LOGO_GRADIENT, c)

export const panergosRelay = (c: ThemeColors, customHero?: string): Line[] =>
  customHero ? parseRichMarkup(customHero) : colorize(PANERGOS_RELAY_ART, RELAY_GRADIENT, c)

export const artWidth = (lines: Line[]) => lines.reduce((m, [, t]) => Math.max(m, t.length), 0)

type Line = [string, string]
