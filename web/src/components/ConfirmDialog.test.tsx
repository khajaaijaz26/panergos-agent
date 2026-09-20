// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { useModalBehavior } from "@/hooks/useModalBehavior";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());

function Harness({ onParentClose }: { onParentClose: () => void }) {
  const [open, setOpen] = useState(false);
  const parentRef = useModalBehavior({ open: true, onClose: onParentClose });
  return (
    <section aria-modal="true" ref={parentRef} role="dialog">
      <button id="confirm-opener" onClick={() => setOpen(true)}>Open</button>
      <ConfirmDialog
        onCancel={() => setOpen(false)}
        onConfirm={vi.fn()}
        open={open}
        title="Continue?"
      />
    </section>
  );
}

it("traps focus and restores the opener", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const parentClose = vi.fn();
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  await act(async () => root.render(<Harness onParentClose={parentClose} />));
  const opener = host.querySelector<HTMLButtonElement>("#confirm-opener")!;
  opener.focus();
  await act(async () => opener.click());

  const dialog = document.querySelector<HTMLElement>('[aria-labelledby="confirm-dialog-title"]')!;
  const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"));
  expect(document.activeElement).toBe(buttons[1]);

  buttons[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  expect(document.activeElement).toBe(buttons[0]);
  buttons[0].dispatchEvent(new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey: true,
    bubbles: true,
  }));
  expect(document.activeElement).toBe(buttons[1]);

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.querySelector('[aria-labelledby="confirm-dialog-title"]')).toBeNull();
  expect(parentClose).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(opener);
});
