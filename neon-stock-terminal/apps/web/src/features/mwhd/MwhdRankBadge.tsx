import type { MwhdRanking } from "./useMwhdRankings";
import styles from "./MwhdRankBadge.module.css";

export function MwhdRankBadge({ ranking, compact = false }: { ranking: MwhdRanking | undefined; compact?: boolean }) {
  if (!ranking) return <span className={styles.badge} data-state="missing" title="MWHD Bull and Bear rankings unavailable">MWHD B— · S—</span>;
  const bullRoute = ranking.best.branch.id === "previous-month" ? "M−1" : "M−1+M−2";
  const bearRoute = ranking.bearBest.branch.id === "previous-month" ? "M−1" : "M−1+M−2";
  return <span className={styles.badge} data-state={ranking.starterState} data-bull-ready={ranking.allGreen || undefined} data-bear-ready={ranking.bearAllRed || undefined} title={`MWHD-BULL rank ${ranking.rank}; ${bullRoute}; weighted ${ranking.best.weightedScore}/${ranking.best.maximumWeight}. MWHD-BEAR rank ${ranking.bearRank}; ${bearRoute}; weighted ${ranking.bearBest.weightedScore}/${ranking.bearBest.maximumWeight}.`}>
    <b>BULL #{ranking.rank}</b><i>BEAR #{ranking.bearRank}</i>{compact ? "" : <small>W {ranking.best.weightedScore}/{ranking.best.maximumWeight} · {ranking.bearBest.weightedScore}/{ranking.bearBest.maximumWeight}</small>}
  </span>;
}
