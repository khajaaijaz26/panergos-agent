import assert from 'node:assert/strict'
import test from 'node:test'

function event() {
  const listeners = []
  return {
    addListener(listener) { listeners.push(listener) },
    emit(...args) { for (const listener of [...listeners]) listener(...args) },
  }
}

function element() {
  const listeners = new Map()
  return {
    dataset: {}, focused: false, hidden: false, value: '', textContent: '',
    addEventListener(name, listener) { listeners.set(name, listener) },
    append() {}, focus() { this.focused = true }, querySelector() { return element() }, replaceChildren() {}, setAttribute() {},
    emit(name, value = {}) { return listeners.get(name)?.(value) },
  }
}

async function loadSidepanel({ activeTab = null, permissionGranted = true } = {}) {
  const elements = new Map()
  const permissionRequests = []
  const ports = []
  const tabQueries = []
  globalThis.location = { origin: 'chrome-extension://test-extension' }
  globalThis.document = {
    addEventListener() {},
    createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element())
      return elements.get(id)
    },
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { clipboard: { async writeText() {} } },
  })
  globalThis.chrome = {
    permissions: {
      async contains() { return true },
      async request(request) {
        permissionRequests.push(request)
        return permissionGranted
      },
    },
    runtime: {
      connect() {
        const port = { messages: [], onDisconnect: event(), onMessage: event() }
        port.postMessage = message => port.messages.push(message)
        ports.push(port)
        return port
      },
    },
    tabs: {
      async create() {},
      async query(query) {
        tabQueries.push(query)
        return activeTab ? [activeTab] : []
      },
    },
  }

  await import(`../src/sidepanel.js?test=${Date.now()}`)
  return { elements, permissionRequests, ports, tabQueries }
}

test('queues a pairing command while reconnecting the service-worker port', async () => {
  const { elements, ports } = await loadSidepanel()
  assert.equal(ports.length, 1)
  ports[0].onMessage.emit({ type: 'state', state: { paired: false } })
  ports[0].onDisconnect.emit()

  elements.get('api-base').value = 'http://127.0.0.1:8642'
  elements.get('pairing-code').value = 'ABCDEF-ABCDEFGH'
  await elements.get('connect-button').emit('click')
  await new Promise(resolve => setTimeout(resolve, 150))

  assert.equal(ports.length, 2)
  assert.deepEqual(ports[1].messages, [])
  ports[1].onMessage.emit({ type: 'state', state: { paired: false } })
  assert.deepEqual(ports[1].messages, [{
    type: 'connect', apiBase: 'http://127.0.0.1:8642', pairingCode: 'ABCDEF-ABCDEFGH',
  }])
})

test('paired settings hide setup and only offer reconnect while offline', async () => {
  const { elements, ports } = await loadSidepanel()

  ports[0].onMessage.emit({ type: 'state', state: { connected: true, paired: true } })
  assert.equal(elements.get('pairing-setup').hidden, true)
  assert.equal(elements.get('connect-button').hidden, true)
  assert.equal(elements.get('disconnect-button').hidden, false)
  assert.equal(elements.get('settings-title').textContent, 'Browser paired')

  ports[0].onMessage.emit({ type: 'state', state: { connected: false } })
  assert.equal(elements.get('pairing-setup').hidden, true)
  assert.equal(elements.get('connect-button').hidden, false)
  assert.equal(elements.get('connect-button').textContent, 'Reconnect')
})

test('clears an accepted goal but preserves failed submissions and newer drafts', async () => {
  const { elements, ports } = await loadSidepanel()
  const goal = elements.get('goal')
  ports[0].onMessage.emit({
    type: 'state',
    state: {
      connected: true, paired: true, runId: null, runStatus: 'idle', timeline: [],
      currentTab: { title: 'Example', url: 'https://example.com' },
    },
  })

  goal.value = 'open youtube'
  elements.get('run-button').emit('click')
  assert.equal(goal.value, 'open youtube')
  assert.deepEqual(ports[0].messages, [{ type: 'run.start', prompt: 'open youtube', includePage: true }])

  ports[0].onMessage.emit({ type: 'state', state: { runId: null, runStatus: 'queued', timeline: [] } })
  assert.equal(goal.value, 'open youtube')
  ports[0].onDisconnect.emit()
  await new Promise(resolve => setTimeout(resolve, 150))
  ports[1].onMessage.emit({
    type: 'state',
    state: { connected: true, paired: true, runId: null, runStatus: 'failed', timeline: [] },
  })
  assert.equal(goal.value, 'open youtube')

  elements.get('run-button').emit('click')
  goal.value = 'my next goal'
  ports[1].onMessage.emit({
    type: 'state',
    state: { runId: 'run_accepted', runStatus: 'running', timeline: [] },
  })
  assert.equal(goal.value, 'my next goal')

  ports[1].onMessage.emit({ type: 'state', state: { runId: 'run_accepted', runStatus: 'completed' } })
  elements.get('run-button').emit('click')
  ports[1].onMessage.emit({
    type: 'state',
    state: { runId: 'run_next', runStatus: 'running', timeline: [] },
  })
  assert.equal(goal.value, '')
})

test('Run goal requests exact page access once, binds it, then starts exactly once', async () => {
  const activeTab = { id: 7, title: 'Example', url: 'https://example.com/watch?v=1' }
  const { elements, permissionRequests, ports, tabQueries } = await loadSidepanel({ activeTab })
  ports[0].onMessage.emit({
    type: 'state',
    state: { connected: true, paired: true, currentTab: null, runStatus: 'idle', timeline: [] },
  })
  elements.get('goal').value = 'open youtube'

  await elements.get('run-button').emit('click')
  await elements.get('run-button').emit('click')

  assert.deepEqual(tabQueries, [{ active: true, lastFocusedWindow: true }])
  assert.deepEqual(permissionRequests, [{ origins: ['https://example.com/*'] }])
  assert.deepEqual(ports[0].messages, [{ type: 'scope.use', tabId: 7 }])
  assert.equal(elements.get('goal').value, 'open youtube')

  const bound = { currentTab: { title: activeTab.title, url: activeTab.url } }
  ports[0].onMessage.emit({ type: 'state', state: bound })
  ports[0].onMessage.emit({ type: 'state', state: bound })

  assert.deepEqual(ports[0].messages, [
    { type: 'scope.use', tabId: 7 },
    { type: 'run.start', prompt: 'open youtube', includePage: true },
  ])
  assert.equal(elements.get('goal').value, 'open youtube')
})

test('Run goal preserves the prompt and does not bind or run when page access is denied', async () => {
  const activeTab = { id: 7, title: 'Example', url: 'https://example.com/private' }
  const { elements, permissionRequests, ports } = await loadSidepanel({
    activeTab, permissionGranted: false,
  })
  ports[0].onMessage.emit({
    type: 'state',
    state: { connected: true, paired: true, currentTab: null, runStatus: 'idle', timeline: [] },
  })
  elements.get('goal').value = 'keep this goal'

  await elements.get('run-button').emit('click')

  assert.deepEqual(permissionRequests, [{ origins: ['https://example.com/*'] }])
  assert.deepEqual(ports[0].messages, [])
  assert.equal(elements.get('goal').value, 'keep this goal')
  assert.equal(elements.get('error-banner').textContent, 'Access to example.com was not granted.')
})
