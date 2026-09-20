import { describe, expect, it } from "vitest";
import {
  CLOSE_WORK_DOCK_EVENT,
  filterCommandDeckItems,
  groupCommandDeckItems,
  isBlockingCommandDeckModal,
  isCommandDeckShortcut,
} from "./command-deck";

describe("groupCommandDeckItems", () => {
  it("keeps every command reachable exactly once", () => {
    const items = [
      { path: "/chat" },
      { path: "/models" },
      { path: "/channels" },
      { path: "/cron" },
      { path: "/future" },
    ];
    const grouped = groupCommandDeckItems(items).flatMap((group) => group.items);

    expect(grouped).toHaveLength(items.length);
    expect(new Set(grouped.map((item) => item.path)).size).toBe(items.length);
    expect(grouped.find((item) => item.path === "/future")).toBe(items.at(-1));
    const searchable = [
      { path: "/models", label: "Model routing" },
      { path: "/channels", label: "Connected accounts" },
    ];

    expect(filterCommandDeckItems(searchable, "ACCOUNT", (item) => item.label)).toEqual([
      searchable[1],
    ]);
    expect(filterCommandDeckItems(searchable, "/models", (item) => item.label)).toEqual([
      searchable[0],
    ]);
    expect(searchable).toHaveLength(2);
  });
});

describe("isCommandDeckShortcut", () => {
  it("opens from the shell but never steals Ctrl+K from editors or xterm", () => {
    const event = (closest?: () => unknown) =>
      ({ ctrlKey: true, metaKey: false, key: "k", target: closest ? { closest } : null }) as KeyboardEvent;

    expect(isCommandDeckShortcut(event())).toBe(true);
    expect(isCommandDeckShortcut(event(() => ({})))).toBe(false);
    expect(isCommandDeckShortcut({ ...event(), defaultPrevented: true })).toBe(false);
  });
});

describe("isBlockingCommandDeckModal", () => {
  const modal = (id: string, hidden = false, ariaHidden: string | null = null) =>
    ({ id, hidden, getAttribute: () => ariaHidden }) as unknown as HTMLElement;

  it("ignores hidden and coordinated work-dock dialogs", () => {
    expect(CLOSE_WORK_DOCK_EVENT).toBe("panergos:close-work-dock");
    expect(isBlockingCommandDeckModal(modal("hidden-dialog", true))).toBe(false);
    expect(isBlockingCommandDeckModal(modal("aria-hidden-dialog", false, "true"))).toBe(false);
    expect(isBlockingCommandDeckModal(modal("chat-work-dock"))).toBe(false);
    expect(isBlockingCommandDeckModal(modal("confirm-dialog"))).toBe(true);
  });
});
