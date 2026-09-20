// @vitest-environment jsdom
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PTY_TICKET_TIMEOUT_MS } from "@/lib/pty-reconnect";

class FakeFitAddon {
  terminal: FakeTerminal | null = null;

  activate(terminal: FakeTerminal) {
    this.terminal = terminal;
  }

  fit() {
    if (!this.terminal) return;
    this.terminal.cols = 132;
    this.terminal.rows = 41;
  }
}

class FakeWebglAddon {
  onContextLoss() {
    return { dispose() {} };
  }
}

class FakeTerminal {
  options: Record<string, unknown>;
  rows = 24;
  cols = 80;
  parser = {
    registerOscHandler: vi.fn(),
  };
  unicode = { activeVersion: "" };

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  attachCustomKeyEventHandler() {
    return true;
  }

  attachCustomWheelEventHandler() {
    return true;
  }

  clearSelection() {}

  dispose() {}

  focus() {}

  getSelection() {
    return "";
  }

  loadAddon(addon: { activate?: (terminal: FakeTerminal) => void }) {
    addon.activate?.(this);
  }

  onData() {
    return { dispose() {} };
  }

  onResize() {
    return { dispose() {} };
  }

  onScroll() {
    return { dispose() {} };
  }

  get buffer() {
    // Minimal active-buffer surface for the resume follow-scroll pin
    // (isViewportPinnedToBottom reads viewportY/baseY).
    return { active: { baseY: 0, viewportY: 0 } };
  }

  scrollToBottom() {}

  open() {}

  paste() {}

  refresh() {}

  write() {}
}

const maybeReloadForLoopbackWsAuthFailure = vi.fn(() => false);
const apiMocks = vi.hoisted(() => ({
  buildWsUrl: vi.fn(async () => "ws://localhost/api/pty?channel=chat-1"),
}));
const pageHeaderMocks = vi.hoisted(() => ({
  setEnd: vi.fn(),
  setTitle: vi.fn(),
}));

vi.mock("@xterm/addon-fit", () => ({ FitAddon: FakeFitAddon }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: FakeWebglAddon }));
vi.mock("@xterm/xterm", () => ({ Terminal: FakeTerminal }));
vi.mock("@/components/ChatSidebar", () => ({
  ChatSidebar: () => <div data-chat-sidebar />,
}));
vi.mock("@/components/ChatSessionList", () => ({
  ChatSessionList: () => null,
}));
vi.mock("@/components/Backdrop", () => ({ Backdrop: () => null }));
vi.mock("@/plugins", () => ({
  PluginSlot: () => null,
}));
vi.mock("@/contexts/usePageHeader", () => ({
  usePageHeader: () => pageHeaderMocks,
}));
vi.mock("@/contexts/useProfileScope", () => ({
  useProfileScope: () => ({ profile: "" }),
}));
vi.mock("@/themes", () => ({
  useTheme: () => ({ theme: { terminalBackground: "#000000" } }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: {
      app: {
        closeModelTools: "Close model tools",
        modelToolsSheetSubtitle: "Tools",
        modelToolsSheetTitle: "Model",
        openNavigation: "Open navigation",
      },
    },
  }),
}));
vi.mock("@/lib/dashboard-auth-reload", () => ({
  maybeReloadForLoopbackWsAuthFailure,
}));
vi.mock("@/lib/api", () => ({
  api: apiMocks,
  buildWsUrl: apiMocks.buildWsUrl,
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;

  binaryType = "blob";
  onclose: ((event: CloseEventLike) => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | string }) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = FakeWebSocket.OPEN;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
  }

  send() {}
}

type CloseEventLike = {
  code: number;
  reason: string;
  wasClean: boolean;
};

let container: HTMLDivElement;
let root: Root;

// jsdom runs without an origin here (per-file @vitest-environment jsdom on a
// node-default config), so localStorage is undefined. Stub it so components
// that persist UI state (Work Dock visibility) can be exercised.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// React only routes updates through act() when this flag is set; without it
// the isActive re-renders in the keyboard-inset gate test warn.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  maybeReloadForLoopbackWsAuthFailure.mockClear();
  apiMocks.buildWsUrl.mockReset();
  apiMocks.buildWsUrl.mockResolvedValue("ws://localhost/api/pty?channel=chat-1");
  pageHeaderMocks.setEnd.mockClear();
  pageHeaderMocks.setTitle.mockClear();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: false,
    media: "",
    removeEventListener() {},
  }));
  vi.stubGlobal("crypto", {
    getRandomValues: (values: Uint8Array) => {
      values.fill(7);
      return values;
    },
    randomUUID: () => "chat-test-id",
  });

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {}, width: 1280 },
  });
  Object.defineProperty(window, "__PANERGOS_SESSION_TOKEN__", {
    configurable: true,
    value: "stale-token",
    writable: true,
  });
  Object.defineProperty(window, "__PANERGOS_AUTH_REQUIRED__", {
    configurable: true,
    value: false,
    writable: true,
  });
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => {}),
    },
  });
  sessionStorage.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  localStorageMock.clear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe("ChatPage", () => {
  it("requests the PTY at the fitted terminal geometry", async () => {
    const { default: ChatPage } = await import("./ChatPage");

    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(apiMocks.buildWsUrl).toHaveBeenCalledWith(
      "/api/pty",
      expect.objectContaining({ cols: "132", rows: "41" }),
    );
  });

  it("treats loopback 4401 closes as stale-token reload candidates", async () => {
    const { default: ChatPage } = await import("./ChatPage");

    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    FakeWebSocket.instances[0].onclose?.({
      code: 4401,
      reason: "auth: token_mismatch",
      wasClean: true,
    });

    expect(maybeReloadForLoopbackWsAuthFailure).toHaveBeenCalledWith(4401);
  });

  it("attaches visualViewport keyboard-inset listeners only while the chat tab is active", async () => {
    // NS-434 follow-up: ChatPage stays mounted (hidden) on every dashboard
    // route. The keyboard-inset/scroll-pin listeners must only be live while
    // /chat is the active tab, or the scroll pin fires when a soft keyboard
    // opens on Settings etc.
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { addEventListener, removeEventListener, width: 1280 },
    });

    const { default: ChatPage } = await import("./ChatPage");

    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive={false} />
      </MemoryRouter>,
    );
    expect(addEventListener).not.toHaveBeenCalled();

    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/chat"]}>
          <ChatPage isActive />
        </MemoryRouter>,
      ),
    );
    expect(addEventListener.mock.calls.map((c) => c[0]).sort()).toEqual([
      "resize",
      "scroll",
    ]);
    expect(removeEventListener).not.toHaveBeenCalled();

    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/chat"]}>
          <ChatPage isActive={false} />
        </MemoryRouter>,
      ),
    );
    expect(removeEventListener.mock.calls.map((c) => c[0]).sort()).toEqual([
      "resize",
      "scroll",
    ]);
  });
});

describe("ChatPage Work Dock", () => {
  function headerButton() {
    const calls = pageHeaderMocks.setEnd.mock.calls;
    return calls[calls.length - 1]?.[0] as ReactElement<{
      "aria-label": string;
      onClick: () => void;
    }>;
  }

  async function renderChat() {
    const { default: ChatPage } = await import("./ChatPage");
    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );
  }

  it("opens on demand, persists the compatible preference, and closes with Escape", async () => {
    localStorage.clear();
    await renderChat();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    expect((document.querySelector("#chat-work-dock") as HTMLElement).hidden).toBe(true);
    expect(document.querySelectorAll("[data-chat-sidebar]")).toHaveLength(1);
    expect(headerButton().props["aria-label"]).toBe("Model Tools");

    await act(async () => {
      headerButton().props.onClick();
    });

    const dock = document.querySelector('[role="dialog"]:not([hidden])');
    expect(dock?.id).toBe("chat-work-dock");
    expect(dock?.getAttribute("aria-modal")).toBe("true");
    expect(dock?.textContent).toContain("Model Tools");
    expect(document.querySelectorAll("[data-chat-sidebar]")).toHaveLength(1);
    expect(localStorage.getItem("panergos-chat-panel-collapsed")).toBe("0");
    expect(headerButton().props["aria-label"]).toBe("Close model tools");

    await act(async () => {
      window.dispatchEvent(new Event("panergos:close-work-dock"));
    });

    expect((document.querySelector("#chat-work-dock") as HTMLElement).hidden).toBe(true);
    expect(localStorage.getItem("panergos-chat-panel-collapsed")).toBe("1");
    expect(headerButton().props["aria-label"]).toBe("Model Tools");

    await act(async () => {
      headerButton().props.onClick();
    });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect((document.querySelector("#chat-work-dock") as HTMLElement).hidden).toBe(true);
  });

  it("honours the old expanded preference and closes from the backdrop", async () => {
    localStorage.setItem("panergos-chat-panel-collapsed", "0");
    await renderChat();

    expect(document.querySelector('[role="dialog"]:not([hidden])')).not.toBeNull();

    await act(async () => {
      document
        .querySelector('[aria-label="Close model tools"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect((document.querySelector("#chat-work-dock") as HTMLElement).hidden).toBe(true);
    expect(localStorage.getItem("panergos-chat-panel-collapsed")).toBe("1");
  });

  it("keeps the event bridge mounted while persistent chat is inactive", async () => {
    const { default: ChatPage } = await import("./ChatPage");
    await render(
      <MemoryRouter initialEntries={["/sessions"]}>
        <ChatPage isActive={false} />
      </MemoryRouter>,
    );

    expect(document.querySelectorAll("[data-chat-sidebar]")).toHaveLength(1);
    expect((document.querySelector("#chat-work-dock") as HTMLElement).hidden).toBe(true);
  });
});

// The gated-mode ticket request runs before any socket exists, so a rejection
// or a hang emits no `close` event and never arms PTY_CONNECTING_TIMEOUT_MS
// (that timer is set after `new WebSocket`). Without its own deadline the tab
// strands on "connecting" with no retry. Mirrors the ChatSidebar events-feed
// coverage in src/components/ChatSidebar.test.tsx.
describe("ChatPage PTY ticket connect deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderChat() {
    const { default: ChatPage } = await import("./ChatPage");
    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );
  }

  /** Advance timers and flush the async connect that fires on the tick. */
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("retries when the ticket request rejects", async () => {
    apiMocks.buildWsUrl.mockRejectedValueOnce(
      new Error("ticket endpoint unavailable"),
    );

    await renderChat();
    await advance(0);
    expect(FakeWebSocket.instances).toHaveLength(0);

    // First backoff step is 250ms; the retry must mint a fresh ticket.
    await advance(250);
    expect(apiMocks.buildWsUrl).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("times out a stalled ticket request and retries", async () => {
    let resolveStalledRequest!: (url: string) => void;
    apiMocks.buildWsUrl.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveStalledRequest = resolve;
        }),
    );

    await renderChat();
    await advance(0);
    expect(FakeWebSocket.instances).toHaveLength(0);

    await advance(PTY_TICKET_TIMEOUT_MS);
    expect(FakeWebSocket.instances).toHaveLength(0);

    // A late ticket from the timed-out attempt must not open a socket behind
    // the replacement the deadline scheduled.
    await act(async () => {
      resolveStalledRequest("ws://localhost/api/pty?channel=stale");
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances).toHaveLength(0);

    await advance(250);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).not.toContain("channel=stale");
  });

  it("leaves a settled ticket's socket to the CONNECTING timer", async () => {
    await renderChat();
    await advance(0);
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    // NS-591 regression: once the socket exists the ticket deadline is
    // disarmed, so PTY_CONNECTING_TIMEOUT_MS stays the only thing that may
    // force-close a wedged handshake — the two must not both fire.
    await advance(PTY_TICKET_TIMEOUT_MS);
    expect(apiMocks.buildWsUrl).toHaveBeenCalledTimes(1);
  });
});
