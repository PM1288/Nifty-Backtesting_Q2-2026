import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import styles from "./CommandPalette.module.css";

export type CommandPaletteItem = {
  group: string;
  label: string;
  to: string;
  keywords?: string[];
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-IN");
}

export function CommandPalette({
  items,
  showLauncher
}: {
  items: CommandPaletteItem[];
  showLauncher: boolean;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return items.slice(0, 12);
    return items
      .filter((item) => normalize([item.label, item.group, ...(item.keywords ?? [])].join(" ")).includes(needle))
      .slice(0, 12);
  }, [items, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showLauncher && (event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("en-IN") === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showLauncher]);

  useEffect(() => {
    if (!showLauncher) setOpen(false);
  }, [showLauncher]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);

  const choose = (item: CommandPaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    navigate(item.to);
  };

  return (
    <>
      {showLauncher ? (
        <button
          type="button"
          className={styles.launcher}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Search size={15} aria-hidden="true" />
          <span>Find</span>
          <kbd>Ctrl K</kbd>
        </button>
      ) : null}

      {open ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-palette-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="command-palette-title" className={styles.srOnly}>Navigate the NIFTY 50 Trader workspace</h2>
            <label className={styles.searchField}>
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                placeholder="Find a page, workflow, or stock"
                aria-controls="command-palette-results"
                aria-activedescendant={results[activeIndex] ? `command-result-${activeIndex}` : undefined}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    if (results.length) setActiveIndex((value) => Math.min(results.length - 1, value + 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((value) => Math.max(0, value - 1));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    choose(results[activeIndex]);
                  }
                }}
              />
              <kbd>Esc</kbd>
            </label>

            <div id="command-palette-results" className={styles.results} role="listbox" aria-label="Workspace destinations">
              {results.length ? results.map((item, index) => (
                <button
                  id={`command-result-${index}`}
                  key={`${item.group}-${item.to}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  data-active={index === activeIndex ? "true" : "false"}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(item)}
                >
                  <span>{item.label}</span>
                  <small>{item.group}</small>
                </button>
              )) : (
                <p className={styles.empty}>No matching workspace. Try “backtest”, “paper”, or a stock name.</p>
              )}
            </div>
            <footer>
              <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
              <span><kbd>Enter</kbd> open</span>
              <strong>Navigation only — no order authority</strong>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
