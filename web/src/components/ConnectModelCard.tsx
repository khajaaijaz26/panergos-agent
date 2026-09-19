import { useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound, SlidersHorizontal } from "lucide-react";
import type { ModelOptionProvider } from "@panergos/shared";
import { Button } from "@panergos/ui/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@panergos/ui/ui/components/card";
import { Input } from "@panergos/ui/ui/components/input";
import { Spinner } from "@panergos/ui/ui/components/spinner";
import { ModelPickerDialog } from "@/components/ModelPickerDialog";
import { api, getManagementProfile } from "@/lib/api";
import type { EnvVarInfo } from "@/lib/api";

interface ProviderChoice {
  envKey: string;
  isSet: boolean;
  label: string;
  slug: string;
  url: string | null;
}

interface StatusMessage {
  kind: "error" | "success" | "warning";
  text: string;
}

function providerChoices(vars: Record<string, EnvVarInfo>): ProviderChoice[] {
  const choices = new Map<string, ProviderChoice>();

  for (const [envKey, info] of Object.entries(vars)) {
    const slug = info.provider?.trim();
    if (
      !slug ||
      info.category !== "provider" ||
      !info.is_password
    ) {
      continue;
    }

    const existing = choices.get(slug);
    // A provider can advertise aliases. The first key is canonical; aliases
    // only contribute connection state and must never become the write target.
    if (!existing) {
      choices.set(slug, {
        envKey,
        isSet: info.is_set,
        label: info.provider_label?.trim() || slug,
        slug,
        url: info.url,
      });
    } else if (info.is_set && !existing.isSet) {
      choices.set(slug, { ...existing, isSet: true });
    }
  }

  return [...choices.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function firstAvailableModel(provider: ModelOptionProvider): string {
  const models = provider.models ?? [];
  const available = new Set(models);
  return (
    provider.featured_models?.find((model) => available.has(model)) ??
    models[0] ??
    ""
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ConnectModelCard({ onChanged }: { onChanged(): void }) {
  const [profile] = useState(getManagementProfile);
  const [providers, setProviders] = useState<ProviderChoice[]>([]);
  const [providerSlug, setProviderSlug] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getEnvVars(profile)
      .then((vars) => {
        if (cancelled) return;
        const next = providerChoices(vars);
        setProviders(next);
        setProviderSlug((current) =>
          next.some((provider) => provider.slug === current) ? current : "",
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage({
            kind: "error",
            text: `Could not load model providers: ${errorText(error)}`,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const selected = providers.find((provider) => provider.slug === providerSlug);
  const connectedProviderCount = providers.filter(
    (provider) => provider.isSet,
  ).length;

  async function connect() {
    const key = apiKey.trim();
    if (!selected || !key || connecting) return;

    let saved = false;
    setConnecting(true);
    setMessage(null);
    try {
      const probe = await api.validateProviderCredential(
        selected.envKey,
        key,
        profile,
      );
      if (!probe.ok && probe.reachable) {
        setMessage({
          kind: "error",
          text: probe.message || "That API key was rejected. Check it and try again.",
        });
        return;
      }

      const validationWarning = !probe.reachable
        ? probe.message || "This provider does not support a live API-key check."
        : "";

      await api.setEnvVar(selected.envKey, key, profile);
      saved = true;
      setApiKey("");
      setProviders((current) =>
        current.map((provider) =>
          provider.slug === selected.slug
            ? { ...provider, isSet: true }
            : provider,
        ),
      );
      onChanged();

      const options = await api.getModelOptions({ profile, refresh: true });
      const provider = options.providers.find(
        (candidate) => candidate.slug === selected.slug,
      );
      const model = provider ? firstAvailableModel(provider) : "";

      if (!provider || !model) {
        setMessage({
          kind: "warning",
          text: `${selected.label} is connected, but no model was returned. Choose one manually.`,
        });
        setPickerOpen(true);
        return;
      }

      const result = await api.setModelAssignment({
        scope: "main",
        provider: provider.slug,
        model,
        task: "main",
      }, profile);
      if (result.confirm_required) {
        setMessage({
          kind: "warning",
          text: `${selected.label} is connected. The suggested model needs your confirmation in the model picker.`,
        });
        setPickerOpen(true);
        return;
      }
      if (!result.ok) throw new Error("The model could not be activated.");

      setMessage({
        kind: validationWarning ? "warning" : "success",
        text: validationWarning
          ? `${selected.label} is connected and ${model} is now the main model for new sessions. ${validationWarning}`
          : `${selected.label} is connected and ${model} is now the main model for new sessions.`,
      });
      onChanged();
    } catch (error) {
      if (saved) {
        setMessage({
          kind: "warning",
          text: `${selected.label} is connected, but its main model for new sessions could not be selected: ${errorText(error)} Choose one manually.`,
        });
        setPickerOpen(true);
      } else {
        setMessage({ kind: "error", text: `Connection failed: ${errorText(error)}` });
      }
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <Card className="min-w-0 overflow-hidden border-primary/40 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Connect a model</CardTitle>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                Pick a provider and paste its API key. Panergos verifies it,
                discovers models, and selects a sensible main model for new sessions.
              </p>
            </div>
            <Button outlined size="sm" onClick={() => setPickerOpen(true)}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Choose manually
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-3">
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-text-secondary">
              <Spinner /> Loading providers…
            </div>
          ) : (
            <form
              className="grid min-w-0 gap-3 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1.4fr)_auto] lg:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void connect();
              }}
            >
              <label className="grid gap-1.5 text-xs text-text-secondary">
                Provider
                <select
                  aria-label="Model provider"
                  className="h-9 min-w-0 border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  disabled={connecting}
                  onChange={(event) => {
                    setProviderSlug(event.target.value);
                    setMessage(null);
                  }}
                  value={providerSlug}
                >
                  <option value="">Select a provider</option>
                  {providers.map((provider) => (
                    <option key={provider.slug} value={provider.slug}>
                      {provider.label}{provider.isSet ? " (connected)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid min-w-0 gap-1.5 text-xs text-text-secondary">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    API key <span className="text-text-tertiary">required</span>
                  </span>
                  {selected?.url && (
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={selected.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Get API key <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </span>
                <Input
                  aria-label="Provider API key"
                  autoComplete="new-password"
                  disabled={!selected || connecting}
                  name="provider-api-key"
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={selected?.isSet ? "Enter a new key to reconnect" : "Paste API key"}
                  spellCheck={false}
                  type="password"
                  value={apiKey}
                />
              </label>

              <Button disabled={!selected || !apiKey.trim() || connecting} type="submit">
                {connecting ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
                {connecting ? "Connecting…" : "Connect"}
              </Button>
            </form>
          )}

          {message && (
            <p
              aria-live="polite"
              className={
                message.kind === "error"
                  ? "mt-3 text-xs text-destructive"
                  : message.kind === "warning"
                    ? "mt-3 text-xs text-warning"
                    : "mt-3 text-xs text-success"
              }
              role="status"
            >
              {message.text}
            </p>
          )}
          <p className="mt-3 text-xs text-text-tertiary">
            {connectedProviderCount} {connectedProviderCount === 1 ? "provider" : "providers"} connected.
            Connect as many as you use; keys stay in the selected profile and
            are redacted after saving.
          </p>
        </CardContent>
      </Card>

      {pickerOpen && (
        <ModelPickerDialog
          alwaysGlobal
          loader={(options) =>
            api.getModelOptions({ profile, refresh: options?.refresh })
          }
          onApply={async ({ confirmExpensiveModel, model, provider }) => {
            const result = await api.setModelAssignment({
              confirm_expensive_model: confirmExpensiveModel,
              scope: "main",
              provider,
              model,
              task: "main",
            }, profile);
            if (!result.confirm_required) {
              onChanged();
              setMessage({
                kind: "success",
                text: `${provider} / ${model} is now the main model for new sessions.`,
              });
            }
            return result;
          }}
          onClose={() => setPickerOpen(false)}
          title="Choose main model"
        />
      )}
    </>
  );
}
