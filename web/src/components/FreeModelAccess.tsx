import { ExternalLink } from "lucide-react";

const OPTIONS = [
  {
    allowance: "25+ free models · 50 requests/day",
    models: "Current :free catalog",
    provider: "OpenRouter",
    setup: "API key",
    url: "https://openrouter.ai/pricing",
  },
  {
    allowance: "Free input/output on selected models; live account limits",
    models: "Gemini free-tier models",
    provider: "Google Gemini",
    setup: "API key",
    url: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  {
    allowance: "200K tokens/day per listed model",
    models: "gpt-oss-120b, gpt-oss-20b, qwen3.8-27b",
    provider: "Groq Free Plan",
    setup: "Custom endpoint",
    url: "https://console.groq.com/docs/rate-limits",
  },
  {
    allowance: "1M tokens/day per named model while $5/30-day credit lasts",
    models: "gpt-oss-120b, qwen-3.8-27b",
    provider: "Cerebras trial",
    setup: "Custom endpoint",
    url: "https://inference-docs.cerebras.ai/support/rate-limits",
  },
  {
    allowance: "$0.10 monthly inference credit for Free accounts",
    models: "Inference Providers catalog",
    provider: "Hugging Face",
    setup: "Token",
    url: "https://huggingface.co/docs/inference-providers/pricing",
  },
  {
    allowance: "Free mode; exact token limits shown in the account",
    models: "Mistral Studio catalog",
    provider: "Mistral",
    setup: "Custom endpoint",
    url: "https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key",
  },
  {
    allowance: "Unspecified AI-credit allowance on Free; paid plans publish credits",
    models: "Auto-selected or account-entitled Copilot models",
    provider: "GitHub Copilot",
    setup: "Account sign-in",
    url: "https://docs.github.com/en/copilot/get-started/plans",
  },
] as const;

export function FreeModelAccess() {
  return (
    <details className="group border border-border/60 bg-card/40 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
        <span>
          Free and included model access
          <span className="ml-2 text-xs font-normal text-text-secondary">
            official limits · verified 2026-09-19
          </span>
        </span>
        <span className="text-xs text-primary group-open:hidden">View details</span>
        <span className="hidden text-xs text-primary group-open:inline">Hide</span>
      </summary>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead className="text-text-tertiary">
            <tr className="border-b border-border">
              <th className="px-2 py-2 font-medium">Provider</th>
              <th className="px-2 py-2 font-medium">Models</th>
              <th className="px-2 py-2 font-medium">Official allowance</th>
              <th className="px-2 py-2 font-medium">Connect with</th>
            </tr>
          </thead>
          <tbody>
            {OPTIONS.map((option) => (
              <tr className="border-b border-border/50" key={option.provider}>
                <td className="px-2 py-2 font-medium">
                  <a
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    href={option.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {option.provider} <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className="px-2 py-2 text-text-secondary">{option.models}</td>
                <td className="px-2 py-2 text-text-secondary">{option.allowance}</td>
                <td className="px-2 py-2 text-text-secondary">{option.setup}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-tertiary">
        Token limits are ceilings, not guaranteed grants. Request limits,
        dollar credits, and subscription allowances cannot be added as tokens.
        Automatic fallback avoids manual switching but never combines or
        bypasses provider quotas.
      </p>
    </details>
  );
}
