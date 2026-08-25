const RELOAD_TARGET_KEY = "n50.ui-version.reload-target";
const VERSION_CHANNEL = "n50-ui-version";
const DEFAULT_POLL_MS = 30_000;
const RELOAD_RETRY_MS = 120_000;

export type AppVersionPayload = {
  version?: unknown;
};

export function currentClientBuildVersion(scripts: Iterable<{ src: string }>, pageUrl = window.location.href): string | null {
  for (const script of scripts) {
    try {
      const pathname = new URL(script.src, pageUrl).pathname;
      const file = pathname.split("/").pop() ?? "";
      if (/^index-[^/]+\.js$/i.test(file)) return file;
    } catch {
      // Ignore malformed third-party script URLs and keep looking for the Vite entry.
    }
  }
  return null;
}

export function remoteClientBuildVersion(payload: AppVersionPayload): string | null {
  return typeof payload.version === "string" && /^index-[^/]+\.js$/i.test(payload.version)
    ? payload.version
    : null;
}

export function shouldReloadForVersion(current: string | null, remote: string | null, reloadTarget: string | null, nowMs = Date.now()): boolean {
  if (!current || !remote || current === remote) return false;
  const [attemptedVersion, attemptedAt] = String(reloadTarget ?? "").split("@");
  const recentAttempt = attemptedVersion === remote
    && Number.isFinite(Number(attemptedAt))
    && nowMs - Number(attemptedAt) < RELOAD_RETRY_MS;
  return !recentAttempt;
}

function showUpdatingNotice() {
  if (document.getElementById("n50-ui-version-update")) return;
  const notice = document.createElement("div");
  notice.id = "n50-ui-version-update";
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "assertive");
  notice.textContent = "A new NIFTY 50 Trader version is available. Updating now…";
  Object.assign(notice.style, {
    position: "fixed",
    inset: "16px 16px auto auto",
    zIndex: "2147483647",
    maxWidth: "360px",
    padding: "12px 16px",
    border: "1px solid #9bbcf0",
    borderRadius: "10px",
    color: "#102f5d",
    background: "#f2f7ff",
    boxShadow: "0 12px 32px rgba(16,47,93,.18)",
    font: "600 13px/1.4 Inter, system-ui, sans-serif",
  });
  document.body.appendChild(notice);
}

export function startAppVersionGuard(options: { pollMs?: number } = {}): () => void {
  if (import.meta.env.DEV || typeof window === "undefined" || typeof document === "undefined") return () => undefined;
  const current = currentClientBuildVersion(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  if (!current) return () => undefined;

  const endpoint = new URL("app-version.json", `${window.location.origin}${import.meta.env.BASE_URL}`).toString();
  const controller = new AbortController();
  let checking = false;
  let reloadQueued = false;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(VERSION_CHANNEL) : null;

  const reloadInto = (version: string) => {
    if (reloadQueued || !shouldReloadForVersion(current, version, sessionStorage.getItem(RELOAD_TARGET_KEY))) return;
    reloadQueued = true;
    sessionStorage.setItem(RELOAD_TARGET_KEY, `${version}@${Date.now()}`);
    showUpdatingNotice();
    channel?.postMessage({ version });
    window.setTimeout(() => window.location.reload(), 350);
  };

  const check = async () => {
    if (checking || reloadQueued || document.visibilityState === "hidden") return;
    checking = true;
    try {
      const response = await fetch(`${endpoint}?t=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      if (!response.ok) return;
      const remote = remoteClientBuildVersion(await response.json() as AppVersionPayload);
      if (remote === current) sessionStorage.removeItem(RELOAD_TARGET_KEY);
      else if (remote) reloadInto(remote);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // A version check must never interrupt the trading UI during a network outage.
    } finally {
      checking = false;
    }
  };

  const onVisible = () => { if (document.visibilityState === "visible") void check(); };
  const onFocus = () => { void check(); };
  const onChannel = (event: MessageEvent<{ version?: unknown }>) => {
    const remote = remoteClientBuildVersion(event.data ?? {});
    if (remote) reloadInto(remote);
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onFocus);
  channel?.addEventListener("message", onChannel);
  const timer = window.setInterval(() => void check(), Math.max(10_000, options.pollMs ?? DEFAULT_POLL_MS));
  void check();

  return () => {
    controller.abort();
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onFocus);
    channel?.removeEventListener("message", onChannel);
    channel?.close();
  };
}
