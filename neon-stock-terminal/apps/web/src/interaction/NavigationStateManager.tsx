import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { rememberScrollPosition, restoreScrollPosition } from "./navigationContext";

/** Keeps browser Back useful after a drill-down by restoring the originating viewport. */
export function NavigationStateManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== "POP") return undefined;
    const frame = window.requestAnimationFrame(() => restoreScrollPosition(location.key));
    return () => window.cancelAnimationFrame(frame);
  }, [location.key, navigationType]);

  useEffect(() => {
    const key = location.key;
    return () => rememberScrollPosition(key);
  }, [location.key]);

  return null;
}
