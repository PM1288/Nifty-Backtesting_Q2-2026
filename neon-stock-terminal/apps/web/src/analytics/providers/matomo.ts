import type { AnalyticsParams, AnalyticsProvider, AnalyticsUserContext } from "../types";

declare global {
  interface Window {
    _paq?: unknown[][];
  }
}

function normalizeBaseUrl(baseUrl?: string) {
  if (!baseUrl) return undefined;
  if (/^https?:\/\//i.test(baseUrl)) {
    return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }
  const normalized = baseUrl.startsWith("/") ? baseUrl : `/${baseUrl}`;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function ensureMatomo(baseUrl: string) {
  if (typeof window === "undefined") return;
  window._paq = window._paq ?? [];

  if (document.querySelector(`script[data-matomo-base="${baseUrl}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `${baseUrl}matomo.js`;
  script.dataset.matomoBase = baseUrl;
  document.head.appendChild(script);
}

function pushPaq(command: unknown[]) {
  if (typeof window === "undefined") return;
  window._paq = window._paq ?? [];
  window._paq.push(command);
}

const KNOWN_APP_HOSTS = ["m.nifty50today.co.in", "stage.nifty50today.co.in", "localhost"];
const VISIT_DIMENSION_IDS = {
  sourceHost: 1,
  locale: 2,
  audienceMode: 3
} as const;
const ACTION_DIMENSION_IDS = {
  pageFamily: 4,
  sectionName: 5
} as const;

function getCurrentUiLanguage() {
  if (typeof document === "undefined") return undefined;
  return document.documentElement.dataset.uiLanguage?.trim() || document.documentElement.lang?.trim() || undefined;
}

function getCurrentDigitSystem() {
  if (typeof document === "undefined") return undefined;
  return document.documentElement.dataset.digitSystem?.trim() || undefined;
}

function buildLocaleToken(language?: unknown, digitSystem?: unknown) {
  const normalizedLanguage = asDimensionValue(language)?.toLowerCase();
  const normalizedDigits = asDimensionValue(digitSystem)?.toLowerCase();
  if (normalizedLanguage && normalizedDigits) return `${normalizedLanguage}-${normalizedDigits}`;
  return normalizedLanguage ?? normalizedDigits ?? undefined;
}

function asDimensionValue(value: unknown) {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const text = value
      .filter((item) => item != null)
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join(", ");
    return text ? text.slice(0, 240) : undefined;
  }
  const text = String(value).trim();
  return text ? text.slice(0, 240) : undefined;
}

function buildVisitDimensions(context: AnalyticsParams) {
  const sourceHost =
    (typeof context.page_location === "string" && context.page_location
      ? (() => {
          try {
            return new URL(context.page_location).host;
          } catch {
            return undefined;
          }
        })()
      : undefined) || (typeof window !== "undefined" ? window.location.host : undefined);

  return [
    [VISIT_DIMENSION_IDS.sourceHost, asDimensionValue(sourceHost)],
    [
      VISIT_DIMENSION_IDS.locale,
      buildLocaleToken(context.ui_language ?? getCurrentUiLanguage(), context.digit_system ?? getCurrentDigitSystem())
    ],
    [VISIT_DIMENSION_IDS.audienceMode, asDimensionValue(context.mode)]
  ] as const;
}

function deriveIndicatorSlug(context: AnalyticsParams) {
  const contentId = typeof context.content_id === "string" ? context.content_id : undefined;
  const pagePath = typeof context.page_path === "string" ? context.page_path : undefined;
  const candidate = contentId || pagePath;
  if (!candidate) return undefined;
  const match = candidate.match(/\/analytics\/indicators\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function getSectionToken(context: AnalyticsParams) {
  return (
    asDimensionValue(context.section_id) ??
    asDimensionValue(context.page_section) ??
    asDimensionValue(context.source_section) ??
    asDimensionValue(context.section)
  );
}

function buildActionDimensions(context: AnalyticsParams) {
  const pageFamily =
    asDimensionValue(context.module) ??
    asDimensionValue(context.app_area) ??
    asDimensionValue(context.page_name);
  const sectionName = getSectionToken(context);

  return [
    [ACTION_DIMENSION_IDS.pageFamily, pageFamily],
    [ACTION_DIMENSION_IDS.sectionName, sectionName ?? asDimensionValue(deriveIndicatorSlug(context))]
  ] as const;
}

function pickNumericValue(params: AnalyticsParams) {
  for (const value of Object.values(params)) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function buildEventName(params: AnalyticsParams) {
  const parts = [
    params.page_name,
    getSectionToken(params),
    params.analysis_type,
    params.simulation_type,
    params.strategy_name,
    params.report_type,
    params.lead_source,
    params.cta_name,
    params.instrument,
    params.timeframe,
    params.page_path
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const uniqueParts = [...new Set(parts)];
  if (!uniqueParts.length) return undefined;
  return uniqueParts.join(" | ").slice(0, 220);
}

export class MatomoProvider implements AnalyticsProvider {
  private initialized = false;
  private readonly baseUrl?: string;
  private readonly siteId?: string;
  private sharedContext: AnalyticsParams = {};

  constructor(baseUrl?: string, siteId?: string | number) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    const normalizedSiteId = siteId == null ? "" : String(siteId).trim();
    this.siteId = normalizedSiteId || undefined;
  }

  init() {
    if (!this.baseUrl || !this.siteId || this.initialized || typeof window === "undefined") return;
    ensureMatomo(this.baseUrl);
    pushPaq(["setTrackerUrl", `${this.baseUrl}matomo.php`]);
    pushPaq(["setSiteId", this.siteId]);
    pushPaq([
      "setDomains",
      [...new Set([window.location.hostname, ...KNOWN_APP_HOSTS])]
    ]);
    pushPaq(["enableLinkTracking"]);
    pushPaq(["enableHeartBeatTimer", 15]);
    this.initialized = true;
  }

  private applyVisitDimensions(context: AnalyticsParams) {
    for (const [dimensionId, rawValue] of buildVisitDimensions(context)) {
      if (rawValue) {
        pushPaq(["setCustomDimension", dimensionId, rawValue]);
      }
    }
  }

  private applyActionDimensions(context: AnalyticsParams) {
    for (const [dimensionId, rawValue] of buildActionDimensions(context)) {
      if (rawValue) {
        pushPaq(["setCustomDimension", dimensionId, rawValue]);
      } else {
        pushPaq(["deleteCustomDimension", dimensionId]);
      }
    }
  }

  pageView(params: AnalyticsParams) {
    if (!this.baseUrl || !this.siteId) return;
    const payload = { ...this.sharedContext, ...params };
    const pageTitle = typeof payload.page_title === "string" ? payload.page_title : undefined;
    const pagePath = typeof payload.page_path === "string" ? payload.page_path : undefined;
    const pageLocation =
      typeof payload.page_location === "string"
        ? payload.page_location
        : pagePath
          ? `${window.location.origin}${pagePath}`
          : undefined;

    this.applyVisitDimensions(payload);
    this.applyActionDimensions(payload);
    if (pageLocation) {
      pushPaq(["setCustomUrl", pageLocation]);
    }
    if (pageTitle) {
      pushPaq(["setDocumentTitle", pageTitle]);
    }
    pushPaq(["trackPageView"]);
  }

  track(eventName: string, params: AnalyticsParams) {
    if (!this.baseUrl || !this.siteId) return;
    const payload = { ...this.sharedContext, ...params };
    const category =
      typeof payload.module === "string"
        ? payload.module
        : typeof payload.app_area === "string"
          ? payload.app_area
          : "app";
    const action = eventName.slice(0, 120);
    const name = buildEventName(payload);
    const value = pickNumericValue(payload);
    this.applyVisitDimensions(payload);
    this.applyActionDimensions(payload);
    if (name && value !== undefined) {
      pushPaq(["trackEvent", category, action, name, value]);
      return;
    }
    if (name) {
      pushPaq(["trackEvent", category, action, name]);
      return;
    }
    pushPaq(["trackEvent", category, action]);
  }

  identify(context: AnalyticsUserContext) {
    if (!this.baseUrl || !this.siteId || !context.userId) return;
    pushPaq(["setUserId", context.userId]);
  }

  setContext(_context: AnalyticsParams) {
    this.sharedContext = { ...this.sharedContext, ..._context };
    if (!this.baseUrl || !this.siteId) return;
    this.applyVisitDimensions(this.sharedContext);
    this.applyActionDimensions(this.sharedContext);
  }
}
