// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  activateCustomEndpoint: vi.fn(async () => ({
    model: "example/model",
    ok: true,
    provider: "example",
  })),
  deleteCustomEndpoint: vi.fn(async () => ({
    current: {
      base_url: "",
      model: "",
      provider: "",
    },
    endpoints: [],
    ok: true,
  })),
  getCustomEndpoints: vi.fn(async () => ({
    current: {
      base_url: "https://models.example.test/v1",
      model: "example/model",
      provider: "example",
    },
    endpoints: [
      {
        api_key_preview: "secret-must-not-render",
        base_url: "https://models.example.test/v1",
        discover_models: true,
        has_api_key: true,
        id: "example",
        is_current: true,
        model: "example/model",
        models: ["example/model"],
        name: "Example",
      },
    ],
  })),
  getProviderDirectory: vi.fn(async () => ({
    providers: [
      {
        configured: false,
        id: "openai-api",
        key_env: "OPENAI_API_KEY",
        models: ["gpt-test"],
        name: "OpenAI API",
        setup_kind: "built_in",
        signup_url: "https://example.test/openai-key",
        total_models: 1,
      },
      {
        base_url: "https://api.nebula.test/v1",
        configured: false,
        id: "nebula",
        key_env: "NEBULA_API_KEY",
        models: ["nebula-fast", "nebula-pro"],
        name: "Nebula AI",
        setup_kind: "custom_endpoint",
        signup_url: "https://example.test/nebula-key",
        total_models: 2,
      },
    ],
  })),
  getManagementProfile: vi.fn(() => "worker"),
  saveCustomEndpoint: vi.fn(async () => ({
    current: {
      base_url: "https://models.example.test/v1",
      model: "example/model",
      provider: "example",
    },
    endpoints: [
      {
        base_url: "https://models.example.test/v1",
        discover_models: true,
        has_api_key: true,
        id: "example",
        is_current: true,
        model: "example/model",
        models: ["example/model", "discovered/model"],
        name: "Example",
      },
    ],
    id: "example",
    ok: true,
  })),
  validateCustomEndpoint: vi.fn(async () => ({
    message: "",
    models: ["discovered/model"],
    ok: true,
    reachable: true,
  })),
}));
const profileScope = vi.hoisted(() => ({ profile: "worker" }));

vi.mock("@/lib/api", () => ({
  api: apiMocks,
  getManagementProfile: apiMocks.getManagementProfile,
}));
vi.mock("@/contexts/useProfileScope", () => ({
  useProfileScope: () => ({ profile: profileScope.profile }),
}));
vi.mock("@/components/DeleteConfirmDialog", () => ({
  DeleteConfirmDialog: ({
    onConfirm,
    open,
  }: {
    onConfirm(): void;
    open: boolean;
  }) => open ? <button onClick={onConfirm}>Confirm delete</button> : null,
}));
vi.mock("@panergos/ui/ui/components/badge", () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@panergos/ui/ui/components/button", () => ({
  Button: ({
    children,
    ghost: _ghost,
    outlined: _outlined,
    size: _size,
    ...props
  }: ComponentProps<"button"> & {
    ghost?: boolean;
    outlined?: boolean;
    size?: string;
  }) => {
    void _ghost;
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
vi.mock("@panergos/ui/ui/components/switch", () => ({
  Switch: () => <button role="switch" type="button" />,
}));

let container: HTMLDivElement;
let root: Root;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
  apiMocks.getManagementProfile.mockReturnValue("worker");
  profileScope.profile = "worker";
});

describe("CustomEndpointsPanel", () => {
  it("searches the provider directory and prefills a compatible company with its models", async () => {
    const { CustomEndpointsPanel } = await import("./CustomEndpointsPanel");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<CustomEndpointsPanel onChanged={() => undefined} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain("Nebula AI"));
    expect(apiMocks.getProviderDirectory).toHaveBeenCalledWith("worker");

    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="AI provider directory"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
        select,
        "nebula",
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("NEBULA_API_KEY");
    expect(container.textContent).toContain("nebula-pro");
    expect(container.querySelector<HTMLInputElement>('input[placeholder="My model server"]')?.value).toBe(
      "Nebula AI",
    );
    expect(container.querySelector<HTMLInputElement>('input[placeholder="Test to discover models, or type an ID"]')?.value).toBe(
      "nebula-fast",
    );
    expect(container.querySelector<HTMLInputElement>('input[name="custom-endpoint-api-key"]')?.type).toBe(
      "password",
    );
  });

  it("keeps a stored API key masked and never echoes its preview", async () => {
    const { CustomEndpointsPanel } = await import("./CustomEndpointsPanel");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<CustomEndpointsPanel onChanged={() => undefined} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain("Example"));
    expect(apiMocks.getCustomEndpoints).toHaveBeenCalledWith("worker");

    const keyInput = container.querySelector<HTMLInputElement>(
      'input[name="custom-endpoint-api-key"]',
    );
    expect(keyInput?.type).toBe("password");
    expect(keyInput?.value).toBe("");
    expect(container.textContent).toContain("API key saved");
    expect(container.textContent).not.toContain("secret-must-not-render");
  });

  it("tests with a blank saved key and only submits a newly typed key", async () => {
    const { CustomEndpointsPanel } = await import("./CustomEndpointsPanel");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<CustomEndpointsPanel onChanged={() => undefined} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain("Example"));

    const button = (text: string) =>
      [...container.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.includes(text),
      ) as HTMLButtonElement;
    await act(async () => button("Test & discover").click());
    await vi.waitFor(() => expect(apiMocks.validateCustomEndpoint).toHaveBeenCalled());
    expect(apiMocks.validateCustomEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        api_key: undefined,
        base_url: "https://models.example.test/v1",
        model: "example/model",
      }),
    );

    const keyInput = container.querySelector<HTMLInputElement>(
      'input[name="custom-endpoint-api-key"]',
    )!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(keyInput, "replacement-key");
      keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Save & activate").click());
    await vi.waitFor(() => expect(apiMocks.saveCustomEndpoint).toHaveBeenCalled());
    expect(apiMocks.saveCustomEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        api_key: "replacement-key",
        create_only: false,
        models: ["discovered/model"],
      }),
      "worker",
    );
  });

  it("marks the new-endpoint flow as create-only", async () => {
    const { CustomEndpointsPanel } = await import("./CustomEndpointsPanel");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<CustomEndpointsPanel onChanged={() => undefined} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain("Example"));

    const button = (text: string) =>
      [...container.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.includes(text),
      ) as HTMLButtonElement;
    await act(async () => button("New endpoint").click());

    const setInput = (placeholder: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(
        `input[placeholder="${placeholder}"]`,
      )!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        value,
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      setInput("My model server", "New endpoint");
      setInput("my-provider", "new-endpoint");
      setInput("http://127.0.0.1:11434/v1", "http://127.0.0.1:9912/v1");
      setInput("Test to discover models, or type an ID", "new-model");
    });
    await act(async () => button("Save & activate").click());
    await vi.waitFor(() => expect(apiMocks.saveCustomEndpoint).toHaveBeenCalled());

    expect(apiMocks.saveCustomEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        create_only: true,
        id: "new-endpoint",
        name: "New endpoint",
      }),
      "worker",
    );
  });

  it("clears the old profile before allowing endpoint mutations in a new profile", async () => {
    let resolveDefault!: (value: Awaited<ReturnType<typeof apiMocks.getCustomEndpoints>>) => void;
    apiMocks.getCustomEndpoints.mockResolvedValueOnce({
      current: {
        base_url: "",
        model: "",
        provider: "",
      },
      endpoints: [
        {
          api_key_preview: "secret-must-not-render",
          base_url: "https://models.example.test/v1",
          discover_models: true,
          has_api_key: true,
          id: "example",
          is_current: false,
          model: "example/model",
          models: ["example/model"],
          name: "Example",
        },
      ],
    }).mockImplementationOnce(() => new Promise((resolve) => {
      resolveDefault = resolve;
    }));
    const defaultResponse = {
      current: {
        base_url: "https://default.example.test/v1",
        model: "default/model",
        provider: "default-example",
      },
      endpoints: [
        {
          api_key_preview: null,
          base_url: "https://default.example.test/v1",
          discover_models: true,
          has_api_key: false,
          id: "default-example",
          is_current: true,
          model: "default/model",
          models: ["default/model"],
          name: "Default Example",
        },
      ],
    };
    const { CustomEndpointsPanel } = await import("./CustomEndpointsPanel");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<CustomEndpointsPanel onChanged={() => undefined} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain("Example"));
    expect(apiMocks.getCustomEndpoints).toHaveBeenCalledWith("worker");

    profileScope.profile = "default";
    await act(async () => root.render(<CustomEndpointsPanel onChanged={() => undefined} />));
    await vi.waitFor(() => expect(apiMocks.getCustomEndpoints).toHaveBeenLastCalledWith("default"));
    expect(apiMocks.getProviderDirectory).toHaveBeenLastCalledWith("default");
    expect(container.querySelector('[aria-label="Delete Example"]')).toBeNull();

    await act(async () => resolveDefault(defaultResponse));
    await vi.waitFor(() => expect(container.textContent).toContain("Default Example"));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Delete Default Example"]')?.click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((candidate) => candidate.textContent === "Confirm delete")
        ?.click();
    });
    await vi.waitFor(() =>
      expect(apiMocks.deleteCustomEndpoint).toHaveBeenCalledWith(
        "default-example",
        "default",
      ),
    );
  });
});
