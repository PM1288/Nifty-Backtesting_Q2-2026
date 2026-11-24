import { useEffect, useState } from "react";
import { getSessionCsrfToken } from "../../lib/session";

const route =
  (import.meta.env.VITE_API_BASE_URL ?? "") + "/v1/paper/browser-alerts";
async function subscriptionAction(
  endpoint: string,
  action: "enable" | "disable" | "status" | "test",
) {
  const response = await fetch(route, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": getSessionCsrfToken() ?? "",
    },
    body: JSON.stringify({ endpoint, action }),
  });
  if (!response.ok) throw new Error("Registration unavailable");
  return (await response.json()).enabled === true;
}

export function BrowserPaperAlerts() {
  const supported =
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");
  useEffect(() => {
    if (!supported) return;
    let active = true;
    (async () => {
      const registration = await navigator.serviceWorker.getRegistration(
        import.meta.env.BASE_URL,
      );
      if (!registration?.active) throw new Error();
      const response = await fetch(route, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const { publicKey } = await response.json();
      const sub = await registration.pushManager.getSubscription();
      const current = sub
        ? await subscriptionAction(sub.endpoint, "status")
        : false;
      if (active) {
        setEnabled(current);
        setKey(publicKey);
      }
    })()
      .catch(() => {
        if (active)
          setMessage(
            "Device alerts are unavailable. Reopen Paper alerts to retry.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [supported]);
  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      if (!enabled && (await Notification.requestPermission()) !== "granted") {
        setMessage(
          "Enable notifications in device or browser settings to receive background alerts.",
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (enabled) {
        if (sub) {
          await subscriptionAction(sub.endpoint, "disable");
          await sub.unsubscribe();
        }
        setEnabled(false);
      } else {
        const bytes = Uint8Array.from(
          atob(key.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        );
        sub ??= await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        });
        setEnabled(await subscriptionAction(sub.endpoint, "enable"));
      }
    } catch {
      setMessage(
        "Could not update device alerts. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function testAlert() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) throw new Error();
      await subscriptionAction(sub.endpoint, "test");
      setMessage("Test queued. Look for an N50 notification on this device.");
    } catch {
      setMessage("Test unavailable. Wait a minute and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {supported ? (
        <button
          type="button"
          disabled={busy || !key}
          aria-pressed={enabled}
          onClick={() => void toggle()}
        >
          {enabled ? "Turn off device alerts" : "Enable device alerts"}
        </button>
      ) : (
        <small>
          On iPhone, open N50 from the Home Screen to enable device alerts.
        </small>
      )}
      {enabled && (
        <button type="button" disabled={busy} onClick={() => void testAlert()}>
          Send test alert
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
