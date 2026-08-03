import { useI18n } from "../../i18n/LocaleProvider";
import styles from "./HeatmapLegend.module.css";
import { getHeatmapGradient, getHeatmapSemantics, type HeatmapMetric } from "./heatmapSemantics";

export function HeatmapLegend({ metric }: { metric: HeatmapMetric }) {
  const { tr } = useI18n();
  const semantics = getHeatmapSemantics(metric);
  const spread = semantics.max - semantics.min || 1;

  return (
    <div className={styles.legend} aria-label={tr(semantics.legendTitle)}>
      <div className={styles.copy}>
        <span className={styles.title}>{tr(semantics.legendTitle)}</span>
        <span className={styles.hint}>{tr(semantics.legendHint)}</span>
      </div>

      <div className={styles.scale}>
        <div className={styles.bar} style={{ backgroundImage: getHeatmapGradient(metric) }} />
        <div className={styles.markers}>
          {semantics.marks.map((mark) => (
            <span
              key={mark.label}
              className={styles.marker}
              style={{ left: `${((mark.value - semantics.min) / spread) * 100}%` }}
            >
              <span className={styles.tick} />
              <span className={styles.value}>{mark.label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className={styles.labels}>
        <span>{tr(semantics.startLabel)}</span>
        <span>{tr(semantics.midLabel)}</span>
        <span>{tr(semantics.endLabel)}</span>
      </div>
    </div>
  );
}
