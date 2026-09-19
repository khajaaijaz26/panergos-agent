// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, fetchJSON, setManagementProfile } from "./api";

const reloadMocks = vi.hoisted(() => ({
  attemptDashboardTokenReloadOnce: vi.fn(() => false),
  clearDashboardTokenReloadAttempt: vi.fn(),
}));

vi.mock("./dashboard-auth-reload", () => ({
  attemptDashboardTokenReloadOnce: reloadMocks.attemptDashboardTokenReloadOnce,
  clearDashboardTokenReloadAttempt: reloadMocks.clearDashboardTokenReloadAttempt,
}));

const SESSION_HEADER = "X-Panergos-Session-Token";

beforeEach(() => {
  reloadMocks.attemptDashboardTokenReloadOnce.mockReset();
  reloadMocks.attemptDashboardTokenReloadOnce.mockReturnValue(false);
  reloadMocks.clearDashboardTokenReloadAttempt.mockReset();

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
});

afterEach(() => {
  setManagementProfile("");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonFetchMock(body: unknown = { ok: true }) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
  );
}

describe("fetchJSON", () => {
  it("tries the one-shot reload path for loopback 401s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        clone: () => ({
          json: async () => ({}),
        }),
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Unauthorized",
      })),
    );
    reloadMocks.attemptDashboardTokenReloadOnce.mockReturnValue(true);

    const pending = fetchJSON("/api/status");
    await expect(Promise.race([pending, Promise.resolve("pending")])).resolves.toBe(
      "pending",
    );

    expect(reloadMocks.attemptDashboardTokenReloadOnce).toHaveBeenCalledTimes(1);
    expect(reloadMocks.clearDashboardTokenReloadAttempt).not.toHaveBeenCalled();
  });

  it("clears the reload latch after a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ ok: true }),
        ok: true,
        status: 200,
      })),
    );

    await expect(fetchJSON("/api/status")).resolves.toEqual({ ok: true });

    expect(reloadMocks.clearDashboardTokenReloadAttempt).toHaveBeenCalledTimes(1);
  });
});

describe("api.getModelOptions", () => {
  it("requests a live model refresh when asked", async () => {
    vi.stubGlobal("window", {});

    const fetchMock = jsonFetchMock({ providers: [] });
    vi.stubGlobal("fetch", fetchMock);

    await api.getModelOptions({ refresh: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/model/options?refresh=1&include_unconfigured=1",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("keeps explicit profile scoping when refreshing", async () => {
    vi.stubGlobal("window", {});

    const fetchMock = jsonFetchMock({ providers: [] });
    vi.stubGlobal("fetch", fetchMock);

    await api.getModelOptions({ profile: "default", refresh: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/model/options?profile=default&refresh=1&include_unconfigured=1",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

describe("api.validateProviderCredential", () => {
  it("sends the credential only in the validation request body", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = jsonFetchMock({
      message: "",
      ok: true,
      reachable: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.validateProviderCredential("OPENAI_API_KEY", "sk-test-secret");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/providers/validate",
      expect.objectContaining({
        body: JSON.stringify({
          key: "OPENAI_API_KEY",
          value: "sk-test-secret",
        }),
        method: "POST",
      }),
    );
  });

  it("keeps an explicitly captured default profile pinned across mutations", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = jsonFetchMock({ ok: true, providers: [] });
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("switched-profile");

    await api.validateProviderCredential("OPENAI_API_KEY", "secret", "");
    await api.setEnvVar("OPENAI_API_KEY", "secret", "");
    await api.getModelOptions({ profile: "", refresh: true });
    await api.setModelAssignment(
      { model: "gpt-test", provider: "openai-api", scope: "main", task: "main" },
      "",
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/providers/validate?profile=",
      "/api/env?profile=",
      "/api/model/options?profile=&refresh=1&include_unconfigured=1",
      "/api/model/set?profile=",
    ]);
  });
});

describe("api custom endpoint helpers", () => {
  it("keeps persisted endpoint operations profile-scoped", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = jsonFetchMock({
      current: { base_url: "", model: "", provider: "" },
      endpoints: [],
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("worker");

    const endpoint = {
      api_key: "test-secret",
      base_url: "https://models.example.test/v1",
      model: "test-model",
      name: "Example",
    };
    await api.getCustomEndpoints();
    await api.validateCustomEndpoint(endpoint);
    await api.saveCustomEndpoint(endpoint);
    await api.activateCustomEndpoint("example/id");
    await api.deleteCustomEndpoint("example/id");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/providers/custom-endpoints?profile=worker",
      "/api/providers/custom-endpoints/validate",
      "/api/providers/custom-endpoints?profile=worker",
      "/api/providers/custom-endpoints/example%2Fid/activate?profile=worker",
      "/api/providers/custom-endpoints/example%2Fid?profile=worker",
    ]);
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify(endpoint),
        method: "POST",
      }),
    );
    expect(fetchMock.mock.calls[4][1]).toEqual(
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("api OAuth helpers", () => {
  it("starts OAuth login in gated mode without requiring an injected session token", async () => {
    vi.stubGlobal("window", { __PANERGOS_AUTH_REQUIRED__: true });
    const fetchMock = jsonFetchMock({
      flow: "device_code",
      session_id: "oauth-session",
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.startOAuthLogin("openai-codex");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/providers/oauth/openai-codex/start",
      expect.objectContaining({
        body: "{}",
        credentials: "include",
        method: "POST",
      }),
    );
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.has(SESSION_HEADER)).toBe(false);
  });

  it("still sends the injected session token for OAuth login in loopback mode", async () => {
    vi.stubGlobal("window", { __PANERGOS_SESSION_TOKEN__: "loopback-token" });
    const fetchMock = jsonFetchMock({
      flow: "device_code",
      session_id: "oauth-session",
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.startOAuthLogin("openai-codex");

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get(SESSION_HEADER)).toBe("loopback-token");
  });

  it("runs provider auth mutations in gated mode via cookie auth", async () => {
    vi.stubGlobal("window", { __PANERGOS_AUTH_REQUIRED__: true });
    const fetchMock = jsonFetchMock({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await api.disconnectOAuthProvider("anthropic");
    await api.submitOAuthCode("anthropic", "oauth-session", "code-123");
    await api.cancelOAuthSession("oauth-session");
    await api.revealEnvVar("OPENAI_API_KEY");

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.credentials).toBe("include");
      expect((init.headers as Headers).has(SESSION_HEADER)).toBe(false);
    }
  });

  it("keeps every OAuth operation on the selected management profile", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = jsonFetchMock({
      flow: "device_code",
      session_id: "oauth-session",
    });
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("worker");

    await api.getOAuthProviders();
    await api.disconnectOAuthProvider("anthropic");
    await api.startOAuthLogin("openai-codex");
    await api.submitOAuthCode("anthropic", "oauth-session", "code-123");
    await api.pollOAuthSession("anthropic", "oauth-session");
    await api.cancelOAuthSession("oauth-session");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/providers/oauth?profile=worker",
      "/api/providers/oauth/anthropic?profile=worker",
      "/api/providers/oauth/openai-codex/start?profile=worker",
      "/api/providers/oauth/anthropic/submit?profile=worker",
      "/api/providers/oauth/anthropic/poll/oauth-session?profile=worker",
      "/api/providers/oauth/sessions/oauth-session?profile=worker",
    ]);
  });
});
