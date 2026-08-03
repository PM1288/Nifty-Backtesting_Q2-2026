import { Link } from "react-router-dom";
import type { Quote } from "../../lib/types";
import { fmtPct, arrow } from "../../lib/format";
import styles from "./TopList.module.css";

export function TopList({
  title,
  items,
  mode
}: {
  title: string;
  items: Quote[];
  mode: "up" | "down";
}) {
  return (
    <div className={styles.block} data-mode={mode}>
      <div className={styles.title}>{title}</div>

      <div className={styles.rows}>
        {items.map((s, index) => (
          <Link key={s.symbol} to={`/analytics/stock/${encodeURIComponent(s.symbol)}`} className={styles.row}>
            <span className={styles.left}>
              <span className={styles.rank} data-mode={mode}>
                <span className={styles.rankArrow}>{mode === "up" ? "▲" : "▼"}</span>
                <span className={styles.rankStar}>★</span>
                <span className={styles.rankNum}>{index + 1}</span>
              </span>
              <span className={styles.sym}>{s.symbol}</span>
            </span>
            <span className={styles.pct}>
              {arrow(s.changePct)} {fmtPct(s.changePct)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
