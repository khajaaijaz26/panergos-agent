// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeSwitcher } from "./ThemeSwitcher";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@panergos/ui/hooks/use-below-breakpoint", () => ({
  useBelowBreakpoint: () => false,
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: { common: { close: "Close" }, theme: { switchTheme: "Switch theme", title: "Theme" } },
  }),
}));
vi.mock("@/themes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/themes")>();
  return {
    ...actual,
    useTheme: () => ({
      availableThemes: [{ name: "default", label: "Panergos Eclipse" }],
      fontChoices: [],
      fontId: actual.THEME_DEFAULT_FONT_ID,
      setFont: vi.fn(),
      setTheme: vi.fn(),
      themeName: "default",
    }),
  };
});

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());

it("moves focus into a picker contained by its modal", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };

  await act(async () =>
    root.render(<ThemeSwitcher dropUp modalOwnerId="command-deck-panel" />),
  );
  await act(async () => {
    host
      .querySelector<HTMLButtonElement>('[aria-label="Switch theme"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const option = document.querySelector<HTMLElement>(
    '[role="option"]',
  );
  expect(option).not.toBeNull();
  expect(host.contains(option)).toBe(true);
  expect(document.activeElement).toBe(option);

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.activeElement).toBe(
    host.querySelector<HTMLButtonElement>('[aria-label="Switch theme"]'),
  );
});
