// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnvVarInfo } from "@/lib/api";

const apiMocks = vi.hoisted(() => ({
  getManagementProfile: vi.fn(() => "worker"),
  getEnvVars: vi.fn(async (): Promise<Record<string, EnvVarInfo>> => ({
    OPENAI_API_KEY: {
      advanced: false,
      category: "provider",
      description: "OpenAI API key",
      is_password: true,
      is_set: false,
      provider: "openai-api",
      provider_label: "OpenAI API",
      redacted_value: null,
      tools: [],
      url: "https://platform.openai.com/api-keys",
    },
  })),
  getModelOptions: vi.fn(async () => ({
    providers: [
      {
        authenticated: true,
        featured_models: ["gpt-featured"],
        models: ["gpt-first", "gpt-featured"],
        name: "OpenAI API",
        slug: "openai-api",
      },
    ],
  })),
  setEnvVar: vi.fn(async () => ({ ok: true })),
  setModelAssignment: vi.fn(async () => ({
    model: "gpt-featured",
    ok: true,
    provider: "openai-api",
  })),
  validateProviderCredential: vi.fn(async () => ({
    message: "",
    ok: true,
    reachable: true,
  })),
}));

vi.mock("@/lib/api", () => ({
  api: apiMocks,
  getManagementProfile: apiMocks.getManagementProfile,
}));
vi.mock("@/components/ModelPickerDialog", () => ({
  ModelPickerDialog: ({
    loader,
    onApply,
  }: {
    loader?(options?: { refresh?: boolean }): Promise<unknown>;
    onApply?(args: {
      confirmExpensiveModel?: boolean;
      model: string;
      persistGlobal: boolean;
      provider: string;
    }): Promise<unknown> | unknown;
  }) => (
    <div>
      <button onClick={() => void loader?.({ refresh: true })} type="button">
        Load manual models
      </button>
      <button
        onClick={() => void onApply?.({
          model: "manual-model",
          persistGlobal: true,
          provider: "openai-api",
        })}
        type="button"
      >
        Apply manual model
      </button>
    </div>
  ),
}));
vi.mock("@panergos/ui/ui/components/button", () => ({
  Button: ({
    children,
    outlined: _outlined,
    size: _size,
    ...props
  }: ComponentProps<"button"> & { outlined?: boolean; size?: string }) => {
    void _outlined;
    void _size;
    return <button {...props}>{children}</button>;
  },
}));
vi.mock("@panergos/ui/ui/components/card", () => ({
  Card: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@panergos/ui/ui/components/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@panergos/ui/ui/components/spinner", () => ({
  Spinner: () => <span>Loading</span>,
}));

let container: HTMLDivElement;
let root: Root;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
  apiMocks.getManagementProfile.mockReset();
  apiMocks.getManagementProfile.mockReturnValue("worker");
});

describe("ConnectModelCard", () => {
  it("validates, saves, discovers, and activates a provider without echoing its key", async () => {
    const { ConnectModelCard } = await import("./ConnectModelCard");
    const onChanged = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<ConnectModelCard onChanged={onChanged} />);
    });
    await vi.waitFor(() =>
      expect(container.textContent).toContain("OpenAI API"),
    );
    expect(apiMocks.getEnvVars).toHaveBeenCalledWith("worker");

    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Model provider"]',
    )!;
    const keyInput = container.querySelector<HTMLInputElement>(
      'input[name="provider-api-key"]',
    )!;
    expect(keyInput.type).toBe("password");

    await act(async () => {
      const setSelectValue = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      setSelectValue?.call(select, "openai-api");
      select.dispatchEvent(new Event("change", { bubbles: true }));

      const setInputValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setInputValue?.call(keyInput, "sk-private-test");
      keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const connect = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Connect",
    )!;
    await act(async () => connect.click());
    await vi.waitFor(() =>
      expect(apiMocks.setModelAssignment).toHaveBeenCalled(),
    );

    expect(apiMocks.validateProviderCredential).toHaveBeenCalledWith(
      "OPENAI_API_KEY",
      "sk-private-test",
      "worker",
    );
    expect(apiMocks.setEnvVar).toHaveBeenCalledWith(
      "OPENAI_API_KEY",
      "sk-private-test",
      "worker",
    );
    expect(apiMocks.getModelOptions).toHaveBeenCalledWith({
      profile: "worker",
      refresh: true,
    });
    expect(apiMocks.setModelAssignment).toHaveBeenCalledWith(
      {
        model: "gpt-featured",
        provider: "openai-api",
        scope: "main",
        task: "main",
      },
      "worker",
    );
    expect(keyInput.value).toBe("");
    expect(container.textContent).toContain(
      "gpt-featured is now the main model for new sessions",
    );
    expect(container.textContent).toContain("1 provider connected");
    expect(container.textContent).not.toContain("sk-private-test");
    expect(onChanged).toHaveBeenCalled();
  });

  it("lists advanced API-key providers and keeps the canonical key for aliases", async () => {
    apiMocks.getEnvVars.mockResolvedValueOnce({
      ANTHROPIC_API_KEY: {
        advanced: true,
        category: "provider",
        description: "Anthropic API key",
        is_password: true,
        is_set: false,
        provider: "anthropic",
        provider_label: "Anthropic",
        redacted_value: null,
        tools: [],
        url: "https://console.anthropic.com/settings/keys",
      },
      CLAUDE_CODE_OAUTH_TOKEN: {
        advanced: true,
        category: "provider",
        description: "Claude Code OAuth token",
        is_password: true,
        is_set: true,
        provider: "anthropic",
        provider_label: "Anthropic",
        redacted_value: "***",
        tools: [],
        url: null,
      },
      OPENROUTER_API_KEY: {
        advanced: true,
        category: "provider",
        description: "OpenRouter API key",
        is_password: true,
        is_set: false,
        provider: "openrouter",
        provider_label: "OpenRouter",
        redacted_value: null,
        tools: [],
        url: "https://openrouter.ai/keys",
      },
    });
    apiMocks.getModelOptions.mockResolvedValueOnce({
      providers: [{
        authenticated: true,
        featured_models: [],
        models: ["claude-test"],
        name: "Anthropic",
        slug: "anthropic",
      }],
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    const { ConnectModelCard } = await import("./ConnectModelCard");
    await act(async () => root.render(<ConnectModelCard onChanged={() => undefined} />));
    await vi.waitFor(() => expect(container.textContent).toContain("OpenRouter"));
    expect(container.textContent).toContain("Anthropic (connected)");

    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Model provider"]',
    )!;
    const keyInput = container.querySelector<HTMLInputElement>(
      'input[name="provider-api-key"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
        select,
        "anthropic",
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        keyInput,
        "sk-ant-test",
      );
      keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Connect")
        ?.click(),
    );
    await vi.waitFor(() => expect(apiMocks.setEnvVar).toHaveBeenCalled());
    expect(apiMocks.setEnvVar).toHaveBeenCalledWith(
      "ANTHROPIC_API_KEY",
      "sk-ant-test",
      "worker",
    );
    expect(apiMocks.setEnvVar).not.toHaveBeenCalledWith(
      "CLAUDE_CODE_OAUTH_TOKEN",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps every async connection write on the component-pinned profile", async () => {
    let releaseValidation!: () => void;
    apiMocks.getManagementProfile.mockReturnValueOnce("worker");
    apiMocks.validateProviderCredential.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseValidation = () => resolve({ message: "", ok: true, reachable: true });
      }),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const { ConnectModelCard } = await import("./ConnectModelCard");
    await act(async () => root.render(<ConnectModelCard onChanged={() => undefined} />));
    await vi.waitFor(() => expect(container.textContent).toContain("OpenAI API"));
    apiMocks.getManagementProfile.mockReturnValue("default");

    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Model provider"]',
    )!;
    const keyInput = container.querySelector<HTMLInputElement>(
      'input[name="provider-api-key"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
        select,
        "openai-api",
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        keyInput,
        "sk-profile-test",
      );
      keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Connect")
        ?.click();
    });
    await vi.waitFor(() =>
      expect(apiMocks.validateProviderCredential).toHaveBeenCalled(),
    );
    await act(async () => releaseValidation());
    await vi.waitFor(() => expect(apiMocks.setModelAssignment).toHaveBeenCalled());

    expect(apiMocks.setEnvVar).toHaveBeenCalledWith(
      "OPENAI_API_KEY",
      "sk-profile-test",
      "worker",
    );
    expect(apiMocks.getModelOptions).toHaveBeenCalledWith({
      profile: "worker",
      refresh: true,
    });
    expect(apiMocks.setModelAssignment).toHaveBeenCalledWith(
      expect.any(Object),
      "worker",
    );
  });

  it("keeps the manual picker on the component-pinned profile", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const { ConnectModelCard } = await import("./ConnectModelCard");
    await act(async () => root.render(<ConnectModelCard onChanged={() => undefined} />));
    await vi.waitFor(() => expect(container.textContent).toContain("OpenAI API"));
    apiMocks.getManagementProfile.mockReturnValue("default");

    const button = (text: string) =>
      [...container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === text,
      ) as HTMLButtonElement;
    await act(async () => button("Choose manually").click());
    await act(async () => button("Load manual models").click());
    await vi.waitFor(() => expect(apiMocks.getModelOptions).toHaveBeenCalledWith({
      profile: "worker",
      refresh: true,
    }));

    await act(async () => button("Apply manual model").click());
    await vi.waitFor(() => expect(apiMocks.setModelAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "manual-model",
        provider: "openai-api",
      }),
      "worker",
    ));
  });
});
