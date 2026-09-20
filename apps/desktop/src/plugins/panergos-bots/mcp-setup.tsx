/**
 * Inline per-profile MCP setup: the `mcp.servers.*` RPC wrapper, its
 * feature-detect, and the button a capability row renders.
 *
 * Shared leaf: the advanced profile editor and the create dialog both render
 * the button, so it lives below both.
 */

import { Button, host, Input, useI18n } from '@panergos/plugin-sdk'
import { useEffect, useRef, useState } from 'react'

// -- inline MCP setup (per-profile), driven by the mcp.servers.* gateway RPCs --
// Feature-detected: if the gateway predates those RPCs the setup button hides
// and the row falls back to the "run panergos mcp / Settings" hint. profile is
// the target bot's profile name (its config is what we write).

/** Body of an `mcp.servers.*` reply. Some gateway builds wrap it in a second
 *  `result` envelope, which every call site below unwraps — hence the
 *  self-reference. */
interface McpServerPayload {
  auth_url?: string
  error?: string
  error_message?: string
  ok?: boolean
  result?: McpServerPayload
  session_id?: string
  status?: string
  verification_url?: string
}

/** `mcpRpc`'s outcome. `unsupported` separates an older gateway that doesn't
 *  know the method from a real failure. */
interface McpRpcResult {
  error?: string
  ok: boolean
  result?: McpServerPayload
  unsupported?: boolean
}

/** The capability scope the Edit Profile / New Bot panes hand down — the SDK's
 *  `ProfileScope`: a bare profile name, or a connection-qualified scope for a
 *  source-scoped bot. */
type McpSetupScope = null | string | undefined | { connectionId?: null | string; profile?: null | string }

function mcpScope(scope: McpSetupScope) {
  if (scope && typeof scope === 'object') {
    return {
      connectionId: String(scope.connectionId || '').trim(),
      profile: String(scope.profile || '').trim() || 'default'
    }
  }

  return { connectionId: '', profile: String(scope || '').trim() }
}

async function mcpRpc(
  scope: McpSetupScope,
  method: string,
  params: Record<string, unknown>
): Promise<McpRpcResult> {
  // Returns { ok, result } or { ok:false, unsupported:true } when the gateway
  // doesn't know the method (older backend) vs a real error.
  try {
    const { connectionId, profile } = mcpScope(scope)
    const scopedParams = profile ? { ...params, profile } : params

    const res = connectionId
      ? await host.requestProfile<McpServerPayload>(
          {
            connectionId,
            mode: connectionId === 'local' ? 'local' : 'remote',
            profile,
            targetProfile: profile
          },
          method,
          scopedParams
        )
      : await host.request<McpServerPayload>(method, scopedParams)

    return {
      ok: true,
      result: res
    }
  } catch (err: any) {
    const msg = String((err && err.message) || err || '')

    if (/unknown method/i.test(msg)) {
      return {
        ok: false,
        unsupported: true
      }
    }

    return {
      ok: false,
      error: msg
    }
  }
}

// Probe whether the new lifecycle RPCs exist on each gateway.
const _mcpRpcSupported = new Map<string, boolean>()

async function mcpSetupSupported(scope: McpSetupScope): Promise<boolean> {
  const { connectionId } = mcpScope(scope)
  const key = connectionId || String(host.state.connectionId.get() || '').trim()
  const cached = _mcpRpcSupported.get(key)

  if (cached !== undefined) {
    return cached
  }

  // RPC support is a gateway-version fact. Probe its existing default profile
  // rather than dialing a not-yet-created draft profile.
  const probeScope = connectionId ? { connectionId, profile: 'default' } : scope
  const r = await mcpRpc(probeScope, 'mcp.servers.list', {})
  const supported = !(r.ok === false && r.unsupported)
  _mcpRpcSupported.set(key, supported)

  return supported
}

/** One row of the capability pane's MCP list (catalog entry or installed server). */
interface McpCatalogEntry {
  auth?: null | string
  fromCatalog?: boolean
  installed?: boolean
  name: string
  requires?: string[]
}

interface McpSetupButtonProps {
  ensureProfile?: () => Promise<McpSetupScope>
  entry: McpCatalogEntry
  onDone?: () => void
  profile: McpSetupScope
}

export function McpSetupButton({ profile, entry, onDone, ensureProfile }: McpSetupButtonProps) {
  const { t } = useI18n()
  // entry: { name, requires:[env keys], auth?, fromCatalog, installed }
  // profile may be null at first (New Bot: the profile isn't created yet).
  // ensureProfile() lazily creates it on the first setup action and returns the
  // slug, so OAuth / API-key setup works DURING creation, not only in Edit.
  const [phase, setPhase] = useState<'busy' | 'done' | 'error' | 'idle' | 'keys' | 'oauth'>('idle') // idle | keys | oauth | busy | done | error
  const [supported, setSupported] = useState<boolean | null>(null)
  const [keyValues, setKeyValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const oauthEpoch = useRef(0)
  // Holds ONLY the profile this component created on demand.
  const createdProfileRef = useRef<McpSetupScope>(null)
  const { connectionId: setupConnectionId, profile: setupProfile } = mcpScope(profile)

  // Resolve the target profile, creating it on demand for the New Bot flow.
  const resolveProfile = async () => {
    if (createdProfileRef.current) {
      return createdProfileRef.current
    }

    if (ensureProfile) {
      const created = await ensureProfile()

      if (created) {
        createdProfileRef.current = created
      }

      return created
    }

    return profile || null
  }

  useEffect(() => {
    const epoch = oauthEpoch
    let alive = true

    const scope: McpSetupScope = setupConnectionId
      ? { connectionId: setupConnectionId, profile: setupProfile }
      : setupProfile || null

    mcpSetupSupported(scope).then(ok => {
      if (alive) {
        setSupported(ok)
      }
    })

    return () => {
      alive = false

      epoch.current++
    }
  }, [setupConnectionId, setupProfile])
  const isOAuth = (entry.auth || '').toLowerCase() === 'oauth'
  const requires = entry.requires || []

  const beginKeys = async () => {
    // Ensure the server exists in the target profile first (add from catalog).
    setPhase('busy')
    setMessage('')
    const profile = await resolveProfile()

    if (!profile) {
      setPhase('idle')

      return
    }

    if (entry.fromCatalog && !entry.installed) {
      const add = await mcpRpc(profile, 'mcp.servers.add', {
        name: entry.name,
        preset: entry.name
      })

      if (!add.ok) {
        setPhase('error')
        setMessage(add.error || 'Could not add server')

        return
      }
    }

    setPhase(isOAuth ? 'oauth' : 'keys')
  }

  const submitKeys = async () => {
    setPhase('busy')
    const target = profile || createdProfileRef.current

    if (!target) {
      setPhase('error')
      setMessage('No target profile')

      return
    }

    for (const k of requires) {
      const val = (keyValues[k] || '').trim()

      if (!val) {
        continue
      }

      const r = await mcpRpc(target, 'mcp.servers.set_api_key', {
        name: entry.name,
        env_var: k,
        value: val
      })

      if (!r.ok) {
        setPhase('error')
        setMessage(r.error || 'Failed to set ' + k)

        return
      }
    }

    // Verify via test.
    const t = await mcpRpc(target, 'mcp.servers.test', {
      name: entry.name
    })

    if (t.ok && t.result && (t.result.ok || (t.result.result && t.result.result.ok))) {
      setPhase('done')
      host.notify({
        kind: 'success',
        message: entry.name + ' configured'
      })
      onDone && onDone()
    } else {
      setPhase('error')
      setMessage(
        (t.result && (t.result.error || (t.result.result && t.result.result.error))) || 'Server test failed after setup'
      )
    }
  }

  const beginOAuth = async () => {
    const epoch = ++oauthEpoch.current

    const ambient =
      profile && typeof profile === 'object'
        ? { ...profile }
        : { connectionId: host.state.connectionId.get(), profile: profile || host.state.profile.get() }

    setPhase('busy')
    setMessage('')
    const resolvedProfile = await resolveProfile()

    if (!resolvedProfile) {
      setPhase('idle')

      return
    }

    const scope = typeof resolvedProfile === 'object' ? resolvedProfile : { ...ambient, profile: resolvedProfile }

    try {
      setPhase('oauth')
      setMessage('Complete sign-in in your browser...')
      await host.completeMcpOAuth({
        serverName: entry.name,
        profile: scope,
        catalogPreset: entry.fromCatalog && !entry.installed ? entry.name : undefined,
        cancelled: () => oauthEpoch.current !== epoch
      })

      if (oauthEpoch.current !== epoch) {
        return
      }

      setPhase('done')
      host.notify({ kind: 'success', message: entry.name + ' authenticated' })
      onDone?.()
    } catch (error) {
      if (oauthEpoch.current !== epoch) {
        return
      }

      setPhase('error')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  if (supported === false) {
    return (
      <span className="ml-1.5 text-[0.65rem] text-(--ui-text-quaternary)">
        {'needs setup (' + requires.join(', ') + ') \u2014 restart the gateway to enable in-app setup'}
      </span>
    )
  }

  if (phase === 'done') {
    return <span className="ml-1.5 text-[0.65rem] text-(--ui-success)">set up ✓</span>
  }

  if (phase === 'keys') {
    return (
      <div className="mt-1 grid gap-1">
        {requires.map(k => (
          <Input
            className="h-6 text-[0.7rem]"
            key={k}
            onChange={e =>
              setKeyValues(prev => ({
                ...prev,
                [k]: e.target.value
              }))
            }
            placeholder={k}
            type="password"
            value={keyValues[k] || ''}
          />
        ))}
        <div className="flex gap-1">
          <Button onClick={() => void submitKeys()} size="xs" variant="secondary">
            Save & test
          </Button>
          <Button onClick={() => setPhase('idle')} size="xs" variant="ghost">
            {t.common.cancel}
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'oauth') {
    return <span className="ml-1.5 text-[0.65rem] text-(--ui-text-quaternary)">{message || 'Authorizing\u2026'}</span>
  }

  if (phase === 'busy') {
    return <span className="ml-1.5 text-[0.65rem] text-(--ui-text-quaternary)">Working…</span>
  }

  if (phase === 'error') {
    return (
      <span className="ml-1.5 text-[0.65rem] text-(--ui-danger,#f87171)">
        {(message || 'Setup failed') + ' '}
        <Button className="underline" onClick={() => setPhase('idle')} size="inline" variant="link">
          retry
        </Button>
      </span>
    )
  }

  // idle
  return (
    <Button
      className="ml-1.5 text-[0.65rem] text-(--ui-accent) underline"
      onClick={() => void (isOAuth ? beginOAuth() : beginKeys())}
      size="inline"
      variant="link"
    >
      {isOAuth ? 'Sign in\u2026' : 'Set up\u2026'}
    </Button>
  )
}
