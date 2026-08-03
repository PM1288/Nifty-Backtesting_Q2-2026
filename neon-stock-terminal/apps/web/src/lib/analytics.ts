import { analytics } from "../analytics";
import type { AnalyticsErrorContext, AnalyticsParams } from "../analytics/types";

export async function trackEvent(name: string, params?: AnalyticsParams) {
  analytics.track(name, params);
}

export async function trackAnalyticsEvent(name: string, params?: AnalyticsParams) {
  analytics.track(name, params);
}

export async function setAnalyticsUser(uid: string, email?: string | null) {
  const domain = typeof email === "string" && email.includes("@") ? email.split("@")[1] : undefined;
  analytics.identify({
    userId: uid,
    authState: "signed_in",
    userProperties: {
      ...(domain ? { email_domain: domain } : {})
    }
  });
}

export async function clearAnalyticsUser() {
  analytics.identify({
    userId: null,
    authState: "guest"
  });
}

export async function trackAnalyticsError(context: AnalyticsErrorContext) {
  analytics.trackError(context);
}

export async function setAnalyticsContext(context: AnalyticsParams) {
  analytics.setContext(context);
}

export async function trackViewAnalysis(params: AnalyticsParams) {
  analytics.track("view_analysis", params);
}

export async function trackRunSimulation(params: AnalyticsParams) {
  analytics.track("run_simulation", params);
}

export async function trackSimulationResultView(params: AnalyticsParams) {
  analytics.track("simulation_result_view", params);
}

export async function trackGenerateLead(params: AnalyticsParams) {
  analytics.track("generate_lead", params);
}

export async function trackSignUp(params: AnalyticsParams) {
  analytics.track("sign_up", params);
}

export async function trackDownloadReport(params: AnalyticsParams) {
  analytics.track("download_report", params);
}

export async function trackCtaClick(params: AnalyticsParams) {
  analytics.track("cta_click", params);
}
