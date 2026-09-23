import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONTROLLER_CAPABILITIES,
  bindControllerTab,
  cancelControllerCommand,
  clearControllerTab,
  executeControllerCommand,
  isHighImpactControlLabel,
  isPublicHttpUrl,
  isSecretLookingText,
  isSensitiveFieldMetadata,
} from '../src/controller.js'

test('controller accepts public pages and rejects protected or private targets', () => {
  assert.equal(isPublicHttpUrl('https://example.com/work'), true)
  for (const url of [
    'chrome://settings',
    'file:///tmp/secret',
    'http://localhost/admin',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/',
    'http://192.88.99.1/',
    'http://[::1]/',
    'http://[64:ff9b::1]/',
    'http://[100::1]/',
    'http://[2002::1]/',
    'http://[3fff::1]/',
    'https://metadata.google.internal/',
    `https://example.com/?api_key=${'x'.repeat(24)}`,
    `https://example.com/callback#access_token=${'x'.repeat(24)}`,
    `https://example.com/${`sk-${'x'.repeat(30)}`}`,
  ]) assert.equal(isPublicHttpUrl(url), false, url)

  assert.equal(CONTROLLER_CAPABILITIES.includes('browser_evaluate'), false)
  assert.equal(CONTROLLER_CAPABILITIES.includes('browser_cdp'), false)
  assert.equal(CONTROLLER_CAPABILITIES.includes('browser_tabs'), false)
})

test('controller identifies fields and controls that require the human', () => {
  assert.equal(isSensitiveFieldMetadata({ type: 'password' }), true)
  assert.equal(isSensitiveFieldMetadata({ autocomplete: 'one-time-code' }), true)
  assert.equal(isSensitiveFieldMetadata({ label: 'Card security code' }), true)
  assert.equal(isSensitiveFieldMetadata({ type: 'text', label: 'Project name' }), false)
  assert.equal(isHighImpactControlLabel('Place order'), true)
  assert.equal(isHighImpactControlLabel('Delete account'), true)
  assert.equal(isHighImpactControlLabel('Open details'), false)
  for (const secret of [
    `sk-${'x'.repeat(30)}`,
    `Authorization: Bearer ${'x'.repeat(32)}`,
    `api_key=${'x'.repeat(32)}`,
    '-----BEGIN PRIVATE KEY-----\nnot-a-real-key',
    `eyJ${'a'.repeat(16)}.${'b'.repeat(16)}.${'c'.repeat(8)}`,
    'postgres://user:password@example.com/database',
  ]) assert.equal(isSecretLookingText(secret), true, secret)
  assert.equal(isSecretLookingText('Draft the public launch announcement.'), false)
})

test('controller refuses sensitive typing and consequential clicks before page mutation', async () => {
  const calls = []
  const api = {
    permissions: { contains: async () => true },
    scripting: {
      executeScript: async ({ func, args }) => {
        calls.push({ name: func.name, args })
        if (func.name === 'inspectOrTypeRef') {
          return [{ result: {
            ok: true, type: 'password', autocomplete: '', label: 'Password', fingerprint: 'same',
          } }]
        }
        if (func.name === 'inspectLinkRef') {
          return [{ result: {
            ok: true, target_url: '', opens_new_context: false, in_form: false,
            is_link: false, element_kind: 'button:', label: 'Place order', fingerprint: 'same',
          } }]
        }
        throw new Error('mutation should not run')
      },
    },
    tabs: {
      get: async () => ({ id: 7, status: 'complete', url: 'https://example.com/' }),
      update: async () => ({ id: 7 }),
    },
  }
  bindControllerTab(7, 'https://example.com')
  await assert.rejects(
    executeControllerCommand({
      command_id: 'c'.repeat(32), action: 'browser_type',
      arguments: { ref: '@e1', text: 'never-forward-this-secret' },
    }, api),
    error => error.code === 'approval_required',
  )
  await assert.rejects(
    executeControllerCommand({
      command_id: 'd'.repeat(32), action: 'browser_click', arguments: { ref: '@e2' },
    }, api),
    error => error.code === 'approval_required',
  )
  await assert.rejects(
    executeControllerCommand({
      command_id: 'e'.repeat(32), action: 'browser_navigate',
      arguments: { url: 'https://example.com/transfer-money' },
    }, api),
    error => error.code === 'approval_required',
  )
  assert.deepEqual(calls, [
    { name: 'inspectOrTypeRef', args: ['https://example.com', 'e1', null, null] },
    { name: 'inspectLinkRef', args: ['https://example.com', 'e2', null] },
  ])
  clearControllerTab()
})

test('controller refuses secret-looking text before inspecting or mutating the page', async () => {
  let touchedPage = false
  const api = {
    permissions: { contains: async () => true },
    scripting: { executeScript: async () => { touchedPage = true } },
    tabs: {
      get: async () => { touchedPage = true },
      update: async () => { touchedPage = true },
    },
  }
  bindControllerTab(8, 'https://example.com')
  await assert.rejects(
    executeControllerCommand({
      command_id: '0'.repeat(32), action: 'browser_type',
      arguments: { ref: '@e1', text: `api_key=${'x'.repeat(32)}` },
    }, api),
    error => error.code === 'approval_required',
  )
  assert.equal(touchedPage, false)
  clearControllerTab()
})

test('controller fails closed on forms, ambiguous controls, and Enter', async () => {
  let scenario = 'form'
  let mutated = false
  const api = {
    permissions: { contains: async () => true },
    scripting: {
      executeScript: async ({ func }) => {
        if (func.name !== 'inspectLinkRef') {
          mutated = true
        }
        return [{ result: {
          ok: true, target_url: '', opens_new_context: false,
          in_form: scenario === 'form', is_link: false, element_kind: 'button:',
          label: scenario === 'form' ? 'Continue' : 'Proceed', fingerprint: scenario,
        } }]
      },
    },
    tabs: {
      get: async () => ({ id: 11, status: 'complete', url: 'https://example.com/' }),
      update: async () => ({ id: 11 }),
    },
  }
  bindControllerTab(11, 'https://example.com')
  await assert.rejects(
    executeControllerCommand({
      command_id: '1'.repeat(32), action: 'browser_click', arguments: { ref: '@e1' },
    }, api),
    error => error.code === 'approval_required',
  )
  scenario = 'ambiguous'
  await assert.rejects(
    executeControllerCommand({
      command_id: '2'.repeat(32), action: 'browser_click', arguments: { ref: '@e2' },
    }, api),
    error => error.code === 'approval_required',
  )
  await assert.rejects(
    executeControllerCommand({
      command_id: '3'.repeat(32), action: 'browser_press', arguments: { key: 'Enter' },
    }, api),
    error => error.code === 'approval_required',
  )
  assert.equal(mutated, false)
  clearControllerTab()
})

test('controller revalidates an anchor then uses native tab navigation', async () => {
  let currentUrl = 'https://example.com/start'
  const inspections = []
  const updates = []
  const metadata = {
    ok: true,
    target_url: 'https://example.com/docs',
    opens_new_context: false,
    in_form: false,
    is_link: true,
    element_kind: 'a:',
    label: 'Read more',
    fingerprint: 'stable-link',
  }
  const api = {
    permissions: { contains: async () => true },
    scripting: {
      executeScript: async ({ func, args }) => {
        assert.doesNotMatch(func.toString(), /\.\s*click\s*\(/)
        inspections.push({ name: func.name, args })
        return [{ result: metadata }]
      },
    },
    tabs: {
      get: async () => ({ id: 12, status: 'complete', url: currentUrl }),
      update: async (_id, change) => {
        updates.push(change)
        if (change.url) currentUrl = change.url
        return { id: 12, status: 'complete', url: currentUrl }
      },
    },
  }
  bindControllerTab(12, 'https://example.com')
  const result = await executeControllerCommand({
    command_id: '4'.repeat(32), action: 'browser_click', arguments: { ref: '@e1' },
  }, api)
  assert.deepEqual(inspections, [
    { name: 'inspectLinkRef', args: ['https://example.com', 'e1', null] },
    { name: 'inspectLinkRef', args: ['https://example.com', 'e1', 'stable-link'] },
  ])
  assert.deepEqual(updates, [{ url: 'https://example.com/docs' }])
  assert.deepEqual(result, {
    success: true, clicked: '@e1', url: 'https://example.com/docs',
  })
  clearControllerTab()
})

test('controller preflights safe cross-origin navigation without touching the destination', async () => {
  let currentUrl = 'https://example.com/start'
  const permissionChecks = []
  const api = {
    permissions: { contains: async ({ origins }) => {
      permissionChecks.push(origins[0])
      return origins[0] === 'https://example.com/*'
    } },
    scripting: { executeScript: async () => [] },
    tabs: {
      get: async () => ({ id: 16, status: 'complete', url: currentUrl }),
      update: async (_id, change) => {
        currentUrl = change.url
        return { id: 16, status: 'loading', url: currentUrl }
      },
    },
  }
  bindControllerTab(16, 'https://example.com')
  const result = await executeControllerCommand({
    command_id: '9'.repeat(32), action: 'browser_navigate',
    arguments: { url: 'https://www.youtube.com/watch?v=abc#details' },
  }, api)
  assert.deepEqual(permissionChecks, ['https://example.com/*'])
  assert.deepEqual(result, {
    _cross_origin_navigation: {
      tab_id: 16,
      url: 'https://www.youtube.com/watch?v=abc#details',
      display_url: 'https://www.youtube.com/watch',
    },
  })
  assert.equal(currentUrl, 'https://example.com/start')

  currentUrl = 'https://example.com/start'
  const cancelledNavigation = executeControllerCommand({
    command_id: 'a'.repeat(32), action: 'browser_navigate',
    arguments: { url: 'https://www.youtube.com/' },
  }, api)
  assert.equal(cancelControllerCommand('a'.repeat(32)), true)
  await assert.rejects(cancelledNavigation, error => error.code === 'cancelled')
  assert.equal(currentUrl, 'https://example.com/start')
  clearControllerTab()
})

test('controller refuses a link that changes between inspection and navigation', async () => {
  let inspection = 0
  let navigated = false
  const api = {
    permissions: { contains: async () => true },
    scripting: {
      executeScript: async () => [{ result: {
        ok: true,
        target_url: ++inspection === 1 ? 'https://example.com/docs' : 'https://example.com/changed',
        opens_new_context: false,
        in_form: false,
        is_link: true,
        element_kind: 'a:',
        label: 'Read more',
        fingerprint: 'stable-link',
      } }],
    },
    tabs: {
      get: async () => ({ id: 13, status: 'complete', url: 'https://example.com/' }),
      update: async () => { navigated = true },
    },
  }
  bindControllerTab(13, 'https://example.com')
  await assert.rejects(
    executeControllerCommand({
      command_id: '5'.repeat(32), action: 'browser_click', arguments: { ref: '@e1' },
    }, api),
    error => error.code === 'page_action_failed',
  )
  assert.equal(navigated, false)
  clearControllerTab()
})

test('controller discards a screenshot if the active tab changes during capture', async () => {
  let activationListener
  let disruptCapture = false
  let listenerRemoved = false
  const dataUrl = `data:image/png;base64,${'a'.repeat(32)}`
  const api = {
    permissions: { contains: async () => true },
    scripting: { executeScript: async () => [] },
    tabs: {
      get: async () => ({ id: 14, windowId: 3, status: 'complete', url: 'https://example.com/' }),
      update: async () => ({ id: 14 }),
      query: async () => [{ id: 14 }],
      captureVisibleTab: async () => {
        if (disruptCapture) {
          activationListener({ tabId: 15, windowId: 3 })
          activationListener({ tabId: 14, windowId: 3 })
        }
        return dataUrl
      },
      onActivated: {
        addListener: listener => { activationListener = listener },
        removeListener: listener => { listenerRemoved = listener === activationListener },
      },
    },
  }
  bindControllerTab(14, 'https://example.com')
  const stable = await executeControllerCommand({
    command_id: '6'.repeat(32), action: 'browser_screenshot', arguments: {},
  }, api)
  assert.equal(stable.data_url, dataUrl)
  assert.equal(listenerRemoved, true)

  disruptCapture = true
  listenerRemoved = false
  await assert.rejects(
    executeControllerCommand({
      command_id: '7'.repeat(32), action: 'browser_screenshot', arguments: {},
    }, api),
    error => error.code === 'tab_unavailable',
  )
  assert.equal(listenerRemoved, true)
  clearControllerTab()
})

test('controller never acts on a bound protected page', async () => {
  let mutated = false
  const api = {
    permissions: { contains: async () => true },
    scripting: { executeScript: async () => { mutated = true } },
    tabs: {
      get: async () => ({ id: 9, status: 'complete', url: 'chrome://settings/' }),
      update: async () => { mutated = true },
    },
  }
  bindControllerTab(9, 'https://example.com')
  await assert.rejects(
    executeControllerCommand({ command_id: 'f'.repeat(32), action: 'browser_snapshot', arguments: {} }, api),
    error => error.code === 'blocked_url',
  )
  assert.equal(mutated, false)
  clearControllerTab()
})

test('controller never acts after the bound tab changes origin', async () => {
  let mutated = false
  const api = {
    permissions: { contains: async () => true },
    scripting: { executeScript: async () => { mutated = true } },
    tabs: {
      get: async () => ({ id: 10, status: 'complete', url: 'https://example.org/' }),
      update: async () => { mutated = true },
    },
  }
  bindControllerTab(10, 'https://example.com')
  await assert.rejects(
    executeControllerCommand({ command_id: '8'.repeat(32), action: 'browser_snapshot', arguments: {} }, api),
    error => error.code === 'origin_changed',
  )
  assert.equal(mutated, false)
  clearControllerTab()
})

test('controller cancels an in-flight native browser command', async () => {
  let started
  const didStart = new Promise(resolve => { started = resolve })
  const api = {
    permissions: { contains: async () => true },
    scripting: { executeScript: async () => [] },
    tabs: {
      get: async () => ({ id: 7, status: 'complete', url: 'https://example.com/' }),
      query: async () => [{ id: 7, status: 'complete', url: 'https://example.com/' }],
      update: () => {
        started()
        return new Promise(() => {})
      },
    },
  }
  const commandId = 'a'.repeat(32)
  clearControllerTab()
  await assert.rejects(
    executeControllerCommand({ command_id: 'b'.repeat(32), action: 'controller.noop', arguments: {} }, api),
    error => error.code === 'tab_unbound',
  )
  bindControllerTab(7, 'https://example.com')
  const pending = executeControllerCommand({
    command_id: commandId,
    action: 'browser_navigate',
    arguments: { url: 'https://example.com/next' },
  }, api)

  await didStart
  assert.equal(cancelControllerCommand(commandId), true)
  await assert.rejects(pending, error => error.code === 'cancelled')
  assert.equal(cancelControllerCommand(commandId), false)
  clearControllerTab()
})
