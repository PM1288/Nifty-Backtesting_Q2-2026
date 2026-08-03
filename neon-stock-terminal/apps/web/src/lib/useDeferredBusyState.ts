import { useEffect, useRef, useState } from "react";

type DeferredBusyStateOptions = {
  delayMs?: number;
  minVisibleMs?: number;
};

export function useDeferredBusyState(
  busy: boolean,
  { delayMs = 160, minVisibleMs = 220 }: DeferredBusyStateOptions = {}
) {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      const timer = window.setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delayMs);
      return () => window.clearTimeout(timer);
    }

    if (!visible) return;
    const shownAt = shownAtRef.current ?? Date.now();
    const remaining = Math.max(0, minVisibleMs - (Date.now() - shownAt));
    const timer = window.setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [busy, delayMs, minVisibleMs, visible]);

  return visible;
}
