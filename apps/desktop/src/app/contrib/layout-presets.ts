import { group, split } from '@/components/pane-shell/tree/model'
import { registry } from '@/contrib/registry'
import { isOnboardingEnabled } from '@/lib/onboarding-enabled'

// ---------------------------------------------------------------------------
// Layout presets — CHAT (main) always dominates.
// ---------------------------------------------------------------------------

// Continuity is the Panergos default: one workstream for chat, sessions,
// files, and review, plus a bottom Launch Bay for the terminal. Supporting
// surfaces replace the workstream only when asked for; chat is never fenced
// between permanent left and right sidebars.
//
// Preview tiles are DYNAMIC panes (like session tiles), so no preset names one:
// they're registered by watchPreviewTiles as tabs open, and dockPaneBeside lands
// each one beside the file tree wherever that surface currently lives.
export const DEFAULT_TREE = split(
  'column',
  [
    group(['workspace', 'sessions', 'files', 'review'], { active: 'workspace', id: 'grp-main' }),
    group(['terminal'], { id: 'grp-terminal' })
  ],
  [4.8, 1],
  'spl-relay'
)

const FOCUS_TREE = split('row', [group(['sessions']), group(['workspace', 'files', 'review', 'terminal'])], [1, 4.6])

// Basic starts with sessions and chat so first-run users need not learn
// terminal, files or review panes before using Panergos.
const BASIC_TREE = split('row', [group(['sessions']), group(['workspace'])], [1, 4.6])

const TERMINAL_TREE = split(
  'column',
  [
    split('row', [group(['sessions']), group(['workspace']), group(['files', 'review'])], [1, 3.2, 1.2]),
    group(['terminal'])
  ],
  [3, 1]
)

const QUAD_TREE = split(
  'column',
  [
    split('row', [group(['sessions', 'files']), group(['workspace'])], [1, 3]),
    split('row', [group(['terminal']), group(['review'])], [1.4, 1])
  ],
  [3, 1]
)

export function registerLayoutPresets() {
  return registry.registerMany([
    { id: 'default', area: 'layouts', title: 'Continuity', order: 0, data: DEFAULT_TREE },
    ...(isOnboardingEnabled()
      ? [{ id: 'basic', area: 'layouts', title: 'Workstream', order: 5, data: BASIC_TREE }]
      : []),
    { id: 'focus', area: 'layouts', title: 'Focus stage', order: 10, data: FOCUS_TREE },
    { id: 'terminal-deck', area: 'layouts', title: 'Launch bay', order: 20, data: TERMINAL_TREE },
    { id: 'quad', area: 'layouts', title: 'Signal grid', order: 30, data: QUAD_TREE }
  ])
}
