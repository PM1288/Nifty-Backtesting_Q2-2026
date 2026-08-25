import { useEffect, useState } from "react";

export type FontMode = "standard" | "high-legibility";

export const FONT_MODE_STORAGE_KEY = "n50:accessibility:font-mode";
export const FONT_MODE_CHANGE_EVENT = "n50:font-mode-change";

export function readFontMode(): FontMode {
  if (typeof window === "undefined") return "standard";
  return window.localStorage.getItem(FONT_MODE_STORAGE_KEY) === "high-legibility"
    ? "high-legibility"
    : "standard";
}

export function applyFontMode(mode: FontMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.fontMode = mode;
  window.localStorage.setItem(FONT_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(FONT_MODE_CHANGE_EVENT, { detail: mode }));
}

export function useFontMode(): [FontMode, (mode: FontMode) => void] {
  const [mode, setMode] = useState<FontMode>(readFontMode);

  useEffect(() => applyFontMode(mode), [mode]);
  useEffect(() => {
    const onModeChange = (event: Event) => {
      const next = (event as CustomEvent<FontMode>).detail;
      if (next === "standard" || next === "high-legibility") setMode(next);
    };
    window.addEventListener(FONT_MODE_CHANGE_EVENT, onModeChange);
    return () => window.removeEventListener(FONT_MODE_CHANGE_EVENT, onModeChange);
  }, []);

  return [mode, setMode];
}
