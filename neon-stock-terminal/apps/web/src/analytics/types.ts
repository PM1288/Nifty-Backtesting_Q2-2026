export type Primitive = string | number | boolean | null | undefined;
export type AnalyticsValue = Primitive | Primitive[];
export type AnalyticsParams = Record<string, AnalyticsValue>;

export type AuthState = "guest" | "signed_in";

export type RouteMeta = {
  pageName: string;
  module: string;
  appArea: "overview" | "market" | "heatmaps" | "learning" | "system" | "backtesting";
  section?: string;
};

export type AnalyticsUserContext = {
  userId?: string | null;
  authState?: AuthState;
  userProperties?: Record<string, Primitive>;
};

export type AnalyticsErrorContext = AnalyticsParams & {
  type: string;
  severity?: "info" | "warning" | "error";
  message?: string;
};

export interface AnalyticsProvider {
  init(): void;
  pageView?(params: AnalyticsParams): void;
  track?(eventName: string, params: AnalyticsParams): void;
  identify?(context: AnalyticsUserContext): void;
  setContext?(context: AnalyticsParams): void;
}
