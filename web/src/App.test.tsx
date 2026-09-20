// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/en";
import { CommandNavLink } from "./App";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function LocationProbe() {
  return <output data-path>{useLocation().pathname}</output>;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe("CommandNavLink", () => {
  it("activates a route and closes the command deck", async () => {
    const close = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(
      <MemoryRouter initialEntries={["/sessions"]}>
        <CommandNavLink
          item={{ path: "/models", label: "Models", icon: () => <span /> }}
          onNavigate={close}
          t={en}
        />
        <LocationProbe />
      </MemoryRouter>,
    ));
    await act(async () => {
      container?.querySelector("a")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(close).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-path]")?.textContent).toBe("/models");
  });
});
