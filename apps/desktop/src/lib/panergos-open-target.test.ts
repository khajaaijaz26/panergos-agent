import { describe, expect, it } from 'vitest'

import {
  normalizePanergosOpenString,
  pathFromOpenDeepLink,
  pathFromPanergosDeepLink,
  resolvePanergosOpenPath
} from './panergos-open-target'

describe('normalizePanergosOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizePanergosOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizePanergosOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped panergos:// deep links to the same path', () => {
    expect(normalizePanergosOpenString('panergos://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizePanergosOpenString('panergos://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps panergos://open/… deep links by stripping the open host', () => {
    expect(normalizePanergosOpenString('panergos://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizePanergosOpenString('panergos://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved panergos kinds and unsafe paths', () => {
    expect(normalizePanergosOpenString('panergos://blueprint/morning-brief')).toBeNull()
    expect(normalizePanergosOpenString('panergos://plugin/install')).toBeNull()
    expect(normalizePanergosOpenString('https://example.com/x')).toBeNull()
    expect(normalizePanergosOpenString('/../etc/passwd')).toBeNull()
    expect(normalizePanergosOpenString('index-network')).toBeNull()
  })
})

describe('resolvePanergosOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolvePanergosOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolvePanergosOpenPath({ href: 'panergos://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromPanergosDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromPanergosDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from panergos://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromPanergosDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromPanergosDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromPanergosDeepLink('plugin', 'install')).toBeNull()
  })
})
