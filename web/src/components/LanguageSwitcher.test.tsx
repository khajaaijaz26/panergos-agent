// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useModalBehavior } from "@/hooks/useModalBehavior";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@panergos/ui/hooks/use-below-breakpoint", () => ({
  useBelowBreakpoint: () => true,
}));
vi.mock("@/i18n/context", () => ({
  useI18n: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: { common: { close: "Close" }, language: { switchTo: "Switch language" } },
  }),
}));
vi.mock("@/i18n", () => ({
  LOCALE_META: { en: { name: "English" } },
}));

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());

function ModalHarness() {
  const ref = useModalBehavior({ open: true, onClose: vi.fn() });
  return (
    <section id="command-deck-panel" ref={ref} tabIndex={-1}>
      <button id="first">First</button>
      <LanguageSwitcher dropUp modalOwnerId="command-deck-panel" />
    </section>
  );
}

it("keeps a visible, focus-trapped language picker on narrow layouts", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };

  await act(async () => root.render(<ModalHarness />));

  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Switch language"]')!;
  const icon = trigger.querySelector("svg");
  expect(icon).not.toBeNull();
  expect(icon?.classList.contains("hidden")).toBe(false);

  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const option = document.querySelector<HTMLElement>(
    '[role="option"]',
  );
  expect(host.contains(option)).toBe(true);
  expect(document.activeElement).toBe(option);

  option?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  expect(document.activeElement).toBe(host.querySelector("#first"));
});
