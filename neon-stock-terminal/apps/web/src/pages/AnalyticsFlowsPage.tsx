import { Link } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import {
  DataTable,
  DensityBadge,
  EmptyState,
  ErrorState,
  InterpretationCard,
  KpiCard,
  LoadingState,
  SectionDivider
} from "../components/ui/DashboardPrimitives";
import { formatDateTime, formatNumber, fmtDecimal, fmtPct, fmtPrice } from "../lib/format";
import { useDashboardSection, useWatchlist, useWatchlistHistory } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, SIGNAL_SECTION_TABS, num, text, useAnalyticsExperienceMode } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

type DashboardRow = Record<string, unknown>;

function signedPct(value: unknown) {
  const parsed = num(value);
  if (!Number.isFinite(parsed)) return "—";
  return fmtPct(parsed * 100);
}

export function AnalyticsFlowsPage() {
  const { authReady } = useAuthGate();
  const { mode } = useAnalyticsExperienceMode();
  const { tr } = useI18n();
  const section = useDashboardSection("events-flows", authReady);
  const watchlist = useWatchlist("events-flow", authReady);
  const history = useWatchlistHistory("events-flow", 20, authReady);
  usePageLoadProfile({
    pageName: "analytics_flows",
    enabled: authReady,
    queries: [
      { name: "dashboard-section:events-flows", isLoading: section.isLoading, isError: !!section.error },
      { name: "watchlist:events-flow", isLoading: watchlist.isLoading, isError: !!watchlist.error },
      { name: "watchlist-history:events-flow:20", isLoading: history.isLoading, isError: !!history.error }
    ]
  });
  const loading =
    !authReady || ((!section.data || !watchlist.data || !history.data) && (section.isLoading || watchlist.isLoading || history.isLoading));
  const showLoading = useDeferredBusyState(loading);

  if (loading) {
    if (!showLoading) return null;
    return (
      <LoadingState
        title={tr("Loading signals archive")}
        body={tr("The current archive, live watchlist, and recent history are loading.")}
      />
    );
  }

  if (section.error || watchlist.error || history.error || !section.data || !watchlist.data || !history.data) {
    return (
      <ErrorState
        title={tr("The signals archive is unavailable")}
        body={tr("The signals archive could not load. Refresh and try again.")}
      />
    );
  }

  const archiveRows = section.data.rows.slice(0, 20) as DashboardRow[];
  const watchRows = watchlist.data.rows.slice(0, 20) as DashboardRow[];
  const historyRows = history.data.rows.slice(0, 30) as DashboardRow[];

  if (!archiveRows.length && !watchRows.length && !historyRows.length) {
    return (
      <EmptyState
        title={tr("No archived signal entries are available")}
        body={tr("There are no archived signal entries to show right now. Check back after the next session.")}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr("Signals Archive")}
        meta={`${tr("Trade date")} ${section.data.trade_date} • ${tr("Refreshed")} ${section.data.generated_at ? formatDateTime(section.data.generated_at, { includeTime: true }) : "—"}`}
        subtitle={tr("Review recent signal history and compare it with the live watchlist in one place.")}
        sectionTabs={[...SIGNAL_SECTION_TABS]}
        learningPrompt={tr("Use this page after the main signals view when you want a deeper historical read of the same signal families.")}
        learningPoints={[
          tr("Start with the guided signals view, then use this page for the fuller historical list."),
          tr("Compare the live watchlist with recent history instead of reading either list in isolation."),
          tr("Advanced mode keeps more rows visible so you can review detail faster.")
        ]}
      />

      <SectionDivider
        eyebrow="Signals"
        title={tr("Use the archive after the guided review")}
        subtitle={tr("This page keeps the fuller signal history available once you already understand the main signal story.")}
      />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("Archive rows")} value={formatNumber(archiveRows.length, { maximumFractionDigits: 0 })} meta={tr("Recent archived signal entries.")} />
        <KpiCard label={tr("Live watchlist")} value={formatNumber(watchRows.length, { maximumFractionDigits: 0 })} meta={tr("Current names still expressing the flow family.")} />
        <KpiCard label={tr("History rows")} value={formatNumber(historyRows.length, { maximumFractionDigits: 0 })} meta={tr("Recent archived watchlist entries for comparison.")} />
        <KpiCard label={tr("Mode")} value={mode === "advanced" ? tr("Advanced") : tr("Beginner")} meta={tr("Use this page after the main Signals page when you need more detail.")} />
      </section>

      <section className={styles.summaryGrid}>
        <DensityBadge
          label={tr("Dense view")}
          detail={tr("This view keeps more rows visible and less guidance on screen, so it works best once you already know the signal context.")}
        />
        <InterpretationCard
          title={tr("What this archive is for")}
          items={[
            tr("Review older event-flow names without mixing them into the beginner-first signal page."),
            tr("Compare the live watchlist with recent history to see whether the current tape is repeating or drifting."),
            tr("Use this page as a reference surface, not as the first page you open.")
          ]}
        />
      </section>

      <section className={styles.grid2}>
        <DataTable
          title={section.data.title}
          subtitle={tr("Archive-first view of the event and flow layer.")}
          maxHeight={440}
          rows={archiveRows}
          columns={[
            {
              key: "symbol",
              header: tr("Symbol"),
              cell: (row: DashboardRow) => (
                <div className={styles.headline}>
                  <strong>{text(row["symbol"], text(row["title"]))}</strong>
                  <span className={styles.muted}>{text(row["subtitle"])}</span>
                </div>
              )
            },
            {
              key: "direction",
              header: tr("Direction"),
              cell: (row: DashboardRow) => <span className={styles.value} data-tone={text(row["accent_token"], "white")}>{text(row["direction"])}</span>
            },
            {
              key: "score",
              header: tr("Score"),
              align: "right",
              cell: (row: DashboardRow) => (row["score"] == null ? "—" : fmtDecimal(num(row["score"]), 2))
            },
            {
              key: "notes",
              header: tr("Notes"),
              cell: (row: DashboardRow) => text(row["notes"])
            }
          ]}
        />

        <DataTable
          title={tr("Events & flow watchlist")}
          subtitle={tr("Live names still expressing the flow family.")}
          maxHeight={440}
          rows={watchRows}
          columns={[
            {
              key: "symbol",
              header: tr("Symbol"),
              cell: (row: DashboardRow) => (
                <div className={styles.headline}>
                  <strong>{text(row["symbol"])}</strong>
                  <span className={styles.muted}>{text(row["notes"])}</span>
                </div>
              )
            },
            {
              key: "return",
              header: tr("Return"),
              align: "right",
              cell: (row: DashboardRow) => <span className={styles.value} data-tone={text(row["accent_token"], "white")}>{signedPct(row["change_pct"])}</span>
            },
            {
              key: "score",
              header: tr("Score"),
              align: "right",
              cell: (row: DashboardRow) => (row["signal_score"] == null ? "—" : fmtDecimal(num(row["signal_score"]), 2))
            },
            {
              key: "tags",
              header: tr("Tags"),
              cell: (row: DashboardRow) => {
                const tags = Array.isArray(row["tags_json"]) ? row["tags_json"] : [];
                return <div className={styles.pillRow}>{tags.slice(0, 3).map((tag) => <span key={String(tag)} className={styles.pill}>{String(tag)}</span>)}</div>;
              }
            }
          ]}
        />
      </section>

      <DataTable
        title={tr("Recent watchlist history")}
        subtitle={tr("Use this to compare the live archive with what recently appeared in the same family.")}
        maxHeight={460}
        rows={historyRows}
        columns={[
          { key: "date", header: tr("Date"), cell: (row: DashboardRow) => text(row["trade_date"]) },
          { key: "symbol", header: tr("Symbol"), cell: (row: DashboardRow) => text(row["symbol"]) },
          {
            key: "return",
            header: tr("Return"),
            align: "right",
            cell: (row: DashboardRow) => <span className={styles.value} data-tone={text(row["accent_token"], "white")}>{signedPct(row["change_pct"])}</span>
          },
          {
            key: "close",
            header: tr("Close"),
            align: "right",
            cell: (row: DashboardRow) => (row["close_price"] == null ? "—" : fmtPrice(num(row["close_price"])))
          },
          {
            key: "score",
            header: tr("Score"),
            align: "right",
            cell: (row: DashboardRow) => (row["signal_score"] == null ? "—" : fmtDecimal(num(row["signal_score"]), 2))
          }
        ]}
      />

      {mode === "advanced" ? null : (
        <section className={styles.nextSteps}>
          <Link to="/analytics/risk" className={styles.nextCard}>
            <span className={styles.promptLabel}>{tr("Back to guided view")}</span>
            <strong>{tr("Return to Signals")}</strong>
            <span className={styles.muted}>{tr("Go back if you want the interpretation-first anomaly and caution review.")}</span>
          </Link>
        </section>
      )}
    </div>
  );
}
