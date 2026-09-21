import type {
  ConfigSchemaResponse,
  CustomEndpointsResponse,
  CustomEndpointUpdate,
  CustomEndpointValidationResponse,
  EnvVarInfo,
  LogsResponse,
  OAuthPollResponse,
  OAuthProvidersResponse,
  OAuthStartResponse,
  OAuthSubmitResponse,
  PanergosConfig,
  PanergosConfigRecord,
  ProviderDirectoryResponse,
  StatusResponse
} from '@/types/panergos'

import { capabilityScoped, panergosApi, type ProfileScope, profileScoped, STARTUP_REQUEST_TIMEOUT_MS } from './client'

export function getStatus(): Promise<StatusResponse> {
  return panergosApi<StatusResponse>({
    ...profileScoped(),
    path: '/api/status'
  })
}

export function getLogs(params: {
  component?: string
  file?: string
  level?: string
  lines?: number
  search?: string
}): Promise<LogsResponse> {
  const query = new URLSearchParams()

  if (params.file) {
    query.set('file', params.file)
  }

  if (typeof params.lines === 'number') {
    query.set('lines', String(params.lines))
  }

  if (params.level && params.level !== 'ALL') {
    query.set('level', params.level)
  }

  if (params.component && params.component !== 'all') {
    query.set('component', params.component)
  }

  if (params.search) {
    query.set('search', params.search)
  }

  const suffix = query.toString()

  return panergosApi<LogsResponse>({
    ...profileScoped(),
    path: suffix ? `/api/logs?${suffix}` : '/api/logs'
  })
}

export function getPanergosConfig(profile?: string): Promise<PanergosConfig> {
  return panergosApi<PanergosConfig>({
    ...profileScoped(profile),
    path: '/api/config',
    timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
  })
}

export function getPanergosConfigRecord(
  profile?: ProfileScope,
  { includeDefaults = true }: { includeDefaults?: boolean } = {}
): Promise<PanergosConfigRecord> {
  return window.panergosDesktop.api<PanergosConfigRecord>({
    ...capabilityScoped(profile),
    path: includeDefaults ? '/api/config' : '/api/config?include_defaults=false'
  })
}

export function getPanergosConfigDefaults(): Promise<PanergosConfigRecord> {
  return panergosApi<PanergosConfigRecord>({
    ...profileScoped(),
    path: '/api/config/defaults',
    timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
  })
}

export function getPanergosConfigSchema(profile?: null | string): Promise<ConfigSchemaResponse> {
  return panergosApi<ConfigSchemaResponse>({
    ...profileScoped(profile),
    path: '/api/config/schema'
  })
}

export function savePanergosConfig(
  config: PanergosConfigRecord,
  profile?: null | string,
  { preserveLanguage = false }: { preserveLanguage?: boolean } = {}
): Promise<{ ok: boolean }> {
  return panergosApi<{ ok: boolean }>({
    ...profileScoped(profile),
    path: preserveLanguage ? '/api/config?preserve_language=true' : '/api/config',
    method: 'PUT',
    body: { config }
  })
}

/** Capability-scoped counterpart of savePanergosConfig — writes the config of
 *  the profile/connection the Capabilities scope selector points at (possibly
 *  on another registered gateway), mirroring getPanergosConfigRecord. */
export function savePanergosConfigRecord(config: PanergosConfigRecord, profile?: ProfileScope): Promise<{ ok: boolean }> {
  return window.panergosDesktop.api<{ ok: boolean }>({
    ...capabilityScoped(profile),
    path: '/api/config',
    method: 'PUT',
    body: { config }
  })
}

export function getEnvVars(profile?: null | string): Promise<Record<string, EnvVarInfo>> {
  return panergosApi<Record<string, EnvVarInfo>>({
    ...profileScoped(profile),
    path: '/api/env'
  })
}

export function setEnvVar(key: string, value: string, profile?: ProfileScope): Promise<{ ok: boolean }> {
  return window.panergosDesktop.api<{ ok: boolean }>({
    ...capabilityScoped(profile),
    path: '/api/env',
    method: 'PUT',
    body: { key, value }
  })
}

export function deleteEnvVar(key: string, profile?: ProfileScope): Promise<{ ok: boolean }> {
  return window.panergosDesktop.api<{ ok: boolean }>({
    ...capabilityScoped(profile),
    path: '/api/env',
    method: 'DELETE',
    body: { key }
  })
}

export function revealEnvVar(key: string, profile?: ProfileScope): Promise<{ key: string; value: string }> {
  return window.panergosDesktop.api<{ key: string; value: string }>({
    ...capabilityScoped(profile),
    path: '/api/env/reveal',
    method: 'POST',
    body: { key }
  })
}

export function validateProviderCredential(
  key: string,
  value: string,
  apiKey?: string,
  profile?: ProfileScope
): Promise<{ ok: boolean; reachable: boolean; message: string; models?: string[] }> {
  return panergosApi<{ ok: boolean; reachable: boolean; message: string; models?: string[] }>({
    ...capabilityScoped(profile),
    path: '/api/providers/validate',
    method: 'POST',
    body: { key, value, api_key: apiKey ?? '' }
  })
}

export function getProviderDirectory(profile?: ProfileScope): Promise<ProviderDirectoryResponse> {
  return panergosApi<ProviderDirectoryResponse>({
    ...capabilityScoped(profile),
    path: '/api/providers/directory'
  })
}

export function getCustomEndpoints(profile?: ProfileScope): Promise<CustomEndpointsResponse> {
  return panergosApi<CustomEndpointsResponse>({
    ...capabilityScoped(profile),
    path: '/api/providers/custom-endpoints'
  })
}

export function saveCustomEndpoint(
  endpoint: CustomEndpointUpdate,
  profile?: ProfileScope
): Promise<CustomEndpointsResponse> {
  return panergosApi<CustomEndpointsResponse>({
    ...capabilityScoped(profile),
    path: '/api/providers/custom-endpoints',
    method: 'POST',
    body: endpoint
  })
}

export function validateCustomEndpoint(
  endpoint: CustomEndpointUpdate,
  profile?: ProfileScope
): Promise<CustomEndpointValidationResponse> {
  return panergosApi<CustomEndpointValidationResponse>({
    ...capabilityScoped(profile),
    path: '/api/providers/custom-endpoints/validate',
    method: 'POST',
    body: endpoint
  })
}

export function activateCustomEndpoint(
  id: string,
  profile?: ProfileScope
): Promise<{ ok: boolean; provider: string; model: string }> {
  return panergosApi<{ ok: boolean; provider: string; model: string }>({
    ...capabilityScoped(profile),
    path: `/api/providers/custom-endpoints/${encodeURIComponent(id)}/activate`,
    method: 'POST'
  })
}

export function deleteCustomEndpoint(id: string, profile?: ProfileScope): Promise<CustomEndpointsResponse> {
  return panergosApi<CustomEndpointsResponse>({
    ...capabilityScoped(profile),
    path: `/api/providers/custom-endpoints/${encodeURIComponent(id)}`,
    method: 'DELETE'
  })
}

export function listOAuthProviders(profile?: null | string): Promise<OAuthProvidersResponse> {
  return panergosApi<OAuthProvidersResponse>({
    ...profileScoped(profile),
    path: '/api/providers/oauth'
  })
}

export function disconnectOAuthProvider(
  providerId: string,
  profile?: null | string
): Promise<{ ok: boolean; provider: string }> {
  return panergosApi<{ ok: boolean; provider: string }>({
    ...profileScoped(profile),
    path: `/api/providers/oauth/${encodeURIComponent(providerId)}`,
    method: 'DELETE'
  })
}

export function startOAuthLogin(providerId: string, profile?: ProfileScope): Promise<OAuthStartResponse> {
  return window.panergosDesktop.api<OAuthStartResponse>({
    ...capabilityScoped(profile),
    path: `/api/providers/oauth/${encodeURIComponent(providerId)}/start`,
    method: 'POST',
    body: {}
  })
}

export function submitOAuthCode(
  providerId: string,
  sessionId: string,
  code: string,
  profile?: null | string
): Promise<OAuthSubmitResponse> {
  return panergosApi<OAuthSubmitResponse>({
    ...profileScoped(profile),
    path: `/api/providers/oauth/${encodeURIComponent(providerId)}/submit`,
    method: 'POST',
    body: { session_id: sessionId, code }
  })
}

export function pollOAuthSession(
  providerId: string,
  sessionId: string,
  profile?: ProfileScope
): Promise<OAuthPollResponse> {
  return window.panergosDesktop.api<OAuthPollResponse>({
    ...capabilityScoped(profile),
    path: `/api/providers/oauth/${encodeURIComponent(providerId)}/poll/${encodeURIComponent(sessionId)}`
  })
}

export function cancelOAuthSession(sessionId: string, profile?: null | string): Promise<{ ok: boolean }> {
  return panergosApi<{ ok: boolean }>({
    ...profileScoped(profile),
    path: `/api/providers/oauth/sessions/${encodeURIComponent(sessionId)}`,
    method: 'DELETE'
  })
}
