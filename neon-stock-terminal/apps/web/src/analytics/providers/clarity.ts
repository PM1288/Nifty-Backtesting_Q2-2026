import type { AnalyticsParams, AnalyticsProvider, AnalyticsUserContext } from "../types";

declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
  }
}

const CLARITY_TAG_KEYS = [
  "page_name",
  "module",
  "section",
  "mode",
  "auth_state",
  "app_area",
  "market_regime",
  "sector",
  "setup_family",
  "watchlist_name",
  "indicator_slug",
  "scenario_id",
  "capital_mode",
  "chart_id"
] as const;

function ensureClarity(projectId: string) {
  if (typeof window === "undefined") return;
  if (window.clarity) return;

  const clarityQueue: NonNullable<Window["clarity"]> = ((...args: unknown[]) => {
    clarityQueue.q?.push(args);
  }) as NonNullable<Window["clarity"]>;
  clarityQueue.q = [];
  window.clarity = clarityQueue;

  if (document.querySelector(`script[data-clarity-id="${projectId}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${projectId}`;
  script.dataset.clarityId = projectId;
  document.head.appendChild(script);
}

export class ClarityProvider implements AnalyticsProvider {
  private initialized = false;

  constructor(private readonly projectId?: string) {}

  init() {
    if (!this.projectId || this.initialized || typeof window === "undefined") return;
    ensureClarity(this.projectId);
    this.initialized = true;
  }

  track(eventName: string) {
    if (!this.projectId) return;
    window.clarity?.("event", eventName);
  }

  setContext(context: AnalyticsParams) {
    if (!this.projectId) return;
    for (const key of CLARITY_TAG_KEYS) {
      const value = context[key];
      if (value == null) continue;
      window.clarity?.("set", key, String(value));
    }
  }

  identify(context: AnalyticsUserContext) {
    if (!this.projectId || !context.userId) return;
    window.clarity?.("identify", context.userId);
    if (context.authState) {
      window.clarity?.("set", "auth_state", context.authState);
    }
  }
}
