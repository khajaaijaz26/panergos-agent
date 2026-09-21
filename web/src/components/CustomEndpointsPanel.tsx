import { useEffect, useState } from "react";
import { Check, ExternalLink, Globe2, Plus, Save, Search, Trash2, Zap } from "lucide-react";
import { Badge } from "@panergos/ui/ui/components/badge";
import { Button } from "@panergos/ui/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@panergos/ui/ui/components/card";
import { Input } from "@panergos/ui/ui/components/input";
import { Spinner } from "@panergos/ui/ui/components/spinner";
import { Switch } from "@panergos/ui/ui/components/switch";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useProfileScope } from "@/contexts/useProfileScope";
import { api } from "@/lib/api";
import type {
  CustomEndpoint,
  CustomEndpointUpdate,
  ProviderDirectoryEntry,
} from "@/lib/api";

interface EndpointForm {
  apiKey: string;
  baseUrl: string;
  contextLength: string;
  discoverModels: boolean;
  id: string;
  makeDefault: boolean;
  model: string;
  name: string;
}

const EMPTY_FORM: EndpointForm = {
  apiKey: "",
  baseUrl: "",
  contextLength: "",
  discoverModels: true,
  id: "",
  makeDefault: true,
  model: "",
  name: "",
};

function formFromEndpoint(endpoint: CustomEndpoint): EndpointForm {
  return {
    apiKey: "",
    baseUrl: endpoint.base_url,
    contextLength: endpoint.context_length
      ? String(endpoint.context_length)
      : "",
    discoverModels: endpoint.discover_models,
    id: endpoint.id,
    makeDefault: Boolean(endpoint.is_current),
    model: endpoint.model,
    name: endpoint.name,
  };
}

function endpointPayload(
  form: EndpointForm,
  models?: string[],
  createOnly = false,
): CustomEndpointUpdate {
  const contextLength = Number.parseInt(form.contextLength, 10);
  return {
    api_key: form.apiKey.trim() || undefined,
    base_url: form.baseUrl.trim(),
    context_length:
      Number.isFinite(contextLength) && contextLength > 0
        ? contextLength
        : undefined,
    create_only: createOnly,
    discover_models: form.discoverModels,
    id: form.id.trim() || undefined,
    make_default: form.makeDefault,
    model: form.model.trim(),
    models: models?.length ? models : undefined,
    name: form.name.trim(),
  };
}

export function CustomEndpointsPanel({
  onChanged,
}: {
  onChanged(): void;
}) {
  const { profile } = useProfileScope();
  return <ProfileCustomEndpointsPanel key={profile} onChanged={onChanged} profile={profile} />;
}

function ProfileCustomEndpointsPanel({
  onChanged,
  profile,
}: {
  onChanged(): void;
  profile: string;
}) {
  const [endpoints, setEndpoints] = useState<CustomEndpoint[]>([]);
  const [directory, setDirectory] = useState<ProviderDirectoryEntry[]>([]);
  const [directoryError, setDirectoryError] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryId, setDirectoryId] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [form, setForm] = useState<EndpointForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomEndpoint | null>(null);

  async function refresh() {
    const response = await api.getCustomEndpoints(profile);
    setEndpoints(response.endpoints);
    return response.endpoints;
  }

  useEffect(() => {
    let cancelled = false;
    api
      .getProviderDirectory(profile)
      .then((response) => {
        if (!cancelled) setDirectory(response.providers);
      })
      .catch(() => {
        if (!cancelled) setDirectoryError(true);
      })
      .finally(() => {
        if (!cancelled) setDirectoryLoading(false);
      });
    api
      .getCustomEndpoints(profile)
      .then((response) => {
        if (cancelled) return;
        setEndpoints(response.endpoints);
        const selected =
          response.endpoints.find((endpoint) => endpoint.is_current) ??
          response.endpoints[0];
        if (selected) {
          setForm(formFromEndpoint(selected));
          setModels(selected.models);
          setCreating(false);
        } else {
          setCreating(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage({ kind: "error", text: `Could not load endpoints: ${error}` });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  function selectEndpoint(endpoint: CustomEndpoint) {
    setCreating(false);
    setForm(formFromEndpoint(endpoint));
    setModels(endpoint.models);
    setMessage(null);
  }

  function startNew() {
    setDirectoryId("");
    setCreating(true);
    setForm(EMPTY_FORM);
    setModels([]);
    setMessage(null);
  }

  function selectDirectoryProvider(id: string) {
    setDirectoryId(id);
    setMessage(null);
    const provider = directory.find((candidate) => candidate.id === id);
    if (!provider || provider.setup_kind === "built_in") return;
    const saved = endpoints.find(
      (endpoint) =>
        endpoint.id === provider.id || endpoint.base_url === provider.base_url,
    );
    if (saved) {
      selectEndpoint(saved);
      setDirectoryId(id);
      return;
    }
    setCreating(true);
    setModels(provider.models);
    setForm({
      ...EMPTY_FORM,
      baseUrl: provider.base_url ?? "",
      id: provider.id,
      model: provider.models[0] ?? "",
      name: provider.name,
    });
  }

  async function testEndpoint() {
    setAction("test");
    setMessage(null);
    try {
      const response = await api.validateCustomEndpoint(endpointPayload(form));
      setModels(response.models);
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: response.message || "Endpoint validation failed.",
        });
        return;
      }
      if (!form.model && response.models[0]) {
        setForm((current) => ({ ...current, model: response.models[0] }));
      }
      setMessage({
        kind: "success",
        text: response.models.length
          ? `Connected. Discovered ${response.models.length} model${response.models.length === 1 ? "" : "s"}.`
          : "Connected. No models were advertised; enter a model ID manually.",
      });
    } catch (error) {
      setMessage({ kind: "error", text: `Test failed: ${error}` });
    } finally {
      setAction(null);
    }
  }

  async function saveEndpoint() {
    setAction("save");
    setMessage(null);
    try {
      const response = await api.saveCustomEndpoint(
        endpointPayload(form, models, creating),
        profile,
      );
      setEndpoints(response.endpoints);
      const saved = response.endpoints.find(
        (endpoint) => endpoint.id === response.id,
      );
      if (saved) selectEndpoint(saved);
      setMessage({ kind: "success", text: "Endpoint saved." });
      onChanged();
    } catch (error) {
      setMessage({ kind: "error", text: `Save failed: ${error}` });
    } finally {
      setAction(null);
    }
  }

  async function activateEndpoint(endpoint: CustomEndpoint) {
    setAction(`activate:${endpoint.id}`);
    setMessage(null);
    try {
      await api.activateCustomEndpoint(endpoint.id, profile);
      const next = await refresh();
      const active = next.find((candidate) => candidate.id === endpoint.id);
      if (active) selectEndpoint(active);
      setMessage({
        kind: "success",
        text: `${endpoint.name} is now the active model endpoint.`,
      });
      onChanged();
    } catch (error) {
      setMessage({ kind: "error", text: `Activation failed: ${error}` });
    } finally {
      setAction(null);
    }
  }

  async function deleteEndpoint() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setAction(`delete:${target.id}`);
    setMessage(null);
    try {
      const response = await api.deleteCustomEndpoint(target.id, profile);
      setEndpoints(response.endpoints);
      if (form.id === target.id) startNew();
      setDeleteTarget(null);
      setMessage({ kind: "success", text: `${target.name} deleted.` });
      onChanged();
    } catch (error) {
      setMessage({ kind: "error", text: `Delete failed: ${error}` });
    } finally {
      setAction(null);
    }
  }

  const modelOptions = Array.from(
    new Set([...models, form.model].filter(Boolean)),
  );
  const selectedDirectory = directory.find(
    (provider) => provider.id === directoryId,
  );
  const normalizedDirectoryQuery = directoryQuery.trim().toLocaleLowerCase();
  const matchingDirectory = normalizedDirectoryQuery
    ? directory.filter((provider) =>
        `${provider.name} ${provider.id} ${provider.key_env ?? ""} ${provider.models.join(" ")}`
          .toLocaleLowerCase()
          .includes(normalizedDirectoryQuery),
      )
    : directory;
  const visibleDirectory =
    selectedDirectory && !matchingDirectory.includes(selectedDirectory)
      ? [selectedDirectory, ...matchingDirectory]
      : matchingDirectory;
  const catalogModelCount = directory.reduce(
    (total, provider) => total + provider.total_models,
    0,
  );
  const canSave = Boolean(
    form.name.trim() && form.baseUrl.trim() && form.model.trim(),
  );

  return (
    <>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Any other AI provider or model</CardTitle>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                If a company is not in the built-in list, enter its OpenAI-compatible
                API URL and key. Panergos discovers every model it advertises; you can
                also type an exact model ID manually. Open the official setup link,
                create or copy the key, paste it below, then test and save.
              </p>
            </div>
            <Button size="sm" outlined onClick={startNew}>
              <Plus className="h-3.5 w-3.5" /> New endpoint
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid min-w-0 gap-4 pt-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="grid min-w-0 gap-3 border border-primary/30 bg-primary/5 p-3 lg:col-span-2">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-xs text-text-secondary">
                Search supported companies and catalog models
                <span className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    aria-label="Search provider directory"
                    className="pl-8"
                    onChange={(event) => setDirectoryQuery(event.target.value)}
                    placeholder="Company, model, or API key name"
                    value={directoryQuery}
                  />
                </span>
              </label>
              <label className="grid gap-1.5 text-xs text-text-secondary">
                AI company
                <select
                  aria-label="AI provider directory"
                  className="h-9 min-w-0 border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  onChange={(event) => selectDirectoryProvider(event.target.value)}
                  value={directoryId}
                >
                  <option value="">Choose a company or keep manual setup</option>
                  {visibleDirectory.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} - {provider.total_models.toLocaleString()} models
                      {provider.configured ? " (connected)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-text-tertiary">
              {directoryLoading
                ? "Loading the provider and model directory..."
                : directoryError
                  ? "The provider directory could not load. Manual URL, key, and model setup below still works."
                  : `${directory.length.toLocaleString()} provider setup options and ${catalogModelCount.toLocaleString()} cataloged model entries. Search includes up to 100 catalog model IDs per provider; connecting discovers its live list. Unsupported proprietary protocols need an OpenAI-compatible adapter.`}
            </p>
            {selectedDirectory && (
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-t border-border/50 pt-3 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {selectedDirectory.name}
                    {selectedDirectory.key_env ? ` | API key: ${selectedDirectory.key_env}` : ""}
                  </p>
                  <p className="mt-1 break-words text-text-secondary">
                    Models: {selectedDirectory.models.slice(0, 12).join(", ") || "discover after connecting"}
                    {selectedDirectory.total_models > 12
                      ? ` +${selectedDirectory.total_models - 12} more`
                      : ""}
                  </p>
                  {selectedDirectory.setup_kind === "built_in" &&
                    selectedDirectory.setup_tab === "keys" &&
                    !selectedDirectory.key_env &&
                    !selectedDirectory.configured && (
                      <p className="mt-1 text-text-secondary">
                        Advanced credentials: run <code>panergos model</code> and choose {selectedDirectory.name}.
                      </p>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedDirectory.signup_url && (
                    <a
                      className="inline-flex h-8 items-center gap-1.5 border border-border bg-background px-3 font-medium text-foreground hover:bg-muted"
                      href={selectedDirectory.signup_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {selectedDirectory.setup_tab === "accounts"
                        ? "Provider setup instructions"
                        : "Get key & setup instructions"} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {selectedDirectory.setup_kind === "built_in" && selectedDirectory.key_env && (
                    <Button
                      outlined
                      size="sm"
                      onClick={() =>
                        document
                          .getElementById("connect-model-card")
                          ?.scrollIntoView?.({ behavior: "smooth", block: "start" })
                      }
                    >
                      Enter API key above
                    </Button>
                  )}
                  {selectedDirectory.setup_kind === "built_in" &&
                    selectedDirectory.setup_tab === "accounts" &&
                    !selectedDirectory.configured && (
                    <Button
                      outlined
                      size="sm"
                      onClick={() => {
                        const section = document.getElementById(
                          "connect-provider-account",
                        ) as HTMLDetailsElement | null;
                        if (section) section.open = true;
                        section?.scrollIntoView?.({ behavior: "smooth", block: "start" });
                      }}
                    >
                      Sign in with provider
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-2">
            {loading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : endpoints.length ? (
              endpoints.map((endpoint) => (
                <div
                  className="flex min-w-0 items-center gap-2 border border-border/50 bg-muted/20 p-3"
                  key={endpoint.id}
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => selectEndpoint(endpoint)}
                    type="button"
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{endpoint.name}</span>
                      {endpoint.is_current && <Badge>Active</Badge>}
                    </span>
                    <span className="mt-1 block truncate font-mono text-xs text-text-secondary">
                      {endpoint.model} · {endpoint.base_url}
                    </span>
                    {endpoint.has_api_key && (
                      <span className="mt-1 block text-xs text-text-tertiary">API key saved</span>
                    )}
                  </button>
                  <Button
                    aria-label={`Activate ${endpoint.name}`}
                    disabled={endpoint.is_current || action !== null}
                    onClick={() => void activateEndpoint(endpoint)}
                    outlined
                    size="sm"
                  >
                    {action === `activate:${endpoint.id}` ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
                    Use
                  </Button>
                  {endpoint.source !== "direct-config" && (
                    <Button
                      aria-label={`Delete ${endpoint.name}`}
                      disabled={action !== null}
                      ghost
                      onClick={() => setDeleteTarget(endpoint)}
                      size="icon"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <div className="border border-dashed border-border px-4 py-8 text-center text-xs text-text-secondary">
                No custom endpoints yet.
              </div>
            )}
          </div>

          <div className="grid min-w-0 gap-3 border border-border/50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs text-text-secondary">
                Display name
                <Input
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="My model server"
                  value={form.name}
                />
              </label>
              <label className="grid gap-1.5 text-xs text-text-secondary">
                Provider ID <span className="text-text-tertiary">optional</span>
                <Input
                  disabled={endpoints.some((endpoint) => endpoint.id === form.id)}
                  onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))}
                  placeholder="my-provider"
                  value={form.id}
                />
              </label>
            </div>

            <label className="grid gap-1.5 text-xs text-text-secondary">
              OpenAI-compatible base URL
              <Input
                inputMode="url"
                onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
                placeholder="http://127.0.0.1:11434/v1"
                value={form.baseUrl}
              />
            </label>

            <label className="grid gap-1.5 text-xs text-text-secondary">
              API key <span className="text-text-tertiary">required for authenticated providers</span>
              <Input
                autoComplete="new-password"
                name="custom-endpoint-api-key"
                onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder={form.id ? "Leave blank to keep the saved key" : "Optional for keyless local servers"}
                spellCheck={false}
                type="password"
                value={form.apiKey}
              />
              <span className="text-text-tertiary">
                Stored in your profile’s .env, never config.yaml. Re-enter a
                saved key only when testing it again.
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <label className="grid gap-1.5 text-xs text-text-secondary">
                Active model
                <Input
                  list="custom-endpoint-models"
                  onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                  placeholder="Test to discover models, or type an ID"
                  value={form.model}
                />
                <datalist id="custom-endpoint-models">
                  {modelOptions.map((model) => <option key={model} value={model} />)}
                </datalist>
              </label>
              <label className="grid gap-1.5 text-xs text-text-secondary">
                Context tokens
                <Input
                  inputMode="numeric"
                  onChange={(event) => setForm((current) => ({ ...current, contextLength: event.target.value }))}
                  placeholder="auto"
                  value={form.contextLength}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-secondary">
              <label className="flex items-center gap-2">
                <Switch
                  checked={form.discoverModels}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, discoverModels: checked }))}
                />
                Discover models
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={form.makeDefault}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, makeDefault: checked }))}
                />
                Make active when saved
              </label>
            </div>

            {models.length > 0 && (
              <p className="text-xs text-text-secondary">
                Discovered: {models.slice(0, 5).join(", ")}
                {models.length > 5 ? ` +${models.length - 5} more` : ""}
              </p>
            )}
            {message && (
              <p
                aria-live="polite"
                className={message.kind === "error" ? "text-xs text-destructive" : "text-xs text-success"}
                role="status"
              >
                {message.text}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!form.baseUrl.trim() || action !== null}
                onClick={() => void testEndpoint()}
                outlined
              >
                {action === "test" ? <Spinner /> : <Zap className="h-3.5 w-3.5" />}
                Test & discover
              </Button>
              <Button
                disabled={!canSave || action !== null}
                onClick={() => void saveEndpoint()}
              >
                {action === "save" ? <Spinner /> : <Save className="h-3.5 w-3.5" />}
                Save{form.makeDefault ? " & activate" : ""}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        description="This removes the endpoint and its stored API key from this profile."
        loading={deleteTarget ? action === `delete:${deleteTarget.id}` : false}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteEndpoint()}
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "endpoint"}?`}
      />
    </>
  );
}
