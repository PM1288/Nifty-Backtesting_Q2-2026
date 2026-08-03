import { resolveRouteMeta } from "./routeMap";
import { sanitizeAnalyticsParams, safePagePath } from "./sanitize";
import { ClarityProvider } from "./providers/clarity";
import { Ga4Provider } from "./providers/ga4";
import { MatomoProvider } from "./providers/matomo";
import { LoggerProvider } from "./providers/logger";
import type { AnalyticsErrorContext, AnalyticsParams, AnalyticsUserContext } from "./types";

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const CLARITY_PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID;
const MATOMO_BASE_URL = import.meta.env.VITE_MATOMO_BASE_URL;
const MATOMO_SITE_ID = import.meta.env.VITE_MATOMO_SITE_ID;

class AnalyticsFacade {
  private readonly ga4 = new Ga4Provider(GA_MEASUREMENT_ID);
  private readonly clarity = new ClarityProvider(CLARITY_PROJECT_ID);
  private readonly matomo = new MatomoProvider(MATOMO_BASE_URL, MATOMO_SITE_ID);
  private readonly logger = new LoggerProvider();
  private initialized = false;
  private sharedContext: AnalyticsParams = {};
  private globalHandlersBound = false;

  init() {
    if (this.initialized) return;
    this.ga4.init();
    this.clarity.init();
    this.matomo.init();
    this.bindGlobalErrorHandlers();
    this.initialized = true;
  }

  private bindGlobalErrorHandlers() {
    if (this.globalHandlersBound || typeof window === "undefined") return;
    const onError = (event: ErrorEvent) => {
      this.trackError({
        type: "client_error",
        severity: "error",
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "Unknown rejection");
      this.trackError({
        type: "unhandled_rejection",
        severity: "error",
        message: reason
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    this.globalHandlersBound = true;
  }

  setContext(context: AnalyticsParams) {
    const cleaned = sanitizeAnalyticsParams(context);
    this.sharedContext = { ...this.sharedContext, ...cleaned };
    this.clarity.setContext?.(this.sharedContext);
    this.matomo.setContext?.(this.sharedContext);
  }

  identify(context: AnalyticsUserContext) {
    this.init();
    this.ga4.identify?.(context);
    this.clarity.identify?.(context);
    this.matomo.identify?.(context);
  }

  pageView(pathname: string, search = "", context: AnalyticsParams = {}) {
    this.init();
    const routeMeta = resolveRouteMeta(pathname);
    const pagePath = safePagePath(pathname, search);
    const payload = sanitizeAnalyticsParams({
      ...this.sharedContext,
      ...context,
      page_name: routeMeta.pageName,
      module: routeMeta.module,
      app_area: routeMeta.appArea,
      section: routeMeta.section,
      page_path: pagePath,
      page_title: typeof document !== "undefined" ? document.title : routeMeta.pageName,
      page_location: typeof window !== "undefined" ? window.location.href : pagePath
    });
    this.ga4.pageView?.(payload);
    this.matomo.pageView?.(payload);
    this.setContext(payload);
  }

  track(eventName: string, params: AnalyticsParams = {}) {
    this.init();
    const payload = sanitizeAnalyticsParams({
      ...this.sharedContext,
      ...params
    });
    this.ga4.track?.(eventName, payload);
    this.clarity.track?.(eventName);
    this.clarity.setContext?.(payload);
    this.matomo.track?.(eventName, payload);
  }

  trackError(context: AnalyticsErrorContext) {
    this.logger.capture({
      ...this.sharedContext,
      ...context
    });
  }
}

export const analytics = new AnalyticsFacade();
