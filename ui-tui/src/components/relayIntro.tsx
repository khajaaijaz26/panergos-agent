import { AlternateScreen, Box, Text, useInput, useStdout } from '@panergos/ink'
import { useEffect, useState } from 'react'

import { PANERGOS_WORDMARK_WIDTH, panergosWordmark } from '../banner.js'
import { RELAY_FRAMES } from '../content/relay.js'
import type { Theme } from '../theme.js'

const BRAND = 'PANERGOS'
const LETTER_TICKS = BRAND.length
const RESOLVE_TICKS = RELAY_FRAMES.length
const HOLD_TICKS = 2
const LARGE_WORDMARK_COLUMNS = 72
const WIDE_WORDMARK_COLUMNS = 42
const RELAY_RESOLVED = ['━━━╲', '━━━━▶  RELAY / READY', '━━━╱'] as const

const GLYPHS: Record<string, readonly [string, string, string]> = {
  P: ['┌──┐', '├──┘', '│   '],
  A: ['┌──┐', '├──┤', '│  │'],
  N: ['│╲ │', '│ ╲│', '│  │'],
  E: ['┌───', '├── ', '└───'],
  R: ['┌──┐', '├─┬┘', '│ ╲ '],
  G: ['┌──┐', '│ ─┤', '└──┘'],
  O: ['┌──┐', '│  │', '└──┘'],
  S: ['┌──┐', '└──┐', '└──┘']
}

export const RELAY_INTRO_TICK_MS = 55
export const RELAY_INTRO_LAST_TICK = LETTER_TICKS + RESOLVE_TICKS + HOLD_TICKS

export const usesLargeRelayWordmark = (columns: number) => columns >= LARGE_WORDMARK_COLUMNS
export const usesWideRelayWordmark = (columns: number) => columns >= WIDE_WORDMARK_COLUMNS

export function relayWordmarkRows(revealed = BRAND.length): readonly [string, string, string] {
  const letters = BRAND.slice(0, Math.max(0, Math.min(BRAND.length, Math.floor(revealed))))

  return [0, 1, 2].map(row => [...letters].map(letter => GLYPHS[letter]![row]).join(' ')) as [string, string, string]
}

export const relayIntroTopPadding = (rows: number, stageRows = 7) =>
  Math.max(0, Math.floor(rows / 4) - Math.floor(stageRows / 2))

export function RelayWordmark({ revealed = BRAND.length, t, wide }: { revealed?: number; t: Theme; wide: boolean }) {
  const brand = BRAND.slice(0, Math.max(0, Math.min(BRAND.length, Math.floor(revealed))))
  const rows = relayWordmarkRows(revealed)

  return wide ? (
    <>
      <Text bold color={t.color.primary}>
        {rows[0] || ' '}
      </Text>
      <Text bold color={t.color.warn}>
        {rows[1] || ' '}
      </Text>
      <Text bold color={t.color.ok}>
        {rows[2] || ' '}
      </Text>
    </>
  ) : (
    <Text bold>
      <Text color={t.color.primary}>{brand.slice(0, 3)}</Text>
      <Text color={t.color.warn}>{brand.slice(3, 5)}</Text>
      <Text color={t.color.ok}>{brand.slice(5)}</Text>
    </Text>
  )
}

const envEnabled = (value: string | undefined) => /^(?:1|true|yes|on)$/i.test((value ?? '').trim())

export function shouldPlayRelayIntro(
  env: NodeJS.ProcessEnv = process.env,
  stdinTTY = Boolean(process.stdin.isTTY),
  stdoutTTY = Boolean(process.stdout.isTTY)
) {
  const automatedStart = Boolean((env.PANERGOS_TUI_QUERY ?? '').trim() || (env.PANERGOS_TUI_IMAGE ?? '').trim())

  return stdinTTY && stdoutTTY && !automatedStart && !envEnabled(env.CI)
}

export function relayIntroFrame(tick: number) {
  const safeTick = Math.max(0, Math.floor(tick))
  const brand = BRAND.slice(0, Math.min(BRAND.length, safeTick + 1))
  const relayTick = Math.max(0, safeTick - LETTER_TICKS)
  const relayIndex = Math.min(RELAY_FRAMES.length - 1, relayTick)

  return {
    brand,
    relay: safeTick < LETTER_TICKS ? '' : (RELAY_FRAMES[relayIndex] ?? '━━▶'),
    resolved: relayTick >= RESOLVE_TICKS - 1
  }
}

export function RelayIntro({ onDone, t }: { onDone: () => void; t: Theme }) {
  const [tick, setTick] = useState(0)
  const frame = relayIntroFrame(tick)
  const stdout = useStdout().stdout
  const columns = stdout?.columns ?? 80
  const terminalRows = stdout?.rows ?? 24
  const large = usesLargeRelayWordmark(columns)
  const wide = !large && usesWideRelayWordmark(columns)
  const largeRows = panergosWordmark(t.color, frame.brand.length)
  const stageWidth = large ? PANERGOS_WORDMARK_WIDTH : wide ? relayWordmarkRows()[0].length : BRAND.length
  const stageRows = large ? 10 : 7

  useInput((_input, key) => {
    if (key.escape) {
      onDone()
    }
  })

  useEffect(() => {
    if (tick >= RELAY_INTRO_LAST_TICK) {
      onDone()

      return
    }

    const id = setTimeout(() => setTick(value => value + 1), RELAY_INTRO_TICK_MS)

    return () => clearTimeout(id)
  }, [onDone, tick])

  return (
    <AlternateScreen mouseTracking="off">
      <Box
        alignItems="center"
        flexDirection="column"
        height={terminalRows}
        paddingTop={relayIntroTopPadding(terminalRows, stageRows)}
        width="100%"
      >
        <Box flexDirection="column" width={stageWidth}>
          {large ? (
            largeRows.map(([color, text], index) => (
              <Text bold color={color} key={index}>
                {text || ' '}
              </Text>
            ))
          ) : (
            <RelayWordmark revealed={frame.brand.length} t={t} wide={wide} />
          )}
          {frame.resolved ? (
            <>
              <Box justifyContent="center" width="100%">
                <Text color={t.color.primary}>{RELAY_RESOLVED[0]}</Text>
              </Box>
              <Box justifyContent="center" width="100%">
                <Text color={t.color.warn}>{RELAY_RESOLVED[1]}</Text>
              </Box>
              <Box justifyContent="center" width="100%">
                <Text color={t.color.ok}>{RELAY_RESOLVED[2]}</Text>
              </Box>
            </>
          ) : (
            <>
              <Text> </Text>
              <Box justifyContent="center" width="100%">
                <Text color={t.color.warn}>{frame.relay || ' '}</Text>
              </Box>
              <Text> </Text>
            </>
          )}
          <Box justifyContent="center" width="100%">
            <Text color={t.color.muted}>esc to skip</Text>
          </Box>
        </Box>
      </Box>
    </AlternateScreen>
  )
}
