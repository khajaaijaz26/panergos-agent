import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate } from "react-router";
import {
  Activity,
  BarChart3,
  BookOpen,
  Clock,
  Code,
  Cpu,
  Database,
  Download,
  Eye,
  FolderOpen,
  FileText,
  Globe,
  Heart,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  Package,
  Plug,
  Puzzle,
  Radio,
  RotateCw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  Users,
  Webhook,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@panergos/ui/ui/components/button";
import { SelectionSwitcher } from "@panergos/ui/ui/components/selection-switcher";
import { Spinner } from "@panergos/ui/ui/components/spinner";
import { ConfirmDialog } from "@panergos/ui/ui/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { gatewayLine } from "@/components/SidebarStatusStrip";
import { useSidebarStatus } from "@/hooks/useSidebarStatus";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { AuthWidget } from "@/components/AuthWidget";
import { PageHeaderProvider } from "@/contexts/PageHeaderProvider";
import { ProfileProvider } from "@/contexts/ProfileProvider";
import { useProfileScope } from "@/contexts/useProfileScope";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";
import { ProfileScopeBanner } from "@/components/ProfileScopeBanner";
import { MemoryPressureBanner } from "@/components/MemoryPressureBanner";
import { useSystemActions } from "@/contexts/useSystemActions";
import type { SystemAction } from "@/contexts/system-actions-context";
// Route pages are lazy-loaded so the initial dashboard shell does not pay for
// every admin surface (and heavy deps like xterm) up front.
const ConfigPage = lazy(() => import("@/pages/ConfigPage"));
const DocsPage = lazy(() => import("@/pages/DocsPage"));
const EnvPage = lazy(() => import("@/pages/EnvPage"));
const FilesPage = lazy(() => import("@/pages/FilesPage"));
const SessionsPage = lazy(() => import("@/pages/SessionsPage"));
const LogsPage = lazy(() => import("@/pages/LogsPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const ModelsPage = lazy(() => import("@/pages/ModelsPage"));
const CronPage = lazy(() => import("@/pages/CronPage"));
const ProfilesPage = lazy(() => import("@/pages/ProfilesPage"));
const ProfileBuilderPage = lazy(() => import("@/pages/ProfileBuilderPage"));
const SkillsPage = lazy(() => import("@/pages/SkillsPage"));
const PluginsPage = lazy(() => import("@/pages/PluginsPage"));
const McpPage = lazy(() => import("@/pages/McpPage"));
const PairingPage = lazy(() => import("@/pages/PairingPage"));
const ChannelsPage = lazy(() => import("@/pages/ChannelsPage"));
const WebhooksPage = lazy(() => import("@/pages/WebhooksPage"));
const SystemPage = lazy(() => import("@/pages/SystemPage"));
const ChatPage = lazy(() => import("@/pages/ChatPage"));
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useI18n } from "@/i18n";
import type { Translations } from "@/i18n/types";
import { PluginPage, PluginSlot, usePlugins } from "@/plugins";
import type { PluginManifest } from "@/plugins";
import { useTheme } from "@/themes";
import { isDashboardEmbeddedChatEnabled } from "@/lib/dashboard-flags";
import { latchChatActivation } from "@/lib/chat-activation";
import { sharedGatewayProfiles, sharedGatewayRestartDescription } from "@/lib/shared-gateway";
import { api, PANERGOS_BASE_PATH } from "@/lib/api";
import type { StatusResponse, UpdateCheckResponse } from "@/lib/api";
import {
  CLOSE_WORK_DOCK_EVENT,
  filterCommandDeckItems,
  groupCommandDeckItems,
  isBlockingCommandDeckModal,
  isCommandDeckShortcut,
  PRIMARY_COMMAND_PATHS,
} from "@/lib/command-deck";

const PANERGOS_MARK_SRC = `${PANERGOS_BASE_PATH}/panergos-mark.svg`;

function RouteFallback({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[12rem] flex-1 items-center justify-center"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        <span>{label}</span>
      </div>
    </div>
  );
}

function RootRedirect() {
  return <Navigate to="/sessions" replace />;
}

function UnknownRouteFallback({ pluginsLoading }: { pluginsLoading: boolean }) {
  if (pluginsLoading) {
    // Render nothing during the plugin-load window — a spinner here would just flash.
    return null;
  }
  return <Navigate to="/sessions" replace />;
}

const CHAT_NAV_ITEM: NavItem = {
  path: "/chat",
  labelKey: "chat",
  label: "Chat",
  icon: Terminal,
};

/**
 * Built-in routes except /chat.  Chat is rendered persistently (outside
 * <Routes>) when embedded — see the persistent chat host block rendered
 * inline near the bottom of this file — so the PTY child, WebSocket,
 * and xterm instance survive when the user visits another tab and comes
 * back.  A `display:none` toggle hides the terminal without unmounting.
 * The host itself is still deferred until the first /chat visit so the
 * xterm chunk is not downloaded on unrelated pages.  Routing still owns
 * the URL so /chat deep-links, browser back/forward, and nav highlight
 * keep working.
 */
const BUILTIN_ROUTES_CORE: Record<string, ComponentType> = {
  "/": RootRedirect,
  "/sessions": SessionsPage,
  "/files": FilesPage,
  "/analytics": AnalyticsPage,
  "/models": ModelsPage,
  "/logs": LogsPage,
  "/cron": CronPage,
  "/skills": SkillsPage,
  "/plugins": PluginsPage,
  "/mcp": McpPage,
  "/pairing": PairingPage,
  "/channels": ChannelsPage,
  "/webhooks": WebhooksPage,
  "/system": SystemPage,
  "/profiles": ProfilesPage,
  "/profiles/new": ProfileBuilderPage,
  "/config": ConfigPage,
  "/env": EnvPage,
  "/docs": DocsPage,
};

// Route placeholder for /chat.  The persistent ChatPage host (rendered
// outside <Routes> when embedded chat is on) paints on top; this empty
// element just claims the path so the `*` catch-all redirect doesn't
// fire when the user navigates to /chat.
function ChatRouteSink() {
  return null;
}

const BUILTIN_NAV_REST: NavItem[] = [
  {
    path: "/sessions",
    labelKey: "sessions",
    label: "Sessions",
    icon: MessageSquare,
  },
  { path: "/files", label: "Files", icon: FolderOpen },
  {
    path: "/analytics",
    labelKey: "analytics",
    label: "Analytics",
    icon: BarChart3,
  },
  {
    path: "/models",
    labelKey: "models",
    label: "Models",
    icon: Cpu,
  },
  { path: "/logs", labelKey: "logs", label: "Logs", icon: FileText },
  { path: "/cron", labelKey: "cron", label: "Cron", icon: Clock },
  { path: "/skills", labelKey: "skills", label: "Skills", icon: Package },
  { path: "/plugins", labelKey: "plugins", label: "Plugins", icon: Puzzle },
  { path: "/mcp", label: "MCP", icon: Plug },
  { path: "/channels", label: "Channels", icon: Radio },
  { path: "/webhooks", label: "Webhooks", icon: Webhook },
  { path: "/pairing", label: "Pairing", icon: ShieldCheck },
  { path: "/profiles", labelKey: "profiles", label: "Profiles", icon: Users },
  { path: "/config", labelKey: "config", label: "Config", icon: Settings },
  { path: "/env", labelKey: "keys", label: "Keys", icon: KeyRound },
  { path: "/system", label: "System", icon: Wrench },
  {
    path: "/docs",
    labelKey: "documentation",
    label: "Documentation",
    icon: BookOpen,
  },
];

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  Activity,
  BarChart3,
  Clock,
  Cpu,
  FileText,
  FolderOpen,
  KeyRound,
  MessageSquare,
  Package,
  Settings,
  Puzzle,
  Sparkles,
  Terminal,
  Globe,
  Database,
  Shield,
  Users,
  Wrench,
  Zap,
  Heart,
  Star,
  Code,
  Eye,
};

function resolveIcon(name: string): ComponentType<{ className?: string }> {
  return ICON_MAP[name] ?? Puzzle;
}

function buildNavItems(builtIn: NavItem[], manifests: PluginManifest[]): NavItem[] {
  const items = [...builtIn];

  for (const manifest of manifests) {
    if (manifest.tab.override) continue;
    if (manifest.tab.hidden) continue;

    const pluginItem: NavItem = {
      path: manifest.tab.path,
      label: manifest.label,
      icon: resolveIcon(manifest.icon),
    };

    const pos = manifest.tab.position ?? "end";
    if (pos === "end") {
      items.push(pluginItem);
    } else if (pos.startsWith("after:")) {
      const target = "/" + pos.slice(6);
      const idx = items.findIndex((i) => i.path === target);
      items.splice(idx >= 0 ? idx + 1 : items.length, 0, pluginItem);
    } else if (pos.startsWith("before:")) {
      const target = "/" + pos.slice(7);
      const idx = items.findIndex((i) => i.path === target);
      items.splice(idx >= 0 ? idx : items.length, 0, pluginItem);
    } else {
      items.push(pluginItem);
    }
  }

  return items;
}

/** Split built-in commands from plugin commands while preserving plugin order hints. */
function partitionCommandNav(
  builtIn: NavItem[],
  manifests: PluginManifest[],
): { coreItems: NavItem[]; pluginItems: NavItem[] } {
  const merged = buildNavItems(builtIn, manifests);
  const builtinPaths = new Set(builtIn.map((i) => i.path));
  const coreItems: NavItem[] = [];
  const pluginItems: NavItem[] = [];
  for (const item of merged) {
    if (builtinPaths.has(item.path)) coreItems.push(item);
    else pluginItems.push(item);
  }
  return { coreItems, pluginItems };
}

function buildRoutes(
  builtinRoutes: Record<string, ComponentType>,
  manifests: PluginManifest[],
): Array<{
  key: string;
  path: string;
  element: ReactNode;
}> {
  const byOverride = new Map<string, PluginManifest>();
  const addons: PluginManifest[] = [];

  for (const m of manifests) {
    if (m.tab.override) {
      byOverride.set(m.tab.override, m);
    } else {
      addons.push(m);
    }
  }

  const routes: Array<{
    key: string;
    path: string;
    element: ReactNode;
  }> = [];

  for (const [path, Component] of Object.entries(builtinRoutes)) {
    const om = byOverride.get(path);
    if (om) {
      routes.push({
        key: `override:${om.name}`,
        path,
        element: <PluginPage name={om.name} />,
      });
    } else {
      routes.push({ key: `builtin:${path}`, path, element: <Component /> });
    }
  }

  for (const m of addons) {
    if (m.tab.hidden) continue;
    if (m.tab.path === "/plugins") continue;
    if (builtinRoutes[m.tab.path]) continue;
    routes.push({
      key: `plugin:${m.name}`,
      path: m.tab.path,
      element: <PluginPage name={m.name} />,
    });
  }

  for (const m of manifests) {
    if (!m.tab.hidden) continue;
    if (m.tab.path === "/plugins") continue;
    if (builtinRoutes[m.tab.path] || m.tab.override) continue;
    routes.push({
      key: `plugin:hidden:${m.name}`,
      path: m.tab.path,
      element: <PluginPage name={m.name} />,
    });
  }

  return routes;
}

export default function App() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { manifests, loading: pluginsLoading } = usePlugins();
  const { theme } = useTheme();
  const [commandDeckOpen, setCommandDeckOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const closeCommandDeck = useCallback(() => {
    setCommandDeckOpen(false);
    setCommandQuery("");
  }, []);
  const openCommandDeck = useCallback(() => {
    window.dispatchEvent(new Event(CLOSE_WORK_DOCK_EVENT));
    setCommandDeckOpen(true);
  }, []);
  const commandPanelRef = useModalBehavior({
    initialFocus: "input[type='search']",
    open: commandDeckOpen,
    onClose: closeCommandDeck,
  });
  const sidebarStatus = useSidebarStatus();
  const isDocsRoute = pathname === "/docs" || pathname === "/docs/";
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const isChatRoute = normalizedPath === "/chat";
  const embeddedChat = isDashboardEmbeddedChatEnabled();
  // Defer mounting the persistent chat host (and its xterm chunk) until the
  // user has actually opened /chat at least once. Sticky after that so the
  // PTY survives later tab switches.
  const [chatHostMounted, setChatHostMounted] = useState(isChatRoute);
  useEffect(() => {
    setChatHostMounted((prev) => latchChatActivation(prev, isChatRoute));
  }, [isChatRoute]);

  // `dashboard.show_token_analytics` gates the Analytics nav item.  The
  // page itself remains reachable by URL (it renders an explanation when
  // the flag is off — see AnalyticsPage), but hiding the nav entry avoids
  // surfacing misleading token/cost numbers in Navigation. Default off.
  const [showTokenAnalytics, setShowTokenAnalytics] = useState(false);
  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        const dash = (cfg?.dashboard ?? {}) as {
          show_token_analytics?: unknown;
        };
        setShowTokenAnalytics(dash.show_token_analytics === true);
      })
      .catch(() => setShowTokenAnalytics(false));
  }, []);

  // A plugin can replace the built-in /chat page via `tab.override: "/chat"`
  // in its manifest.  When one does, `buildRoutes` already swaps the route
  // element for <PluginPage /> — but we also have to suppress the
  // persistent ChatPage host below, or the plugin's page and the built-in
  // terminal would paint on top of each other.  The override is niche
  // (nothing ships overriding /chat today) but it's an advertised
  // extension point, so preserve the pre-persistence contract: when a
  // plugin owns /chat, the built-in chat UI is entirely absent.
  //
  // Waiting on `pluginsLoading` is load-bearing: manifests arrive
  // asynchronously from /api/dashboard/plugins, so on initial render
  // `chatOverriddenByPlugin` is always false.  Without the loading
  // gate, the persistent host would mount, spawn a PTY, and THEN get
  // yanked out from under the user when the plugin's manifest resolves
  // — killing the session mid-paint.  Delaying host mount by the
  // plugin-load window (typically <50ms, worst case 2s safety timeout)
  // is the cheaper trade-off.
  const chatOverriddenByPlugin = useMemo(
    () => manifests.some((m) => m.tab.override === "/chat"),
    [manifests],
  );

  const builtinRoutes = useMemo(
    () => ({
      ...BUILTIN_ROUTES_CORE,
      ...(embeddedChat ? { "/chat": ChatRouteSink } : {}),
    }),
    [embeddedChat],
  );

  const builtinNav = useMemo(() => {
    const base = embeddedChat ? [CHAT_NAV_ITEM, ...BUILTIN_NAV_REST] : BUILTIN_NAV_REST;
    return showTokenAnalytics ? base : base.filter((n) => n.path !== "/analytics");
  }, [embeddedChat, showTokenAnalytics]);

  const commandNav = useMemo(
    () => partitionCommandNav(builtinNav, manifests),
    [builtinNav, manifests],
  );
  const primaryCommands = useMemo(
    () => commandNav.coreItems.filter((item) => PRIMARY_COMMAND_PATHS.has(item.path)),
    [commandNav.coreItems],
  );
  const filteredCoreCommands = useMemo(
    () =>
      filterCommandDeckItems(commandNav.coreItems, commandQuery, (item) =>
        resolveNavLabel(item, t),
      ),
    [commandNav.coreItems, commandQuery, t],
  );
  const filteredPluginCommands = useMemo(
    () =>
      filterCommandDeckItems(commandNav.pluginItems, commandQuery, (item) =>
        resolveNavLabel(item, t),
      ),
    [commandNav.pluginItems, commandQuery, t],
  );
  const commandGroups = useMemo(
    () => groupCommandDeckItems(filteredCoreCommands),
    [filteredCoreCommands],
  );
  const routes = useMemo(() => buildRoutes(builtinRoutes, manifests), [builtinRoutes, manifests]);
  const pluginTabMeta = useMemo(
    () =>
      manifests
        .filter((m) => !m.tab.hidden)
        .map((m) => ({
          path: m.tab.override ?? m.tab.path,
          label: m.label,
        })),
    [manifests],
  );

  const layoutVariant = theme.layoutVariant ?? "standard";

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (isCommandDeckShortcut(event)) {
        const blocked = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[aria-modal="true"], [role="dialog"], [role="alertdialog"]',
          ),
        ).some(isBlockingCommandDeckModal);
        if (blocked) return;
        event.preventDefault();
        openCommandDeck();
      }
    };
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, [openCommandDeck]);

  const gateway = sidebarStatus ? gatewayLine(sidebarStatus, t) : null;

  return (
    <ProfileProvider>
      <div
        data-layout-variant={layoutVariant}
        data-panergos-shell="signal"
        className="panergos-shell flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-background-base text-text-primary antialiased"
      >
        <SelectionSwitcher />

        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <PluginSlot name="backdrop" />
        </div>

        <header className="panergos-command-deck relative z-50 shrink-0 px-2 pb-1 pt-2 sm:px-3 sm:pt-3">
          <div className="mx-auto grid h-14 w-full max-w-[1680px] grid-cols-[auto_1fr_auto] items-center gap-2 sm:h-[4.25rem] sm:gap-3">
            <div className="col-start-1 row-start-1 flex h-full min-w-0 items-center">
              <PluginSlot name="header-left" />
              <Link
                aria-label={t.app.brand}
                className="panergos-brand-node group flex h-full shrink-0 items-center gap-2.5 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midground/70 sm:px-3"
                onClick={closeCommandDeck}
                to="/sessions"
              >
                <span className="panergos-mark-frame relative grid h-10 w-10 place-items-center overflow-hidden">
                  <img
                    src={PANERGOS_MARK_SRC}
                    alt=""
                    className="h-8 w-8 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105"
                  />
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block font-expanded text-[0.82rem] font-bold tracking-[0.18em] text-foreground">
                    PANERGOS
                  </span>
                  <span className="block text-[0.6rem] font-medium uppercase tracking-[0.22em] text-text-tertiary">
                    {t.app.webUi}
                  </span>
                </span>
              </Link>
            </div>

            <nav
              aria-label={t.app.navigation}
              className="panergos-command-track scrollbar-none col-start-2 hidden h-11 min-w-0 items-center justify-center gap-1 overflow-x-auto px-2 lg:flex"
            >
              {primaryCommands.map((item) => (
                <CommandNavLink
                  compact
                  item={item}
                  key={item.path}
                  onNavigate={closeCommandDeck}
                  t={t}
                />
              ))}
            </nav>

            <div className="panergos-control-node col-start-3 flex h-full items-center gap-1.5 px-1.5 sm:px-2">
              <Link
                className="hidden shrink-0 items-center gap-2 px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:text-foreground md:flex"
                onClick={closeCommandDeck}
                title={t.app.statusOverview}
                to="/sessions"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-2 w-2 rotate-45 shadow-[0_0_10px_currentColor]",
                    gateway?.tone ?? "text-text-tertiary",
                    gateway?.tone === "text-success"
                      ? "bg-success"
                      : gateway?.tone === "text-warning"
                        ? "bg-warning"
                        : gateway?.tone === "text-destructive"
                          ? "bg-destructive"
                          : "bg-muted-foreground",
                  )}
                />
                <span>{gateway?.label ?? t.common.loading}</span>
                {sidebarStatus && (
                  <span className="font-mono-ui tabular-nums text-text-tertiary">
                    {sidebarStatus.active_sessions}
                  </span>
                )}
              </Link>

              <PluginSlot name="header-right" />

              <Button
                ghost
                onClick={() => (commandDeckOpen ? closeCommandDeck() : openCommandDeck())}
                aria-label={commandDeckOpen ? t.app.closeNavigation : t.app.openNavigation}
                aria-expanded={commandDeckOpen}
                aria-controls="command-deck-panel"
                className="panergos-map-trigger shrink-0 gap-2 px-3 text-text-secondary hover:text-foreground"
              >
                {commandDeckOpen ? <X className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                <span className="hidden text-xs font-medium uppercase tracking-[0.12em] sm:inline">
                  {t.app.navigation}
                </span>
              </Button>
            </div>
          </div>
        </header>

        {commandDeckOpen && (
          <>
            <button
              aria-label={t.app.closeNavigation}
              className="fixed inset-0 z-[55] cursor-default bg-black/70 backdrop-blur-md"
              onClick={closeCommandDeck}
              type="button"
            />
            <section
              aria-modal="true"
              aria-label={t.app.navigation}
              className="panergos-command-panel fixed inset-x-3 bottom-3 top-[5rem] z-[60] overflow-y-auto border border-current/20 sm:top-[5.75rem]"
              id="command-deck-panel"
              ref={commandPanelRef}
              role="dialog"
              tabIndex={-1}
            >
              <Button
                ghost
                size="icon"
                aria-label={t.app.closeNavigation}
                className="absolute right-4 top-4 z-10 border border-current/15 bg-background-base/35 text-text-secondary hover:text-midground"
                onClick={closeCommandDeck}
              >
                <X className="h-4 w-4" />
              </Button>
              <div className="grid min-h-full grid-rows-[auto_minmax(0,1fr)]">
                <header className="panergos-command-header grid min-w-0 gap-4 border-b border-current/15 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,auto)] lg:items-center lg:p-5">
                  <div className="flex items-start justify-between gap-3 lg:block">
                    <div>
                      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-midground">
                        Panergos / {t.app.navigation}
                      </p>
                      <h2 className="mt-2 font-expanded text-2xl font-bold leading-none tracking-[0.02em] text-foreground">
                        {t.app.navigation}
                      </h2>
                    </div>
                    <span
                      aria-hidden
                      className="panergos-relay-glyph mr-11 mt-1 grid h-12 w-12 shrink-0 place-items-center lg:mr-0 lg:mt-6 lg:h-28 lg:w-28 lg:self-center"
                    >
                      <img src={PANERGOS_MARK_SRC} alt="" className="h-8 w-8 lg:h-14 lg:w-14" />
                    </span>
                  </div>

                  <div className="hidden min-w-0 items-stretch justify-end gap-3 lg:flex">
                    <div className="min-w-[19rem] overflow-hidden border border-current/15 bg-background-base/25">
                      <ProfileSwitcher />
                      <CommandSystemActions onNavigate={closeCommandDeck} status={sidebarStatus} />
                    </div>

                    <div className="flex items-center gap-1 border border-current/15 bg-background-base/25 p-2">
                      <ThemeSwitcher dropUp modalOwnerId="command-deck-panel" />
                      <LanguageSwitcher dropUp modalOwnerId="command-deck-panel" />
                    </div>

                    <AuthWidget className="border border-current/15 bg-background-base/25" />
                  </div>
                </header>

                <div className="flex min-w-0 flex-col p-4 sm:p-5 lg:p-6">
                  <label className="group flex w-full items-center gap-3 border-b border-current/25 bg-background-base/20 py-3 pl-1 pr-12 focus-within:border-midground/70">
                    <Search className="h-4 w-4 shrink-0 text-text-tertiary group-focus-within:text-midground" />
                    <span className="sr-only">{t.common.search}</span>
                    <input
                      aria-label={t.common.search}
                      autoComplete="off"
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-text-tertiary"
                      onChange={(event) => setCommandQuery(event.target.value)}
                      placeholder={t.common.search}
                      type="search"
                      value={commandQuery}
                    />
                    <kbd className="hidden rounded border border-current/15 px-1.5 py-0.5 font-mono-ui text-[0.65rem] text-text-tertiary sm:inline">
                      ESC
                    </kbd>
                  </label>

                  {commandGroups.length === 0 && filteredPluginCommands.length === 0 ? (
                    <div className="grid min-h-52 flex-1 place-items-center border border-dashed border-current/20 bg-background-base/15 text-center">
                      <div>
                        <Search className="mx-auto mb-3 h-6 w-6 text-text-tertiary" />
                        <p className="text-sm font-medium text-foreground">{t.common.noResults}</p>
                      </div>
                    </div>
                  ) : (
                    <nav
                      aria-label={t.app.navigation}
                      className="mt-5 grid content-start gap-2 sm:grid-cols-2 xl:grid-cols-3"
                    >
                      {commandGroups.map((group) => (
                        <section
                          className={cn(
                            "panergos-command-lane border border-current/15 p-2.5",
                            group.id === "operate" && "sm:col-span-2 xl:col-span-3",
                          )}
                          key={group.id}
                        >
                          <h3 className="px-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                            {
                              {
                                create: t.common.create,
                                intelligence: t.app.nav.models,
                                connect: t.common.messaging,
                                operate: t.app.system,
                                more: t.common.other,
                              }[group.id]
                            }
                          </h3>
                          <ul
                            className={cn(
                              "grid gap-1",
                              group.id === "operate" && "sm:grid-cols-2 xl:grid-cols-3",
                            )}
                          >
                            {group.items.map((item) => (
                              <li key={item.path}>
                                <CommandNavLink item={item} onNavigate={closeCommandDeck} t={t} />
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}

                      {filteredPluginCommands.length > 0 && (
                        <section className="panergos-command-lane border border-current/15 p-2.5">
                          <h3 className="px-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                            {t.app.pluginNavSection}
                          </h3>
                          <ul className="grid gap-1">
                            {filteredPluginCommands.map((item) => (
                              <li key={item.path}>
                                <CommandNavLink item={item} onNavigate={closeCommandDeck} t={t} />
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                    </nav>
                  )}

                  <div className="mt-auto grid gap-3 pt-5 lg:hidden">
                    <div className="min-w-0 overflow-hidden border border-current/15 bg-background-base/25">
                      <ProfileSwitcher />
                      <CommandSystemActions onNavigate={closeCommandDeck} status={sidebarStatus} />
                    </div>

                    <div className="flex flex-wrap items-center gap-1 border border-current/15 bg-background-base/25 p-2">
                      <ThemeSwitcher dropUp modalOwnerId="command-deck-panel" />
                      <LanguageSwitcher dropUp modalOwnerId="command-deck-panel" />
                    </div>

                    <AuthWidget className="border border-current/15 bg-background-base/25" />
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
        <PluginSlot name="header-banner" />
        <ProfileScopeBanner />
        <MemoryPressureBanner status={sidebarStatus} />

        <div className="relative z-1 flex min-h-0 min-w-0 flex-1 overflow-hidden px-2 pb-2 pt-1 sm:px-3 sm:pb-3">
          <div className="panergos-workspace-shell flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <PageHeaderProvider pluginTabs={pluginTabMeta}>
              <div
                className={cn(
                  "relative z-2 flex min-w-0 min-h-0 flex-1 flex-col",
                  "px-3 sm:px-6",
                  isChatRoute ? "pb-0 pt-1 sm:pt-2 lg:pt-4" : "pt-2 sm:pt-4 lg:pt-6",
                  isDocsRoute && "min-h-0 flex-1",
                )}
              >
                <PluginSlot name="pre-main" />
                <div
                  className={cn(
                    "w-full min-w-0",
                    !isChatRoute && "pb-[calc(2rem+env(safe-area-inset-bottom,0px))] lg:pb-8",
                    (isDocsRoute || isChatRoute) && "min-h-0 flex flex-1 flex-col",
                  )}
                >
                  <ProfileKeyedRoutes>
                    <Suspense fallback={<RouteFallback />}>
                      <Routes>
                        {routes.map(({ key, path, element }) => (
                          <Route key={key} path={path} element={element} />
                        ))}
                        <Route
                          path="*"
                          element={<UnknownRouteFallback pluginsLoading={pluginsLoading} />}
                        />
                      </Routes>
                    </Suspense>
                  </ProfileKeyedRoutes>

                  {embeddedChat &&
                    !chatOverriddenByPlugin &&
                    (pluginsLoading ? (
                      isChatRoute ? (
                        <RouteFallback label="Loading chat…" />
                      ) : null
                    ) : chatHostMounted ? (
                      <div
                        data-chat-active={isChatRoute ? "true" : "false"}
                        className={cn(
                          "min-h-0 min-w-0",
                          isChatRoute ? "flex flex-1 flex-col" : "hidden",
                        )}
                        aria-hidden={!isChatRoute}
                      >
                        <Suspense
                          fallback={isChatRoute ? <RouteFallback label="Loading chat…" /> : null}
                        >
                          <ChatPage isActive={isChatRoute} />
                        </Suspense>
                      </div>
                    ) : isChatRoute ? (
                      <RouteFallback label="Loading chat…" />
                    ) : null)}
                </div>
                <PluginSlot name="post-main" />
              </div>
            </PageHeaderProvider>
          </div>
        </div>

        <PluginSlot name="overlay" />
      </div>
    </ProfileProvider>
  );
}

/**
 * Remounts the entire routed page tree when the global management profile
 * changes. Pages load their data on mount; without this, a page opened
 * under profile A would keep showing A's state while writes (via the
 * fetchJSON ?profile= injection) silently targeted the newly selected
 * profile B — the exact stale-target footgun the switcher exists to kill.
 * Keying by profile resets every page's local state so it refetches under
 * the new scope. The persistent ChatPage host below handles its own
 * remount (channel keyed on scopedProfile).
 */
function ProfileKeyedRoutes({ children }: { children: ReactNode }) {
  const { profile } = useProfileScope();
  return (
    <div key={profile || "__own__"} className="contents">
      {children}
    </div>
  );
}

function resolveNavLabel(item: NavItem, t: Translations): string {
  return item.labelKey
    ? ((t.app.nav as Record<string, string>)[item.labelKey] ?? item.label)
    : item.label;
}

export function CommandNavLink({ compact = false, item, onNavigate, t }: CommandNavLinkProps) {
  const { path, icon: Icon } = item;
  const label = resolveNavLabel(item, t);

  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          "group/command relative flex min-w-0 items-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground/70",
          compact
            ? "shrink-0 gap-2 rounded-lg px-3 py-2 text-xs font-medium"
            : "gap-3 rounded-xl px-3 py-2.5 text-sm",
          isActive
            ? "bg-midground/12 text-midground"
            : "text-text-secondary hover:bg-foreground/5 hover:text-foreground",
        )
      }
      end={path === "/sessions"}
      onClick={onNavigate}
      to={path}
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-lg border border-current/10",
              compact ? "h-7 w-7" : "h-8 w-8",
              isActive ? "bg-midground/10" : "bg-background-base/30",
            )}
          >
            <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </span>
          <span className="truncate">{label}</span>
          {!compact && (
            <span className="ml-auto font-mono-ui text-[0.62rem] text-text-tertiary opacity-0 transition-opacity group-hover/command:opacity-100 group-focus-visible/command:opacity-100">
              {path}
            </span>
          )}
          {isActive && (
            <span
              aria-hidden
              className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-midground"
            />
          )}
        </>
      )}
    </NavLink>
  );
}

function CommandSystemActions({ onNavigate, status }: CommandSystemActionsProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { activeAction, isBusy, isRunning, pendingAction, runAction } = useSystemActions();
  const canUpdatePanergos = status?.can_update_panergos === true;
  // Served by the shared multiplexer: a restart blips every bot on this device — say which.
  const sharedGateway = sharedGatewayProfiles(status);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [updateConfirmInfo, setUpdateConfirmInfo] = useState<UpdateCheckResponse | null>(null);
  const [updateConfirmChecking, setUpdateConfirmChecking] = useState(false);

  useEffect(() => {
    if (!updateConfirmOpen) {
      setUpdateConfirmInfo(null);
      return;
    }
    let cancelled = false;
    setUpdateConfirmChecking(true);
    api
      .checkPanergosUpdate(false)
      .then((info) => {
        if (!cancelled) setUpdateConfirmInfo(info);
      })
      .catch(() => {
        if (!cancelled) setUpdateConfirmInfo(null);
      })
      .finally(() => {
        if (!cancelled) setUpdateConfirmChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [updateConfirmOpen]);

  const updateConfirmDescription = useMemo(() => {
    if (updateConfirmInfo?.behind && updateConfirmInfo.behind > 0) {
      const cmd = updateConfirmInfo.update_command;
      const n = updateConfirmInfo.behind;
      return `This will run 'panergos update' (${cmd}) and pull ${n} new commit${n === 1 ? "" : "s"}. The gateway restarts when the update finishes; the current session keeps its prompt cache until then.`;
    }
    const cmd = updateConfirmInfo?.update_command ?? "panergos update";
    return (
      t.status.updatePanergosConfirmMessage ??
      `This will run 'panergos update' (${cmd}) and restart the gateway when it finishes.`
    );
  }, [t.status.updatePanergosConfirmMessage, updateConfirmInfo]);

  const items: SystemActionItem[] = [
    {
      action: "restart",
      icon: RotateCw,
      label: t.status.restartGateway,
      runningLabel: t.status.restartingGateway,
      spin: true,
    },
  ];
  if (canUpdatePanergos) {
    items.push({
      action: "update",
      icon: Download,
      label: t.status.updatePanergos,
      runningLabel: t.status.updatingPanergos,
      spin: false,
    });
  }

  const handleClick = (action: SystemAction) => {
    if (isBusy) return;
    if (action === "restart") {
      setRestartConfirmOpen(true);
      return;
    }
    if (action === "update") {
      setUpdateConfirmOpen(true);
      return;
    }
    void runAction(action);
    navigate("/sessions");
    onNavigate();
  };

  const confirmRestart = () => {
    setRestartConfirmOpen(false);
    void runAction("restart");
    navigate("/sessions");
    onNavigate();
  };

  const confirmUpdate = () => {
    setUpdateConfirmOpen(false);
    void runAction("update");
    navigate("/sessions");
    onNavigate();
  };

  const gateway = status ? gatewayLine(status, t) : null;

  return (
    <>
      <div className="flex flex-col gap-3 border-t border-current/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 text-xs text-text-secondary hover:bg-foreground/5 hover:text-foreground"
          onClick={onNavigate}
          to="/sessions"
        >
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              gateway?.tone === "text-success"
                ? "bg-success"
                : gateway?.tone === "text-warning"
                  ? "bg-warning"
                  : gateway?.tone === "text-destructive"
                    ? "bg-destructive"
                    : "bg-muted-foreground",
            )}
          />
          <span className="truncate">
            {t.app.gatewayStatusLabel} {gateway?.label ?? t.common.loading}
          </span>
          {status && (
            <span className="font-mono-ui tabular-nums text-text-tertiary">
              {t.app.sessionsActiveCount.replace("{count}", String(status.active_sessions))}
            </span>
          )}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {items.map((item) => (
            <SystemActionButton
              key={item.action}
              disabled={
                isBusy &&
                !(pendingAction === item.action || (activeAction === item.action && isRunning))
              }
              isPending={pendingAction === item.action}
              isRunning={activeAction === item.action && isRunning && pendingAction !== item.action}
              item={item}
              onClick={() => handleClick(item.action)}
            />
          ))}
        </div>
      </div>

      <ConfirmDialog
        cancelLabel={t.common.cancel}
        confirmLabel={sharedGateway ? "Restart all" : t.status.restartGateway}
        description={
          sharedGateway
            ? sharedGatewayRestartDescription(sharedGateway)
            : (t.status.restartGatewayConfirmMessage ??
              "This restarts the Panergos gateway process. Connected channels and active sessions will reconnect afterward.")
        }
        loading={pendingAction === "restart"}
        onCancel={() => setRestartConfirmOpen(false)}
        onConfirm={confirmRestart}
        open={restartConfirmOpen}
        title={
          sharedGateway
            ? "Restart the shared gateway?"
            : (t.status.restartGatewayConfirmTitle ?? `${t.status.restartGateway}?`)
        }
      />

      <ConfirmDialog
        cancelLabel={t.common.cancel}
        confirmLabel={t.status.updatePanergosConfirmNow ?? "Update now"}
        description={updateConfirmChecking ? t.common.loading : updateConfirmDescription}
        loading={pendingAction === "update" || updateConfirmChecking}
        onCancel={() => setUpdateConfirmOpen(false)}
        onConfirm={confirmUpdate}
        open={updateConfirmOpen}
        title={t.status.updatePanergosConfirmTitle ?? `${t.status.updatePanergos}?`}
      />
    </>
  );
}

function SystemActionButton({
  disabled,
  isPending,
  isRunning: isActionRunning,
  item,
  onClick,
}: SystemActionButtonProps) {
  const { icon: Icon, label, runningLabel, spin } = item;
  const busy = isPending || isActionRunning;
  const displayLabel = isActionRunning ? runningLabel : label;

  return (
    <button
      aria-busy={busy}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-current/15 px-3 py-2",
        "text-xs font-medium text-text-secondary transition-colors",
        "hover:border-midground/35 hover:bg-midground/8 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground",
        "disabled:cursor-not-allowed disabled:text-text-disabled",
        busy && "border-midground/30 text-midground",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {busy && spin ? (
        <Spinner className="shrink-0 text-[0.875rem]" />
      ) : (
        <Icon className={cn("h-3.5 w-3.5 shrink-0", busy && !spin && "animate-pulse")} />
      )}
      <span>{displayLabel}</span>
    </button>
  );
}

interface NavItem {
  icon: ComponentType<{ className?: string }>;
  label: string;
  labelKey?: string;
  path: string;
}

interface CommandNavLinkProps {
  compact?: boolean;
  item: NavItem;
  onNavigate?: () => void;
  t: Translations;
}

interface CommandSystemActionsProps {
  onNavigate: () => void;
  status: StatusResponse | null;
}

interface SystemActionButtonProps {
  disabled: boolean;
  isPending: boolean;
  isRunning: boolean;
  item: SystemActionItem;
  onClick: () => void;
}

interface SystemActionItem {
  action: SystemAction;
  icon: ComponentType<{ className?: string }>;
  label: string;
  runningLabel: string;
  spin: boolean;
}
