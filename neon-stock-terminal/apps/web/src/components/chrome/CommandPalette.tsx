import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search, ShieldAlert, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { CommandGroup, CommandItem } from "../../interaction/routeCatalog";
import styles from "./CommandPalette.module.css";

export type CommandPaletteItem = CommandItem;

const GROUP_ORDER: CommandGroup[] = ["Recent", "Go to", "Stocks", "Strategies", "Paper trades", "Backtest runs", "Actions", "Help", "Data issues", "Saved views"];
const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

function normalize(value: string) {
  return value.toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g, " ").trim();
}

function fuzzyScore(haystack: string, needle: string) {
  if (!needle) return 1;
  if (haystack.startsWith(needle)) return 120 - Math.min(haystack.length, 40);
  const direct = haystack.indexOf(needle);
  if (direct >= 0) return 90 - Math.min(direct, 30);
  let position = 0;
  let score = 0;
  for (const char of needle) {
    const next = haystack.indexOf(char, position);
    if (next < 0) return -1;
    score += next === position ? 3 : 1;
    position = next + 1;
  }
  return score;
}

function queryScope(raw: string) {
  const query = raw.trim();
  if (query.startsWith("@")) return { groups: ["Stocks"] as CommandGroup[], query: query.slice(1) };
  if (query.startsWith("#")) return { groups: ["Go to", "Strategies", "Data issues"] as CommandGroup[], query: query.slice(1) };
  if (query.startsWith(">")) return { groups: ["Actions"] as CommandGroup[], query: query.slice(1) };
  if (query.startsWith("?")) return { groups: ["Help"] as CommandGroup[], query: query.slice(1) };
  return { groups: null, query };
}

function recentIds() {
  try { return JSON.parse(localStorage.getItem("n50:command:recent") ?? "[]") as string[]; } catch { return []; }
}

export function CommandPalette({ items, loadItems }: { items: CommandPaletteItem[]; loadItems?: () => Promise<CommandPaletteItem[]> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteItems, setRemoteItems] = useState<CommandPaletteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const allItems = useMemo(() => {
    const unique = new Map<string, CommandPaletteItem>();
    for (const item of [...items, ...remoteItems]) unique.set(item.id, item);
    const recents = recentIds().map((id) => unique.get(id)).filter(Boolean).map((item) => ({ ...item!, group: "Recent" as const, id: `recent:${item!.id}`, keywords: [...(item!.keywords ?? []), item!.id] }));
    return [...recents, ...unique.values()];
  }, [items, remoteItems]);

  const results = useMemo(() => {
    const scoped = queryScope(query);
    const needle = normalize(scoped.query);
    return allItems
      .filter((item) => !scoped.groups || scoped.groups.includes(item.group))
      .map((item) => {
        const haystack = normalize([item.label, item.group, item.description, item.context, ...(item.keywords ?? []), ...(item.aliases ?? [])].filter(Boolean).join(" "));
        return { item, score: fuzzyScore(haystack, needle) };
      })
      .filter((row) => row.score >= 0)
      .sort((a, b) => b.score - a.score || GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group) || a.item.label.localeCompare(b.item.label))
      .slice(0, 36)
      .map((row) => row.item);
  }, [allItems, query]);

  const close = (restore = true) => {
    setOpen(false);
    if (restore) window.requestAnimationFrame(() => restoreFocusRef.current?.focus());
  };

  useEffect(() => {
    const onOpenRequest = () => {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    };
    window.addEventListener("n50:open-command-palette", onOpenRequest);
    return () => window.removeEventListener("n50:open-command-palette", onOpenRequest);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new Event("n50:blocking-surface-open"));
    setQuery(""); setActiveIndex(0); setLoadError(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
    if (loadItems) {
      setLoading(true);
      loadItems().then(setRemoteItems).catch((reason) => setLoadError(reason instanceof Error ? reason.message : String(reason))).finally(() => setLoading(false));
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [loadItems, open]);

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => { if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1)); }, [activeIndex, results.length]);

  const choose = (item: CommandPaletteItem | undefined) => {
    if (!item || item.disabledReason) return;
    const baseId = item.id.replace(/^recent:/, "");
    const ids = [baseId, ...recentIds().filter((id) => id !== baseId)].slice(0, 8);
    localStorage.setItem("n50:command:recent", JSON.stringify(ids));
    if (item.to === "#shortcuts") {
      close(false);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true }));
      return;
    }
    close(false);
    navigate(item.to);
  };

  return <>
    <button type="button" className={styles.launcher} aria-label="Search stocks, dashboards and actions" aria-haspopup="dialog" aria-expanded={open} onClick={(event) => { restoreFocusRef.current = event.currentTarget; setOpen(true); }}>
      <Search size={16} aria-hidden="true" /><span>Search &amp; commands</span><kbd>Ctrl K</kbd>
    </button>
    {open ? <div className={styles.backdrop} role="presentation" onMouseDown={() => close(true)}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="command-palette-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(true); }
        if (event.key === "Tab" && dialogRef.current) {
          const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
          const first = focusable[0], last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <header className={styles.dialogHeader}><div><span>UNIVERSAL NAVIGATION</span><h2 id="command-palette-title">Search stocks, dashboards &amp; actions</h2></div><button type="button" onClick={() => close(true)} aria-label="Close search and commands"><X aria-hidden="true" /></button></header>
        <label className={styles.searchField}><Search size={19} aria-hidden="true" /><input ref={inputRef} value={query} placeholder="Try @RELIANCE, #leadership, >add paper trade or ?MAE" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="command-palette-results" aria-activedescendant={results[activeIndex] ? `command-result-${activeIndex}` : undefined} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); if (results.length) setActiveIndex((value) => Math.min(results.length - 1, value + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(0, value - 1)); }
          else if (event.key === "Enter") { event.preventDefault(); choose(results[activeIndex]); }
        }} /></label>
        <div className={styles.status} aria-live="polite">{loading ? "Loading current trades and runs…" : `${results.length} result${results.length === 1 ? "" : "s"}`}{loadError ? <span>Some live entities are unavailable</span> : null}</div>
        <div id="command-palette-results" className={styles.results} role="listbox" aria-label="Command results">
          {results.length ? results.map((item, index) => {
            const showGroup = index === 0 || results[index - 1]?.group !== item.group;
            return <div className={styles.resultWrap} key={`${item.id}-${index}`}>{showGroup ? <h3>{item.group}</h3> : null}<button id={`command-result-${index}`} type="button" role="option" aria-selected={index === activeIndex} aria-disabled={Boolean(item.disabledReason)} data-active={index === activeIndex ? "true" : "false"} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}><span className={styles.resultCopy}><strong>{item.label}</strong><small>{item.description ?? item.context ?? item.group}</small>{item.freshness ? <em>{item.freshness}</em> : null}</span><span className={styles.resultAction}>{item.disabledReason ? <><ShieldAlert size={15} />Unavailable</> : <>{item.actionLabel ?? "Open"}<ArrowRight size={15} /></>}</span></button></div>;
          }) : <p className={styles.empty}>No matching result. Search a dashboard name, symbol, strategy, trade, run or definition.</p>}
        </div>
        <footer><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span><strong>Commands use existing permissions and confirmations</strong></footer>
      </section>
    </div> : null}
  </>;
}
