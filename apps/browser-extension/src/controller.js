const MAX_URL_LENGTH = 4096
const MAX_TYPE_LENGTH = 100_000
const MAX_SCREENSHOT_LENGTH = 3_000_000
const COMMAND_ID_RE = /^[0-9a-f]{32}$/
const REF_RE = /^@?e([1-9]\d{0,5})$/
const SAFE_KEYS = new Set([
  'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Enter', 'Escape',
  'Home', 'PageDown', 'PageUp', 'Space', 'Tab',
])

export const CONTROLLER_CAPABILITIES = Object.freeze([
  'controller.noop',
  'browser_back',
  'browser_click',
  'browser_navigate',
  'browser_press',
  'browser_screenshot',
  'browser_scroll',
  'browser_snapshot',
  'browser_type',
])

const inFlight = new Map()
const historyByTab = new Map()
let controlledTabId = null
let controlledOrigin = null

export class ControllerActionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ControllerActionError'
    this.code = code
  }
}

function reject(code, message) {
  throw new ControllerActionError(code, message)
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reject('invalid_arguments', `${label} must be an object.`)
  }
  return value
}

function exactKeys(args, allowed) {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) reject('invalid_arguments', `Unsupported argument: ${cleanText(key, 100)}.`)
  }
}

function stringArg(args, name, maxLength, { empty = false } = {}) {
  const value = args[name]
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > maxLength) {
    reject('invalid_arguments', `${name} must be a${empty ? '' : ' non-empty'} string of at most ${maxLength} characters.`)
  }
  return value
}

const KNOWN_SECRET_RE = /(?:^|[^a-z0-9])(?:sk-(?:or-v1-)?[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|AIza[a-z0-9_-]{20,}|A(?:KI|SI)A[A-Z0-9]{16}|xox[baprs]-[a-z0-9-]{10,}|(?:sk|rk)_(?:live|test)_[a-z0-9]{16,}|SK[a-f0-9]{32})(?:$|[^a-z0-9])/i
const SECRET_QUERY_KEY_RE = /^(?:api[_-]?key|access[_-]?token|auth(?:orization)?|id[_-]?token|password|secret|token)$/i

export function isSecretLookingText(value) {
  if (typeof value !== 'string' || !value) return false
  return KNOWN_SECRET_RE.test(value)
    || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)
    || /\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{5,}\b/i.test(value)
    || /\bauthorization\s*:\s*(?:basic|bearer)\s+\S{8,}/i.test(value)
    || /\b(?:api[ _-]?key|access[ _-]?token|client[ _-]?secret|password|passwd|private[ _-]?key|secret|token)\b\s*[:=]\s*["']?\S{8,}/i.test(value)
    || /\b(?:mongodb(?:\+srv)?|mysql|postgres(?:ql)?):\/\/[^:\s/]+:[^@\s/]+@/i.test(value)
}

function ipv4Octets(hostname) {
  if (!/^\d+(?:\.\d+){3}$/.test(hostname)) return null
  const octets = hostname.split('.').map(Number)
  return octets.every(part => Number.isInteger(part) && part >= 0 && part <= 255) ? octets : null
}

function ipv6Words(hostname) {
  let host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host.includes(':') || host.includes('%')) return null

  const dotted = host.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (dotted) {
    const octets = ipv4Octets(dotted)
    if (!octets) return null
    host = host.slice(0, -dotted.length) + `${(octets[0] << 8 | octets[1]).toString(16)}:${(octets[2] << 8 | octets[3]).toString(16)}`
  }

  if ((host.match(/::/g) || []).length > 1) return null
  const [leftRaw, rightRaw = ''] = host.split('::')
  const left = leftRaw ? leftRaw.split(':') : []
  const right = rightRaw ? rightRaw.split(':') : []
  const missing = 8 - left.length - right.length
  if ((!host.includes('::') && missing !== 0) || missing < 0) return null
  const words = [...left, ...Array(missing).fill('0'), ...right]
  if (words.length !== 8 || words.some(word => !/^[0-9a-f]{1,4}$/.test(word))) return null
  return words.map(word => Number.parseInt(word, 16))
}

function isPrivateAddress(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (
    !host.includes('.') && !host.includes(':')
    || host === 'localhost'
    || ['.localhost', '.local', '.internal', '.home', '.lan', '.corp', '.test', '.example', '.invalid']
      .some(suffix => host.endsWith(suffix))
    || ['metadata', 'metadata.google.internal', 'metadata.azure.internal'].includes(host)
  ) return true

  const v4 = ipv4Octets(host)
  if (v4) {
    const [a, b, c] = v4
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2)))
      || (a === 192 && b === 88 && c === 99)
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)
  }

  const v6 = ipv6Words(host)
  if (!v6) return false
  const allZero = v6.every(word => word === 0)
  const loopback = v6.slice(0, 7).every(word => word === 0) && v6[7] === 1
  const first = v6[0]
  return allZero || loopback
    || (first & 0xfe00) === 0xfc00
    || (first & 0xffc0) === 0xfe80
    || (first & 0xffc0) === 0xfec0
    || (first & 0xff00) === 0xff00
    || (first === 0x0064 && v6[1] === 0xff9b && [0, 1].includes(v6[2])
      && v6.slice(3, 6).every(word => word === 0))
    || (first === 0x0100 && v6.slice(1, 4).every(word => word === 0))
    || (first === 0x2001 && [0x0000, 0x0002, 0x0db8].includes(v6[1]))
    || first === 0x2002
    || first === 0x3fff
    || (v6.slice(0, 5).every(word => word === 0) && v6[5] === 0xffff)
}

export function normalizePublicHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_URL_LENGTH) {
    reject('invalid_url', `URL must be a non-empty string of at most ${MAX_URL_LENGTH} characters.`)
  }
  let url
  try {
    url = new URL(value)
  } catch {
    reject('invalid_url', 'URL is invalid.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) reject('blocked_url', 'Only public HTTP and HTTPS pages are allowed.')
  if (url.username || url.password) reject('blocked_url', 'URLs containing credentials are not allowed.')
  if (isPrivateAddress(url.hostname)) reject('blocked_url', 'Private, local, metadata, and reserved network targets are not allowed.')
  let secretSurface = `${url.pathname}${url.search}${url.hash}`
  try {
    secretSurface = decodeURIComponent(secretSurface)
  } catch {
    // Malformed escapes are kept encoded; URL itself remains syntactically valid.
  }
  if (
    [...url.searchParams].some(([key, item]) => SECRET_QUERY_KEY_RE.test(key) && item.trim())
    || /(?:^|[&#])(?:api[_-]?key|access[_-]?token|token)=/i.test(url.hash.slice(1))
    || /(?:^|[?&#])(?:api[_-]?key|access[_-]?token|token)=[^&#]+/i.test(secretSurface)
    || KNOWN_SECRET_RE.test(secretSurface)
  ) reject('blocked_url', 'URLs containing credentials or secret-looking values are not allowed.')
  return url.href
}

export function isPublicHttpUrl(value) {
  try {
    normalizePublicHttpUrl(value)
    return true
  } catch {
    return false
  }
}

function displayUrl(value) {
  const url = new URL(normalizePublicHttpUrl(value))
  url.search = ''
  url.hash = ''
  return url.href
}

function cleanText(value, maxLength = 50_000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
    .slice(0, maxLength)
}

export function isSensitiveFieldMetadata(metadata) {
  const type = cleanText(metadata?.type, 40).toLowerCase()
  const autocomplete = cleanText(metadata?.autocomplete, 200).toLowerCase()
  const label = cleanText(metadata?.label, 1_000).toLowerCase()
  return type === 'password'
    || /(?:^|\s)(?:current-password|new-password|one-time-code|webauthn|cc-[a-z-]+|transaction-(?:amount|currency))(?:\s|$)/.test(autocomplete)
    || /\b(?:password|passcode|pin|one[ -]?time(?: code)?|otp|2fa|mfa|verification code|security code|cvv|cvc|card number|credit card|debit card|card expiry|expiration date|expiry date|bank account|routing number|iban|payment)\b/.test(label)
}

export function isHighImpactControlLabel(value) {
  const label = cleanText(value, 1_000).toLowerCase()
  return /\b(?:buy(?: now)?|purchase|pay(?: now)?|payment|checkout|place order|confirm order|submit order|send|post|publish|delete|remove|erase|transfer|withdraw|wire|sell|trade|close account|deactivate|change password|reset password|enable (?:2fa|mfa)|disable (?:2fa|mfa)|revoke|rotate api key|reset api key|regenerate|subscribe|cancel subscription|upgrade plan|donate)\b/.test(label)
}

function isPotentiallyConsequentialControl(value) {
  const label = cleanText(value, 1_000).toLowerCase()
  return isHighImpactControlLabel(label)
    || /\b(?:approve|authorize|confirm|submit|sign(?: in| up| out)?|log ?out)\b/.test(label)
}

export function sanitizeControllerResult(value, depth = 0, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return cleanText(value)
  if (depth >= 5 || typeof value !== 'object' || seen.has(value)) return null
  seen.add(value)
  if (Array.isArray(value)) {
    return value.slice(0, 250).map(item => sanitizeControllerResult(item, depth + 1, seen))
  }
  const result = {}
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    const safeKey = cleanText(key, 100)
    if (safeKey) result[safeKey] = sanitizeControllerResult(item, depth + 1, seen)
  }
  return result
}

export function serializeControllerError(error) {
  if (error instanceof ControllerActionError) {
    return { code: error.code, message: cleanText(error.message, 500) }
  }
  return { code: 'browser_action_failed', message: 'The browser action failed.' }
}

function cancelled() {
  return new ControllerActionError('cancelled', 'Command cancelled.')
}

function abortable(value, signal) {
  if (signal.aborted) return Promise.reject(cancelled())
  return new Promise((resolve, rejectPromise) => {
    const abort = () => rejectPromise(cancelled())
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(value).then(
      result => {
        signal.removeEventListener('abort', abort)
        resolve(result)
      },
      error => {
        signal.removeEventListener('abort', abort)
        rejectPromise(error)
      },
    )
  })
}

function chromeFailure(error, fallback) {
  const raw = String(error?.message || error || '').toLowerCase()
  if (raw.includes('permission') || raw.includes('cannot access') || raw.includes('not allowed')) {
    reject('permission_denied', 'Grant Panergos access to this site and retry.')
  }
  reject('browser_action_failed', fallback)
}

function requireApi(api) {
  if (!api?.tabs?.get || !api?.tabs?.update || !api?.scripting?.executeScript) {
    reject('browser_unavailable', 'Required Chrome tabs or scripting APIs are unavailable.')
  }
}

function originPattern(value) {
  const url = new URL(normalizePublicHttpUrl(value))
  return `${url.origin}/*`
}

async function requireOriginPermission(api, value) {
  if (!api.permissions?.contains) reject('permission_denied', 'Site access has not been granted.')
  const allowed = await api.permissions.contains({ origins: [originPattern(value)] })
  if (!allowed) reject('permission_denied', 'Grant Panergos access to this site and retry.')
}

async function controlledTab(api) {
  if (!Number.isSafeInteger(controlledTabId) || typeof controlledOrigin !== 'string') {
    reject('tab_unbound', 'Choose Use this page before running browser actions.')
  }
  let tab
  try {
    tab = await api.tabs.get(controlledTabId)
  } catch {
    reject('tab_unavailable', 'The bound browser tab is no longer available.')
  }
  if (typeof tab.url !== 'string') reject('permission_denied', 'The current tab URL is unavailable.')
  const url = normalizePublicHttpUrl(tab.url)
  if (new URL(url).origin !== controlledOrigin) {
    reject('origin_changed', 'The selected tab moved to another site. Choose Use this page again.')
  }
  await requireOriginPermission(api, url)
  rememberUrl(tab.id, url)
  return tab
}

function rememberUrl(tabId, url) {
  const history = historyByTab.get(tabId) || []
  if (history.at(-1) !== url) history.push(url)
  historyByTab.set(tabId, history.slice(-50))
}

function blankUnsafeTab(api, tabId) {
  void api.tabs.update(tabId, { url: 'about:blank' }).catch(() => {})
}

async function checkedLoadedTab(api, tabId, fallbackUrl) {
  const tab = await api.tabs.get(tabId)
  const raw = typeof tab.url === 'string' ? tab.url : fallbackUrl
  try {
    const url = normalizePublicHttpUrl(raw)
    if (new URL(url).origin !== controlledOrigin) {
      reject('origin_changed', 'The selected tab moved to another site. Choose Use this page again.')
    }
    await requireOriginPermission(api, url)
    rememberUrl(tabId, url)
    return { ...tab, url }
  } catch (error) {
    blankUnsafeTab(api, tabId)
    throw error
  }
}

function waitForLoad(api, tabId, signal, timeoutMs = 20_000) {
  if (!api.tabs.onUpdated?.addListener) return abortable(api.tabs.get(tabId), signal)
  return new Promise((resolve, rejectPromise) => {
    let timer
    const cleanup = () => {
      clearTimeout(timer)
      api.tabs.onUpdated.removeListener(updated)
      api.tabs.onRemoved?.removeListener(removed)
      signal.removeEventListener('abort', aborted)
    }
    const finish = outcome => {
      cleanup()
      outcome.then(resolve, rejectPromise)
    }
    const updated = (id, change, tab) => {
      if (id === tabId && change.status === 'complete') finish(Promise.resolve(tab))
    }
    const removed = id => {
      if (id === tabId) finish(Promise.reject(new ControllerActionError('tab_unavailable', 'The controlled tab was closed.')))
    }
    const aborted = () => finish(Promise.reject(cancelled()))
    api.tabs.onUpdated.addListener(updated)
    api.tabs.onRemoved?.addListener(removed)
    signal.addEventListener('abort', aborted, { once: true })
    timer = setTimeout(() => finish(Promise.reject(new ControllerActionError('timeout', 'The page did not finish loading.'))), timeoutMs)
    api.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') finish(Promise.resolve(tab))
    }, error => finish(Promise.reject(error)))
  })
}

async function inject(api, tabId, func, args, signal) {
  try {
    const frames = await abortable(api.scripting.executeScript({
      target: { tabId }, func, args: [controlledOrigin, ...args],
    }), signal)
    const result = frames?.[0]?.result
    if (!result || result.ok !== true) reject('page_action_failed', cleanText(result?.error || 'Page action failed.', 300))
    return result
  } catch (error) {
    if (error instanceof ControllerActionError) throw error
    chromeFailure(error, 'The page action failed.')
  }
}

function snapshotPage(expectedOrigin, maxText, maxRefs) {
  if (location.origin !== expectedOrigin) return { ok: false, error: 'The selected page origin changed.' }
  const attribute = 'data-panergos-ref'
  document.querySelectorAll(`[${attribute}]`).forEach(element => element.removeAttribute(attribute))
  const selector = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'textarea', 'select',
    '[contenteditable="true"]', '[role="button"]', '[role="link"]', '[role="checkbox"]',
    '[role="radio"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
    '[role="textbox"]', '[role="switch"]',
  ].join(',')
  const visible = element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }
  const label = element => {
    const id = element.getAttribute('id')
    const associated = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.innerText : ''
    return (element.getAttribute('aria-label') || associated || element.innerText
      || element.getAttribute('placeholder') || element.getAttribute('title') || element.getAttribute('name') || '')
      .replace(/\s+/g, ' ').trim().slice(0, 300)
  }
  const role = element => element.getAttribute('role') || ({
    A: 'link', BUTTON: 'button', INPUT: element.type || 'input', SELECT: 'select', TEXTAREA: 'textarea',
  })[element.tagName] || element.tagName.toLowerCase()
  const refs = []
  for (const element of document.querySelectorAll(selector)) {
    if (refs.length >= maxRefs || !visible(element)) continue
    const ref = `e${refs.length + 1}`
    element.setAttribute(attribute, ref)
    refs.push({ ref: `@${ref}`, role: role(element).slice(0, 40), label: label(element) })
  }
  return {
    ok: true,
    title: document.title,
    url: location.href,
    text: (document.body?.innerText || '').replace(/\s+\n/g, '\n').trim().slice(0, maxText),
    refs,
  }
}

async function snapshot(api, tab, full, signal) {
  const page = await inject(api, tab.id, snapshotPage, full ? [50_000, 400] : [15_000, 180], signal)
  const url = displayUrl(page.url)
  const refs = page.refs.map(item => ({
    ref: cleanText(item.ref, 16), role: cleanText(item.role, 40), label: cleanText(item.label, 300),
  }))
  const refText = refs.map(item => `[${item.ref}] ${item.role}${item.label ? ` "${item.label}"` : ''}`).join('\n')
  return {
    success: true,
    url,
    title: cleanText(page.title, 500),
    snapshot: [cleanText(page.text, full ? 50_000 : 15_000), refText && `Interactive elements:\n${refText}`]
      .filter(Boolean).join('\n\n'),
    refs,
  }
}

async function noop(args) {
  plainObject(args, 'arguments')
  return { success: true }
}

async function navigate(args, api, signal) {
  exactKeys(args, ['url'])
  const url = normalizePublicHttpUrl(stringArg(args, 'url', MAX_URL_LENGTH))
  if (new URL(url).origin !== controlledOrigin) {
    reject('origin_changed', 'Cross-site navigation requires choosing Use this page again.')
  }
  if (isHighImpactControlLabel(new URL(url).pathname.replace(/[-_/]+/g, ' '))) {
    reject('approval_required', 'This consequential navigation must be completed manually in the page.')
  }
  await requireOriginPermission(api, url)
  const tab = await controlledTab(api)
  try {
    await abortable(api.tabs.update(tab.id, { url }), signal)
    await waitForLoad(api, tab.id, signal)
    const loaded = await checkedLoadedTab(api, tab.id, url)
    return snapshot(api, loaded, false, signal)
  } catch (error) {
    if (error instanceof ControllerActionError) throw error
    chromeFailure(error, 'Navigation failed.')
  }
}

async function getSnapshot(args, api, signal) {
  exactKeys(args, ['full', 'include'])
  if (args.full !== undefined && typeof args.full !== 'boolean') reject('invalid_arguments', 'full must be a boolean.')
  if (args.include !== undefined && args.include !== 'accessibility') reject('invalid_arguments', 'include must be accessibility.')
  return snapshot(api, await controlledTab(api), args.full === true, signal)
}

function inspectLinkRef(expectedOrigin, ref, expectedFingerprint) {
  if (location.origin !== expectedOrigin) return { ok: false, error: 'The selected page origin changed.' }
  const element = document.querySelector(`[data-panergos-ref="${ref}"]`)
  if (!element) return { ok: false, error: 'Element reference is stale. Take a new snapshot and retry.' }
  const link = element.matches('a[href]') ? element : null
  const form = element.closest('form')
  const id = element.getAttribute('id')
  const associated = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.innerText : ''
  let targetUrl = ''
  try {
    if (link) targetUrl = new URL(link.getAttribute('href'), document.baseURI).href
  } catch {
    // The controller validates the resolved target outside the page context.
  }
  const label = [
    element.getAttribute('aria-label'), element.getAttribute('title'), element.innerText,
    element.matches('input[type="button"], input[type="submit"]') ? element.value : '',
    associated, form?.getAttribute('aria-label'),
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 1000)
  const metadata = {
    ok: true,
    target_url: targetUrl,
    opens_new_context: link?.target === '_blank' || form?.target === '_blank',
    in_form: Boolean(form),
    is_link: Boolean(link),
    element_kind: `${element.tagName.toLowerCase()}:${element.getAttribute('type') || element.getAttribute('role') || ''}`,
    label,
  }
  metadata.fingerprint = JSON.stringify([
    metadata.target_url, metadata.opens_new_context, metadata.in_form,
    metadata.is_link, metadata.element_kind, metadata.label,
  ])
  if (expectedFingerprint === null) return metadata
  if (metadata.fingerprint !== expectedFingerprint) {
    return { ok: false, error: 'The control changed after inspection. Take a new snapshot and retry.' }
  }
  return metadata
}

async function click(args, api, signal) {
  exactKeys(args, ['ref'])
  const match = REF_RE.exec(stringArg(args, 'ref', 16))
  if (!match) reject('invalid_arguments', 'ref must look like @e1.')
  const tab = await controlledTab(api)
  const inspected = await inject(api, tab.id, inspectLinkRef, [`e${match[1]}`, null], signal)
  if (!String(inspected.label || '').trim()) {
    reject('approval_required', 'This unlabeled control must be completed manually in the page.')
  }
  if (inspected.in_form) {
    reject('approval_required', 'Form controls and submissions must be completed manually in the page.')
  }
  if (isPotentiallyConsequentialControl(inspected.label)) {
    reject('approval_required', 'This consequential control must be completed manually in the page.')
  }
  if (!inspected.is_link) reject('approval_required', 'Only ordinary links can be opened automatically; use other controls manually.')
  if (inspected.opens_new_context) reject('blocked_navigation', 'Opening a new tab or window is not allowed.')
  const target = normalizePublicHttpUrl(inspected.target_url)
  if (new URL(target).origin !== controlledOrigin) {
    reject('origin_changed', 'Cross-site navigation requires choosing Use this page again.')
  }
  if (isHighImpactControlLabel(new URL(target).pathname.replace(/[-_/]+/g, ' '))) {
    reject('approval_required', 'This consequential navigation must be completed manually in the page.')
  }
  await requireOriginPermission(api, target)
  const rechecked = await inject(api, tab.id, inspectLinkRef, [`e${match[1]}`, inspected.fingerprint], signal)
  const recheckedTarget = normalizePublicHttpUrl(rechecked.target_url)
  if (recheckedTarget !== target) reject('page_action_failed', 'The link changed after inspection. Take a new snapshot and retry.')
  await requireOriginPermission(api, recheckedTarget)
  try {
    await abortable(api.tabs.update(tab.id, { url: recheckedTarget }), signal)
    await waitForLoad(api, tab.id, signal)
    const loaded = await checkedLoadedTab(api, tab.id, recheckedTarget)
    return { success: true, clicked: `@e${match[1]}`, url: displayUrl(loaded.url) }
  } catch (error) {
    if (error instanceof ControllerActionError) throw error
    chromeFailure(error, 'Link navigation failed.')
  }
}

function inspectOrTypeRef(expectedOrigin, ref, text, expectedFingerprint) {
  if (location.origin !== expectedOrigin) return { ok: false, error: 'The selected page origin changed.' }
  const element = document.querySelector(`[data-panergos-ref="${ref}"]`)
  if (!element) return { ok: false, error: 'Element reference is stale. Take a new snapshot and retry.' }
  const id = element.getAttribute('id')
  const associated = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.innerText : ''
  const metadata = {
    ok: true,
    type: element.getAttribute('type') || '',
    autocomplete: element.getAttribute('autocomplete') || '',
    label: [
      element.getAttribute('name'), element.getAttribute('id'), element.getAttribute('aria-label'),
      element.getAttribute('placeholder'), associated,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 1000),
  }
  metadata.fingerprint = JSON.stringify([
    element.tagName.toLowerCase(), metadata.type, metadata.autocomplete, metadata.label,
    element.isContentEditable, element.matches(':disabled, [readonly]'),
  ])
  if (expectedFingerprint === null) return metadata
  if (metadata.fingerprint !== expectedFingerprint) {
    return { ok: false, error: 'The field changed after inspection. Take a new snapshot and retry.' }
  }
  if (element.matches(':disabled, [readonly]')) return { ok: false, error: 'The target field is disabled or read-only.' }
  element.focus()
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, text)
  } else if (element.isContentEditable) {
    element.textContent = text
  } else {
    return { ok: false, error: 'The referenced element is not an editable field.' }
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: true }
}

async function type(args, api, signal) {
  exactKeys(args, ['ref', 'text'])
  const match = REF_RE.exec(stringArg(args, 'ref', 16))
  if (!match) reject('invalid_arguments', 'ref must look like @e1.')
  const text = stringArg(args, 'text', MAX_TYPE_LENGTH, { empty: true })
  if (isSecretLookingText(text)) {
    reject('approval_required', 'Secret-looking text must be entered manually and is never sent to the page.')
  }
  const tab = await controlledTab(api)
  const metadata = await inject(api, tab.id, inspectOrTypeRef, [`e${match[1]}`, null, null], signal)
  if (isSensitiveFieldMetadata(metadata)) {
    reject('approval_required', 'Passwords, verification codes, and payment fields must be completed manually.')
  }
  await inject(api, tab.id, inspectOrTypeRef, [`e${match[1]}`, text, metadata.fingerprint], signal)
  return { success: true, typed: true, element: `@e${match[1]}` }
}

function scrollPage(expectedOrigin, direction) {
  if (location.origin !== expectedOrigin) return { ok: false, error: 'The selected page origin changed.' }
  const distance = Math.max(500, Math.floor(innerHeight * 0.75)) * (direction === 'up' ? -1 : 1)
  scrollBy({ top: distance, behavior: 'auto' })
  return { ok: true, x: scrollX, y: scrollY }
}

async function scroll(args, api, signal) {
  exactKeys(args, ['direction'])
  const direction = stringArg(args, 'direction', 4)
  if (!['up', 'down'].includes(direction)) reject('invalid_arguments', 'direction must be up or down.')
  const tab = await controlledTab(api)
  const result = await inject(api, tab.id, scrollPage, [direction], signal)
  return { success: true, scrolled: direction, x: result.x, y: result.y }
}

async function back(args, api, signal) {
  exactKeys(args, [])
  const tab = await controlledTab(api)
  const history = historyByTab.get(tab.id) || []
  if (history.length < 2) reject('blocked_navigation', 'No controller-verified public page exists in history.')
  history.pop()
  const url = normalizePublicHttpUrl(history.at(-1))
  if (new URL(url).origin !== controlledOrigin) {
    reject('origin_changed', 'Cross-site navigation requires choosing Use this page again.')
  }
  await requireOriginPermission(api, url)
  historyByTab.set(tab.id, history)
  try {
    await abortable(api.tabs.update(tab.id, { url }), signal)
    await waitForLoad(api, tab.id, signal)
    const loaded = await checkedLoadedTab(api, tab.id, url)
    return { success: true, url: displayUrl(loaded.url) }
  } catch (error) {
    if (error instanceof ControllerActionError) throw error
    chromeFailure(error, 'Back navigation failed.')
  }
}

function pressKey(expectedOrigin, key) {
  if (location.origin !== expectedOrigin) return { ok: false, error: 'The selected page origin changed.' }
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body
  if (key === 'Tab') {
    const focusable = [...document.querySelectorAll('a[href],button,input,textarea,select,[tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.matches(':disabled') && element.getClientRects().length)
    focusable[(focusable.indexOf(target) + 1 + focusable.length) % focusable.length]?.focus()
  } else if (key === 'Escape') {
    target.blur()
  } else {
    const amount = key.startsWith('Page') || key === 'Space' ? innerHeight * 0.8 : 120
    const y = ['ArrowUp', 'PageUp', 'Home'].includes(key) ? -amount : ['ArrowDown', 'PageDown', 'End', 'Space'].includes(key) ? amount : 0
    const x = key === 'ArrowLeft' ? -amount : key === 'ArrowRight' ? amount : 0
    if (key === 'Home') scrollTo({ top: 0 })
    else if (key === 'End') scrollTo({ top: document.documentElement.scrollHeight })
    else if (x || y) scrollBy({ left: x, top: y })
  }
  return { ok: true }
}

async function press(args, api, signal) {
  exactKeys(args, ['key'])
  const key = stringArg(args, 'key', 20)
  if (!SAFE_KEYS.has(key)) reject('invalid_arguments', 'That key is not in the safe keyboard allowlist.')
  if (key === 'Enter') {
    reject('approval_required', 'Enter can submit or activate a control and must be pressed manually in the page.')
  }
  const tab = await controlledTab(api)
  await inject(api, tab.id, pressKey, [key], signal)
  return { success: true, pressed: key, synthetic: true }
}

async function screenshot(args, api, signal) {
  exactKeys(args, [])
  const tab = await controlledTab(api)
  if (!api.tabs.captureVisibleTab) reject('browser_unavailable', 'Screenshot capture is unavailable.')
  if (!Number.isSafeInteger(tab.windowId)) reject('browser_unavailable', 'The selected page window is unavailable.')
  if (!api.tabs.query || !api.tabs.onActivated?.addListener || !api.tabs.onActivated?.removeListener) {
    reject('browser_unavailable', 'Active-tab verification is unavailable.')
  }
  let activationGeneration = 0
  const activated = info => {
    if (info?.windowId === tab.windowId) activationGeneration += 1
  }
  let listening = false
  try {
    await abortable(api.tabs.update(tab.id, { active: true }), signal)
    if (api.windows?.update) {
      await abortable(api.windows.update(tab.windowId, { focused: true }), signal)
    }
    api.tabs.onActivated.addListener(activated)
    listening = true
    const [active] = await abortable(api.tabs.query({ active: true, windowId: tab.windowId }), signal)
    if (active?.id !== tab.id) reject('tab_unavailable', 'The selected page is no longer the visible tab.')
    const captureGeneration = activationGeneration
    const dataUrl = await abortable(api.tabs.captureVisibleTab(tab.windowId, { format: 'png' }), signal)
    const [activeAfter] = await abortable(api.tabs.query({ active: true, windowId: tab.windowId }), signal)
    if (activeAfter?.id !== tab.id || activationGeneration !== captureGeneration) {
      reject('tab_unavailable', 'The visible tab changed during capture; the screenshot was discarded.')
    }
    await controlledTab(api)
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > MAX_SCREENSHOT_LENGTH) {
      reject('screenshot_failed', 'The screenshot was invalid or too large.')
    }
    return { success: true, mime_type: 'image/png', data_url: dataUrl }
  } catch (error) {
    if (error instanceof ControllerActionError) throw error
    chromeFailure(error, 'Screenshot capture failed.')
  } finally {
    if (listening) api.tabs.onActivated.removeListener(activated)
  }
}

const ACTIONS = Object.freeze({
  'controller.noop': noop,
  browser_back: back,
  browser_click: click,
  browser_navigate: navigate,
  browser_press: press,
  browser_screenshot: screenshot,
  browser_scroll: scroll,
  browser_snapshot: getSnapshot,
  browser_type: type,
})

export async function executeControllerCommand(command, api = globalThis.chrome) {
  requireApi(api)
  if (!Number.isSafeInteger(controlledTabId)) reject('tab_unbound', 'Choose Use this page before running browser actions.')
  const frame = plainObject(command, 'command')
  const commandId = frame.command_id
  if (typeof commandId !== 'string' || !COMMAND_ID_RE.test(commandId)) {
    reject('invalid_command', 'command_id must be a 32-character lowercase hexadecimal value.')
  }
  const action = frame.action
  const handler = typeof action === 'string' ? ACTIONS[action] : null
  if (!handler) reject('unsupported_action', 'The requested browser action is not allowed.')
  if (inFlight.has(commandId)) reject('duplicate_command', 'This command is already running.')

  const controller = new AbortController()
  inFlight.set(commandId, controller)
  try {
    const result = await handler(plainObject(frame.arguments ?? {}, 'arguments'), api, controller.signal)
    if (controller.signal.aborted) throw cancelled()
    if (action === 'browser_screenshot') return result
    return sanitizeControllerResult(result)
  } finally {
    if (inFlight.get(commandId) === controller) inFlight.delete(commandId)
  }
}

export function cancelControllerCommand(commandId) {
  if (typeof commandId !== 'string' || !COMMAND_ID_RE.test(commandId)) return false
  const controller = inFlight.get(commandId)
  if (!controller) return false
  controller.abort()
  return true
}

export function bindControllerTab(tabId, origin) {
  if (!Number.isSafeInteger(tabId) || tabId <= 0) reject('invalid_arguments', 'tabId must be a positive integer.')
  if (typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin)) {
    reject('invalid_arguments', 'origin must be an exact HTTP(S) origin.')
  }
  if (controlledTabId !== tabId || controlledOrigin !== origin) {
    if (controlledTabId !== null) {
      for (const controller of inFlight.values()) controller.abort()
    }
    historyByTab.clear()
  }
  controlledTabId = tabId
  controlledOrigin = origin
}

export function clearControllerTab() {
  for (const controller of inFlight.values()) controller.abort()
  historyByTab.clear()
  controlledTabId = null
  controlledOrigin = null
}
