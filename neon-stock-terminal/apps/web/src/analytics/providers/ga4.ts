import type { AnalyticsParams, AnalyticsProvider, AnalyticsUserContext } from "../types";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function ensureGtag(measurementId: string) {
  if (typeof window === "undefined") return;
  if (window.gtag) return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (function gtag(this: Window, ..._args: unknown[]) {
    // Match Google's canonical queue shape so gtag.js can replay queued commands reliably.
    window.dataLayer?.push(arguments as unknown as never);
  }) as NonNullable<Window["gtag"]>;

  if (document.querySelector(`script[data-ga4-id="${measurementId}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.dataset.ga4Id = measurementId;
  document.head.appendChild(script);
}

export class Ga4Provider implements AnalyticsProvider {
  private initialized = false;

  constructor(private readonly measurementId?: string) {}

  init() {
    if (!this.measurementId || this.initialized || typeof window === "undefined") return;
    ensureGtag(this.measurementId);
    window.gtag?.("js", new Date());
    window.gtag?.("config", this.measurementId, { send_page_view: false });
    this.initialized = true;
  }

  pageView(params: AnalyticsParams) {
    if (!this.measurementId) return;
    window.gtag?.("event", "page_view", params);
  }

  track(eventName: string, params: AnalyticsParams) {
    if (!this.measurementId) return;
    window.gtag?.("event", eventName, params);
  }

  identify(context: AnalyticsUserContext) {
    if (!this.measurementId) return;
    window.gtag?.("config", this.measurementId, {
      user_id: context.userId ?? null,
      send_page_view: false
    });
    if (context.userProperties && Object.keys(context.userProperties).length) {
      window.gtag?.("set", "user_properties", context.userProperties);
    }
  }
}
