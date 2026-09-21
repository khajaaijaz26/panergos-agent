import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SearchField } from '@/components/ui/search-field'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Check, Globe, Loader2, Plus, Save, Trash2, Zap } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  activateCustomEndpoint,
  deleteCustomEndpoint,
  getCustomEndpoints,
  getProviderDirectory,
  type ProfileScope,
  saveCustomEndpoint,
  validateCustomEndpoint
} from '@/panergos'
import { confirm } from '@/store/confirm'
import { notify, notifyError } from '@/store/notifications'
import type { CustomEndpoint, CustomEndpointUpdate, ProviderDirectoryEntry } from '@/types/panergos'

import { EmptyState, Pill, SectionHeading, SettingsContent, SettingsSkeleton } from './primitives'
import { SettingsProfileScope } from './profile-scope'

interface CustomEndpointsSettingsProps {
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
  onOpenAccounts: () => void
  onOpenApiKeys: () => void
  profile?: ProfileScope
}

interface EndpointForm {
  apiKey: string
  baseUrl: string
  contextLength: string
  discoverModels: boolean
  id: string
  makeDefault: boolean
  model: string
  name: string
}

const EMPTY_FORM: EndpointForm = {
  apiKey: '',
  baseUrl: '',
  contextLength: '',
  discoverModels: true,
  id: '',
  makeDefault: true,
  model: '',
  name: ''
}

function formFromEndpoint(endpoint: CustomEndpoint): EndpointForm {
  return {
    apiKey: '',
    baseUrl: endpoint.base_url,
    contextLength: endpoint.context_length ? String(endpoint.context_length) : '',
    discoverModels: endpoint.discover_models,
    id: endpoint.id,
    makeDefault: Boolean(endpoint.is_current),
    model: endpoint.model,
    name: endpoint.name
  }
}

function toPayload(form: EndpointForm, models?: string[]): CustomEndpointUpdate {
  const contextLength = Number.parseInt(form.contextLength, 10)

  return {
    id: form.id.trim() || undefined,
    name: form.name.trim(),
    base_url: form.baseUrl.trim(),
    model: form.model.trim(),
    api_key: form.apiKey.trim() || undefined,
    context_length: Number.isFinite(contextLength) && contextLength > 0 ? contextLength : undefined,
    discover_models: form.discoverModels,
    make_default: form.makeDefault,
    models: models?.length ? models : undefined
  }
}

export function CustomEndpointsSettings({
  onConfigSaved,
  onMainModelChanged,
  onOpenAccounts,
  onOpenApiKeys,
  profile
}: CustomEndpointsSettingsProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [endpoints, setEndpoints] = useState<CustomEndpoint[]>([])
  const [providers, setProviders] = useState<ProviderDirectoryEntry[]>([])
  const [providerQuery, setProviderQuery] = useState('')
  const [form, setForm] = useState<EndpointForm>(EMPTY_FORM)
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])

  async function refresh() {
    const data = await getCustomEndpoints(profile)
    setEndpoints(data.endpoints)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      const [endpointResult, directoryResult] = await Promise.allSettled([
        getCustomEndpoints(profile),
        getProviderDirectory(profile)
      ])

      if (cancelled) {
        return
      }

      if (endpointResult.status === 'fulfilled') {
        setEndpoints(endpointResult.value.endpoints)
        const current = endpointResult.value.endpoints.find(endpoint => endpoint.is_current) ?? endpointResult.value.endpoints[0]
        setForm(current ? formFromEndpoint(current) : EMPTY_FORM)
        setDiscoveredModels(current?.models ?? [])
      } else {
        notifyError(endpointResult.reason, 'Could not load custom endpoints')
      }

      if (directoryResult.status === 'fulfilled') {
        setProviders(directoryResult.value.providers)
      } else {
        notifyError(directoryResult.reason, 'Could not load provider directory')
      }

      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [profile])

  async function handleSave() {
    try {
      setSaving(true)
      const response = await saveCustomEndpoint(toPayload(form, discoveredModels), profile)
      setEndpoints(response.endpoints)
      const saved = response.endpoints.find(endpoint => endpoint.id === response.id)

      if (saved) {
        setForm(formFromEndpoint(saved))
        setDiscoveredModels(saved.models)
      }

      if (saved && saved.is_current) {
        onMainModelChanged?.(saved.id, saved.model)
      }

      triggerHaptic('success')
      onConfigSaved?.()
      notify({ kind: 'success', message: 'Custom endpoint saved.' })
    } catch (err) {
      notifyError(err, 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleValidate() {
    try {
      setTesting(true)
      const response = await validateCustomEndpoint(toPayload(form), profile)
      setDiscoveredModels(response.models)

      if (response.ok) {
        if (!form.model && response.models[0]) {
          setForm(current => ({ ...current, model: response.models[0] }))
        }

        notify({
          kind: 'success',
          message: response.models.length
            ? `Endpoint is reachable. Found ${response.models.length} models.`
            : 'Endpoint is reachable.'
        })
      } else {
        notify({
          kind: response.reachable ? 'warning' : 'error',
          message: response.message || 'Endpoint validation failed.'
        })
      }
    } catch (err) {
      notifyError(err, 'Validation failed')
    } finally {
      setTesting(false)
    }
  }

  async function handleActivate(endpoint: CustomEndpoint) {
    try {
      setActivating(endpoint.id)
      const response = await activateCustomEndpoint(endpoint.id, profile)
      await refresh()
      onConfigSaved?.()
      onMainModelChanged?.(response.provider, response.model)
      triggerHaptic('success')
    } catch (err) {
      notifyError(err, 'Activation failed')
    } finally {
      setActivating(null)
    }
  }

  async function handleDelete(endpoint: CustomEndpoint) {
    // This panel is not internationalized at all — keep the literal it had.
    if (!(await confirm({ destructive: true, title: `Delete ${endpoint.name}?` }))) {
      return
    }

    try {
      setDeleting(endpoint.id)
      const response = await deleteCustomEndpoint(endpoint.id, profile)
      setEndpoints(response.endpoints)

      if (form.id === endpoint.id) {
        setForm(EMPTY_FORM)
        setDiscoveredModels([])
      }

      onConfigSaved?.()
      triggerHaptic('success')
    } catch (err) {
      notifyError(err, 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return <SettingsSkeleton sections={[{ heading: true, rows: 3 }]} />
  }

  const allModelOptions = Array.from(new Set([...discoveredModels, form.model].filter(Boolean)))
  const canSave = form.name.trim() && form.baseUrl.trim() && form.model.trim()
  const query = providerQuery.trim().toLowerCase()

  const visibleProviders = query
    ? providers.filter(provider =>
        [provider.name, provider.id, provider.key_env ?? '', ...provider.models].some(value =>
          value.toLowerCase().includes(query)
        )
      )
    : providers

  const selectedProvider = providers.find(
    provider => provider.setup_kind === 'custom_endpoint' && provider.id === form.id
  )

  return (
    <SettingsContent>
      <div className="space-y-6">
        <SettingsProfileScope />
        <section>
          <SectionHeading icon={Globe} meta={`${providers.length}`} title="AI provider directory" />
          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            Search every supported company or model. Built-in providers open the API-key screen; compatible
            providers fill the connection form for you. Open the official link, create or copy the key, paste it,
            then test and save.
          </p>
          <SearchField
            aria-label="Search companies or models"
            containerClassName="mb-3 w-full"
            onChange={setProviderQuery}
            placeholder="Search companies or models..."
            value={providerQuery}
          />
          <div className="max-h-96 divide-y divide-border/40 overflow-y-auto rounded-md border border-border/50">
            {visibleProviders.length ? (
              visibleProviders.map(provider => (
                <div
                  className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  key={`${provider.setup_kind}:${provider.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{provider.name}</span>
                      <Pill>{provider.setup_kind === 'built_in' ? 'Built in' : 'Compatible API'}</Pill>
                      <Pill tone={provider.configured ? 'success' : 'muted'}>
                        {provider.configured ? 'Connected' : 'Not connected'}
                      </Pill>
                      <Pill>
                        {provider.total_models} {provider.total_models === 1 ? 'model' : 'models'}
                      </Pill>
                    </div>
                    <div className="mt-1 font-mono text-[0.68rem] text-muted-foreground">
                      {provider.key_env
                        ? `API key: ${provider.key_env}`
                        : provider.configured
                          ? 'Ready without an API key'
                          : provider.setup_tab === 'accounts'
                            ? 'Provider account sign-in'
                            : 'Advanced credential setup'}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {provider.models.length
                        ? `${provider.models.slice(0, 8).join(', ')}${provider.total_models > 8 ? ` +${provider.total_models - 8} more` : ''}`
                        : 'Models are discovered after connection.'}
                    </p>
                    {provider.setup_kind === 'built_in' &&
                      provider.setup_tab === 'keys' &&
                      !provider.key_env &&
                      !provider.configured && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Advanced credentials: run <code>panergos model</code> and choose {provider.name}.
                        </p>
                      )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {provider.signup_url && (
                      <a
                        className="text-xs font-medium text-primary hover:underline"
                        href={provider.signup_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Get key / setup instructions
                      </a>
                    )}
                    {provider.setup_kind === 'built_in' && provider.key_env ? (
                      <Button onClick={onOpenApiKeys} size="sm" variant="outline">
                        {provider.configured ? 'Manage key' : 'Add API key'}
                      </Button>
                    ) : provider.setup_kind === 'built_in' &&
                      provider.setup_tab === 'accounts' &&
                      !provider.configured ? (
                      <Button onClick={onOpenAccounts} size="sm" variant="outline">
                        Sign in
                      </Button>
                    ) : (
                      provider.setup_kind === 'custom_endpoint' && <Button
                        aria-label={`Set up ${provider.name}`}
                        onClick={() => {
                          const saved = endpoints.find(
                            endpoint => endpoint.id === provider.id || endpoint.base_url === provider.base_url
                          )

                          setForm(
                            saved
                              ? formFromEndpoint(saved)
                              : {
                                  ...EMPTY_FORM,
                                  baseUrl: provider.base_url ?? '',
                                  id: provider.id,
                                  model: provider.models[0] ?? '',
                                  name: provider.name
                                }
                          )
                          setDiscoveredModels(saved?.models ?? provider.models)
                          document
                            .getElementById('provider-connection-form')
                            ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Set up
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="grid min-h-24 place-items-center px-4 py-6 text-center text-xs text-muted-foreground">
                No companies or models match your search.
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionHeading icon={Globe} meta={`${endpoints.length}`} title="Saved compatible endpoints" />
          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            Connect a cloud company or local server that exposes an OpenAI-compatible API. Test discovers its
            model names; you can always enter an exact model ID manually.
          </p>
          <div className="divide-y divide-border/40 rounded-md border border-border/50">
            {endpoints.length ? (
              endpoints.map(endpoint => (
                <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={endpoint.id}>
                  <button
                    className="min-w-0 text-left"
                    onClick={() => {
                      setForm(formFromEndpoint(endpoint))
                      setDiscoveredModels(endpoint.models)
                    }}
                    type="button"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{endpoint.name}</span>
                      {endpoint.is_current && (
                        <Pill tone="primary">
                          <Check className="size-3" />
                          Active
                        </Pill>
                      )}
                      {endpoint.source === 'direct-config' && <Pill>config.yaml</Pill>}
                    </div>
                    <div className="mt-1 truncate font-mono text-[0.7rem] text-muted-foreground">
                      {endpoint.base_url}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{endpoint.model}</span>
                      {endpoint.has_api_key && <span>{endpoint.api_key_preview ?? 'API key set'}</span>}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <Button
                      disabled={endpoint.is_current || activating === endpoint.id}
                      onClick={() => void handleActivate(endpoint)}
                      size="sm"
                      variant="outline"
                    >
                      {activating === endpoint.id ? <Loader2 className="animate-spin" /> : <Zap />}
                      Use
                    </Button>
                    {endpoint.source !== 'direct-config' && (
                      <Button
                        className="hover:text-destructive"
                        disabled={deleting === endpoint.id}
                        onClick={() => void handleDelete(endpoint)}
                        size="icon-sm"
                        title={t.settings.customEndpoints.deleteEndpoint}
                        variant="ghost"
                      >
                        {deleting === endpoint.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                description={t.settings.customEndpoints.emptyDescription}
                title={t.settings.customEndpoints.emptyTitle}
              />
            )}
          </div>
        </section>

        <section id="provider-connection-form">
          <SectionHeading icon={Plus} title={form.id ? 'Edit Endpoint' : 'Add Endpoint'} />
          <div className="grid gap-3 rounded-md border border-border/50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs text-muted-foreground">
                Name
                <Input
                  onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                  placeholder={t.settings.customEndpoints.namePlaceholder}
                  value={form.name}
                />
              </label>
              <label className="grid gap-1.5 text-xs text-muted-foreground">
                Provider ID
                <Input
                  onChange={event => setForm(current => ({ ...current, id: event.target.value }))}
                  placeholder="axet-proxy"
                  value={form.id}
                />
              </label>
            </div>
            <label className="grid gap-1.5 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs font-medium text-foreground">
              API Key{selectedProvider?.key_env ? ` (${selectedProvider.key_env})` : ''}
              <Input
                aria-label="API Key"
                onChange={event => setForm(current => ({ ...current, apiKey: event.target.value }))}
                placeholder={endpoints.some(endpoint => endpoint.id === form.id) ? 'Leave blank to keep current key' : 'Paste provider API key'}
                type="password"
                value={form.apiKey}
              />
              <span className="font-normal text-muted-foreground">
                {endpoints.some(endpoint => endpoint.id === form.id)
                  ? 'A key is already saved; leave this blank to keep it.'
                  : 'Paste the provider key here. Leave blank only for local or keyless servers.'}
              </span>
            </label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              Endpoint URL
              <Input
                onChange={event => setForm(current => ({ ...current, baseUrl: event.target.value }))}
                placeholder="http://127.0.0.1:8081/v1"
                value={form.baseUrl}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <label className="grid gap-1.5 text-xs text-muted-foreground">
                Default Model
                <Input
                  list="custom-endpoint-models"
                  onChange={event => setForm(current => ({ ...current, model: event.target.value }))}
                  placeholder="gpt-5.4"
                  value={form.model}
                />
                <datalist id="custom-endpoint-models">
                  {allModelOptions.map(model => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              <label className="grid gap-1.5 text-xs text-muted-foreground">
                Context
                <Input
                  inputMode="numeric"
                  onChange={event => setForm(current => ({ ...current, contextLength: event.target.value }))}
                  placeholder={t.settings.customEndpoints.contextPlaceholder}
                  value={form.contextLength}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={form.makeDefault}
                  onCheckedChange={checked => setForm(current => ({ ...current, makeDefault: checked === true }))}
                />
                Use for new chats
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={form.discoverModels}
                  onCheckedChange={checked => setForm(current => ({ ...current, discoverModels: checked === true }))}
                />
                Discover models
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={testing || !form.baseUrl.trim()}
                onClick={() => void handleValidate()}
                variant="outline"
              >
                {testing ? <Loader2 className="animate-spin" /> : <Zap />}
                Test
              </Button>
              <Button disabled={saving || !canSave} onClick={() => void handleSave()}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save
              </Button>
              <Button
                className={cn(!form.id && 'hidden')}
                onClick={() => {
                  setForm(EMPTY_FORM)
                  setDiscoveredModels([])
                }}
                type="button"
                variant="ghost"
              >
                New endpoint
              </Button>
            </div>
          </div>
        </section>
      </div>
    </SettingsContent>
  )
}
