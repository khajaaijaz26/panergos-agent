import { Box, Text, useStdout } from '@panergos/ink'
import { mix } from '@panergos/shared/color'
import { useEffect, useState } from 'react'
import unicodeSpinners from 'unicode-animations'

import { artWidth, logo, panergosRelay, panergosWordmark } from '../banner.js'
import { flat } from '../lib/text.js'
import type { Theme } from '../theme.js'
import type { PanelSection, SessionInfo } from '../types.js'

import { Accordion } from './accordion.js'
import { ShimmerRows } from './loaders.js'
import { RelayWordmark, usesLargeRelayWordmark, usesWideRelayWordmark } from './relayIntro.js'
import { WidgetGrid } from './widgetGrid.js'

const LOADER_TICK_MS = 120

function InlineLoader({ label, t }: { label: string; t: Theme }) {
  const [tick, setTick] = useState(0)
  const spinner = unicodeSpinners.braille
  const frame = spinner.frames[tick % spinner.frames.length] ?? '⠋'

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), Math.max(LOADER_TICK_MS, spinner.interval))

    return () => clearInterval(id)
  }, [spinner.interval])

  return (
    <Text color={t.color.muted} wrap="truncate">
      <Text color={t.color.accent}>{frame}</Text> {label}
    </Text>
  )
}

export function ArtLines({ lines }: { lines: [string, string][] }) {
  // No `opaque`: the banner is top-level content with nothing behind it, so
  // it never needs the opaque space-fill (that's for absolute overlays). On a
  // transparent terminal (terminal.background #00000000) the fill's "default
  // background" spaces composite to black bars instead of the intended
  // see-through — the reported ugly banner. Glyphs paint fine on their own.
  return (
    <Box flexDirection="column" height={lines.length} width={artWidth(lines)}>
      {lines.map(([c, text], i) => (
        <Text color={c} key={i} wrap="truncate-end">
          {text}
        </Text>
      ))}
    </Box>
  )
}

// Three work lanes converge into one cursor. Unlike the former centred
// mascot/card composition, this stays left-aligned and leads straight into
// the live workspace below it.
const TAG_FULL = 'context stays · work moves'
const HIDE_BELOW = 24
const SIGNAL_LABEL_WIDTH = 11

function FlowMark({ t }: { t: Theme }) {
  return <ArtLines lines={panergosRelay(t.color)} />
}

export function Banner({ maxWidth, t }: { maxWidth?: number; t: Theme }) {
  const term = useStdout().stdout?.columns ?? 80
  const cols = Math.max(1, Math.min(term, maxWidth ?? term))

  if (cols < HIDE_BELOW) {
    return null
  }

  // Explicit custom skin art remains supported. The default identity stays
  // compact at every width so opening a session reaches the work immediately.
  if (t.bannerLogo) {
    const logoLines = logo(t.color, t.bannerLogo)

    if (cols >= artWidth(logoLines) + 2) {
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Box justifyContent="center" width="100%">
            <ArtLines lines={logoLines} />
          </Box>
        </Box>
      )
    }
  }

  if (t.brand.name === 'Panergos Agent') {
    const large = usesLargeRelayWordmark(cols)

    return (
      <Box alignItems="center" flexDirection="column" marginBottom={1} width={cols}>
        {large ? (
          <ArtLines lines={panergosWordmark(t.color)} />
        ) : (
          <RelayWordmark t={t} wide={usesWideRelayWordmark(cols)} />
        )}
        <Text color={t.color.muted}>RELAY / READY</Text>
      </Box>
    )
  }

  const full = cols >= 48
  const brand = t.brand.name.toUpperCase()
  const customToken = `${t.brand.icon} `

  return (
    <Box marginBottom={1} width={Math.max(1, cols - 2)}>
      <FlowMark t={t} />
      <Box flexDirection="column" marginLeft={1}>
        <Text color={t.color.muted} wrap="truncate-end">
          {full ? 'WORK CONTINUITY' : 'CONTINUITY'}
        </Text>
        <Text bold color={t.color.primary} wrap="truncate-end">
          {customToken}
          {brand}
        </Text>
        {full ? (
          <Text color={t.color.muted} wrap="truncate-end">
            {TAG_FULL}
          </Text>
        ) : (
          <Text color={t.color.muted}>READY</Text>
        )}
      </Box>
    </Box>
  )
}

function Signal({ code, detail, label, t, tone, value, width }: SignalProps) {
  return (
    <Box flexDirection="column" width={width}>
      <Text wrap="truncate-end">
        <Text bold color={tone}>
          {code}
        </Text>
        <Text color={t.color.muted}> / </Text>
        <Text bold color={t.color.label}>
          {label.padEnd(SIGNAL_LABEL_WIDTH)}
        </Text>
        <Text color={t.color.text}>{value}</Text>
      </Text>
      <Text color={t.color.muted} wrap="truncate-end">
        {' '.repeat(SIGNAL_LABEL_WIDTH + 5)}
        {detail}
      </Text>
    </Box>
  )
}

interface SignalProps {
  code: string
  detail: string
  label: string
  t: Theme
  tone: string
  value: string
  width: number
}

// ── Skeleton ─────────────────────────────────────────────────────────
//
// Lazy sections render shimmer rows shaped like the real content (label
// block + value run) instead of a blank gap that pops when data lands.
// Row widths mirror the typical toolsets listing.
const SKELETON_ROWS: readonly (readonly [number, number])[] = [
  [7, 30],
  [7, 9],
  [14, 12],
  [12, 12],
  [7, 7],
  [10, 13]
]

// ── SessionPanel ─────────────────────────────────────────────────────

const SKILLS_MAX = 8
const TOOLSETS_MAX = 8

export function SessionPanel({ info, maxWidth, sid, t }: SessionPanelProps) {
  const term = useStdout().stdout?.columns ?? 100
  const cols = Math.max(20, Math.min(term, maxWidth ?? term))
  const innerCols = Math.max(16, cols - 6)
  const wide = innerCols >= 74
  const lineBudget = Math.max(12, innerCols - 2)
  const strip = (s: string) => (s.endsWith('_tools') ? s.slice(0, -6) : s)

  // Hierarchy: labels lead in the label tone; member lists recede in the
  // muted/text midpoint. Anchoring on MUTED (mid-luminance by construction)
  // keeps the fade readable on both poles even when polarity detection is
  // wrong — surface-relative blends go invisible when text is already pale.
  const listFade = mix(t.color.muted, t.color.text, 0.5)
  const customHero = t.bannerHero ? panergosRelay(t.color, t.bannerHero) : null

  // Capability detail stays one click away without dominating startup.
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false)
  const [systemOpen, setSystemOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)

  const truncLine = (pfx: string, items: string[]) => {
    let line = ''
    let shown = 0

    for (const item of [...items].sort()) {
      const next = line ? `${line}, ${item}` : item

      if (pfx.length + next.length > lineBudget) {
        return line ? `${line}, …+${items.length - shown}` : `${item}, …`
      }

      line = next
      shown++
    }

    return line
  }

  // ── Collapsible skills section ──
  const skills = info.skills ?? {}
  const skillEntries = Object.entries(skills).sort()
  const skillsTotal = flat(skills).length

  const skillsBody = () => {
    if (info.lazy && skillEntries.length === 0) {
      return <InlineLoader label="scanning skills" t={t} />
    }

    const shown = skillEntries.slice(0, SKILLS_MAX)
    const overflow = skillEntries.length - SKILLS_MAX

    return (
      <>
        {shown.map(([k, vs]) => (
          <Text key={k} wrap="truncate">
            <Text color={t.color.label}>{strip(k)}: </Text>
            <Text color={listFade}>{truncLine(strip(k) + ': ', vs)}</Text>
          </Text>
        ))}
        {overflow > 0 && <Text color={t.color.muted}>(and {overflow} more categories…)</Text>}
      </>
    )
  }

  // ── Collapsible tools section ──
  const tools = info.tools ?? {}
  const toolEntries = Object.entries(tools).sort()
  const toolsTotal = flat(tools).length

  // MCP headline counts *connected* servers, not configured-but-disabled ones,
  // so it matches the classic CLI banner (`sum(s.connected)` in
  // panergos_cli/banner.py) and the "connected" label on the collapse toggle.
  const mcpServers = info.mcp_servers ?? []
  const mcpConnected = mcpServers.filter(s => s.connected).length

  const toolsBody = () => {
    if (info.lazy && toolEntries.length === 0) {
      return <ShimmerRows color={listFade} highlight={t.color.label} rows={SKELETON_ROWS} />
    }

    const shown = toolEntries.slice(0, TOOLSETS_MAX)
    const overflow = toolEntries.length - TOOLSETS_MAX

    return (
      <>
        {shown.map(([k, vs]) => (
          <Text key={k} wrap="truncate">
            <Text color={t.color.label}>{strip(k)}: </Text>
            <Text color={listFade}>{truncLine(strip(k) + ': ', vs)}</Text>
          </Text>
        ))}
        {overflow > 0 && <Text color={t.color.muted}>(and {overflow} more toolsets…)</Text>}
      </>
    )
  }

  // ── Collapsible MCP section ──
  const mcpBody = () => (
    <>
      {(info.mcp_servers ?? []).map(s => (
        <Text key={s.name} wrap="truncate">
          <Text color={t.color.muted}>{`  ${s.name} `}</Text>
          <Text color={t.color.muted}>{`[${s.transport}]`}</Text>
          <Text color={t.color.muted}>: </Text>
          {s.connected ? (
            <Text color={t.color.text}>
              {s.tools} tool{s.tools === 1 ? '' : 's'}
            </Text>
          ) : s.disabled || s.status === 'disabled' ? (
            <Text color={t.color.muted}>disabled</Text>
          ) : s.status === 'connecting' ? (
            <Text color={t.color.warn}>connecting</Text>
          ) : s.status === 'configured' ? (
            <Text color={t.color.muted}>configured</Text>
          ) : (
            <Text color={t.color.error}>failed</Text>
          )}
        </Text>
      ))}
    </>
  )

  // ── System prompt body ──
  const sysPromptLen = (info.system_prompt ?? '').length

  const systemBody = () => {
    if (sysPromptLen === 0) {
      return <Text color={t.color.muted}>No system prompt loaded.</Text>
    }

    return <Text color={t.color.muted}>{info.system_prompt}</Text>
  }

  const model = info.model || 'select a model'
  const provider = info.provider || (model.includes('/') ? model.split('/')[0] : 'automatic')

  const routeMode = [info.fast ? 'boost on' : null, info.service_tier, info.reasoning_effort]
    .filter(Boolean)
    .join(' · ')

  const cwd = info.cwd || process.cwd()
  const workspace = info.project?.name || cwd.split(/[\\/]/).filter(Boolean).at(-1) || cwd

  const workspaceDetail = [info.branch, info.profile_name ? `profile ${info.profile_name}` : null, cwd]
    .filter(Boolean)
    .join(' · ')

  const usage = info.usage ?? {}
  const memoryValue = info.stored_session_id ? 'resumable' : sid ? 'live session' : 'ready'

  const memoryDetail = [
    typeof usage.cache_hit_pct === 'number' ? `${Math.round(usage.cache_hit_pct)}% cache hit` : 'context ready',
    typeof usage.context_percent === 'number' ? `${Math.round(usage.context_percent)}% context` : null
  ]
    .filter(Boolean)
    .join(' · ')

  const pace = [
    typeof usage.avg_tps === 'number' ? `${Math.round(usage.avg_tps)} t/s` : null,
    typeof usage.avg_latency_s === 'number' ? `${usage.avg_latency_s.toFixed(1)}s latency` : null
  ]
    .filter(Boolean)
    .join(' · ')

  const signalWidgets = [
    {
      id: 'model-signal',
      render: (width: number) => (
        <Signal
          code="01"
          detail={model}
          label="MODEL"
          t={t}
          tone={t.color.primary}
          value={model.split('/').pop() || model}
          width={width}
        />
      )
    },
    {
      id: 'route-signal',
      render: (width: number) => (
        <Signal
          code="02"
          detail={[routeMode || 'adaptive selection', pace].filter(Boolean).join(' · ')}
          label="ROUTE"
          t={t}
          tone={t.color.accent}
          value={provider}
          width={width}
        />
      )
    },
    {
      id: 'workspace-signal',
      render: (width: number) => (
        <Signal
          code="03"
          detail={workspaceDetail || cwd}
          label="WORKSPACE"
          t={t}
          tone={t.color.warn}
          value={workspace}
          width={width}
        />
      )
    },
    {
      id: 'memory-signal',
      render: (width: number) => (
        <Signal
          code="04"
          detail={memoryDetail}
          label="MEMORY"
          t={t}
          tone={t.color.ok}
          value={memoryValue}
          width={width}
        />
      )
    }
  ]

  const infoColumn = (
    <Box flexDirection="column" width="100%">
      {customHero && artWidth(customHero) <= innerCols ? (
        <Box justifyContent="center" marginBottom={1} width="100%">
          <ArtLines lines={customHero} />
        </Box>
      ) : null}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={t.color.primary} wrap="truncate-end">
          LIVE WORKSTREAM
        </Text>
        <Text color={t.color.muted} wrap="truncate-end">
          {info.version ? `v${info.version}` : ''}
          {sid ? `${info.version ? ' · ' : ''}${sid.slice(0, 8)}` : ''}
        </Text>
      </Box>

      <WidgetGrid
        cols={innerCols}
        columns={wide ? 2 : 1}
        gap={wide ? 2 : 0}
        paddingX={0}
        paddingY={0}
        rowGap={1}
        widgets={signalWidgets}
      />

      <Box marginTop={1}>
        <Text color={t.color.muted} wrap="truncate-end">
          <Text bold color={t.color.accent}>
            GO / COMMAND LANE
          </Text>
          {'  '}
          <Text color={t.color.text}>Ctrl+O</Text> model · <Text color={t.color.text}>Ctrl+X</Text> sessions ·{' '}
          <Text color={t.color.text}>?</Text> help · <Text color={t.color.text}>/</Text> commands
        </Text>
      </Box>

      {/* Capability detail is available without becoming the startup view. */}
      <Box flexDirection="column" marginTop={1}>
        <Accordion
          onToggle={() => setCapabilitiesOpen(v => !v)}
          open={capabilitiesOpen}
          suffix={info.lazy && !toolsTotal && !skillsTotal ? 'loading' : `${toolsTotal} tools · ${skillsTotal} skills`}
          t={t}
          title="Capability map"
        >
          <Box flexDirection="column" marginLeft={2}>
            <Text bold color={t.color.label}>
              Tools
            </Text>
            {toolsBody()}
            <Box marginTop={1}>
              <Text bold color={t.color.label}>
                Skills
              </Text>
            </Box>
            {skillsBody()}
          </Box>
        </Accordion>
      </Box>

      {/* ── System Prompt (collapsed by default) ── */}
      {sysPromptLen > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Accordion
            onToggle={() => setSystemOpen(v => !v)}
            open={systemOpen}
            suffix={`— ${sysPromptLen.toLocaleString()} chars`}
            t={t}
            title="System Prompt"
          >
            {systemBody()}
          </Accordion>
        </Box>
      )}

      {/* Connected services stay inspectable without owning the workstream. */}
      {mcpServers.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Accordion
            onToggle={() => setMcpOpen(v => !v)}
            open={mcpOpen}
            suffix={mcpConnected ? `${mcpConnected} MCP connected` : 'none active'}
            t={t}
            title="Connections"
          >
            {mcpBody()}
          </Accordion>
        </Box>
      )}

      <Text />

      <Text color={t.color.text} wrap="truncate-end">
        {/* Lazy boot: never print "0 tools · 0 skills" while counts load. */}
        {info.lazy && !toolsTotal ? '… ' : `${toolsTotal} `}tools{' · '}
        {info.lazy && !skillsTotal ? '… ' : `${skillsTotal} `}skills
        {mcpConnected ? ` · ${mcpConnected} MCP` : ''}
        {' · '}
        <Text color={t.color.muted}>continuity ready</Text>
      </Text>

      {typeof info.update_behind === 'number' && info.update_behind > 0 && (
        <Text bold color={t.color.warn}>
          ! {info.update_behind} {info.update_behind === 1 ? 'commit' : 'commits'} behind
          <Text bold={false} color={t.color.warn} dimColor>
            {' '}
            - run{' '}
          </Text>
          <Text bold color={t.color.warn}>
            {info.update_command || 'panergos update'}
          </Text>
          <Text bold={false} color={t.color.warn} dimColor>
            {' '}
            to update
          </Text>
        </Text>
      )}

      {info.install_warning && (
        <Text bold color={t.color.warn} wrap="wrap">
          ! {info.install_warning}
        </Text>
      )}
    </Box>
  )

  return (
    <Box
      borderBottom={false}
      borderColor={t.color.border}
      borderLeft
      borderRight={false}
      borderStyle="single"
      borderTop={false}
      marginBottom={1}
      paddingLeft={2}
    >
      <WidgetGrid
        cols={innerCols}
        columns={1}
        gap={0}
        paddingX={0}
        paddingY={0}
        rowGap={0}
        widgets={[{ children: infoColumn, id: 'session-info' }]}
      />
    </Box>
  )
}

export function Panel({ sections, t, title }: PanelProps) {
  return (
    <Box borderColor={t.color.border} borderStyle="round" flexDirection="column" paddingX={2} paddingY={1}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={t.color.primary}>
          {title}
        </Text>
      </Box>

      {sections.map((sec, si) => (
        <Box flexDirection="column" key={si} marginTop={si > 0 ? 1 : 0}>
          {sec.title && (
            <Text bold color={t.color.accent}>
              {sec.title}
            </Text>
          )}

          {sec.rows?.map(([k, v], ri) => (
            <Text key={ri} wrap="truncate">
              <Text color={t.color.muted}>{k.padEnd(20)}</Text>
              <Text color={t.color.text}>{v}</Text>
            </Text>
          ))}

          {sec.items?.map((item, ii) => (
            <Text color={t.color.text} key={ii} wrap="truncate">
              {item}
            </Text>
          ))}

          {sec.text && <Text color={t.color.muted}>{sec.text}</Text>}
        </Box>
      ))}
    </Box>
  )
}

interface PanelProps {
  sections: PanelSection[]
  t: Theme
  title: string
}

interface SessionPanelProps {
  info: SessionInfo
  maxWidth?: number
  sid?: string | null
  t: Theme
}
