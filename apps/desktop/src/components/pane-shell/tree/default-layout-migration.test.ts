// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TREE_KEY = 'panergos.desktop.layoutTree.v2'
const PRESET_KEY = 'panergos.desktop.layoutPreset.active'

describe('default layout migration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it('moves the shipped default to Continuity once', async () => {
    const previous = { type: 'group', id: 'old-default', panes: ['workspace'], active: 'workspace' }
    window.localStorage.setItem(TREE_KEY, JSON.stringify(previous))
    window.localStorage.setItem(PRESET_KEY, 'default')

    const tree = await import('./store')
    const { group } = await import('./model')
    const continuity = group(['workspace', 'sessions'], { active: 'workspace', id: 'grp-main' })

    tree.declareDefaultTree(continuity)

    expect(tree.$layoutTree.get()).toEqual(continuity)
    expect(JSON.parse(window.localStorage.getItem(TREE_KEY)!)).toEqual(continuity)
    expect(window.localStorage.getItem('panergos.desktop.defaultLayoutVersion')).toBe('continuity-v1')
  })

  it('preserves a custom layout', async () => {
    const custom = { type: 'group', id: 'my-layout', panes: ['workspace'], active: 'workspace' }
    window.localStorage.setItem(TREE_KEY, JSON.stringify(custom))
    window.localStorage.setItem(PRESET_KEY, 'custom')

    const tree = await import('./store')
    const { group } = await import('./model')

    tree.declareDefaultTree(group(['workspace'], { active: 'workspace', id: 'grp-main' }))

    expect(tree.$layoutTree.get()).toEqual(custom)
  })

  it('keeps the Continuity layout flip affordance inert without root sidebars', async () => {
    const tree = await import('./store')
    const { DEFAULT_TREE } = await import('@/app/contrib/layout-presets')
    const layout = await import('@/store/layout')

    tree.declareDefaultTree(DEFAULT_TREE)

    expect(layout.$panesFlippable.get()).toBe(false)
    expect(layout.$panesFlipped.get()).toBe(false)

    layout.togglePanesFlipped()

    expect(layout.$panesFlipped.get()).toBe(false)
    expect(window.localStorage.getItem('panergos.desktop.panesFlipped')).not.toBe('true')
  })

  it('routes tab Close through pane stores in Continuity and side layouts', async () => {
    const tree = await import('./store')
    const { allPaneIds, group, split } = await import('./model')
    const { DEFAULT_TREE } = await import('@/app/contrib/layout-presets')
    const { registry } = await import('@/contrib/registry')
    const layout = await import('@/store/layout')

    const disposers = [
      registry.register({ area: 'panes', id: 'sessions', data: { placement: 'left' } }),
      registry.register({ area: 'panes', id: 'workspace', data: { placement: 'main', uncloseable: true } }),
      registry.register({ area: 'panes', id: 'files', data: { placement: 'right' } })
    ]

    try {
      tree.declareDefaultTree(DEFAULT_TREE)
      tree.bindPaneVisibility(
        'sessions',
        layout.$sidebarOpen,
        () => layout.setSidebarOpen(false),
        () => layout.setSidebarOpen(true)
      )
      tree.bindPaneVisibility(
        'files',
        layout.$fileBrowserOpen,
        () => layout.setFileBrowserOpen(false),
        () => layout.setFileBrowserOpen(true)
      )

      for (const [paneId, open] of [
        ['sessions', () => layout.setSidebarOpen(true)],
        ['files', () => layout.setFileBrowserOpen(true)]
      ] as const) {
        open()
        tree.noteActiveTreeGroup('grp-main')

        expect(tree.closeFocusedSessionTab()).toBe(true)
        expect(tree.$hiddenTreePanes.get()).toContain(paneId)
        expect(allPaneIds(tree.$layoutTree.get()!)).toContain(paneId)
      }

      tree.$layoutTree.set(
        split('row', [
          group(['sessions'], { id: 'grp-sessions' }),
          group(['workspace'], { id: 'grp-workspace' }),
          group(['files'], { id: 'grp-files' })
        ])
      )
      layout.setSidebarOpen(true)
      layout.setFileBrowserOpen(true)

      tree.closeTreePane('sessions')
      tree.closeTreePane('files')

      expect(tree.$collapsedTreeSides.get()).toEqual(new Set(['left', 'right']))
      expect(tree.$hiddenTreePanes.get()).toEqual(new Set(['sessions', 'files']))
    } finally {
      disposers.forEach(dispose => dispose())
    }
  })
})
