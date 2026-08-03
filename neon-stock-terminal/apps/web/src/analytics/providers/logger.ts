import { sanitizeAnalyticsParams } from "../sanitize";
import type { AnalyticsErrorContext } from "../types";

type LoggerPayload = AnalyticsErrorContext & {
  timestamp: string;
};

function postLog(payload: LoggerPayload) {
  const endpoint = import.meta.env.VITE_ANALYTICS_LOG_ENDPOINT;
  if (!endpoint || typeof window === "undefined") return;

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  }).catch(() => {
    // Logging must never break the app shell.
  });
}

export class LoggerProvider {
  capture(context: AnalyticsErrorContext) {
    const payload = {
      ...sanitizeAnalyticsParams(context),
      type: String(context.type),
      severity: context.severity ?? "error",
      timestamp: new Date().toISOString()
    } as LoggerPayload;

    postLog(payload);

    const shouldUseErrorConsole =
      payload.severity === "error" && (payload.type === "client_error" || payload.type === "unhandled_rejection");
    const consoleMethod = shouldUseErrorConsole
      ? "error"
      : payload.severity === "error" || payload.severity === "warning"
        ? "warn"
        : "info";
    console[consoleMethod]("[analytics]", payload);
  }
}
