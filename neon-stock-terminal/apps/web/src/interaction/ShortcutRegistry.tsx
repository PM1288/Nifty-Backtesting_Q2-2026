import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import styles from "./ShortcutRegistry.module.css";

export type ShortcutScope = "global" | "workspace" | "table" | "chart" | "market-board" | "paper-trading" | "backtest";

export type ShortcutDefinition = {
  id: string;
  keys: string[];
  scope: ShortcutScope;
  label: string;
  description: string;
  opensConfirmation?: boolean;
};

const DEFINITIONS: readonly ShortcutDefinition[] = [
  { id: "commands", keys: ["Ctrl/Cmd", "K"], scope: "global", label: "Search and commands", description: "Find dashboards, stocks, strategies, trades, runs and help." },
  { id: "page-search", keys: ["/"], scope: "global", label: "Focus page search", description: "Focus the current page's search or filter control." },
  { id: "go-today", keys: ["G", "T"], scope: "global", label: "Go to Today", description: "Open the live market canvas." },
  { id: "go-markets", keys: ["G", "M"], scope: "global", label: "Go to Markets", description: "Open Market Story." },
  { id: "go-stocks", keys: ["G", "S"], scope: "global", label: "Go to Stocks", description: "Open Stock 360." },
  { id: "go-oiis", keys: ["G", "O"], scope: "global", label: "Go to OIIS Lab", description: "Open live selection." },
  { id: "go-paper", keys: ["G", "P"], scope: "global", label: "Go to Paper Trading", description: "Open the PAPER portfolio." },
  { id: "go-derivatives", keys: ["G", "D"], scope: "global", label: "Go to Derivatives", description: "Open options intelligence." },
  { id: "go-data", keys: ["G", "A"], scope: "global", label: "Go to Data & Operations", description: "Open the trust workspace." },
  { id: "guide", keys: ["Shift", "?"], scope: "global", label: "Shortcut guide", description: "Open this guide." },
  { id: "pause-paint", keys: ["Alt", "P"], scope: "global", label: "Pause visual painting", description: "Pause non-critical visual motion without stopping data processing." },
  { id: "add-paper", keys: ["A"], scope: "paper-trading", label: "Add paper trade", description: "Open the PAPER-only preview form; never submits directly.", opensConfirmation: true },
  { id: "run-backtest", keys: ["Ctrl/Cmd", "Enter"], scope: "backtest", label: "Review backtest run", description: "Open the run confirmation; never submits directly.", opensConfirmation: true },
] as const;

type ShortcutContextValue = { enabled: boolean; setEnabled: (enabled: boolean) => void; openGuide: () => void; definitions: readonly ShortcutDefinition[] };
const ShortcutContext = createContext<ShortcutContextValue | null>(null);

function editable(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input,textarea,select,[contenteditable='true'],[role='textbox']"));
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [guideOpen, setGuideOpen] = useState(false);
  const [enabled, setEnabledState] = useState(() => localStorage.getItem("n50:shortcuts:enabled") !== "false");
  const [paintPaused, setPaintPaused] = useState(false);
  const chord = useRef<{ key: string; at: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const setEnabled = (value: boolean) => {
    setEnabledState(value);
    localStorage.setItem("n50:shortcuts:enabled", String(value));
  };

  useEffect(() => {
    document.documentElement.dataset.paintPaused = paintPaused ? "true" : "false";
    return () => { delete document.documentElement.dataset.paintPaused; };
  }, [paintPaused]);

  useEffect(() => {
    const routes: Record<string, string> = { t: "/", m: "/analytics", s: "/analytics/stock/RELIANCE", o: "/strategy/oiis-live", p: "/paper-trading", d: "/options/intelligence", a: "/analytics/system/quality" };
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        window.dispatchEvent(new Event("n50:open-command-palette"));
        return;
      }
      if (event.key === "Escape" && guideOpen) { event.preventDefault(); setGuideOpen(false); return; }
      if (event.key === "Escape") { window.dispatchEvent(new Event("n50:close-active-surface")); return; }
      if (!enabled || editable(event.target)) return;
      if (event.shiftKey && event.key === "?") { event.preventDefault(); setGuideOpen(true); return; }
      if (event.altKey && key === "p") { event.preventDefault(); setPaintPaused((value) => !value); return; }
      if (location.pathname.startsWith("/paper-trading") && key === "a" && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); window.dispatchEvent(new Event("n50:paper-add")); return; }
      if (location.pathname.startsWith("/backtesting") && key === "enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); window.dispatchEvent(new Event("n50:backtest-review")); return; }
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        window.dispatchEvent(new Event("n50:focus-page-search"));
        return;
      }
      const now = Date.now();
      if (key === "g" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        chord.current = { key: "g", at: now };
        return;
      }
      if (chord.current?.key === "g" && now - chord.current.at < 1_200 && routes[key]) {
        event.preventDefault();
        chord.current = null;
        navigate(routes[key]);
      } else if (key !== "shift" && key !== "control" && key !== "meta" && key !== "alt") chord.current = null;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, guideOpen, location.pathname, navigate]);

  useEffect(() => { setGuideOpen(false); chord.current = null; }, [location.pathname]);
  useEffect(() => { if (guideOpen) window.requestAnimationFrame(() => closeRef.current?.focus()); }, [guideOpen]);

  const value = useMemo<ShortcutContextValue>(() => ({ enabled, setEnabled, openGuide: () => setGuideOpen(true), definitions: DEFINITIONS }), [enabled]);
  return <ShortcutContext.Provider value={value}>
    {children}
    {guideOpen ? <div className={styles.backdrop} onMouseDown={() => setGuideOpen(false)}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="shortcut-guide-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>KEYBOARD AND FOCUS</span><h2 id="shortcut-guide-title">Keyboard shortcuts</h2><p>Every shortcut has a visible alternative. Economic actions open confirmation only.</p></div><button ref={closeRef} type="button" onClick={() => setGuideOpen(false)} aria-label="Close shortcut guide"><X aria-hidden="true" /></button></header>
        <label className={styles.toggle}><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Enable character and navigation shortcuts</span></label>
        <div className={styles.list}>{DEFINITIONS.map((item) => <article key={item.id}><div>{item.keys.map((key) => <kbd key={key}>{key}</kbd>)}</div><span><strong>{item.label}</strong><small>{item.description}</small></span><em>{item.scope.replace("-", " ")}</em></article>)}</div>
      </section>
    </div> : null}
  </ShortcutContext.Provider>;
}

export function useShortcuts() {
  const context = useContext(ShortcutContext);
  if (!context) throw new Error("useShortcuts must be used inside ShortcutProvider");
  return context;
}
