import { useEffect, useRef } from "react";

/** Keep keyboard interaction inside an open modal and restore the trigger on close. */
export function useModalFocus(open: boolean, onEscape?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const escapeRef = useRef(onEscape); escapeRef.current = onEscape;
  useEffect(() => {
    const root = ref.current;
    if (!open || !root) return;
    const previous = document.activeElement;
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
    (focusable()[0] ?? root).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && escapeRef.current) { event.preventDefault(); escapeRef.current(); }
      if (event.key !== "Tab") return;
      const items = focusable(); const first = items[0]; const last = items.at(-1);
      if (!first || !last) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    root.addEventListener("keydown", keydown);
    return () => { root.removeEventListener("keydown", keydown); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [open]);
  return ref;
}
