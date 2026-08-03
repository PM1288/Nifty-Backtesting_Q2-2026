import type { ReactNode } from "react";
import type { QuoteLite } from "../../lib/types";
import { TickerTape } from "./TickerTape";
import styles from "./HeaderTicker.module.css";

export function HeaderTicker({ items, rightSlot }: { items: QuoteLite[]; rightSlot?: ReactNode }) {
  return (
    <div className={styles.header}>
      <div className={styles.tickerWrap}>
        <TickerTape items={items} />
      </div>
      <div className={styles.rightSlot}>{rightSlot}</div>
    </div>
  );
}
