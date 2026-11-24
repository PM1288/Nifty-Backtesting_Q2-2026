import { useEffect, useRef, useState } from "react";

/** Keep the current route and form state until the user reloads fresh server data. */
export function ConnectionNotice() {
  const [status, setStatus] = useState<"current" | "offline" | "restored">(
    "current",
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const offline = () => setStatus("offline");
    const restored = () => setStatus(previous => previous === "current" ? previous : "restored");
    window.addEventListener("offline", offline);
    window.addEventListener("n50:service-unavailable", offline);
    window.addEventListener("n50:service-reachable", restored);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("n50:service-unavailable", offline);
      window.removeEventListener("n50:service-reachable", restored);
    };
  }, []);
  useEffect(() => {
    if (status !== "current" && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [status]);
  if (status === "current") return null;
  return <dialog ref={dialog} className="connection-notice" aria-labelledby="connection-title"
    onCancel={event => event.preventDefault()}>
    <h2 id="connection-title">{status === "restored" ? "Connection restored" : "Connection unavailable"}</h2>
    <p>{status === "restored" ? "Reload this workspace to retrieve current data." :
      "Live updates are paused. Check your connection before continuing."}</p>
    <button type="button" onClick={() => location.reload()}>{status === "restored" ? "Reload workspace" : "Retry connection"}</button>
  </dialog>;
}
