// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useModalBehavior } from "./useModalBehavior";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (mounted.length) await mounted.pop()?.();
});

function Modal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useModalBehavior({ open, onClose });
  return open ? (
    <section id="test-modal" ref={ref} tabIndex={-1}>
      <button id="first">First</button>
      <button id="last">Last</button>
    </section>
  ) : null;
}

it("traps focus and restores the opener", async () => {
  const opener = document.body.appendChild(document.createElement("button"));
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const close = vi.fn();
  opener.focus();
  mounted.push(async () => {
    await act(async () => root.unmount());
    opener.remove();
    host.remove();
  });

  await act(async () => root.render(<Modal open onClose={close} />));
  const first = document.querySelector<HTMLElement>("#first")!;
  const last = document.querySelector<HTMLElement>("#last")!;
  expect(document.activeElement).toBe(first);

  const owned = document.body.appendChild(document.createElement("div"));
  owned.dataset.modalOwner = "test-modal";
  const portalButton = owned.appendChild(document.createElement("button"));
  mounted.push(async () => owned.remove());

  portalButton.focus();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  expect(document.activeElement).toBe(first);

  first.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
  first.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  }));
  expect(close).not.toHaveBeenCalled();

  const alertDialog = document.body.appendChild(document.createElement("section"));
  alertDialog.role = "alertdialog";
  const confirmButton = alertDialog.appendChild(document.createElement("button"));
  mounted.push(async () => alertDialog.remove());
  confirmButton.focus();
  confirmButton.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  }));
  expect(close).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(confirmButton);
  alertDialog.remove();

  last.dataset.modalChildOpen = "true";
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(close).not.toHaveBeenCalled();
  delete last.dataset.modalChildOpen;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(close).toHaveBeenCalledOnce();

  await act(async () => root.render(<Modal open={false} onClose={close} />));
  expect(document.activeElement).toBe(opener);
});
