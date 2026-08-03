import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useWorkspaceEngagement, useWorkspaceSectionViews } from "../analytics/useWorkspaceAnalytics";
import {
  DataTable,
  EmptyState,
  ErrorState,
  InterpretationCard,
  KpiCard,
  LoadingSkeletonCard,
  LoadingTableCard,
  SectionDivider
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { formatDateTime, formatNumber, formatPercent, fmtDecimal, fmtPct } from "../lib/format";
import { trackCtaClick } from "../lib/analytics";
import { useDashboardSection, useWatchlists } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { useI18n } from "../i18n/LocaleProvider";
import type { AnalyticsParams } from "../analytics/types";
import {
  AnalyticsHeader,
  ExplainThis,
  LEARNING_SECTION_TABS,
  num,
  text,
  toneFromNumber,
  useAnalyticsExperienceMode
} from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

type DashboardRow = Record<string, unknown>;

function signedPct(value: unknown) {
  const parsed = num(value);
  if (!Number.isFinite(parsed)) return "—";
  return fmtPct(parsed * 100);
}

function regimeLabel(value: string) {
  const normalized = value.replace(/_/g, " ").trim().toLowerCase();
  if (normalized === "risk off") return "Risk-off";
  if (normalized === "risk on") return "Risk-on";
  if (normalized === "mixed") return "Mixed";
  if (!normalized) return "Mixed";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildEvidenceBarOption(rows: DashboardRow[], tr: (value: string) => string): EChartsOption {
  return {
    grid: { top: 20, right: 18, bottom: 44, left: 140, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; value: number }> : [];
        const row = rows.find((entry) => text(entry.title) === items[0]?.axisValue);
        return [
          items[0]?.axisValue ?? "",
          `${tr("Samples")}: ${formatNumber(num(row?.secondary_metric), { maximumFractionDigits: 0 })}`,
          `${tr("Forward return")}: ${fmtPct(num(row?.primary_metric) * 100)}`
        ].join("<br/>");
      }
    },
    xAxis: {
      type: "value",
      name: tr("Sample Size"),
      axisLabel: { formatter: (value: number) => formatNumber(value, { maximumFractionDigits: 0 }) }
    },
    yAxis: {
      type: "category",
      name: tr("Signal Family"),
      data: rows.map((row) => tr(text(row.title)))
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 20,
        data: rows.map((row) => ({
          value: num(row.secondary_metric),
          itemStyle: {
            color: num(row.primary_metric) >= 0 ? "#3fb950" : "#ff7b72",
            borderRadius: [0, 6, 6, 0]
          }
        })),
        label: {
          show: true,
          position: "right",
          color: "#e6edf3",
          formatter: (params: unknown) => {
            const item = params as { dataIndex: number };
            return fmtPct(num(rows[item.dataIndex]?.primary_metric) * 100);
          }
        }
      }
    ]
  };
}

function buildEvidenceScatterOption(rows: DashboardRow[], tr: (value: string) => string): EChartsOption {
  const maxScore = Math.max(...rows.map((row) => num(row.score)), 1);
  return {
    grid: { top: 24, right: 18, bottom: 52, left: 60, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const item = params as { data?: [number, number, number, string] };
        const data = item?.data ?? [0, 0, 0, ""];
        return [
          data[3],
          `${tr("Samples")}: ${formatNumber(Number(data[0]), { maximumFractionDigits: 0 })}`,
          `${tr("Avg forward return")}: ${fmtPct(Number(data[1]))}`,
          `${tr("Evidence score")}: ${fmtDecimal(Number(data[2]))}`
        ].join("<br/>");
      }
    },
    xAxis: {
      type: "value",
      name: tr("Sample Size"),
      axisLabel: { formatter: (value: number) => formatNumber(value, { maximumFractionDigits: 0 }) }
    },
    yAxis: {
      type: "value",
      name: tr("Average Forward Return %"),
      axisLabel: { formatter: (value: number) => formatPercent(value, 0, false) }
    },
    series: [
      {
        type: "scatter",
        data: rows.map((row, index) => ({
          value: [num(row.secondary_metric), num(row.primary_metric) * 100, num(row.score), tr(text(row.title))],
          symbolSize: 12 + (num(row.score) / maxScore) * 20,
          itemStyle: { color: ["#e3b341", "#3fb950", "#58a6ff", "#ff7b72", "#a371f7"][index % 5], opacity: 0.72 }
        })),
        label: {
          show: true,
          position: "top",
          color: "#e6edf3",
          fontSize: 11,
          formatter: (params: unknown) => {
            const item = params as { data?: { value?: [number, number, number, string] } };
            return item?.data?.value?.[3] ?? "";
          }
        }
      }
    ]
  };
}

export function AnalyticsLearnPage() {
  const { authReady } = useAuthGate();
  const { mode } = useAnalyticsExperienceMode();
  const { tr } = useI18n();
  const learner = useDashboardSection("historical-learner", authReady);
  const regime = useDashboardSection("regime-breadth", authReady);
  const watchlists = useWatchlists(authReady);
  usePageLoadProfile({
    pageName: "analytics_learn",
    enabled: authReady,
    queries: [
      { name: "dashboard-section:historical-learner", isLoading: learner.isLoading, isError: !!learner.error },
      { name: "dashboard-section:regime-breadth", isLoading: regime.isLoading, isError: !!regime.error },
      { name: "watchlists", isLoading: watchlists.isLoading, isError: !!watchlists.error }
    ]
  });
  const loading = !authReady || ((!learner.data || !regime.data || !watchlists.data) && (learner.isLoading || regime.isLoading || watchlists.isLoading));
  useDeferredBusyState(loading);
  const evidenceOverviewRef = useRef<HTMLElement | null>(null);
  const signalMatrixRef = useRef<HTMLElement | null>(null);
  const historyRequirementsRef = useRef<HTMLElement | null>(null);
  const replayLinksRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useMemo(
    () => ({
      evidence_overview: evidenceOverviewRef,
      signal_matrix: signalMatrixRef,
      history_requirements: historyRequirementsRef,
      replay_links: replayLinksRef
    }),
    []
  );
  const engagementExtrasRef = useRef<AnalyticsParams>({});

  const analyticsContext = useMemo(
    () => ({
      page_name: "strategy_lab",
      page_family: "learning",
      section: "lab",
      page_path: "/analytics/learn",
      regime: regimeLabel(text(regime.data?.summary_metrics?.["market_regime"], "mixed"))
    }),
    [regime.data?.summary_metrics]
  );

  useWorkspaceSectionViews(sectionRefs, analyticsContext, "strategy_lab_section_view", authReady && !loading && !!learner.data);
  useWorkspaceEngagement(analyticsContext, "strategy_lab_engagement", authReady && !loading && !!learner.data, {
    extraParams: engagementExtrasRef
  });

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Learning context")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Signal summary")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Best profile")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Sample size")} lines={3} compact />
        </div>
        <div className={styles.grid2}>
          <LoadingTableCard title={tr("Signal performance matrix")} rows={7} />
          <LoadingSkeletonCard title={tr("Event-study summary")} lines={6} />
        </div>
      </div>
    );
  }

  if (learner.error || regime.error || watchlists.error || !learner.data || !regime.data || !watchlists.data) {
    return (
      <ErrorState
        title={tr("The learning workspace is unavailable")}
        body={tr("The historical learner sections could not load. Check the replay and history services, then refresh.")}
      />
    );
  }

  const rows = learner.data.rows.slice(0, 20) as DashboardRow[];
  const availableLists = watchlists.data.items
    .filter((item) => Number((item as DashboardRow).latest_count ?? 0) > 0)
    .slice(0, 12) as DashboardRow[];

  if (!rows.length) {
    return (
      <EmptyState
        title={tr("No learning history is available")}
        body={tr("The strategy learner does not have enough historical rows to summarize yet. Run more history builds or wait for additional sessions.")}
      />
    );
  }

  const largestSample = rows.reduce((best, row) => Math.max(best, num(row.secondary_metric)), 0);
  const currentRegimeLabel = regimeLabel(text(regime.data.summary_metrics["market_regime"], "mixed"));
  const bestForwardRow = rows[0];
  const topForwardRows = rows
    .slice()
    .sort((a, b) => num(b.primary_metric) - num(a.primary_metric))
    .slice(0, 3);
  const bridgeRows = topForwardRows.map((row, index) => ({
    rank: index + 1,
    title: text(row.title),
    subtitle: text(row.subtitle),
    samples: num(row.secondary_metric),
    avgForwardPct: num(row.primary_metric) * 100,
    nextAction:
      index === 0
        ? "Carry into Simulator"
        : index === 1
          ? "Validate in Setups"
          : "Keep on watch"
  }));
  const evidenceRows = rows
    .slice()
    .sort((a, b) => num(b.secondary_metric) - num(a.secondary_metric))
    .slice(0, 5);
  const strongestWatchlist = availableLists[0];
  const evidenceBarOption = buildEvidenceBarOption(evidenceRows, tr);
  const evidenceScatterOption = buildEvidenceScatterOption(evidenceRows, tr);

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr("Learning")}
        meta={`${tr("Trade date")} ${learner.data.trade_date ?? regime.data.trade_date ?? "—"} • ${tr("Refreshed")} ${learner.data.generated_at ? formatDateTime(learner.data.generated_at, { includeTime: true }) : "—"}`}
        subtitle={
          mode === "beginner"
            ? tr("Use history to see which ideas tend to work, not to predict certainty.")
            : tr("Use history to calibrate confidence, sample size, and follow-through.")
        }
        sectionTabs={[...LEARNING_SECTION_TABS]}
        learningPrompt={tr("Read current regime first, then sample size, then the forward-return matrix. Use this page to learn what deserves attention next, not to turn history into certainty.")}
        learningPoints={[
          tr("Sample size matters more than a single attractive historical figure."),
          tr("History is context, not a promise."),
          tr("Bring the lesson back to today by checking whether current watchlists express the same setup family.")
        ]}
      />

      <SectionDivider
        eyebrow={tr("Learning")}
        title={tr("Strategy lab")}
        subtitle={tr("This page should answer one question immediately: which historical signal families are most relevant to today’s tape?")}
      />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("Current regime")} value={tr(currentRegimeLabel)} meta={tr("Use the live regime as the context lens for historical tendencies.")} />
        <KpiCard label={tr("Signal rows")} value={formatNumber(rows.length, { maximumFractionDigits: 0 })} meta={tr("Historical signal summaries currently exposed by the learner.")} />
        <KpiCard
          label={tr("Best forward profile")}
          value={fmtDecimal(num(bestForwardRow?.score))}
          meta={bestForwardRow ? tr(text(bestForwardRow.title)) : tr("No signal available")}
          tone={toneFromNumber(num(bestForwardRow?.score))}
        />
        <KpiCard
          label={tr("Largest sample")}
          value={largestSample ? formatNumber(largestSample, { maximumFractionDigits: 0 }) : "—"}
          meta={tr("Sample size should dominate your confidence more than a flashy return figure.")}
        />
      </section>

      <section ref={evidenceOverviewRef} data-analytics-section="evidence_overview" className={styles.grid2}>
        <div className={styles.chartPanel}>
          <h2 className={styles.panelTitle}>{tr("Most relevant evidence right now")}</h2>
          <p className={styles.sectionIntro}>
            {tr("Start here: large samples first, then forward return, then whether the same family still appears in today’s watchlists.")}
          </p>
          <EChartSurface ariaLabel="Most relevant evidence chart" className={styles.chartSurfaceTall} option={evidenceBarOption} />
        </div>

        <div className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <div className={styles.panelTitle}>{tr("Confidence vs payoff")}</div>
              <div className={styles.chartCaption}>{tr("X-axis is sample size, Y-axis is average forward return, and bubble size reflects the evidence score.")}</div>
            </div>
          </div>
          <EChartSurface ariaLabel="Confidence versus payoff chart" className={styles.chartSurfaceTall} option={evidenceScatterOption} />
        </div>
      </section>

      <section className={styles.summaryGrid}>
        <InterpretationCard
          title={tr("How to use this page")}
          items={[
            tr("Sample size should dominate your confidence more than a flashy forward return."),
            tr("Use the signal matrix to learn which setup families hold up across multiple observations."),
            tr("Bring the lesson back to today by checking whether a current watchlist is actually expressing the same family.")
          ]}
        />
        <ExplainThis
          label={tr("Forward return")}
          summary={tr("Forward return tells you what tended to happen after the signal, not what must happen next time.")}
          detail={tr("Treat it as evidence, not prophecy. Sample size and current market regime matter more than a single attractive historical figure.")}
          takeaway={tr("History improves selection only when you keep uncertainty visible.")}
        />
      </section>

      <section className={styles.matrixGrid}>
        {topForwardRows.map((row) => {
          const sampleSize = num(row.secondary_metric);
          const avgForward = num(row.primary_metric) * 100;
          const width = Math.min(100, Math.max(12, largestSample > 0 ? (sampleSize / largestSample) * 100 : 0));
          return (
            <article key={`${text(row.title)}-${text(row.subtitle)}`} className={styles.matrixCard}>
              <div className={styles.forwardStripHeader}>
                <strong className={styles.strong}>{tr(text(row.title))}</strong>
                <span className={styles.value} data-tone={text(row.accent_token, "white")}>{signedPct(row.primary_metric)}</span>
              </div>
              <div className={styles.muted}>{tr(text(row.subtitle))}</div>
              <div className={styles.miniBarGroup}>
                <div className={styles.miniBarMeta}>
                  <span>{tr("Sample size")}</span>
                  <strong>{formatNumber(sampleSize, { maximumFractionDigits: 0 })}</strong>
                </div>
                <div className={styles.miniBarTrack}>
                  <div className={styles.miniBarFill} data-tone="white" style={{ width: `${width}%` }} />
                </div>
              </div>
              <div className={styles.miniBarMeta}>
                <span>{tr("Average forward read")}</span>
                <strong>{fmtPct(avgForward)}</strong>
              </div>
            </article>
          );
        })}
      </section>

      <section ref={signalMatrixRef} data-analytics-section="signal_matrix" className={styles.grid2}>
        <DataTable
          title={tr("Signal performance matrix")}
          subtitle={tr("Compare signal direction, forward return tendency, and sample size before you give a setup family more trust.")}
          rows={rows}
          columns={[
            {
              key: "signal",
              header: "Signal",
              cell: (row: DashboardRow) => (
                <div className={styles.headline}>
                  <strong>{tr(text(row.title))}</strong>
                  <span className={styles.muted}>{tr(text(row.subtitle))}</span>
                </div>
              )
            },
            {
              key: "direction",
              header: "Direction",
              cell: (row: DashboardRow) => (
                <span className={styles.value} data-tone={text(row.accent_token, "white")}>
                  {tr(text(row.direction))}
                </span>
              )
            },
            {
              key: "forward",
              header: "Forward return",
              align: "right",
              cell: (row: DashboardRow) => signedPct(row.primary_metric)
            },
            {
              key: "samples",
              header: "Samples",
              align: "right",
              cell: (row: DashboardRow) => (row.secondary_metric == null ? "—" : formatNumber(num(row.secondary_metric), { maximumFractionDigits: 0 }))
            }
          ]}
        />

        <DataTable
          title={tr("Current-to-history bridge")}
          subtitle={tr("Translate the strongest historical family into one immediate next action instead of reading history as a vague concept panel.")}
          rows={bridgeRows}
          columns={[
            { key: "rank", header: "#", align: "right", cell: (row) => formatNumber(row.rank, { maximumFractionDigits: 0 }) },
            {
              key: "family",
              header: "Live family",
              cell: (row) => (
                <div className={styles.headline}>
                  <strong>{tr(row.title)}</strong>
                  <span className={styles.muted}>{tr(row.subtitle)}</span>
                </div>
              )
            },
            { key: "samples", header: "Samples", align: "right", cell: (row) => formatNumber(row.samples, { maximumFractionDigits: 0 }) },
            { key: "forward", header: "Avg forward", align: "right", cell: (row) => formatPercent(row.avgForwardPct, 2, true) },
            { key: "next", header: "Next action", cell: (row) => tr(row.nextAction) }
          ]}
          footer={
            <Link
              to="/analytics/simulator"
              className={styles.nextCard}
              onClick={() => {
                engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "open_simulator" };
                void trackCtaClick({
                  ...analyticsContext,
                  cta_name: "open_simulator",
                  page_section: "signal_matrix"
                });
              }}
            >
              <span className={styles.promptLabel}>{tr("Next action")}</span>
              <strong>{tr("Open Simulator")}</strong>
              <span className={styles.muted}>{tr("Carry the most relevant signal family forward into capital-behavior review.")}</span>
            </Link>
          }
        />
      </section>

      <section ref={historyRequirementsRef} data-analytics-section="history_requirements" className={styles.grid2}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("History requirements")}</h2>
          <p className={styles.sectionIntro}>{tr("Use this checklist before you let a historical pattern influence the next decision.")}</p>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Sample size first")}</div>
                <div className={styles.muted}>{tr("Prefer broader evidence over attractive but thin outcomes.")}</div>
              </div>
              <div className={styles.smallStat}>{formatNumber(largestSample, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Re-read through regime")}</div>
                <div className={styles.muted}>{tr("Today’s tape still decides whether a historical family is relevant right now.")}</div>
              </div>
              <div className={styles.smallStat}>{tr(currentRegimeLabel)}</div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Only act when the live tape agrees")}</div>
                <div className={styles.muted}>{tr("If today’s watchlists do not express the same family, keep the read educational rather than actionable.")}</div>
              </div>
              <div className={styles.smallStat}>{formatNumber(availableLists.length, { maximumFractionDigits: 0 })} {tr("live lists")}</div>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("Replay and learning links")}</h2>
          <p className={styles.sectionIntro}>
            {strongestWatchlist
              ? `${tr(text(strongestWatchlist.title))} ${tr("is currently the strongest live bridge back to today’s tape.")}`
              : tr("Use current watchlists only when they still express the same historical family.")}
          </p>
          <div className={styles.nextSteps}>
            {availableLists.slice(0, 4).map((item) => (
              <Link key={text(item.slug)} to="/analytics/setups" className={styles.nextCard}>
                <span className={styles.promptLabel}>{tr(text(item.watchlist_kind, "watchlist"))}</span>
                <strong>{tr(text(item.title))}</strong>
                <span className={styles.muted}>{tr(text(item.description))}</span>
                <span className={styles.muted}>{formatNumber(num(item.latest_count), { maximumFractionDigits: 0 })} {tr("names live now")}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section ref={replayLinksRef} data-analytics-section="replay_links" className={styles.nextSteps}>
        <Link
          to="/analytics/setups"
          className={styles.nextCard}
          onClick={() => {
            engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "return_to_setups" };
            void trackCtaClick({
              ...analyticsContext,
              cta_name: "return_to_setups",
              page_section: "replay_links"
            });
          }}
        >
          <span className={styles.promptLabel}>{tr("Apply the lesson")}</span>
          <strong>{tr("Return to Setups")}</strong>
          <span className={styles.muted}>{tr("Move back into the current tape once you know which signal families deserve more trust.")}</span>
        </Link>
        <Link
          to="/analytics/regime"
          className={styles.nextCard}
          onClick={() => {
            engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "recheck_regime" };
            void trackCtaClick({
              ...analyticsContext,
              cta_name: "recheck_regime",
              page_section: "replay_links"
            });
          }}
        >
          <span className={styles.promptLabel}>{tr("Reset context")}</span>
          <strong>{tr("Recheck Regime")}</strong>
          <span className={styles.muted}>{tr("If the session context changes, historical tendencies should be re-read through the new tape.")}</span>
        </Link>
      </section>
    </div>
  );
}
