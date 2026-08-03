import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Quote } from "../../lib/types";
import { fmtPct, arrow } from "../../lib/format";
import styles from "./MoversSidebar.module.css";

function uniqBySymbol(items: Quote[]): Quote[] {
  const m = new Map<string, Quote>();
  for (const it of items) m.set(it.symbol, it);
  return [...m.values()];
}

export function MoversSidebar({ title, items }: { title: string; items: Quote[] }) {
  const unique = uniqBySymbol(items);
  const sorted = unique.sort((a, b) => b.changePct - a.changePct).slice(0, 20);
  const maxAbs = Math.max(1, ...sorted.map((s) => Math.abs(s.changePct)));

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>{title}</div>

      <div className={styles.list} role="list">
        {sorted.map((s) => {
          const dir = s.changePct > 0 ? "up" : s.changePct < 0 ? "down" : "flat";
          const w = Math.min(100, (Math.abs(s.changePct) / maxAbs) * 100);

          return (
            <motion.div key={s.symbol} layout className={styles.item} data-dir={dir} role="listitem">
              <Link to={`/analytics/stock/${encodeURIComponent(s.symbol)}`} className={styles.row}>
                <div className={styles.left}>
                  <div className={styles.symbol}>{s.symbol}</div>
                  <div className={styles.barTrack}>
                    <div className={styles.bar} style={{ width: `${w}%` }} />
                  </div>
                </div>
                <div className={styles.right}>
                  <span className={styles.pct}>
                    {arrow(s.changePct)} {fmtPct(s.changePct)}
                  </span>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
