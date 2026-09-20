// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ModelPickerDialog } from "./ModelPickerDialog";
import { useModalBehavior } from "@/hooks/useModalBehavior";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());

function Harness({ onParentClose }: { onParentClose: () => void }) {
  const [open, setOpen] = useState(false);
  const parentRef = useModalBehavior({ open: true, onClose: onParentClose });
  return (
    <section aria-modal="true" ref={parentRef} role="dialog">
      <button id="picker-opener" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <ModelPickerDialog
          alwaysGlobal
          loader={async () => ({ model: "", provider: "", providers: [] })}
          onApply={vi.fn()}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

it("traps focus and restores its Work Dock opener", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const parentClose = vi.fn();
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  await act(async () => root.render(<Harness onParentClose={parentClose} />));
  const opener = host.querySelector<HTMLButtonElement>("#picker-opener")!;
  opener.focus();
  await act(async () => {
    opener.click();
    await Promise.resolve();
  });

  const dialog = document.querySelector<HTMLElement>('[aria-labelledby="model-picker-title"]')!;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  expect(document.activeElement).toBe(dialog.querySelector("[data-model-search]"));

  focusable.at(-1)?.focus();
  focusable.at(-1)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  expect(document.activeElement).toBe(focusable[0]);
  focusable[0].dispatchEvent(new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey: true,
    bubbles: true,
  }));
  expect(document.activeElement).toBe(focusable.at(-1));

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.querySelector('[aria-labelledby="model-picker-title"]')).toBeNull();
  expect(parentClose).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(opener);
});
