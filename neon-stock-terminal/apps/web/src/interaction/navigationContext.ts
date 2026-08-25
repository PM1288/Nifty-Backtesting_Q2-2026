export type NavigationContext = {
  asOf?: string;
  instrumentId?: string;
  symbol?: string;
  exchange?: string;
  strategy?: string;
  strategyVersion?: string;
  runId?: string;
  tradeId?: string;
  horizon?: "intraday" | "swing" | "5d" | "30d";
  source?: string;
  selectedEntityId?: string;
  scrollAnchor?: string;
  returnTo?: string;
};

const KEYS: Array<keyof NavigationContext> = ["asOf", "instrumentId", "symbol", "exchange", "strategy", "strategyVersion", "runId", "tradeId", "horizon", "source", "selectedEntityId", "scrollAnchor", "returnTo"];

export function readNavigationContext(search: string): NavigationContext {
  const params = new URLSearchParams(search);
  const context: NavigationContext = {};
  for (const key of KEYS) {
    const value = params.get(key);
    if (value) (context as Record<string, string>)[key] = value.slice(0, key === "returnTo" ? 1200 : 160);
  }
  return context;
}

export function contextualPath(path: string, context: NavigationContext, currentLocation?: string) {
  const url = new URL(path, "https://n50.local");
  for (const key of KEYS) {
    const value = context[key];
    if (value) url.searchParams.set(key, value);
  }
  if (currentLocation && !context.returnTo) url.searchParams.set("returnTo", currentLocation.slice(0, 1200));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value.slice(0, 1200);
}

export function rememberScrollPosition(locationKey: string) {
  try { sessionStorage.setItem(`n50:scroll:${locationKey}`, String(Math.max(0, window.scrollY))); } catch { /* storage is optional */ }
}

export function restoreScrollPosition(locationKey: string) {
  try {
    const value = Number(sessionStorage.getItem(`n50:scroll:${locationKey}`));
    if (Number.isFinite(value)) window.requestAnimationFrame(() => window.scrollTo({ top: value, behavior: "auto" }));
  } catch { /* storage is optional */ }
}
