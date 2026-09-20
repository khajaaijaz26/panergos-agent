// Single source of truth for built-in personality names on the desktop.
// Mirrors panergos_cli/personality.py BUILTIN_PERSONALITIES — the backend
// single owner. Keep in sync when a built-in is added there.
export const BUILTIN_PERSONALITIES = [
  'helpful',
  'concise',
  'technical',
  'creative',
  'teacher',
  'pirate',
  'shakespeare',
  'surfer',
  'noir',
  'philosopher',
  'hype'
]

// Accepted only while reading older saved configs. These values normalize to
// the neutral profile and are never included in menus or completion data.
export const RETIRED_PERSONALITIES = new Set(['kawaii', 'catgirl', 'uwu'])
