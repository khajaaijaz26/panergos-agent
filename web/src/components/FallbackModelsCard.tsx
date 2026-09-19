import { useEffect, useState } from "react";
import { ArrowDown, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { ModelOptionsResult } from "@panergos/shared";
import { Button } from "@panergos/ui/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@panergos/ui/ui/components/card";
import { Spinner } from "@panergos/ui/ui/components/spinner";
import { ModelPickerDialog } from "@/components/ModelPickerDialog";
import { api, getManagementProfile } from "@/lib/api";

interface FallbackEntry {
  model: string;
  provider: string;
}

function entriesFromConfig(config: Record<string, unknown>): FallbackEntry[] {
  const values = [config.fallback_providers, config.fallback_model];
  const entries: FallbackEntry[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const candidates = Array.isArray(value) ? value : value ? [value] : [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const raw = candidate as Record<string, unknown>;
      const provider = String(raw.provider ?? "").trim();
      const model = String(raw.model ?? "").trim();
      const identity = `${provider.toLowerCase()}\0${model.toLowerCase()}`;
      if (!provider || !model || seen.has(identity)) continue;
      seen.add(identity);
      entries.push({ provider, model });
    }
  }
  return entries;
}

export function FallbackModelsCard({ onChanged }: { onChanged(): void }) {
  const [entries, setEntries] = useState<FallbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const profile = getManagementProfile();

  useEffect(() => {
    let cancelled = false;
    api
      .getConfig(profile)
      .then((config) => {
        if (!cancelled) setEntries(entriesFromConfig(config));
      })
      .catch((error) => {
        if (!cancelled) setMessage(`Could not load automatic fallback: ${error}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  async function save(next: FallbackEntry[]) {
    setSaving(true);
    setMessage("");
    try {
      await api.saveConfig(
        { fallback_model: null, fallback_providers: next },
        profile,
      );
      setEntries(next);
      onChanged();
    } catch (error) {
      setMessage(`Could not save automatic fallback: ${error}`);
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function loadConnectedModels(options?: {
    refresh?: boolean;
  }): Promise<ModelOptionsResult> {
    const result = await api.getModelOptions({
      profile,
      refresh: options?.refresh,
    });
    return {
      ...result,
      providers: result.providers.filter(
        (provider) => provider.authenticated && provider.models?.length,
      ),
    };
  }

  return (
    <>
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Automatic fallback</CardTitle>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                When the main model is unavailable, rate-limited, or out of
                quota, Panergos tries these connected models in order.
              </p>
            </div>
            <Button
              disabled={loading || saving}
              onClick={() => setPickerOpen(true)}
              outlined
              size="sm"
            >
              <Plus className="h-3.5 w-3.5" /> Add backup model
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-3">
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-text-secondary">
              <Spinner /> Loading fallback order…
            </div>
          ) : entries.length ? (
            <ol className="space-y-2">
              {entries.map((entry, index) => (
                <li
                  className="flex min-w-0 items-center gap-3 border border-border/50 bg-muted/20 px-3 py-2"
                  key={`${entry.provider}\0${entry.model}`}
                >
                  <span className="text-xs text-text-tertiary">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {entry.provider} / {entry.model}
                  </span>
                  {index < entries.length - 1 && (
                    <ArrowDown className="h-3.5 w-3.5 text-text-tertiary" />
                  )}
                  <Button
                    aria-label={`Remove ${entry.provider} ${entry.model}`}
                    disabled={saving}
                    ghost
                    onClick={() =>
                      void save(entries.filter((_, itemIndex) => itemIndex !== index))
                    }
                    size="icon"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="border border-dashed border-border px-4 py-5 text-center text-xs text-text-secondary">
              No backup model yet. Connect another provider, then add it here.
            </p>
          )}

          <p className="mt-3 text-xs text-text-tertiary">
            Provider quotas and charges still apply. Running sessions keep their
            current route; this order applies to new sessions.
          </p>
          {message && (
            <p aria-live="polite" className="mt-2 text-xs text-destructive" role="status">
              {message}
            </p>
          )}
        </CardContent>
      </Card>

      {pickerOpen && (
        <ModelPickerDialog
          alwaysGlobal
          loader={loadConnectedModels}
          onApply={async ({ model, provider }) => {
            const duplicate = entries.some(
              (entry) => entry.provider === provider && entry.model === model,
            );
            if (!duplicate) await save([...entries, { provider, model }]);
          }}
          onClose={() => setPickerOpen(false)}
          title="Add backup model"
        />
      )}
    </>
  );
}
