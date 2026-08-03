import { Link } from "react-router-dom";
import { trackSelectContent } from "../analytics/events";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { DataState, DataTable, PageIntroAccordion } from "../components/ui/DashboardPrimitives";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateTime, formatNumber, fmtDecimal, fmtPct, fmtPrice } from "../lib/format";
import { useAnalyticsDashboard, useDashboardSection, useDashboardSummary } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import {
  AnalyticsHeader,
  ExplainThis,
  MARKET_SECTION_TABS,
  asArray,
  num,
  text,
  toneFromNumber,
  useAnalyticsExperienceMode
} from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

function signedPct(value: unknown) {
  const parsed = num(value);
  if (!Number.isFinite(parsed)) return "—";
  return fmtPct(parsed * 100);
}

function humanizeRegimeLabel(value: unknown) {
  const raw = text(value, "mixed");
  const normalized = raw.replace(/_/g, " ").trim().toLowerCase();
  if (normalized === "risk off") return "Risk-off";
  if (normalized === "risk on") return "Risk-on";
  if (normalized === "mixed") return "Mixed / fragile breadth";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function regimeNarrative(
  participation: number,
  breakouts: number,
  breakdowns: number,
  tr: (value: string) => string,
) {
  if (participation >= 0.58 && breakouts > breakdowns) {
    return tr("Broad participation is supporting the move, so continuation setups deserve more trust than usual.");
  }
  if (participation <= 0.42 && breakdowns >= breakouts) {
    return tr("Weak participation and negative pressure are aligned, so protecting capital matters more than chasing isolated strength.");
  }
  return tr("The tape is mixed enough that confirmation matters more than speed. Use the next-step cards before jumping into stock-level risk.");
}

function regimeTone(regimeLabel: string): "green" | "red" | "white" {
  if (/risk-on/i.test(regimeLabel)) return "green";
  if (/risk-off/i.test(regimeLabel)) return "red";
  return "white";
}

export function AnalyticsRegimePage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const { mode } = useAnalyticsExperienceMode();
  const summary = useDashboardSummary(authReady);
  const regime = useDashboardSection("regime-breadth", authReady);
  const analyticsDashboard = useAnalyticsDashboard(authReady);
  usePageLoadProfile({
    pageName: "analytics_regime",
    enabled: authReady,
    queries: [
      { name: "dashboard-summary", isLoading: summary.isLoading, isError: !!summary.error },
      { name: "dashboard-section:regime-breadth", isLoading: regime.isLoading, isError: !!regime.error },
      { name: "analytics-dashboard", isLoading: analyticsDashboard.isLoading, isError: !!analyticsDashboard.error }
    ]
  });
  const loading = !authReady || ((!summary.data || !regime.data) && (summary.isLoading || regime.isLoading));
  useDeferredBusyState(loading);

  if (loading) {
    return (
      <DataState
        kind="loading"
        title={tr("Loading market story")}
        body={tr("The regime, breadth, breakout balance, and leadership snapshot are being prepared.")}
      />
    );
  }

  if (summary.error || regime.error || !summary.data || !regime.data) {
    return (
      <DataState
        kind="error"
        title={tr("The market story is unavailable")}
        body={tr("The regime and breadth sections could not load. Check the market summary feed and try again.")}
      />
    );
  }

  const metrics = regime.data.summary_metrics;
  const gainers = asArray(summary.data.top_gainers).slice(0, 5) as Array<Record<string, unknown>>;
  const losers = asArray(summary.data.top_losers).slice(0, 5) as Array<Record<string, unknown>>;
  const rows = regime.data.rows.slice(0, 12) as Array<Record<string, unknown>>;
  const regimeLabel = humanizeRegimeLabel(metrics["market_regime"]);
  const headlineNarrative = regimeNarrative(
    num(metrics["positive_ratio"]),
    num(metrics["breakout_count"]),
    num(metrics["breakdown_count"]),
    tr,
  );
  const regimeTimeline = analyticsDashboard.data?.regimeHistory?.slice(-10) ?? [];
  const latestRegimeWindow = regimeTimeline.map((point) => humanizeRegimeLabel(point.marketRegime));
  const regimeTransitions = latestRegimeWindow.reduce((count, label, index, list) => {
    if (index === 0) return count;
    return count + (label !== list[index - 1] ? 1 : 0);
  }, 0);
  const stableRegimeShare = latestRegimeWindow.length
    ? latestRegimeWindow.filter((label) => label === regimeLabel).length / latestRegimeWindow.length
    : 0;
  const stabilityLabel =
    stableRegimeShare >= 0.7 && regimeTransitions <= 1
      ? tr("Stable read")
      : regimeTransitions >= 3
        ? tr("Recently shifting")
        : tr("Watch for confirmation");
  const stabilityNarrative =
    stableRegimeShare >= 0.7 && regimeTransitions <= 1
      ? tr("The recent regime labels have stayed consistent, so today’s breadth read is less likely to be a one-session head fake.")
      : regimeTransitions >= 3
        ? tr("The regime has flipped several times in the last two weeks, so today’s read needs more follow-through before you treat it as durable.")
        : tr("The regime is leaning one way, but the recent history still shows enough variation that stock selection should stay selective.");

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={mode === "beginner" ? tr("Market Story") : tr("Regime & Breadth")}
        meta={`${tr("Trade date")} ${summary.data.trade_date} • ${tr("Refreshed")} ${summary.data.generated_at ? formatDateTime(summary.data.generated_at, { includeTime: true }) : "—"}`}
        subtitle={
          mode === "beginner"
            ? tr("Understand whether the market is healthy, narrow, or unstable before you pick a stock.")
            : tr("Use breadth and breakout balance to decide whether the current tape deserves continuation risk.")
        }
        sectionTabs={[...MARKET_SECTION_TABS]}
      />

      <section className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Market Regime")}</div>
          <div className={styles.metricValue} data-tone={regime.data.accent_token}>
            {tr(regimeLabel)}
          </div>
          <div className={styles.metricHint}>{headlineNarrative}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Participation")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(num(metrics["positive_ratio"]) - 0.5)}>
            {signedPct(metrics["positive_ratio"])}
          </div>
          <div className={styles.metricHint}>
            {formatNumber(num(metrics["advancers"]), { maximumFractionDigits: 0 })} {tr("up")} / {formatNumber(num(metrics["decliners"]), { maximumFractionDigits: 0 })} {tr("down")}
          </div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Breakout Balance")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(num(metrics["breakout_count"]) - num(metrics["breakdown_count"]))}>
            {formatNumber(num(metrics["breakout_count"]), { maximumFractionDigits: 0 })} / {formatNumber(num(metrics["breakdown_count"]), { maximumFractionDigits: 0 })}
          </div>
          <div className={styles.metricHint}>{tr("Breakouts vs breakdowns. This is your continuation pressure check.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Index Return")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(num(metrics["nifty_return"]))}>
            {signedPct(metrics["nifty_return"])}
          </div>
          <div className={styles.metricHint}>{tr("NIFTY close")} {fmtPrice(num(metrics["nifty_close"]))}</div>
        </div>
      </section>

      {regimeTimeline.length ? (
        <section className={styles.panel}>
          <div className={styles.forwardStripHeader}>
            <div>
              <h2 className={styles.panelTitle}>{tr("Regime stability")}</h2>
              <p className={styles.sectionIntro}>{tr("Last 10 sessions. Use this strip to judge whether the current read is stable or newly changing.")}</p>
            </div>
            <div className={styles.smallStat} data-tone={regimeTone(regimeLabel)}>{stabilityLabel}</div>
          </div>
          <div className={styles.pillRow}>
            {regimeTimeline.map((point) => {
              const label = humanizeRegimeLabel(point.marketRegime);
              const balance = point.breakoutCount - point.breakdownCount;
              return (
                <div key={point.tradeDate} className={styles.historyPill} data-tone={regimeTone(label)}>
                  <div className={styles.historyPillDate}>{point.tradeDate.slice(5)}</div>
                  <div className={styles.historyPillLabel}>{tr(label)}</div>
                  <div className={styles.historyPillMeta}>
                    <span>{fmtPct(point.positiveRatio * 100)} {tr("breadth")}</span>
                    <strong data-tone={toneFromNumber(balance)}>{balance >= 0 ? "+" : ""}{formatNumber(balance, { maximumFractionDigits: 0 })} {tr("balance")}</strong>
                  </div>
                </div>
              );
            })}
          </div>
          <p className={styles.sectionIntro}>{stabilityNarrative}</p>
        </section>
      ) : null}

      <section className={styles.grid2}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("Current read")}</h2>
          <p className={styles.sectionIntro}>{headlineNarrative}</p>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("If participation stays broad")}</div>
                <div className={styles.muted}>{tr("Continue into Setups or the % Change heatmap to find the names confirming the tape.")}</div>
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("If the tape feels noisy")}</div>
                <div className={styles.muted}>{tr("Move into Risk / Signals before trusting continuation or reversal ideas.")}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.tablePanel}>
          <h2 className={styles.panelTitle}>{tr("Leadership Snapshot")}</h2>
          <div className={styles.dualList}>
            <div className={styles.miniPanel}>
              <div className={styles.miniTitle}>{tr("Top Gainers")}</div>
              {gainers.map((item) => (
                <Link
                  key={text(item.symbol)}
                  to={`/analytics/stock/${encodeURIComponent(text(item.symbol))}`}
                  className={styles.miniRow}
                  onClick={() =>
                    void trackSelectContent("stock", text(item.symbol), {
                      symbol: text(item.symbol),
                      bucket: "gainer",
                      source_surface: "market_story"
                    })
                  }
                >
                  <span className={styles.strong}>{text(item.symbol)}</span>
                  <span className={styles.value} data-tone="green">{signedPct(item.change_pct)}</span>
                </Link>
              ))}
            </div>
            <div className={styles.miniPanel}>
              <div className={styles.miniTitle}>{tr("Top Losers")}</div>
              {losers.map((item) => (
                <Link
                  key={text(item.symbol)}
                  to={`/analytics/stock/${encodeURIComponent(text(item.symbol))}`}
                  className={styles.miniRow}
                  onClick={() =>
                    void trackSelectContent("stock", text(item.symbol), {
                      symbol: text(item.symbol),
                      bucket: "loser",
                      source_surface: "market_story"
                    })
                  }
                >
                  <span className={styles.strong}>{text(item.symbol)}</span>
                  <span className={styles.value} data-tone="red">{signedPct(item.change_pct)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("Interpretation")}</h2>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Average breadth return")}</div>
                <div className={styles.muted}>{tr("Tells you whether the average stock is moving with or against the headline index.")}</div>
              </div>
              <div className={styles.smallStat} data-tone={toneFromNumber(num(metrics["avg_daily_return"]))}>
                {signedPct(metrics["avg_daily_return"])}
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Event count")}</div>
                <div className={styles.muted}>{tr("High event load can make the tape look active without making it trustworthy.")}</div>
              </div>
              <div className={styles.smallStat}>{formatNumber(num(metrics["event_count"]), { maximumFractionDigits: 0 })}</div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Anomaly count")}</div>
                <div className={styles.muted}>{tr("A rising anomaly count means more tape distortion and more need for confirmation.")}</div>
              </div>
              <div className={styles.smallStat}>{formatNumber(num(metrics["anomaly_count"]), { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.nextSteps}>
        <Link to="/analytics/setups" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Broad / constructive tape")}</span>
          <strong>{tr("Go to Setups")}</strong>
          <span className={styles.muted}>{tr("Use this when participation and breakout balance are strong enough to support stock selection.")}</span>
        </Link>
        <Link to="/analytics/risk" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Fragile / distorted tape")}</span>
          <strong>{tr("Go to Risk")}</strong>
          <span className={styles.muted}>{tr("Use this when event load and anomaly count are high enough to question the move.")}</span>
        </Link>
      </section>

      <DataTable
        title={tr("Breadth Clues")}
        subtitle={tr("Signals that explain why the current regime looks constructive, narrow, or unstable.")}
        rows={rows}
        maxHeight={440}
        columns={[
          {
            key: "signal",
            header: tr("Signal"),
            cell: (row: Record<string, unknown>) => (
              <div className={styles.headline}>
                <strong>{text(row.title, text(row.symbol))}</strong>
                <span className={styles.muted}>{text(row.subtitle)}</span>
              </div>
            )
          },
          {
            key: "direction",
            header: tr("Direction"),
            cell: (row: Record<string, unknown>) => (
              <span className={styles.value} data-tone={text(row.accent_token, "white")}>
                {text(row.direction)}
              </span>
            )
          },
          {
            key: "score",
            header: tr("Score"),
            align: "right",
            cell: (row: Record<string, unknown>) => (row.score == null ? "—" : fmtDecimal(num(row.score), 2))
          },
          {
            key: "notes",
            header: tr("Why it matters"),
            cell: (row: Record<string, unknown>) => text(row.notes)
          }
        ]}
      />

      <section className={styles.guidanceGrid}>
        <article className={styles.guideCard}>
          <span className={styles.guideStep}>1</span>
          <h2 className={styles.guideTitle}>{tr("Check whether the move is broad enough to trust.")}</h2>
          <p className={styles.guideText}>
            {tr("If positive ratio is weak and breakdowns dominate, treat upside names more selectively and prefer tighter confirmation.")}
          </p>
        </article>
        <article className={styles.guideCard}>
          <span className={styles.guideStep}>2</span>
          <h2 className={styles.guideTitle}>{tr("Separate leadership from noise.")}</h2>
          <p className={styles.guideText}>
            {tr("Compare the strongest gainers and losers. If both are extreme, the session is active but unstable.")}
          </p>
        </article>
        <article className={styles.guideCard}>
          <span className={styles.guideStep}>3</span>
          <h2 className={styles.guideTitle}>{tr("Choose the next page by market condition.")}</h2>
          <p className={styles.guideText}>
            {tr("Broad participation leads naturally to Setups. Weak participation or heavy caution signals leads naturally to Risk.")}
          </p>
        </article>
      </section>

      <section className={styles.explainGrid}>
        <ExplainThis
          label="Breadth"
          summary="Breadth asks whether the average stock is moving in the same direction as the headline index."
          detail="When breadth is strong, rallies are usually healthier because more names are participating. When breadth is weak, a few heavyweights can hide weakness underneath."
          takeaway="Beginners should trust upside continuation more when participation is broad, not just when the index is green."
        />
        <ExplainThis
          label="Breakout Balance"
          summary="This compares how many stocks are breaking higher versus breaking lower on the same day."
          detail="A market with more breakouts than breakdowns usually supports trend trades better. A balanced or negative reading means confirmation matters more."
          takeaway="If breakdowns dominate, reduce the urge to chase strength just because one stock looks fast."
        />
        <ExplainThis
          label="Event Load"
          summary="Event load tracks how much of the day's movement may be driven by announcements, actions, or flow shocks."
          detail="A busy tape can look exciting without being clean. High event load means you should verify the move with breadth, volume quality, and follow-through."
          takeaway="Use event-heavy sessions for learning and confirmation, not automatic aggression."
        />
      </section>

      <PageIntroAccordion
        label="How to use this page"
          title={mode === "beginner" ? tr("Read left to right: regime, participation, breakout balance, then leadership.") : tr("Use regime first, explanations second.")}
        body={
          mode === "beginner"
            ? tr("This page explains what the tape is doing before you choose names.")
            : tr("This page tells you whether the current tape deserves continuation risk before you open stock-level detail.")
        }
        items={[
          tr("Participation tells you whether the average stock agrees with the headline index."),
          tr("Breakout balance tells you whether continuation has broad support or only isolated pockets."),
          tr("Leadership should confirm the regime read, not contradict it.")
        ]}
        defaultOpen={mode === "beginner"}
      />

    </div>
  );
}
