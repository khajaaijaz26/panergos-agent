// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getConfig: vi.fn(async () => ({
    fallback_providers: [
      { model: "model-a", provider: "openrouter" },
    ],
  })),
  getModelOptions: vi.fn(),
  saveConfig: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/api", () => ({
  api: apiMocks,
  getManagementProfile: () => "worker",
}));
vi.mock("@/components/ModelPickerDialog", () => ({
  ModelPickerDialog: () => null,
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
vi.mock("@panergos/ui/ui/components/spinner", () => ({
  Spinner: () => <span>Loading</span>,
}));

let container: HTMLDivElement;
let root: Root;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

describe("FallbackModelsCard", () => {
  it("removes a backup model in the selected profile", async () => {
    const { FallbackModelsCard } = await import("./FallbackModelsCard");
    const onChanged = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<FallbackModelsCard onChanged={onChanged} />);
    });
    await vi.waitFor(() =>
      expect(container.textContent).toContain("openrouter / model-a"),
    );

    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove openrouter model-a"]',
    )!;
    await act(async () => remove.click());
    await vi.waitFor(() => expect(apiMocks.saveConfig).toHaveBeenCalled());

    expect(apiMocks.saveConfig).toHaveBeenCalledWith(
      { fallback_model: null, fallback_providers: [] },
      "worker",
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
