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

  return (
    <div className={styles.viewport} aria-label={tr("Market ticker tape")} tabIndex={0}>
      <div className={styles.track}>
        <div className={styles.segment} role="list">
          {items.map((it) => (
            <div key={it.symbol} className={styles.item} role="listitem">
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
