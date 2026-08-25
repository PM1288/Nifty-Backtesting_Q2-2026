import type { ReactNode } from "react";
import type { QuoteLite } from "../../lib/types";
import { TickerTape } from "./TickerTape";
import styles from "./HeaderTicker.module.css";

export function HeaderTicker({ items, leadingSlot }: { items: QuoteLite[]; leadingSlot?: ReactNode }) {
  return (
    <div className={styles.header}>
      <div className={styles.leadingSlot}>{leadingSlot}</div>
      <div className={styles.tickerWrap}>
        <TickerTape items={items} />
      </div>
    </div>
  );
}
