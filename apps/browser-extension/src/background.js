import {
  CONTROLLER_CAPABILITIES,
  ControllerActionError,
  bindControllerTab,
  cancelControllerCommand,
  clearControllerTab,
  executeControllerCommand,
  isPublicHttpUrl,
  serializeControllerError,
} from './controller.js'
import {
  AUTH_STORAGE_KEY,
  DEFAULT_API_BASE,
  IDENTITY_STORAGE_KEY,
  SCOPE_STORAGE_KEY,
  apiUrl,
  appendTimeline,
  browserTaskPrompt,
  controllableTab,
  controllerActionAllowed,
  createSseJsonParser,
  errorMessage,
  isExtensionSessionId,
  normalizeApiBase,
  pageOrigin,
  pageOriginPattern,
  websocketUrl,
} from './protocol.js'

const PAIR_EXCHANGE_PATH = '/v1/browser-extension/pair/exchange'
const TOKEN_PATH = '/v1/browser-extension/token'
const EXTENSION_ORIGIN_HEADER = 'X-Panergos-Extension-Origin'
const CONTROLLER_PROTOCOL = 'panergos-browser-control-v1'
const TICKET_PROTOCOL_PREFIX = 'panergos-browser-control-ticket.'
const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000, 8_000]
const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
const SAFE_APPROVAL_CHOICES = new Set(['deny', 'once'])
const MAX_OUTPUT_LENGTH = 250_000
const REQUEST_TIMEOUT_MS = 20_000
const SCOPE_RECONFIRM_ERROR = 'This tab moved to a different site. Choose Use this page again.'
const NETWORK_URL_PREFIX = '^https?://(?:[^/@]+@)?'
const NETWORK_URL_SUFFIX = '(?::[0-9]+)?(?:[/?#]|$)'
const networkGuardRule = (id, host) => ({ id, regexFilter: `${NETWORK_URL_PREFIX}${host}${NETWORK_URL_SUFFIX}` })
const NETWORK_GUARD_RULES = Object.freeze([
  {
    id: 61_001,
    regexFilter: '^https?://(?:[^/@]+@)?(?:[^./:@]+|(?:[^./:@]+\\.)*(?:localhost|local|internal|home|lan|corp|test|invalid|example))\\.?(?::[0-9]+)?(?:[/?#]|$)',
  },
  networkGuardRule(61_002, '(?:0|10|127)(?:\\.[0-9]{1,3}){3}'),
  networkGuardRule(61_003, '100\\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])(?:\\.[0-9]{1,3}){2}'),
  networkGuardRule(61_004, '169\\.254(?:\\.[0-9]{1,3}){2}'),
  networkGuardRule(61_005, '172\\.(?:1[6-9]|2[0-9]|3[01])(?:\\.[0-9]{1,3}){2}'),
  networkGuardRule(61_006, '192\\.168(?:\\.[0-9]{1,3}){2}'),
  networkGuardRule(61_007, '192\\.0\\.(?:0|2)\\.[0-9]{1,3}'),
  networkGuardRule(61_008, '192\\.88\\.99\\.[0-9]{1,3}'),
  networkGuardRule(61_009, '198\\.1[89](?:\\.[0-9]{1,3}){2}'),
  networkGuardRule(61_010, '198\\.51\\.100\\.[0-9]{1,3}'),
  networkGuardRule(61_011, '203\\.0\\.113\\.[0-9]{1,3}'),
  networkGuardRule(61_012, '(?:22[4-9]|2[3-4][0-9]|25[0-5])(?:\\.[0-9]{1,3}){3}'),
  networkGuardRule(61_013, '\\[::[0-9a-f:.]*\\]'),
  networkGuardRule(61_014, '\\[f[cd][0-9a-f]{2}:[0-9a-f:.]*\\]'),
  networkGuardRule(61_015, '\\[fe[89ab][0-9a-f]:[0-9a-f:.]*\\]'),
  networkGuardRule(61_016, '\\[fe[c-f][0-9a-f]:[0-9a-f:.]*\\]'),
  networkGuardRule(61_017, '\\[ff[0-9a-f]{2}:[0-9a-f:.]*\\]'),
  networkGuardRule(61_018, '\\[64:ff9b(?::1)?::[0-9a-f:.]*\\]'),
  networkGuardRule(61_019, '\\[100::[0-9a-f:.]*\\]'),
  networkGuardRule(61_020, '\\[2001::[0-9a-f:.]*\\]'),
  networkGuardRule(61_021, '\\[2001:(?:0|2|db8):[0-9a-f:.]*\\]'),
  networkGuardRule(61_022, '\\[2002:[0-9a-f:.]*\\]'),
  networkGuardRule(61_023, '\\[3fff:[0-9a-f:.]*\\]'),
])
const NETWORK_GUARD_RULE_IDS = NETWORK_GUARD_RULES.map(rule => rule.id)

const extensionUrl = new URL(chrome.runtime.getURL('/'))
const extensionOrigin = `${extensionUrl.protocol}//${extensionUrl.host}`
const ports = new Set()
let auth = null
let identity = null
let boundTabId = null
let boundTabOrigin = null
let controllerSocket = null
let controllerGeneration = 0
let negotiatedCapabilities = new Set()
let desiredConnected = false
let reconnectAttempt = 0
let reconnectTimer = null
let heartbeatTimer = null
let heartbeatNonce = null
let heartbeatSentAt = 0
let runAbort = null
let runAdmission = null
let runAdmissionId = null
let runAdmissionStopRequested = false
let bootstrapPromise = null
let guardedTabId = null
const cancelledControllerCommands = new Set()

const state = {
  phase: 'offline',
  connected: false,
  apiBase: DEFAULT_API_BASE,
  sessionId: null,
  runId: null,
  runStatus: 'idle',
  currentTab: null,
  timeline: [],
  output: '',
  approval: null,
  error: null,
  paired: false,
  extensionOrigin,
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function publicState() {
  return {
    ...state,
    currentTab: state.currentTab ? { title: state.currentTab.title, url: state.currentTab.url } : null,
    timeline: [...state.timeline],
    approval: state.approval ? { ...state.approval } : null,
  }
}

function broadcastState() {
  const message = { type: 'state', state: publicState() }
  for (const port of [...ports]) {
    try {
      port.postMessage(message)
    } catch {
      ports.delete(port)
    }
  }
}

function updateState(patch) {
  Object.assign(state, patch)
  broadcastState()
}

function addTimeline(item) {
  state.timeline = appendTimeline(state.timeline, { at: Date.now(), ...item })
  broadcastState()
}

function safeError(error, fallback = 'Panergos could not complete that request.') {
  const message = error instanceof Error ? error.message : String(error || fallback)
  return message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500) || fallback
}

function reportError(error, port) {
  const message = safeError(error)
  updateState({ error: message })
  try {
    port?.postMessage({ type: 'error', message })
  } catch {
    // The state broadcast is the durable error surface.
  }
}

function requestSignal(timeout = REQUEST_TIMEOUT_MS) {
  return AbortSignal.timeout(timeout)
}

async function responsePayload(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: `Panergos returned an invalid response (${response.status}).` }
  }
}

async function requestJson(path, { method = 'GET', json, headers: extraHeaders, signal } = {}, credential = auth) {
  if (!credential?.token) throw new Error('Pair this browser with Panergos first.')
  const headers = new Headers(extraHeaders)
  headers.set('Authorization', `${credential.tokenType} ${credential.token}`)
  headers.set(EXTENSION_ORIGIN_HEADER, extensionOrigin)
  if (json !== undefined) headers.set('Content-Type', 'application/json')
  const response = await fetch(apiUrl(credential.apiBase, path), {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal: signal || requestSignal(),
  })
  const payload = await responsePayload(response)
  if (!response.ok) throw new HttpError(response.status, errorMessage(payload, `Panergos request failed (${response.status}).`))
  return payload
}

async function ensureServerPermission(apiBase) {
  const origin = pageOriginPattern(apiBase)
  if (!await chrome.permissions.contains({ origins: [origin] })) {
    throw new Error('Server access was not granted. Connect again and approve the requested origin.')
  }
}

async function exchangePairingCode(apiBase, pairingCode) {
  const code = String(pairingCode || '').trim()
  if (!code || code.length > 1_024 || /\s/.test(code)) throw new Error('Enter a valid one-time pairing code.')
  const response = await fetch(apiUrl(apiBase, PAIR_EXCHANGE_PATH), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairing_code: code }),
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal: requestSignal(),
  })
  const payload = await responsePayload(response)
  if (!response.ok) throw new HttpError(response.status, errorMessage(payload, 'Pairing failed. Request a fresh code and retry.'))
  const token = payload?.access_token
  const tokenType = payload?.token_type
  const sessionId = payload?.session_id
  const lifetime = Number(payload?.expires_in_seconds)
  if (
    typeof token !== 'string' || !token || token.length > 8_192 || tokenType !== 'Bearer'
    || !isExtensionSessionId(sessionId) || !Number.isFinite(lifetime) || lifetime <= 0
    || payload?.origin !== extensionOrigin
  ) {
    throw new Error('Panergos returned an invalid pairing credential.')
  }
  const credential = {
    apiBase,
    token,
    tokenType,
    sessionId,
    expiresAt: Date.now() + lifetime * 1_000,
    scope: Array.isArray(payload.scope) ? payload.scope.filter(value => typeof value === 'string').slice(0, 100) : [],
  }
  await chrome.storage.session.set({ [AUTH_STORAGE_KEY]: credential })
  return credential
}

async function loadAuth() {
  const stored = (await chrome.storage.session.get(AUTH_STORAGE_KEY))[AUTH_STORAGE_KEY]
  if (!stored || typeof stored.token !== 'string' || stored.tokenType !== 'Bearer'
      || !isExtensionSessionId(stored.sessionId)) return null
  if (!Number.isFinite(stored.expiresAt) || stored.expiresAt <= Date.now() + 5_000) {
    await chrome.storage.session.remove(AUTH_STORAGE_KEY)
    return null
  }
  try {
    stored.apiBase = normalizeApiBase(stored.apiBase)
  } catch {
    await chrome.storage.session.remove(AUTH_STORAGE_KEY)
    return null
  }
  return stored
}

function validId(value, prefix) {
  return typeof value === 'string' && value.startsWith(prefix) && /^[A-Za-z0-9_-]{12,100}$/.test(value)
}

async function ensureIdentity() {
  const stored = (await chrome.storage.local.get(IDENTITY_STORAGE_KEY))[IDENTITY_STORAGE_KEY]
  if (
    validId(stored?.controllerId, 'controller_')
    && validId(stored?.browserProfileId, 'browser_')
  ) {
    const current = { controllerId: stored.controllerId, browserProfileId: stored.browserProfileId }
    await chrome.storage.local.set({ [IDENTITY_STORAGE_KEY]: current })
    return current
  }
  const next = {
    controllerId: `controller_${crypto.randomUUID()}`,
    browserProfileId: `browser_${crypto.randomUUID()}`,
  }
  await chrome.storage.local.set({ [IDENTITY_STORAGE_KEY]: next })
  return next
}

async function probeCapabilities() {
  const payload = await requestJson('/v1/capabilities')
  const features = payload?.features || {}
  const browser = features.browser_extension_control || {}
  if (features.run_submission !== true || features.run_events_sse !== true || features.session_resources !== true) {
    throw new Error('This Panergos server is missing the required run or session APIs. Update and restart it.')
  }
  if (browser.enabled !== true) {
    throw new Error('Browser extension control is disabled. Enable browser.extension_control.enabled and restart Panergos.')
  }
  if (browser.protocol_version !== 1) throw new Error('This Panergos browser-control protocol is not supported.')
  const serverCapabilities = new Set(Array.isArray(browser.capabilities) ? browser.capabilities : [])
  const capabilities = CONTROLLER_CAPABILITIES.filter(capability => serverCapabilities.has(capability))
  if (!capabilities.length) throw new Error('Panergos and this extension have no compatible browser actions.')
  return capabilities
}

async function ensureSession() {
  const path = `/api/sessions/${encodeURIComponent(identity.sessionId)}`
  try {
    await requestJson(path)
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error
    try {
      await requestJson('/api/sessions', {
        method: 'POST',
        json: { id: identity.sessionId, source: 'browser_extension' },
      })
    } catch (createError) {
      if (!(createError instanceof HttpError) || createError.status !== 409) throw createError
      await requestJson(path)
    }
  }
  updateState({ sessionId: identity.sessionId })
}

async function registerController(capabilities) {
  const registration = await requestJson('/v1/browser-control/register', {
    method: 'POST',
    json: {
      protocol_version: 1,
      session_id: identity.sessionId,
      controller_id: identity.controllerId,
      browser_profile_id: identity.browserProfileId,
      capabilities,
    },
  })
  const ticket = registration?.ticket
  const path = registration?.ws_path
  if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{20,512}$/.test(ticket)) {
    throw new Error('Panergos returned an invalid browser-control ticket.')
  }
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9/_-]+$/.test(path)) {
    throw new Error('Panergos returned an invalid browser-control WebSocket path.')
  }
  negotiatedCapabilities = new Set(
    Array.isArray(registration?.scope?.capabilities)
      ? registration.scope.capabilities.filter(capability => capabilities.includes(capability))
      : [],
  )
  if (!negotiatedCapabilities.size) throw new Error('Panergos did not grant any browser actions.')
  return { ticket, path }
}

function clearHeartbeat() {
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
  heartbeatTimer = null
  heartbeatNonce = null
  heartbeatSentAt = 0
}

function sendControllerFrame(socket, frame) {
  if (socket.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(frame))
  return true
}

function startHeartbeat(socket, generation) {
  clearHeartbeat()
  const beat = () => {
    if (generation !== controllerGeneration || socket !== controllerSocket) return
    if (heartbeatNonce && Date.now() - heartbeatSentAt > 45_000) {
      socket.close(4000, 'heartbeat timeout')
      return
    }
    heartbeatNonce = `${Date.now()}-${crypto.randomUUID().slice(0, 16)}`
    heartbeatSentAt = Date.now()
    sendControllerFrame(socket, {
      method: 'browser.controller.heartbeat',
      params: { nonce: heartbeatNonce },
    })
  }
  beat()
  heartbeatTimer = setInterval(beat, 20_000)
}

async function executeControllerFrame(socket, generation, params) {
  const commandId = params?.command_id
  const action = params?.action
  const expectedRunId = state.runId || runAdmissionId
  let ok = false
  let result
  try {
    if (cancelledControllerCommands.has(commandId)) throw new Error('Browser command was cancelled.')
    if (typeof action !== 'string' || !negotiatedCapabilities.has(action)) {
      throw new Error('The requested browser action was not negotiated.')
    }
    if (!controllerActionAllowed(action, expectedRunId, state.runStatus, params?.run_id)) {
      throw new Error('Browser actions require this extension to have an active Panergos run.')
    }
    if (action !== 'controller.noop') await refreshBoundTab(true)
    if (cancelledControllerCommands.has(commandId)) throw new Error('Browser command was cancelled.')
    if (generation !== controllerGeneration || socket !== controllerSocket
        || expectedRunId !== (state.runId || runAdmissionId)
        || !controllerActionAllowed(action, expectedRunId, state.runStatus, params?.run_id)) {
      clearControllerTab()
      throw new Error('The Panergos run changed before the browser action could start.')
    }
    result = await executeControllerCommand({ ...params, tabId: boundTabId })
    const navigation = result?._cross_origin_navigation
    if (navigation) {
      await clearBoundTab({ keepNetworkGuard: true })
      try {
        if (cancelledControllerCommands.has(commandId)
            || generation !== controllerGeneration || socket !== controllerSocket
            || expectedRunId !== (state.runId || runAdmissionId)
            || !controllerActionAllowed(action, expectedRunId, state.runStatus, params?.run_id)) {
          throw new ControllerActionError('cancelled', 'Command cancelled.')
        }
        await chrome.tabs.update(navigation.tab_id, { url: navigation.url })
      } catch (error) {
        await replaceNetworkGuard()
        throw error
      }
      result = {
        success: true,
        url: navigation.display_url,
        requires_confirmation: true,
        message: 'Opened the destination. Choose Use this page again before further browser actions.',
      }
      updateState({ error: SCOPE_RECONFIRM_ERROR })
    }
    ok = true
  } catch (error) {
    result = serializeControllerError(error)
  } finally {
    cancelledControllerCommands.delete(commandId)
  }
  if (generation !== controllerGeneration || socket !== controllerSocket) return
  sendControllerFrame(socket, {
    method: 'browser.controller.result',
    params: ok ? { command_id: commandId, ok: true, result } : { command_id: commandId, ok: false, error: result },
  })
}

function handleControllerMessage(socket, generation, raw) {
  if (generation !== controllerGeneration || socket !== controllerSocket || typeof raw !== 'string') return
  let frame
  try {
    frame = JSON.parse(raw)
  } catch {
    return
  }
  const params = frame?.params
  if (frame?.method === 'browser.controller.heartbeat' && params?.nonce === heartbeatNonce && params?.ok === true) {
    heartbeatNonce = null
    heartbeatSentAt = 0
    reconnectAttempt = 0
    return
  }
  if (frame?.method === 'browser.controller.cancel') {
    const commandId = params?.command_id
    if (!cancelControllerCommand(commandId) && typeof commandId === 'string' && /^[0-9a-f]{32}$/.test(commandId)) {
      cancelledControllerCommands.add(commandId)
      if (cancelledControllerCommands.size > 256) {
        cancelledControllerCommands.delete(cancelledControllerCommands.values().next().value)
      }
    }
    return
  }
  if (frame?.method === 'browser.controller.command') void executeControllerFrame(socket, generation, params)
}

function openControllerSocket(registration) {
  const generation = ++controllerGeneration
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      websocketUrl(auth.apiBase, registration.path),
      [CONTROLLER_PROTOCOL, `${TICKET_PROTOCOL_PREFIX}${registration.ticket}`],
    )
    let transportOpen = false
    let ready = false
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    }
    // No legacy WS-open fallback: that would recreate the pre-attach command race.
    const timeout = setTimeout(() => {
      if (!ready) {
        socket.close()
        fail(new Error('Panergos did not confirm browser-control readiness in time.'))
      }
    }, 10_000)

    socket.addEventListener('open', () => {
      if (generation !== controllerGeneration) {
        socket.close()
        return
      }
      if (socket.protocol !== CONTROLLER_PROTOCOL) {
        socket.close(1002, 'protocol mismatch')
        fail(new Error('Panergos selected an invalid browser-control protocol.'))
        return
      }
      transportOpen = true
    })
    socket.addEventListener('message', event => {
      if (!ready) {
        let frame
        try {
          frame = typeof event.data === 'string' ? JSON.parse(event.data) : null
        } catch {
          frame = null
        }
        if (
          !transportOpen || generation !== controllerGeneration
          || frame?.method !== 'browser.controller.ready' || frame?.params?.protocol_version !== 1
        ) {
          socket.close(1002, 'readiness protocol mismatch')
          fail(new Error('Panergos returned an invalid browser-control readiness frame.'))
          return
        }
        ready = true
        settled = true
        clearTimeout(timeout)
        controllerSocket = socket
        startHeartbeat(socket, generation)
        updateState({ connected: true, phase: 'ready', error: null, paired: true })
        resolve()
        return
      }
      handleControllerMessage(socket, generation, event.data)
    })
    socket.addEventListener('error', () => {
      if (!ready) fail(new Error('Browser-control connection failed.'))
    })
    socket.addEventListener('close', () => {
      clearTimeout(timeout)
      if (!ready) fail(new Error(
        transportOpen ? 'Browser-control connection closed before it was ready.' : 'Browser-control connection was refused.',
      ))
      if (generation === controllerGeneration) handleControllerClose(socket)
    })
  })
}

async function establishController() {
  await refreshBoundTab(false)
  const capabilities = await probeCapabilities()
  await ensureSession()
  const registration = await registerController(capabilities)
  await openControllerSocket(registration)
}

function handleControllerClose(socket) {
  if (socket !== controllerSocket) return
  controllerSocket = null
  clearControllerTab()
  clearHeartbeat()
  updateState({ connected: false, phase: desiredConnected ? 'reconnecting' : 'offline' })
  if (desiredConnected) scheduleReconnect()
}

function scheduleReconnect() {
  if (reconnectTimer !== null || !desiredConnected || !auth) return
  if (reconnectAttempt >= RECONNECT_DELAYS.length) {
    desiredConnected = false
    updateState({
      phase: 'offline',
      error: 'Panergos could not restore browser control after several attempts. Reconnect manually.',
    })
    return
  }
  const delay = RECONNECT_DELAYS[reconnectAttempt++]
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    try {
      await establishController()
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        await forgetAuth()
        desiredConnected = false
        updateState({ paired: false, phase: 'offline', error: 'Pairing expired. Request a fresh pairing code.' })
        return
      }
      scheduleReconnect()
    }
  }, delay)
}

function closeController() {
  controllerGeneration += 1
  clearControllerTab()
  clearHeartbeat()
  if (reconnectTimer !== null) clearTimeout(reconnectTimer)
  reconnectTimer = null
  const socket = controllerSocket
  controllerSocket = null
  if (socket?.readyState === WebSocket.OPEN) {
    sendControllerFrame(socket, { method: 'browser.controller.detach', params: {} })
    socket.close(1000, 'disconnect')
  } else {
    socket?.close()
  }
  state.connected = false
}

async function connect({ apiBase, pairingCode } = {}) {
  const base = normalizeApiBase(apiBase || auth?.apiBase || DEFAULT_API_BASE)
  await ensureServerPermission(base)
  desiredConnected = true
  reconnectAttempt = 0
  closeController()
  updateState({ phase: pairingCode ? 'pairing' : 'connecting', apiBase: base, error: null })
  const prior = auth
  let receivedCredential = false
  try {
    auth = pairingCode ? await exchangePairingCode(base, pairingCode) : await loadAuth()
    receivedCredential = Boolean(pairingCode)
    if (!auth || auth.apiBase !== base) throw new Error('Enter a fresh pairing code for this Panergos server.')
    if (prior?.token && prior.token !== auth.token) await revokeCredential(prior)
    identity = { ...(identity || await ensureIdentity()), sessionId: auth.sessionId }
    await restoreBoundTab()
    updateState({ paired: true, apiBase: base })
    await establishController()
  } catch (error) {
    desiredConnected = false
    closeController()
    if (error instanceof HttpError && error.status === 401 && (!pairingCode || receivedCredential)) {
      await forgetAuth()
    } else if (!receivedCredential) {
      auth = await loadAuth()
    }
    updateState({
      phase: 'offline', connected: false, paired: Boolean(auth), apiBase: auth?.apiBase || base,
      error: safeError(error),
    })
    throw error
  }
}

async function revokeCredential(credential) {
  try {
    await requestJson(TOKEN_PATH, { method: 'DELETE' }, credential)
  } catch {
    // Local forgetting still wins when the server is unavailable or already restarted.
  }
}

async function forgetAuth() {
  auth = null
  await chrome.storage.session.remove(AUTH_STORAGE_KEY)
}

async function replaceNetworkGuard(tabId = null) {
  if (!chrome.declarativeNetRequest?.updateSessionRules) {
    throw new Error('Chrome network safeguards are unavailable; this page was not enabled.')
  }
  const guarded = Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null
  if (guarded !== null && guarded === guardedTabId) return
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: NETWORK_GUARD_RULE_IDS,
    addRules: guarded === null ? [] : NETWORK_GUARD_RULES.map(rule => ({
      id: rule.id,
      priority: 1,
      action: { type: 'block' },
      condition: {
        regexFilter: rule.regexFilter,
        isUrlFilterCaseSensitive: false,
        tabIds: [guarded],
      },
    })),
  })
  guardedTabId = guarded
}

async function clearBoundTab({ keepNetworkGuard = false } = {}) {
  boundTabId = null
  boundTabOrigin = null
  clearControllerTab()
  try {
    if (!keepNetworkGuard) await replaceNetworkGuard()
  } finally {
    await chrome.storage.session.remove(SCOPE_STORAGE_KEY)
    updateState({ currentTab: null })
  }
}

async function refreshBoundTab(required = false) {
  if (!Number.isSafeInteger(boundTabId) || typeof boundTabOrigin !== 'string') {
    if (required) {
      throw new ControllerActionError(
        'tab_unbound', 'Choose Use this page before Panergos performs browser actions.',
      )
    }
    return null
  }
  try {
    const page = controllableTab(await chrome.tabs.get(boundTabId))
    if (!page || !isPublicHttpUrl(page.url)) {
      throw new ControllerActionError(
        'blocked_url', 'The selected tab is not a public page that Panergos may control.',
      )
    }
    if (pageOrigin(page.url) !== boundTabOrigin) {
      throw new ControllerActionError('origin_changed', SCOPE_RECONFIRM_ERROR)
    }
    const permitted = await chrome.permissions.contains({ origins: [pageOriginPattern(page.url)] })
    if (!permitted) {
      throw new ControllerActionError('permission_denied', 'Access to the selected page is no longer granted.')
    }
    await replaceNetworkGuard(page.id)
    bindControllerTab(page.id, boundTabOrigin)
    state.currentTab = { title: page.title, url: page.url }
    broadcastState()
    return page
  } catch (error) {
    await clearBoundTab()
    if (error instanceof ControllerActionError && error.code === 'origin_changed') {
      updateState({ error: SCOPE_RECONFIRM_ERROR })
    }
    if (required) throw error
    return null
  }
}

async function restoreBoundTab() {
  const stored = (await chrome.storage.session.get(SCOPE_STORAGE_KEY))[SCOPE_STORAGE_KEY]
  boundTabId = Number.isSafeInteger(stored?.tabId) ? stored.tabId : null
  try {
    boundTabOrigin = typeof stored?.origin === 'string' && pageOrigin(stored.origin) === stored.origin
      ? stored.origin
      : null
  } catch {
    boundTabOrigin = null
  }
  if (boundTabId === null || boundTabOrigin === null) {
    await clearBoundTab()
    return null
  }
  return refreshBoundTab(false)
}

async function useScope(tabId) {
  if (!Number.isSafeInteger(tabId) || tabId <= 0) throw new Error('Choose a valid browser tab.')
  const page = controllableTab(await chrome.tabs.get(tabId))
  if (!page || !isPublicHttpUrl(page.url)) {
    throw new Error('Private, protected, metadata, and secret-bearing pages cannot be controlled.')
  }
  if (!await chrome.permissions.contains({ origins: [pageOriginPattern(page.url)] })) {
    throw new Error(`Access to ${new URL(page.url).hostname} was not granted.`)
  }
  boundTabId = null
  boundTabOrigin = null
  clearControllerTab()
  await chrome.storage.session.remove(SCOPE_STORAGE_KEY)
  updateState({ currentTab: null })
  await replaceNetworkGuard(page.id)
  boundTabId = page.id
  boundTabOrigin = pageOrigin(page.url)
  bindControllerTab(page.id, boundTabOrigin)
  await chrome.storage.session.set({
    [SCOPE_STORAGE_KEY]: { tabId: page.id, origin: boundTabOrigin },
  })
  updateState({ currentTab: { title: page.title, url: page.url }, error: null })
}

function eventTime(event) {
  const value = Number(event?.timestamp)
  return Number.isFinite(value) ? (value < 10_000_000_000 ? value * 1_000 : value) : Date.now()
}

function displayText(value, limit = 1_000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .slice(0, limit)
}

function runTimeline(event, item) {
  state.timeline = appendTimeline(state.timeline, { at: eventTime(event), ...item })
}

function applyRunEvent(event) {
  if (!event || event.run_id !== state.runId || typeof event.event !== 'string') return
  const type = event.event
  const terminalEvent = type.startsWith('run.') && TERMINAL_RUN_STATES.has(type.slice(4))
  if ((state.runStatus === 'stopping' || TERMINAL_RUN_STATES.has(state.runStatus)) && !terminalEvent) return
  if (type === 'message.delta') {
    state.runStatus = 'running'
    state.output = `${state.output}${displayText(event.delta, 50_000)}`.slice(0, MAX_OUTPUT_LENGTH)
  } else if (type === 'tool.started') {
    runTimeline(event, { kind: 'active', event: type, label: `Using ${displayText(event.tool, 100)}`, detail: displayText(event.preview, 320) })
  } else if (type === 'tool.completed') {
    runTimeline(event, {
      kind: event.error ? 'error' : 'done', event: type, label: `${displayText(event.tool, 100)} ${event.error ? 'failed' : 'finished'}`,
      detail: Number.isFinite(event.duration) ? `${event.duration}s` : '',
    })
  } else if (type === 'subagent.start' || type === 'subagent.complete') {
    runTimeline(event, {
      kind: type.endsWith('complete') ? 'done' : 'active', event: type,
      label: type.endsWith('complete') ? 'Specialist finished' : 'Specialist started',
      detail: displayText(event.summary || event.goal || event.preview, 320),
    })
  } else if (type === 'approval.request') {
    state.runStatus = 'waiting_for_approval'
    state.approval = {
      request_id: displayText(event.request_id, 256),
      command: displayText(event.command, 2_000),
      description: displayText(event.description, 1_000),
      choices: (Array.isArray(event.choices) ? event.choices : ['once', 'deny'])
        .filter(choice => SAFE_APPROVAL_CHOICES.has(choice)),
    }
    runTimeline(event, { kind: 'active', event: type, label: 'Approval needed', detail: state.approval.description })
  } else if (type === 'approval.responded') {
    state.runStatus = 'running'
    state.approval = null
    runTimeline(event, { kind: 'done', event: type, label: 'Decision sent', detail: displayText(event.choice, 40) })
  } else if (type === 'run.steered') {
    runTimeline(event, { kind: 'done', event: type, label: 'Guidance queued' })
  } else if (terminalEvent) {
    const status = type.slice(4)
    clearControllerTab()
    state.runStatus = status
    state.approval = null
    if (typeof event.output === 'string') state.output = event.output.slice(0, MAX_OUTPUT_LENGTH)
    if (event.error) state.error = displayText(event.error, 500)
    runTimeline(event, {
      kind: status === 'completed' ? 'done' : status === 'cancelled' ? 'done' : 'error',
      event: type,
      label: status === 'completed' ? 'Goal completed' : `Run ${status}`,
      detail: displayText(event.error, 320),
    })
  }
  broadcastState()
}

async function reconcileRun(runId) {
  if (state.runId !== runId || TERMINAL_RUN_STATES.has(state.runStatus)) return
  const status = await requestJson(`/v1/runs/${encodeURIComponent(runId)}`)
  if (status?.status === 'waiting_for_approval' && status.approval) {
    applyRunEvent({ ...status.approval, event: 'approval.request', run_id: runId })
  } else if (TERMINAL_RUN_STATES.has(status?.status)) {
    applyRunEvent({ ...status, event: `run.${status.status}`, run_id: runId })
  } else if (typeof status?.status === 'string' && state.runStatus !== 'stopping') {
    updateState({ runStatus: status.status })
  }
}

async function streamRun(runId) {
  const controller = new AbortController()
  runAbort = controller
  try {
    const response = await fetch(apiUrl(auth.apiBase, `/v1/runs/${encodeURIComponent(runId)}/events`), {
      headers: {
        Authorization: `${auth.tokenType} ${auth.token}`,
        [EXTENSION_ORIGIN_HEADER]: extensionOrigin,
        Accept: 'text/event-stream',
      },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    if (!response.ok) throw new HttpError(response.status, errorMessage(await responsePayload(response), 'Run stream failed.'))
    if (!response.body) throw new Error('Panergos returned an empty run stream.')
    const parser = createSseJsonParser(applyRunEvent)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.push(decoder.decode())
    parser.finish()
    await reconcileRun(runId)
  } catch (error) {
    if (error?.name !== 'AbortError' && state.runId === runId) {
      try {
        await reconcileRun(runId)
      } catch {
        updateState({ error: safeError(error, 'The live run stream ended unexpectedly.') })
      }
    }
  } finally {
    if (runAbort === controller) runAbort = null
  }
}

async function startRunInternal(prompt, includePage) {
  if (!state.connected) throw new Error('Connect Panergos before starting a goal.')
  if (!identity?.sessionId) throw new Error('The Panergos session is not ready.')
  if (!TERMINAL_RUN_STATES.has(state.runStatus) && !['idle'].includes(state.runStatus)) {
    throw new Error('A goal is already running.')
  }
  const page = includePage === true ? await refreshBoundTab(true) : null
  const input = browserTaskPrompt(prompt, page)
  const idempotencyKey = `pxrun-${crypto.randomUUID()}`
  const requestedRunId = `run_${crypto.randomUUID().replaceAll('-', '')}`
  runAdmissionId = requestedRunId
  updateState({
    runId: null, runStatus: 'queued', timeline: [], output: '', approval: null, error: null,
  })
  let admitted
  try {
    const request = () => requestJson('/v1/runs', {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey },
      json: { input, session_id: identity.sessionId, run_id: requestedRunId },
    })
    try {
      admitted = await request()
    } catch (error) {
      if (error instanceof HttpError) throw error
      admitted = await request() // Same key safely recovers a lost acceptance response.
    }
  } catch (error) {
    clearControllerTab()
    updateState({ runStatus: 'failed' })
    throw error
  }
  if (typeof admitted?.run_id !== 'string' || !admitted.run_id) {
    clearControllerTab()
    updateState({ runStatus: 'failed' })
    throw new Error('Panergos did not return a run ID.')
  }
  if (admitted.run_id !== requestedRunId) {
    clearControllerTab()
    updateState({ runStatus: 'failed' })
    throw new Error('Panergos returned a different run ID than the one admitted by this extension.')
  }
  if (runAdmissionStopRequested || state.runStatus === 'stopping') {
    updateState({ runId: admitted.run_id, runStatus: 'stopping' })
    await stopRun()
    return
  }
  updateState({ runId: admitted.run_id, runStatus: 'running' })
  addTimeline({ kind: 'active', event: 'run.started', label: 'Goal accepted', detail: page?.title || 'Panergos session' })
  void streamRun(admitted.run_id)
}

function startRun(prompt, includePage) {
  if (runAdmission) return Promise.reject(new Error('A goal is already being admitted.'))
  runAdmissionStopRequested = false
  const pending = startRunInternal(prompt, includePage)
  runAdmission = pending
  return pending.finally(() => {
    if (runAdmission === pending) {
      runAdmission = null
      runAdmissionId = null
      runAdmissionStopRequested = false
    }
  })
}

async function stopRun() {
  if (TERMINAL_RUN_STATES.has(state.runStatus)) return
  if (!state.runId) {
    if (state.runStatus !== 'queued' || !runAdmission) return
    runAdmissionStopRequested = true
    clearControllerTab()
    updateState({ runStatus: 'stopping', error: null })
    try {
      await runAdmission
    } catch {
      // A rejected admission created no run to stop.
    }
    return
  }
  clearControllerTab()
  updateState({ runStatus: 'stopping', error: null })
  const result = await requestJson(`/v1/runs/${encodeURIComponent(state.runId)}/stop`, { method: 'POST' })
  if (TERMINAL_RUN_STATES.has(result?.status)) {
    applyRunEvent({ ...result, event: `run.${result.status}`, run_id: state.runId })
  }
}

async function respondApproval(choice, requestId) {
  if (!state.runId || !state.approval) throw new Error('No approval is waiting.')
  if (!SAFE_APPROVAL_CHOICES.has(choice)) throw new Error('That approval choice is not allowed here.')
  const body = { choice }
  const exactId = String(requestId || state.approval.request_id || '').trim()
  if (exactId) body.request_id = exactId
  await requestJson(`/v1/runs/${encodeURIComponent(state.runId)}/approval`, { method: 'POST', json: body })
  updateState({ approval: null, runStatus: 'running', error: null })
  addTimeline({ kind: 'done', event: 'approval.responded', label: 'Decision sent', detail: choice })
}

async function steerRun(text) {
  const guidance = String(text || '').trim()
  if (!state.runId || state.runStatus !== 'running') throw new Error('No running goal can accept guidance.')
  if (!guidance || guidance.length > 12_000) throw new Error('Guidance must be between 1 and 12,000 characters.')
  await requestJson(`/v1/runs/${encodeURIComponent(state.runId)}/steer`, {
    method: 'POST',
    json: { input: guidance },
  })
  addTimeline({ kind: 'done', event: 'run.steered', label: 'Guidance queued' })
}

async function disconnect() {
  desiredConnected = false
  updateState({ connected: false, phase: 'disconnecting' })
  const credential = auth
  const pendingAdmission = runAdmission
  if (pendingAdmission && !state.runId && state.runStatus === 'queued') {
    runAdmissionStopRequested = true
    clearControllerTab()
    updateState({ runStatus: 'stopping', error: null })
  }
  if (pendingAdmission) {
    try {
      await pendingAdmission
    } catch {
      // A rejected admission created no run to stop.
    }
  }
  runAbort?.abort()
  runAbort = null
  if (state.runId && !TERMINAL_RUN_STATES.has(state.runStatus)) {
    try {
      await stopRun()
    } catch {
      // Revocation still prevents further extension access.
    }
  }
  closeController()
  if (credential) await revokeCredential(credential)
  await forgetAuth()
  await clearBoundTab()
  updateState({
    phase: 'offline', connected: false, paired: false, runId: null, runStatus: 'idle',
    sessionId: null, approval: null, error: null,
  })
}

async function bootstrap() {
  identity = await ensureIdentity()
  auth = await loadAuth()
  await restoreBoundTab()
  if (!auth) {
    updateState({ paired: false, phase: 'offline' })
    return
  }
  state.apiBase = auth.apiBase
  state.paired = true
  try {
    await connect({ apiBase: auth.apiBase })
  } catch {
    // connect() already published a user-safe state.
  }
}

async function handlePortMessage(port, message) {
  if (!message || typeof message.type !== 'string') throw new Error('Invalid extension message.')
  if (message.type === 'state.get') {
    port.postMessage({ type: 'state', state: publicState() })
    return
  }
  if (message.type === 'connect') return connect(message)
  if (message.type === 'scope.use') return useScope(message.tabId)
  if (message.type === 'run.start') return startRun(message.prompt, message.includePage)
  if (message.type === 'run.stop') return stopRun()
  if (message.type === 'approval.respond') return respondApproval(message.choice, message.requestId)
  if (message.type === 'run.steer') return steerRun(message.text)
  if (message.type === 'disconnect') return disconnect()
  throw new Error(`Unsupported extension message: ${message.type}`)
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'panergos-sidepanel') return
  ports.add(port)
  port.onDisconnect.addListener(() => ports.delete(port))
  port.onMessage.addListener(message => {
    void handlePortMessage(port, message).catch(error => reportError(error, port))
  })
  port.postMessage({ type: 'state', state: publicState() })
  bootstrapPromise ||= bootstrap().catch(error => reportError(error, port))
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === boundTabId) void refreshBoundTab(false)
  else if (tabId === guardedTabId && changeInfo.status === 'complete') void replaceNetworkGuard()
})
chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId === boundTabId) void clearBoundTab()
  else if (tabId === guardedTabId) void replaceNetworkGuard()
})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
