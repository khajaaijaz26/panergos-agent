import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { PageHeaderContext } from "./page-header-context";
import { resolvePageTitle } from "@/lib/resolve-page-title";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export function PageHeaderProvider({
  children,
  pluginTabs,
}: {
  children: ReactNode;
  pluginTabs: { path: string; label: string }[];
}) {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [afterTitle, setAfterTitle] = useState<ReactNode>(null);
  const [end, setEnd] = useState<ReactNode>(null);

  // Clear any per-page title / toolbar slots when the path changes. Child routes
  // re-fill these on mount via usePageHeader.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    setTitleOverride(null);
    setAfterTitle(null);
    setEnd(null);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const defaultTitle = useMemo(
    () => resolvePageTitle(pathname, t, pluginTabs),
    [pathname, t, pluginTabs],
  );
  const displayTitle = titleOverride ?? defaultTitle;

  const isChatRoute = pathname === "/chat" || pathname === "/chat/";
  /** Env jump-nav is wide — stack below title on small screens so KEYS stays readable. */
  const isEnvRoute = pathname === "/env" || pathname.startsWith("/env/");

  const value = useMemo(
    () => ({
      setAfterTitle,
      setEnd,
      setTitle: setTitleOverride,
    }),
    [],
  );

  return (
    <PageHeaderContext.Provider value={value}>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={cn(
            "z-1 w-full shrink-0 px-3 pt-2 sm:px-6 sm:pt-3",
            "min-h-0 overflow-x-hidden overflow-y-visible",
          )}
          role="banner"
        >
          <div
            className={cn(
              "panergos-page-beacon flex w-full min-w-0 flex-1 gap-3 pb-2 sm:min-h-11 sm:gap-3 sm:pb-3",
              isChatRoute
                ? "flex-row items-center"
                : "flex-col justify-center sm:flex-row sm:items-center",
            )}
          >
            <span
              aria-hidden
              className="panergos-page-signal mt-1 h-7 w-1 shrink-0 self-start sm:mt-0 sm:self-center"
            />
            <div
              className={cn(
                "flex min-w-0 flex-1 gap-2 sm:gap-3",
                afterTitle && isEnvRoute
                  ? "flex-col items-start sm:flex-row sm:items-center"
                  : afterTitle
                    ? "flex-row flex-wrap items-center"
                    : "flex-row items-center",
              )}
            >
              <h1
                className={cn(
                  "font-expanded min-w-0 text-sm font-bold uppercase tracking-[0.16em] text-midground",
                  afterTitle && isEnvRoute
                    ? "max-w-full sm:min-w-0 sm:shrink sm:truncate"
                    : afterTitle
                      ? "shrink truncate"
                      : "truncate",
                )}
              >
                {displayTitle}
              </h1>
              {afterTitle ? (
                <div
                  className={cn(
                    "min-w-0 scrollbar-none",
                    isEnvRoute
                      ? "w-full overflow-x-auto sm:flex-1 sm:overflow-x-auto"
                      : "shrink-0 overflow-visible",
                  )}
                >
                  {afterTitle}
                </div>
              ) : null}
            </div>

            {end ? (
              <div
                className={cn(
                  "flex min-w-0 sm:max-w-md sm:flex-1",
                  isChatRoute
                    ? "w-auto shrink-0 justify-end"
                    : "w-full justify-start sm:justify-end",
                )}
              >
                {end}
              </div>
            ) : null}
          </div>
        </header>

        <main
          className={cn(
            "min-h-0 w-full min-w-0 flex-1 flex flex-col",
            // Bottom inset for scrolled pages lives on the route outlet wrapper in
            // `App.tsx` (`w-full min-w-0`) so it pads scrollable content, not flex chrome.
            isChatRoute
              ? "overflow-hidden"
              : "overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]",
          )}
        >
          {children}
        </main>
      </div>
    </PageHeaderContext.Provider>
  );
}
