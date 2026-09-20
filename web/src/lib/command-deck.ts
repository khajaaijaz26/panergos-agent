export interface CommandDeckItem {
  path: string;
}

export const CLOSE_WORK_DOCK_EVENT = "panergos:close-work-dock";

export const PRIMARY_COMMAND_PATHS = new Set([
  "/chat",
  "/sessions",
  "/files",
  "/models",
  "/cron",
]);

export function isCommandDeckShortcut(event: KeyboardEvent): boolean {
  if (
    event.defaultPrevented ||
    !(event.ctrlKey || event.metaKey) ||
    event.key.toLocaleLowerCase() !== "k"
  ) {
    return false;
  }
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  return !target?.closest?.("input, textarea, select, [contenteditable='true'], .xterm");
}

export function isBlockingCommandDeckModal(modal: HTMLElement): boolean {
  return (
    modal.id !== "command-deck-panel" &&
    modal.id !== "chat-work-dock" &&
    !modal.hidden &&
    modal.getAttribute("aria-hidden") !== "true"
  );
}

const COMMAND_GROUPS = [
  { id: "create", paths: ["/chat", "/sessions", "/files"] },
  {
    id: "intelligence",
    paths: ["/models", "/analytics", "/skills", "/plugins", "/mcp"],
  },
  { id: "connect", paths: ["/channels", "/webhooks", "/pairing"] },
  {
    id: "operate",
    paths: ["/cron", "/logs", "/profiles", "/config", "/env", "/system", "/docs"],
  },
] as const;

/** Keep every command reachable, including future routes not yet assigned a lane. */
export function groupCommandDeckItems<T extends CommandDeckItem>(items: T[]) {
  const assigned = new Set<string>(COMMAND_GROUPS.flatMap((group) => group.paths));
  const groups = COMMAND_GROUPS.map((group) => ({
    id: group.id,
    items: items.filter((item) => (group.paths as readonly string[]).includes(item.path)),
  })).filter((group) => group.items.length > 0);
  const more = items.filter((item) => !assigned.has(item.path));
  return more.length > 0 ? [...groups, { id: "more", items: more }] : groups;
}

export function filterCommandDeckItems<T extends CommandDeckItem>(
  items: T[],
  query: string,
  label: (item: T) => string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    `${label(item)} ${item.path}`.toLocaleLowerCase().includes(needle),
  );
}
