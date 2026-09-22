import assert from 'node:assert/strict'
import test from 'node:test'

import { AUTH_STORAGE_KEY, IDENTITY_STORAGE_KEY, SCOPE_STORAGE_KEY } from '../src/protocol.js'

function event() {
  const listeners = []
  return {
    addListener(listener) { listeners.push(listener) },
    removeListener(listener) {
      const index = listeners.indexOf(listener)
      if (index >= 0) listeners.splice(index, 1)
    },
    emit(...args) { for (const listener of [...listeners]) listener(...args) },
  }
}

function storageArea(data) {
  return {
    async get(key) { return { [key]: data[key] } },
    async set(values) { Object.assign(data, values) },
    async remove(key) { delete data[key] },
  }
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail(message)
}

test('service worker pairs with a session-only token and publishes the side-panel state contract', async t => {
  const serverSessionId = `extension_${'b'.repeat(32)}`
  const local = {}
  const session = {}
  const runtimeConnect = event()
  const tabsUpdated = event()
  const requests = []
  const sockets = []
  const networkRuleUpdates = []
  let runAdmissions = 0
  let firstRunId = null
  let queuedRunId = null
  let releaseQueuedAdmission = null
  let releaseControllerReady = null
  let tabResult = null
  let releaseNetworkGuard = null

  globalThis.chrome = {
    runtime: {
      getURL: () => `chrome-extension://${'a'.repeat(32)}/`,
      onConnect: runtimeConnect,
      onInstalled: event(),
    },
    storage: { local: storageArea(local), session: storageArea(session) },
    declarativeNetRequest: {
      async updateSessionRules(update) {
        networkRuleUpdates.push(structuredClone(update))
        if (update.addRules.length && !releaseNetworkGuard) {
          await new Promise(resolve => { releaseNetworkGuard = resolve })
        }
      },
    },
    permissions: { contains: async () => true },
    tabs: {
      get: async () => {
        if (tabResult) return tabResult
        throw new Error('no bound tab')
      },
      onUpdated: tabsUpdated, onRemoved: event(),
    },
    sidePanel: { setPanelBehavior: async () => {} },
  }

  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname
    requests.push({ path, options })
    if (path === '/v1/browser-extension/pair/exchange') {
      return Response.json({
        access_token: 'pxe_restricted-test-token', token_type: 'Bearer',
        expires_in_seconds: 28_800, scope: ['capabilities:read'],
        origin: `chrome-extension://${'a'.repeat(32)}`,
        session_id: serverSessionId,
      })
    }
    if (path === '/v1/capabilities') {
      return Response.json({ features: {
        run_submission: true, run_events_sse: true, session_resources: true,
        browser_extension_control: {
          enabled: true, protocol_version: 1, capabilities: ['controller.noop'],
        },
      } })
    }
    if (path.startsWith('/api/sessions/') && options.method !== 'POST') {
      return Response.json({ error: { message: 'missing' } }, { status: 404 })
    }
    if (path === '/api/sessions') return Response.json({ session: { id: 'created' } }, { status: 201 })
    if (path === '/v1/browser-control/register') {
      return Response.json({
        ticket: 'ticket_12345678901234567890', ws_path: '/v1/browser-control/ws',
        scope: { capabilities: ['controller.noop'] },
      }, { status: 201 })
    }
    if (path === '/v1/runs' && options.method === 'POST') {
      runAdmissions += 1
      const body = JSON.parse(options.body)
      assert.match(body.run_id, /^run_[0-9a-f]{32}$/)
      firstRunId ||= body.run_id
      if (runAdmissions === 1) throw new TypeError('simulated lost response')
      if (runAdmissions === 3) {
        queuedRunId = body.run_id
        return new Promise(resolve => {
          releaseQueuedAdmission = () => resolve(Response.json({ run_id: queuedRunId }, { status: 202 }))
        })
      }
      return Response.json({ run_id: body.run_id }, { status: 202 })
    }
    if (path === `/v1/runs/${firstRunId}/events`) {
      const events = [
        { event: 'message.delta', run_id: firstRunId, delta: 'First line\n' },
        { event: 'run.completed', run_id: firstRunId, output: 'First line\nSecond line' },
        { event: 'message.delta', run_id: firstRunId, delta: '\nlate unsafe delta' },
      ].map(value => `data: ${JSON.stringify(value)}\n\n`).join('')
      return new Response(events, { headers: { 'Content-Type': 'text/event-stream' } })
    }
    if (path === `/v1/runs/${queuedRunId}/stop` && options.method === 'POST') {
      return Response.json({ run_id: queuedRunId, status: 'cancelled' })
    }
    if (path === '/v1/browser-extension/token' && options.method === 'DELETE') {
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${path}`)
  }

  globalThis.WebSocket = class FakeWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 3

    constructor(url, protocols) {
      this.url = url
      this.protocols = protocols
      this.protocol = protocols[0]
      this.readyState = FakeWebSocket.CONNECTING
      this.events = new Map()
      this.sent = []
      sockets.push(this)
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN
        this.emit('open', {})
        releaseControllerReady = () => this.emit('message', { data: JSON.stringify({
          method: 'browser.controller.ready', params: { protocol_version: 1 },
        }) })
      })
    }

    addEventListener(name, listener) {
      const listeners = this.events.get(name) || []
      listeners.push(listener)
      this.events.set(name, listeners)
    }

    emit(name, value) {
      for (const listener of this.events.get(name) || []) listener(value)
    }

    send(value) {
      const frame = JSON.parse(value)
      this.sent.push(frame)
      if (frame.method === 'browser.controller.heartbeat') {
        queueMicrotask(() => this.emit('message', { data: JSON.stringify({
          method: frame.method, params: { ...frame.params, ok: true },
        }) }))
      }
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED
      queueMicrotask(() => this.emit('close', {}))
    }
  }

  await import(`../src/background.js?test=${Date.now()}`)
  const messages = []
  const port = {
    name: 'panergos-sidepanel',
    postMessage(message) { messages.push(message) },
    onDisconnect: event(),
    onMessage: event(),
  }
  t.after(() => port.onMessage.emit({ type: 'disconnect' }))
  runtimeConnect.emit(port)
  await waitFor(() => local[IDENTITY_STORAGE_KEY], 'worker did not initialize its stable identity')

  port.onMessage.emit({
    type: 'connect', apiBase: 'http://127.0.0.1:8642', pairingCode: 'ABCDEF-ABCDEFGH',
  })
  await waitFor(() => releaseControllerReady, 'controller socket did not open')
  assert.equal(messages.some(message => message.type === 'state' && message.state.connected), false)
  releaseControllerReady()
  await waitFor(
    () => messages.some(message => message.type === 'state' && message.state.connected),
    'worker did not publish a connected state',
  )

  const connected = messages.findLast(message => message.type === 'state' && message.state.connected).state
  assert.deepEqual(Object.keys(connected).sort(), [
    'apiBase', 'approval', 'connected', 'currentTab', 'error', 'extensionOrigin', 'output',
    'paired', 'phase', 'runId', 'runStatus', 'sessionId', 'timeline',
  ])
  assert.equal(connected.extensionOrigin, `chrome-extension://${'a'.repeat(32)}`)
  assert.equal(connected.sessionId, serverSessionId)
  assert.equal(session[AUTH_STORAGE_KEY].token, 'pxe_restricted-test-token')
  assert.equal(session[AUTH_STORAGE_KEY].sessionId, serverSessionId)
  assert.doesNotMatch(JSON.stringify(local), /restricted-test-token/)
  assert.match(local[IDENTITY_STORAGE_KEY].controllerId, /^controller_/)
  assert.equal('sessionId' in local[IDENTITY_STORAGE_KEY], false)

  assert.equal(sockets.length, 1)
  assert.equal(sockets[0].url, 'ws://127.0.0.1:8642/v1/browser-control/ws')
  assert.deepEqual(sockets[0].protocols, [
    'panergos-browser-control-v1',
    'panergos-browser-control-ticket.ticket_12345678901234567890',
  ])
  assert.doesNotMatch(sockets[0].url, /ticket|pxe_/)
  const registration = requests.find(request => request.path === '/v1/browser-control/register')
  assert.equal(JSON.parse(registration.options.body).session_id, serverSessionId)

  tabResult = { id: 9, title: 'Metadata', url: 'http://169.254.169.254/latest/meta-data/' }
  port.onMessage.emit({ type: 'scope.use', tabId: 9 })
  await waitFor(
    () => messages.some(message => message.type === 'state' && /cannot be controlled/.test(message.state.error || '')),
    'worker did not reject a private page scope',
  )
  assert.equal(session[SCOPE_STORAGE_KEY], undefined)
  assert.equal(messages.findLast(message => message.type === 'state').state.currentTab, null)

  tabResult = { id: 9, title: 'Public plans', url: 'https://example.com/plans' }
  port.onMessage.emit({ type: 'scope.use', tabId: 9 })
  await waitFor(() => releaseNetworkGuard, 'worker did not install the redirect guard before binding the tab')
  const guardUpdate = networkRuleUpdates.at(-1)
  assert.deepEqual(
    guardUpdate.removeRuleIds,
    Array.from({ length: 23 }, (_, index) => 61_001 + index),
  )
  assert.equal(guardUpdate.addRules.length, 23)
  assert.ok(guardUpdate.addRules.every(rule => (
    rule.action.type === 'block'
      && rule.condition.isUrlFilterCaseSensitive === false
      && JSON.stringify(rule.condition.tabIds) === '[9]'
      && rule.condition.resourceTypes === undefined
  )))
  const guardedUrl = url => guardUpdate.addRules.some(
    rule => new RegExp(rule.condition.regexFilter, 'i').test(url),
  )
  for (const url of [
    'http://127.0.0.1/admin',
    'http://10.20.30.40/',
    'http://100.64.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://172.16.0.1/',
    'http://192.168.0.1/',
    'http://192.0.2.1/',
    'http://192.88.99.1/',
    'http://198.18.0.1/',
    'http://198.51.100.1/',
    'http://203.0.113.1/',
    'http://224.0.0.1/',
    'http://metadata.google.internal/',
    'http://metadata.google.internal./',
    'http://localhost./',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[fed0::1]/',
    'http://[ff02::1]/',
    'http://[64:ff9b::192.0.2.1]/',
    'http://[100::1]/',
    'http://[2001::1]/',
    'http://[2001:2::1]/',
    'http://[2001:db8::1]/',
    'http://[2002::1]/',
    'http://[3fff::1]/',
  ]) assert.equal(guardedUrl(url), true, url)
  assert.equal(guardedUrl('https://example.com/plans'), false)
  assert.equal(session[SCOPE_STORAGE_KEY], undefined)
  assert.equal(messages.findLast(message => message.type === 'state').state.currentTab, null)
  releaseNetworkGuard()
  releaseNetworkGuard = null
  await waitFor(() => session[SCOPE_STORAGE_KEY]?.tabId === 9, 'worker bound the tab before its redirect guard')
  assert.deepEqual(session[SCOPE_STORAGE_KEY], { tabId: 9, origin: 'https://example.com' })
  assert.equal(messages.findLast(message => message.type === 'state').state.currentTab.url, 'https://example.com/plans')

  tabResult = { id: 9, title: 'Pricing', url: 'https://example.com/pricing?team=1' }
  tabsUpdated.emit(9)
  await waitFor(
    () => messages.findLast(message => message.type === 'state').state.currentTab?.url === tabResult.url,
    'same-origin navigation did not retain the selected tab',
  )
  assert.deepEqual(session[SCOPE_STORAGE_KEY], { tabId: 9, origin: 'https://example.com' })

  tabResult = { id: 9, title: 'Other site', url: 'https://example.org/' }
  tabsUpdated.emit(9)
  await waitFor(
    () => !session[SCOPE_STORAGE_KEY]
      && /different site/.test(messages.findLast(message => message.type === 'state').state.error || ''),
    'cross-origin navigation did not clear the selected tab and request confirmation',
  )
  assert.equal(messages.findLast(message => message.type === 'state').state.currentTab, null)

  port.onMessage.emit({ type: 'run.start', prompt: 'Complete the goal', includePage: false })
  await waitFor(
    () => messages.some(message => message.type === 'state' && message.state.runStatus === 'completed'),
    'worker did not stream the run to completion',
  )
  const completed = messages.findLast(
    message => message.type === 'state' && message.state.runStatus === 'completed',
  ).state
  assert.equal(completed.output, 'First line\nSecond line')
  const admissions = requests.filter(request => request.path === '/v1/runs')
  assert.equal(admissions.length, 2)
  assert.deepEqual(JSON.parse(admissions[0].options.body), {
    input: 'Complete the goal', session_id: serverSessionId, run_id: firstRunId,
  })
  assert.equal(
    new Headers(admissions[0].options.headers).get('Idempotency-Key'),
    new Headers(admissions[1].options.headers).get('Idempotency-Key'),
  )

  port.onMessage.emit({ type: 'run.start', prompt: 'Stop during admission', includePage: false })
  await waitFor(() => releaseQueuedAdmission, 'second run did not enter queued admission')
  port.onMessage.emit({ type: 'run.stop' })
  await waitFor(
    () => messages.some(message => message.type === 'state' && message.state.runStatus === 'stopping'),
    'Stop did not immediately close the queued controller gate',
  )
  releaseQueuedAdmission()
  await waitFor(
    () => messages.some(message => message.type === 'state' && message.state.runStatus === 'cancelled'),
    'queued admission was not cancelled after receiving its run ID',
  )
  assert.ok(requests.some(request => (
    request.path === `/v1/runs/${queuedRunId}/stop` && request.options.method === 'POST'
  )))

  const authenticated = requests.filter(request => !request.path.endsWith('/pair/exchange'))
  assert.ok(authenticated.length >= 6)
  for (const request of authenticated) {
    const headers = new Headers(request.options.headers)
    assert.equal(headers.get('Authorization'), 'Bearer pxe_restricted-test-token')
    assert.equal(headers.get('X-Panergos-Extension-Origin'), `chrome-extension://${'a'.repeat(32)}`)
  }

  port.onMessage.emit({ type: 'disconnect' })
  await waitFor(() => !session[AUTH_STORAGE_KEY], 'disconnect did not forget the session credential')
  await waitFor(
    () => networkRuleUpdates.at(-1)?.addRules.length === 0,
    'disconnect did not remove the tab-scoped redirect guard',
  )
})
