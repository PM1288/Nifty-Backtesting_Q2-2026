import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useWorkspaceEngagement, useWorkspaceSectionViews } from "../analytics/useWorkspaceAnalytics";
import { trackTableRowSelected } from "../analytics/events";
import type { AnalyticsParams } from "../analytics/types";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { DataState, DataTable, PageIntroAccordion } from "../components/ui/DashboardPrimitives";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateTime, formatNumber, fmtDecimal, fmtPct, fmtPrice } from "../lib/format";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import {
  useAnalyticsBoardBrief,
  useDashboardSection,
  useDashboardSummary,
  useWatchlist,
  useWatchlists
} from "../lib/hooks";
import {
  AnalyticsHeader,
  MARKET_SECTION_TABS,
  asArray,
  num,
  text,
  useAnalyticsExperienceMode
} from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

function signedPct(value: unknown) {
  const parsed = num(value);
  if (!Number.isFinite(parsed)) return "—";
  return fmtPct(parsed * 100);
}

function buildMarketStory(
  hero: Record<string, unknown>,
  regimeMetrics: Record<string, unknown>,
  sectorGroups: Array<Record<string, unknown>>,
  tr: (value: string) => string,
  t: (key: string, fallback?: string, values?: Record<string, string | number>) => string
) {
  const indexMove = num(hero["change_pct"]);
  const participation = num(regimeMetrics["positive_ratio"]);
  const breakoutCount = num(regimeMetrics["breakout_count"]);
  const breakdownCount = num(regimeMetrics["breakdown_count"]);
  const marketRegime = text(regimeMetrics["market_regime"], "mixed session");
  const leadSector = sectorGroups[0]?.sector_name ? text(sectorGroups[0].sector_name) : "sector leadership";

  let tone = "Rotation";
  let read = "The tape is mixed and leadership is rotating rather than moving in one clean direction.";
  if (indexMove > 0.003 && participation >= 0.58) {
    tone = "Bullish Expansion";
    read = "The index and the average stock are rising together, which is the cleanest form of upside participation.";
  } else if (indexMove < -0.003 && participation <= 0.42) {
    tone = "Broad Weakness";
    read = "The index and breadth are both weak, which usually means sellers have control across the tape.";
  } else if (Math.abs(indexMove) < 0.003 && participation > 0.5) {
    tone = "Positive Rotation";
    read = "The headline index is quiet, but enough stocks are still rising to suggest rotation underneath the surface.";
  }

  const pressureRead =
    breakoutCount > breakdownCount
      ? "Breakouts are outnumbering breakdowns, so continuation setups have more support."
      : breakoutCount < breakdownCount
        ? "Breakdowns are outnumbering breakouts, so caution matters more than chasing strength."
        : "Breakouts and breakdowns are balanced, so confirmation matters more than speed.";

  return {
    tone,
    title: t("overview.marketStoryTitle", "Today's Market Story: {{tone}}", { tone: tr(tone) }),
    body: t(
      "overview.marketStoryBody",
      "{{read}} The live regime model currently reads {{regime}}, and {{leadSector}} is one of the visible leadership pockets.",
      {
        read: tr(read),
        regime: tr(marketRegime.toLowerCase()),
        leadSector: tr(leadSector.toLowerCase())
      }
    ),
    bullets: [
      t("overview.marketStoryBulletIndexMove", "Index move: {{indexMove}} with breadth at {{breadth}}", {
        indexMove: signedPct(hero["change_pct"]),
        breadth: signedPct(regimeMetrics["positive_ratio"])
      }),
      tr(pressureRead),
      tr("Use Leaders & Setups next if you want the names carrying the move, or open Anomalies if the tape still feels distorted.")
    ]
  };
}

function humanizeRegimeLabel(value: unknown) {
  const raw = text(value, "mixed");
  const normalized = raw.replace(/_/g, " ").trim().toLowerCase();
  if (normalized === "risk off") return "Risk-off";
  if (normalized === "risk on") return "Risk-on";
  if (normalized === "mixed") return "Mixed / fragile breadth";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function regimeConfidence(participation: number, breakoutCount: number, breakdownCount: number) {
  const balance = Math.abs(breakoutCount - breakdownCount);
  if (participation >= 0.58 && balance >= 6) return "High";
  if (participation <= 0.42 && balance >= 6) return "High";
  if (participation >= 0.53 || participation <= 0.47 || balance >= 3) return "Medium";
  return "Low";
}

function localizeDynamicMarketText(
  value: string,
  tr: (value: string) => string,
  formatNumberLocal: (value: number, options?: Intl.NumberFormatOptions) => string
) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const countMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+names$/i);
  if (countMatch) {
    return `${formatNumberLocal(Number(countMatch[1]), { maximumFractionDigits: 0 })} ${tr("names")}`;
  }

  return tr(trimmed);
}


export function AnalyticsOverviewPage() {
  const { t, tr } = useI18n();
  const { authReady } = useAuthGate();
  const { mode } = useAnalyticsExperienceMode();
  const boardBrief = useAnalyticsBoardBrief(authReady);
  const summary = useDashboardSummary(authReady);
  const regime = useDashboardSection("regime-breadth", authReady);
  const historical = useDashboardSection("historical-learner", authReady);
  const watchlists = useWatchlists(authReady);
  const leaders = useWatchlist("leaders", authReady);
  usePageLoadProfile({
    pageName: "analytics_overview",
    enabled: authReady,
    queries: [
      { name: "dashboard-summary", isLoading: summary.isLoading, isError: !!summary.error },
      { name: "analytics-board-brief", isLoading: boardBrief.isLoading, isError: !!boardBrief.error },
      { name: "dashboard-section:regime-breadth", isLoading: regime.isLoading, isError: !!regime.error },
      { name: "dashboard-section:historical-learner", isLoading: historical.isLoading, isError: !!historical.error },
      { name: "watchlists", isLoading: watchlists.isLoading, isError: !!watchlists.error },
      { name: "watchlist:leaders", isLoading: leaders.isLoading, isError: !!leaders.error }
    ]
  });

  const loading =
    !authReady ||
    ((!boardBrief.data || !summary.data || !regime.data || !historical.data || !watchlists.data || !leaders.data) &&
      (boardBrief.isLoading || summary.isLoading || regime.isLoading || historical.isLoading || watchlists.isLoading || leaders.isLoading));
  useDeferredBusyState(loading);
  const heroRef = useRef<HTMLElement | null>(null);
  const marketStoryRef = useRef<HTMLDivElement | null>(null);
  const routingRef = useRef<HTMLDivElement | null>(null);
  const leadersRef = useRef<HTMLElement | null>(null);
  const leadershipRef = useRef<HTMLDivElement | null>(null);
  const strategyPreviewRef = useRef<HTMLElement | null>(null);
  const engagementExtrasRef = useRef<AnalyticsParams>({});

  const overviewAnalyticsContext = useMemo(
    () => ({
      page_name: "market_hub",
      page_family: "market",
      section: "hub",
      page_path: "/analytics",
      audience_mode: mode,
    }),
    [mode],
  );

  const sectionRefs = useMemo(
    () => ({
      market_hub_hero: heroRef,
      market_hub_story: marketStoryRef,
      market_hub_routing: routingRef,
      market_hub_leaders: leadersRef,
      market_hub_leadership: leadershipRef,
      market_hub_strategy_preview: strategyPreviewRef,
    }),
    [],
  );

  useWorkspaceSectionViews(sectionRefs, overviewAnalyticsContext, "market_hub_section_view", authReady && !loading && !!boardBrief.data && !!summary.data && !!regime.data);
  useWorkspaceEngagement(overviewAnalyticsContext, "market_hub_engagement", authReady && !loading && !!summary.data && !!regime.data, {
    extraParams: engagementExtrasRef,
  });

  if (loading) {
    return (
      <DataState
        kind="loading"
        title={tr("Loading the market workspace")}
        body={tr("The market summary, breadth context, leadership groups, and historical teaching cards are being prepared.")}
      />
    );
  }
  if (boardBrief.error || summary.error || regime.error || historical.error || watchlists.error || leaders.error || !boardBrief.data || !summary.data || !regime.data || !historical.data || !watchlists.data || !leaders.data) {
    return (
      <DataState
        kind="error"
        title={tr("The market workspace is unavailable")}
        body={tr("The root-route briefing and supporting analytics sections could not load together. Check the summary, quality, and breadth data sources, then refresh.")}
      />
    );
  }

  const brief = boardBrief.data;
  const hero = summary.data.hero;
  const regimeMetrics = regime.data.summary_metrics;
  const leaderRows = leaders.data.rows;
  const historicalRows = historical.data.rows;
  const sectorGroups = asArray(summary.data.sector_groups) as Array<Record<string, unknown>>;
  const marketStory = buildMarketStory(
    summary.data.hero as unknown as Record<string, unknown>,
    regimeMetrics as Record<string, unknown>,
    sectorGroups,
    tr,
    t
  );
  const regimeLabel = tr(humanizeRegimeLabel(regimeMetrics["market_regime"]));
  const confidence = tr(regimeConfidence(num(regimeMetrics["positive_ratio"]), num(regimeMetrics["breakout_count"]), num(regimeMetrics["breakdown_count"])));

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr("Market Hub")}
        meta={`${tr("Trade date")} ${summary.data.trade_date} • ${tr("Refreshed")} ${formatDateTime(summary.data.generated_at, { includeTime: true })}`}
        subtitle={tr("Start with the market tone, then move into market story, heatmaps, signals, or stock selection without changing shells.")}
        sectionTabs={[...MARKET_SECTION_TABS]}
      />

      <section className={styles.panel}>
        <div className={styles.eyebrow}>{tr("Market dossier")}</div>
        <pre className={styles.dossierPre}>{brief.decoratedHeader.join("\n")}</pre>

        <div>
          <h2 className={styles.panelTitle}>{tr("Market headline")}</h2>
          <p className={styles.sectionIntro}>{tr(brief.marketHeadline)}</p>
          <p className={styles.muted}>{tr(brief.marketBias)}</p>
        </div>

        <div>
          <h3 className={styles.panelTitle}>{tr("Key conclusions")}</h3>
          <div className={styles.signalGrid}>
            {brief.keyConclusions.map((item) => (
              <div key={item} className={styles.signalItem}>
                <div className={styles.muted}>{tr(item)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.grid2}>
          <div>
            <h3 className={styles.panelTitle}>{tr("Index snapshot")}</h3>
            <div className={styles.signalGrid}>
              {brief.indexSnapshot.map((item) => (
                <div key={item} className={styles.signalItem}>
                  <div className={styles.muted}>{tr(item)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className={styles.panelTitle}>{tr("Options snapshot")}</h3>
            <div className={styles.signalGrid}>
              {brief.optionsSnapshot.map((item) => (
                <div key={item} className={styles.signalItem}>
                  <div className={styles.muted}>{tr(item)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.grid2}>
          <div>
            <h3 className={styles.panelTitle}>{tr("FII snapshot")}</h3>
            <div className={styles.signalGrid}>
              {brief.fiiSnapshot.map((item) => (
                <div key={item} className={styles.signalItem}>
                  <div className={styles.muted}>{tr(item)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className={styles.panelTitle}>{tr("Sector snapshot")}</h3>
            <div className={styles.signalGrid}>
              {brief.sectorSnapshot.map((item) => (
                <div key={item} className={styles.signalItem}>
                  <div className={styles.muted}>{tr(item)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className={styles.panelTitle}>{tr("Full stock snapshot")}</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {brief.fullStockSnapshot.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {brief.fullStockSnapshot.rows.map((row) => (
                  <tr key={row.symbol}>
                    {brief.fullStockSnapshot.columns.map((column) => (
                      <td key={`${row.symbol}-${column}`}>
                        {String(row[column as keyof typeof row] ?? "NA")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.grid2}>
            <div>
              <h4 className={styles.panelTitle}>{tr("Top 5 leaders")}</h4>
              <div className={styles.signalGrid}>
                {brief.fullStockSnapshot.topLeaders.map((item) => (
                  <div key={item} className={styles.signalItem}>
                    <div className={styles.muted}>{tr(item)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className={styles.panelTitle}>{tr("Top 5 weakest")}</h4>
              <div className={styles.signalGrid}>
                {brief.fullStockSnapshot.topWeakest.map((item) => (
                  <div key={item} className={styles.signalItem}>
                    <div className={styles.muted}>{tr(item)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.grid2}>
            <div>
              <h4 className={styles.panelTitle}>{tr("Top 5 continuation candidates")}</h4>
              <div className={styles.signalGrid}>
                {brief.fullStockSnapshot.continuationCandidates.map((item) => (
                  <div key={item} className={styles.signalItem}>
                    <div className={styles.muted}>{tr(item)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className={styles.panelTitle}>{tr("Top 5 reversal watchlist names")}</h4>
              <div className={styles.signalGrid}>
                {brief.fullStockSnapshot.reversalCandidates.map((item) => (
                  <div key={item} className={styles.signalItem}>
                    <div className={styles.muted}>{tr(item)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className={styles.panelTitle}>{tr("Best entries")}</h3>
          <div className={styles.grid2}>
            <div>
              <h4 className={styles.panelTitle}>{tr("Continuation")}</h4>
              <div className={styles.signalGrid}>
                {brief.bestEntries.continuation.map((item) => (
                  <div key={item} className={styles.signalItem}><div className={styles.muted}>{tr(item)}</div></div>
                ))}
              </div>
            </div>
            <div>
              <h4 className={styles.panelTitle}>{tr("Pullback")}</h4>
              <div className={styles.signalGrid}>
                {brief.bestEntries.pullback.map((item) => (
                  <div key={item} className={styles.signalItem}><div className={styles.muted}>{tr(item)}</div></div>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.grid2}>
            <div>
              <h4 className={styles.panelTitle}>{tr("Reversal")}</h4>
              <div className={styles.signalGrid}>
                {brief.bestEntries.reversal.map((item) => (
                  <div key={item} className={styles.signalItem}><div className={styles.muted}>{tr(item)}</div></div>
                ))}
              </div>
            </div>
            <div>
              <h4 className={styles.panelTitle}>{tr("Avoid")}</h4>
              <div className={styles.signalGrid}>
                {brief.bestEntries.avoid.map((item) => (
                  <div key={item} className={styles.signalItem}><div className={styles.muted}>{tr(item)}</div></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.grid2}>
          <div>
            <h3 className={styles.panelTitle}>{tr("Risk flags")}</h3>
            <div className={styles.signalGrid}>
              {brief.riskFlags.map((item) => (
                <div key={item} className={styles.signalItem}>
                  <div className={styles.muted}>{tr(item)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className={styles.panelTitle}>{tr("Next alerts")}</h3>
            <div className={styles.signalGrid}>
              {brief.nextAlerts.map((item) => (
                <div key={item} className={styles.signalItem}>
                  <div className={styles.muted}>{tr(item)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className={styles.panelTitle}>{tr("How to read today")}</h3>
          <div className={styles.signalGrid}>
            {brief.howToReadToday.map((item) => (
              <div key={item} className={styles.signalItem}>
                <div className={styles.muted}>{tr(item)}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className={styles.panelTitle}>{tr("Data quality")}</h3>
          <div className={styles.signalGrid}>
            {brief.dataQuality.map((item) => (
              <div key={item} className={styles.signalItem}>
                <div className={styles.muted}>{tr(item)}</div>
              </div>
            ))}
          </div>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Changed vs prior session")}</div>
                <div className={styles.muted}>{tr(brief.changedVsPriorSession)}</div>
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Confirming modules")}</div>
                <div className={styles.pillRow}>
                  {brief.moduleAlignment.confirming.map((item) => (
                    <span key={item} className={styles.pill} data-tone="green">{tr(item)}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Contradicting modules")}</div>
                <div className={styles.pillRow}>
                  {brief.moduleAlignment.contradicting.map((item) => (
                    <span key={item} className={styles.pill} data-tone="red">{tr(item)}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className={styles.panelTitle}>{tr("LLM brief")}</h3>
          <p className={styles.sectionIntro}>{brief.llm_brief}</p>
        </div>

        <div>
          <h3 className={styles.panelTitle}>{tr("Machine facts")}</h3>
          <pre className={styles.dossierPre}>{brief.machineFacts.join("\n")}</pre>
          <p className={styles.muted}>{brief.rootRouteTakeaway}</p>
        </div>
      </section>

      <section ref={heroRef} data-analytics-section="market_hub_hero" className={styles.heroGrid}>
        <div className={styles.heroCard}>
          <div className={styles.eyebrow}>{tr("Current market conclusion")}</div>
          <div className={styles.heroValue} data-tone={hero.accent_token}>{fmtPrice(num(hero.last_value))}</div>
          <div className={styles.heroMeta}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Regime")}</div>
              <div className={styles.metricValue}>{regimeLabel}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Confidence")}</div>
              <div className={styles.metricValue} data-tone={confidence === "High" ? hero.accent_token : "white"}>{confidence}</div>
            </div>
          </div>
          <p className={styles.sectionIntro}>
            {t(
              "overview.currentMarketConclusionNarrative",
              "{{regime}} with {{confidence}} confidence. {{index}} is at {{value}}, so use the cards on this page to decide whether to continue into story, signals, or strategy evidence.",
              {
                regime: regimeLabel,
                confidence: confidence.toLowerCase(),
                index: hero.index_name,
                value: fmtPrice(num(hero.last_value))
              }
            )}
          </p>
        </div>

        <div className={styles.metricGrid}>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>{tr("Participation")}</div>
            <div className={styles.metricValue}>{signedPct(regimeMetrics["positive_ratio"])}</div>
            <div className={styles.metricHint}>{formatNumber(num(regimeMetrics["advancers"]), { maximumFractionDigits: 0 })} {tr("up")} / {formatNumber(num(regimeMetrics["decliners"]), { maximumFractionDigits: 0 })} {tr("down")}. {tr("This shows how broad the move really is.")}</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>{tr("Breadth Return")}</div>
            <div className={styles.metricValue} data-tone={num(regimeMetrics["avg_daily_return"]) > 0 ? "green" : num(regimeMetrics["avg_daily_return"]) < 0 ? "red" : "white"}>{signedPct(regimeMetrics["avg_daily_return"])}</div>
            <div className={styles.metricHint}>{tr("Median")} {signedPct(regimeMetrics["median_daily_return"])}. {tr("This is the average stock, not just the headline index.")}</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>{tr("Turnover")}</div>
            <div className={styles.metricValue}>{formatNumber(num(regimeMetrics["total_turnover_lacs"]), { maximumFractionDigits: 0 })}</div>
            <div className={styles.metricHint}>{formatNumber(num(regimeMetrics["securities_count"]), { maximumFractionDigits: 0 })} {tr("securities")}</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>{tr("Breakouts vs Breakdowns")}</div>
            <div className={styles.metricValue}>{formatNumber(num(regimeMetrics["breakout_count"]), { maximumFractionDigits: 0 })} / {formatNumber(num(regimeMetrics["breakdown_count"]), { maximumFractionDigits: 0 })}</div>
            <div className={styles.metricHint}>{tr("Events")} {formatNumber(num(regimeMetrics["event_count"]), { maximumFractionDigits: 0 })} • {tr("Risk")} {formatNumber(num(regimeMetrics["risk_count"]), { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
      </section>

      <section className={styles.grid2}>
        <div ref={marketStoryRef} data-analytics-section="market_hub_story" className={styles.panel}>
          <h2 className={styles.panelTitle}>{marketStory.title}</h2>
          <p className={styles.sectionIntro}>{marketStory.body}</p>
          <div className={styles.signalGrid}>
            {marketStory.bullets.map((bullet) => (
              <div key={bullet} className={styles.signalItem}>
                <div>
                  <div className={styles.strong}>{tr(marketStory.tone)}</div>
                  <div className={styles.muted}>{tr(bullet)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div ref={routingRef} data-analytics-section="market_hub_routing" className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr(mode === "beginner" ? "Where this page routes you next" : "Routing cards")}</h2>
          <div className={styles.signalGrid}>
            {(mode === "beginner"
              ? [
                  { title: tr("Market Story"), summary_text: tr("Use this next if you need to know whether the current move is broad enough to trust.") },
                  { title: tr("Signals & Heatmaps"), summary_text: tr("Use this next if the tape is clear and you want stock-level strength, weakness, or oscillator extremes.") },
                  { title: tr("Strategy Lab"), summary_text: tr("Use this next if you want historical evidence before moving into the simulator.") }
                ]
              : asArray(summary.data.summary_cards)
            ).map((item, index) => {
              const row = item as Record<string, unknown>;
              const stableKey = [text(row["section_slug"], ""), text(row["title"], ""), text(row["summary_text"], "")]
                .filter(Boolean)
                .join("::");
              return (
                <div key={stableKey || `summary-card-${index}`} className={styles.signalItem}>
                  <div>
                    <div className={styles.strong}>{tr(text(row["title"]))}</div>
                    <div className={styles.muted}>{localizeDynamicMarketText(text(row["summary_text"]), tr, formatNumber)}</div>
                  </div>
                  {mode === "beginner" ? null : (
                    <>
                      <div className={styles.smallStat} data-tone={text(row["accent_token"], "white")}>{fmtDecimal(num(row["summary_value"]))}</div>
                       <div className={styles.pill} data-tone={text(row["accent_token"], "white")}>{tr(text(row["direction"]))}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <section ref={leadersRef} data-analytics-section="market_hub_leaders">
          <DataTable
            title={tr("Leaders Watchlist")}
            subtitle={tr("Leadership names visible in the current tape.")}
            maxHeight={420}
            rows={leaderRows.slice(0, 12) as Array<Record<string, unknown>>}
            columns={[
            {
              key: "symbol",
              header: tr("Symbol"),
              cell: (row: Record<string, unknown>) => (
                <div className={styles.headline}>
                  <Link
                    to={`/analytics/stock/${encodeURIComponent(text(row["symbol"]))}`}
                    className={styles.inlineLink}
                    onClick={() =>
                      void trackTableRowSelected({
                        table_name: "leaders_watchlist",
                        row_type: "symbol",
                        symbol: text(row["symbol"]),
                        source_surface: "market_hub"
                      })
                    }
                  >
                    <strong>{text(row["symbol"])}</strong>
                  </Link>
                  <span className={styles.muted}>{tr(text(row["notes"]))}</span>
                </div>
              )
            },
            {
              key: "return",
              header: tr("Return"),
              align: "right",
              cell: (row: Record<string, unknown>) => (
                <span className={styles.value} data-tone={text(row["accent_token"], "white")}>
                  {signedPct(row["change_pct"])}
                </span>
              )
            },
            {
              key: "score",
              header: tr("Score"),
              align: "right",
              cell: (row: Record<string, unknown>) => fmtDecimal(num(row["signal_score"]))
            },
            {
              key: "tags",
              header: tr("Tags"),
              cell: (row: Record<string, unknown>) => (
                <div className={styles.pillRow}>
                  {asArray(row["tags_json"])
                    .slice(0, 3)
                    .map((tag) => (
                      <span key={String(tag)} className={styles.pill}>
                        {tr(String(tag))}
                      </span>
                    ))}
                </div>
              )
            }
            ]}
          />
        </section>
      </section>

      <section className={styles.grid2}>
        <div ref={leadershipRef} data-analytics-section="market_hub_leadership" className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr(mode === "beginner" ? "Leadership Buckets" : "Theme Buckets")}</h2>
          <div className={styles.signalGrid}>
            {sectorGroups.map((item) => {
              const row = item as Record<string, unknown>;
              return (
                <div key={text(row["sector_name"])} className={styles.signalItem}>
                  <div>
                    <div className={styles.strong}>{tr(text(row["sector_name"]))}</div>
                    <div className={styles.muted}>
                      {tr("Avg score")} {fmtDecimal(
                        asArray(row["items"]).reduce((sum, child) => sum + num((child as Record<string, unknown>)["signal_score"]), 0) /
                          Math.max(asArray(row["items"]).length, 1)
                      )}
                    </div>
                    <div className={styles.pillRow}>
                      {asArray(row["items"]).slice(0, 4).map((child) => {
                        const childRow = child as Record<string, unknown>;
                        return <span key={text(childRow["symbol"])} className={styles.pill} data-tone={text(childRow["accent_token"], "white")}>{text(childRow["arrow"], "•")} {text(childRow["symbol"])}</span>;
                      })}
                    </div>
                  </div>
                  <div className={styles.smallStat}>{formatNumber(asArray(row["items"]).length, { maximumFractionDigits: 0 })} {tr("names")}</div>
                </div>
              );
            })}
          </div>
        </div>

        <section ref={strategyPreviewRef} data-analytics-section="market_hub_strategy_preview">
          <DataTable
            title={tr(mode === "beginner" ? "Strategy Lab Preview" : "Historical Learner")}
            subtitle={tr("Use this preview to decide whether to continue into the learning workspace.")}
            maxHeight={420}
            rows={historicalRows.slice(0, 14) as Array<Record<string, unknown>>}
            columns={[
            {
              key: "signal",
              header: tr("Signal"),
              cell: (row: Record<string, unknown>) => (
                <div className={styles.headline}>
                  <strong>{tr(text(row["title"]))}</strong>
                  <span className={styles.muted}>{tr(text(row["subtitle"]))}</span>
                </div>
              )
            },
            {
              key: "direction",
              header: tr("Direction"),
              cell: (row: Record<string, unknown>) => (
                <span className={styles.value} data-tone={text(row["accent_token"], "white")}>
                  {tr(text(row["direction"]))}
                </span>
              )
            },
            {
              key: "hit",
              header: tr("Hit Rate"),
              align: "right",
              cell: (row: Record<string, unknown>) => signedPct(row["primary_metric"])
            },
            {
              key: "samples",
              header: tr("Samples"),
              align: "right",
              cell: (row: Record<string, unknown>) =>
                row["secondary_metric"] == null ? "—" : formatNumber(num(row["secondary_metric"]), { maximumFractionDigits: 0 })
            }
            ]}
          />
        </section>
      </section>

      <PageIntroAccordion
        label={tr("How to use this page")}
        title={tr(mode === "beginner" ? "Read the headline tape first, then drill into the next workspace." : "Use the summary cards as routing, not as final answers.")}
        body={tr("Use this page as the headline market read. Confirm the broad tape first, then use the sidebar or section tabs to move into the page that matches your next question.")}
        items={[
          tr("Read the market story before you open a stock-specific page."),
          tr("Use the summary cards as routing hints, not as substitute navigation."),
          tr("When breadth and breakout balance disagree, slow down before trusting continuation.")
        ]}
        defaultOpen={mode === "beginner"}
      />

      {mode === "advanced" ? (
        <DataTable
          title={tr("Available Watchlists")}
          subtitle={tr("Full catalog view for the current session. Shared table chrome keeps longer lists readable without breaking the shell.")}
          maxHeight={460}
          rows={watchlists.data.items as Array<Record<string, unknown>>}
          columns={[
            { key: "slug", header: tr("Slug"), cell: (row: Record<string, unknown>) => text(row["slug"]) },
            {
              key: "title",
              header: tr("Watchlist"),
              cell: (row: Record<string, unknown>) => (
                <div className={styles.headline}>
                  <strong>{tr(text(row["title"]))}</strong>
                  <span className={styles.muted}>{tr(text(row["description"]))}</span>
                </div>
              )
            },
            { key: "kind", header: tr("Kind"), cell: (row: Record<string, unknown>) => tr(text(row["watchlist_kind"], "system")) },
            {
              key: "count",
              header: tr("Names"),
              align: "right",
              cell: (row: Record<string, unknown>) =>
                row["latest_count"] == null ? "—" : formatNumber(Number(row["latest_count"]), { maximumFractionDigits: 0 })
            }
          ]}
        />
      ) : null}
    </div>
  );
}
