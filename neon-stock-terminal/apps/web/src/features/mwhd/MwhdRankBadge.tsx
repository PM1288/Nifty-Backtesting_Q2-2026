import type { MwhdRanking } from "./useMwhdRankings";
import styles from "./MwhdRankBadge.module.css";

export function MwhdRankBadge({ ranking, compact = false }: { ranking: MwhdRanking | undefined; compact?: boolean }) {
  if (!ranking) return <span className={styles.badge} data-state="missing" title="MWHD ranking unavailable">MWHD —</span>;
  const route = ranking.best.branch.id === "previous-month" ? "M−1" : "M−2";
  return <span className={styles.badge} data-state={ranking.starterState} data-complete={ranking.allGreen || undefined} title={`MWHD rank ${ranking.rank}; ${route}; weighted score ${ranking.best.weightedScore} of ${ranking.best.maximumWeight}; ${ranking.best.pass} passed, ${ranking.best.fail} failed, ${ranking.best.pending} pending`}>
    MWHD #{ranking.rank}{compact ? "" : ` · ${route} · W ${ranking.best.weightedScore}/${ranking.best.maximumWeight}`}
  </span>;
}
