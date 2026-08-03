import type { CSSProperties } from "react";
import { normalizeRsi, normalizeWillr, rsiColor, willrColor } from "../../lib/indicatorMarkers";
import styles from "./IndicatorMarkers.module.css";

const TRACK_INSET_PX = 15;
const MARKER_HALF_PX = 5;

function markerLeft(norm: number): string {
  return `calc(${TRACK_INSET_PX}px + (100% - ${TRACK_INSET_PX * 2}px) * ${norm} - ${MARKER_HALF_PX}px)`;
}

export function IndicatorMarkers({
  rsi,
  willr
}: {
  rsi: number | null | undefined;
  willr: number | null | undefined;
}) {
  const rsiNorm = normalizeRsi(rsi);
  const willrNorm = normalizeWillr(willr);

  const rsiStyle: CSSProperties | undefined =
    rsiNorm == null
      ? undefined
      : {
          left: markerLeft(rsiNorm),
          backgroundColor: rsiColor(rsi)
        };

  const willrStyle: CSSProperties | undefined =
    willrNorm == null
      ? undefined
      : {
          left: markerLeft(willrNorm),
          backgroundColor: willrColor(willr)
        };

  return (
    <span className={styles.overlay} aria-hidden="true">
      {rsiNorm == null ? null : <span className={`${styles.marker} ${styles.top}`} style={rsiStyle} />}
      {willrNorm == null ? null : <span className={`${styles.marker} ${styles.bottom}`} style={willrStyle} />}
    </span>
  );
}
