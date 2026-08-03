import type { QuoteLite } from "../../lib/types";
import { useI18n } from "../../i18n/LocaleProvider";
import { arrow, fmtPct, fmtPrice } from "../../lib/format";
import { pctClass } from "../utils/pctClass";
import styles from "./TickerTape.module.css";

export function TickerTape({ items }: { items: QuoteLite[] }) {
  const { tr } = useI18n();
  if (!items.length) {
    return <div className={styles.placeholder}>{tr("Loading market tape…")}</div>;
  }

  // Keep one segment wide enough, then duplicate exactly once for seamless loop.
  const minItemsPerSegment = 14;
  const repeats = Math.max(1, Math.ceil(minItemsPerSegment / items.length));
  const segmentItems = Array.from({ length: repeats }, () => items).flat();

  return (
    <div className={styles.viewport} aria-label={tr("Market ticker tape")}>
      <div className={styles.track}>
        <div className={styles.segment}>
          {segmentItems.map((it, idx) => (
            <div key={`${it.symbol}-a-${idx}`} className={styles.item}>
              <span className={styles.symbol}>{it.symbol}</span>
              <span className={styles.last}>{fmtPrice(it.last)}</span>
              <span className={`${styles.pct} ${pctClass(it.changePct)}`}>
                {arrow(it.changePct)} {fmtPct(it.changePct)}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.segment} aria-hidden="true">
          {segmentItems.map((it, idx) => (
            <div key={`${it.symbol}-b-${idx}`} className={styles.item}>
              <span className={styles.symbol}>{it.symbol}</span>
              <span className={styles.last}>{fmtPrice(it.last)}</span>
              <span className={`${styles.pct} ${pctClass(it.changePct)}`}>
                {arrow(it.changePct)} {fmtPct(it.changePct)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
