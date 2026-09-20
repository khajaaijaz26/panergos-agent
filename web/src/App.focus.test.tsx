// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/i18n", async () => {
  const { en } = await import("@/i18n/en");
  return { useI18n: () => ({ t: en }) };
});
vi.mock("@/plugins", () => ({
  PluginPage: () => null,
  PluginSlot: () => null,
  usePlugins: () => ({ loading: false, manifests: [] }),
}));
vi.mock("@/themes", () => ({
  useTheme: () => ({ theme: { layoutVariant: "standard" } }),
}));
vi.mock("@/hooks/useSidebarStatus", () => ({ useSidebarStatus: () => null }));
vi.mock("@/contexts/ProfileProvider", () => ({
  ProfileProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/contexts/PageHeaderProvider", () => ({
  PageHeaderProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/contexts/useProfileScope", () => ({
  useProfileScope: () => ({ profile: "" }),
}));
vi.mock("@/contexts/useSystemActions", () => ({
  useSystemActions: () => ({
    activeAction: null,
    isBusy: false,
    isRunning: false,
    pendingAction: null,
    runAction: vi.fn(),
  }),
}));
vi.mock("@/components/AuthWidget", () => ({ AuthWidget: () => null }));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/components/MemoryPressureBanner", () => ({ MemoryPressureBanner: () => null }));
vi.mock("@/components/ProfileScopeBanner", () => ({ ProfileScopeBanner: () => null }));
vi.mock("@/components/ProfileSwitcher", () => ({ ProfileSwitcher: () => null }));
vi.mock("@/components/ThemeSwitcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("@/lib/api", () => ({
  PANERGOS_BASE_PATH: "/panergos",
  api: {
    checkPanergosUpdate: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("@/pages/SessionsPage", () => ({ default: () => null }));

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());

it("focuses Command Deck search when Ctrl+K opens it", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/sessions"]}>
        <App />
      </MemoryRouter>,
    );
    await Promise.resolve();
  });

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "k",
    }));
  });

  expect(document.activeElement).toBe(
    document.querySelector('#command-deck-panel input[type="search"]'),
  );
});

it("loads the brand mark from the dashboard base path", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/sessions"]}>
        <App />
      </MemoryRouter>,
    );
    await Promise.resolve();
  });

  expect(host.querySelector("img")?.getAttribute("src")).toBe(
    "/panergos/panergos-mark.svg",
  );
});
