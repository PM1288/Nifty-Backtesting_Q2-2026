import { Link } from "react-router-dom";
import { trackTableRowSelected } from "../analytics/events";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { DataState, DataTable, LoadingSkeletonCard, PageIntroAccordion } from "../components/ui/DashboardPrimitives";
import { useI18n } from "../i18n/LocaleProvider";
import { fmtDecimal, fmtPct, fmtPrice, formatDateTime, formatNumber } from "../lib/format";
import { useDashboardSection, useWatchlist } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import {
  AnalyticsHeader,
  SIGNAL_SECTION_TABS,
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

function WatchlistBlock({
  slug,
  title
}: {
  slug: string;
  title: string;
}) {
  const { tr } = useI18n();
  const watchlist = useWatchlist(slug, true);

  if (watchlist.isLoading) return <LoadingSkeletonCard title={title} lines={5} compact />;
  if (watchlist.error || !watchlist.data) return <div className={styles.panel}>{tr("Failed to load")} {title.toLowerCase()}.</div>;

  const rows = watchlist.data.rows.slice(0, 7) as Array<Record<string, unknown>>;

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>{title}</h2>
      {rows.length ? (
        <div className={styles.flowGrid}>
          {rows.map((row) => (
            <Link
              key={text(row.symbol)}
              to={`/analytics/stock/${encodeURIComponent(text(row.symbol))}`}
              className={styles.flowRow}
              onClick={() =>
                void trackTableRowSelected({
                  table_name: slug,
                  row_type: "symbol",
                  symbol: text(row.symbol),
                  source_surface: "signals_watchlist"
                })
              }
            >
              <div className={styles.headline}>
                <strong>{text(row.symbol)}</strong>
                <span className={styles.muted}>{text(row.notes)}</span>
              </div>
              <div className={styles.value} data-tone={text(row.accent_token, "white")}>
                {signedPct(row.change_pct)}
              </div>
              <div className={styles.smallStat}>{fmtPrice(num(row.close_price))}</div>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>{tr("No names qualified today. That is a valid outcome and usually means the filter is protecting you from weak setups.")}</div>
      )}
    </div>
  );
}

export function AnalyticsRiskPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const { mode } = useAnalyticsExperienceMode();
  const flows = useDashboardSection("events-flows", authReady);
  const risk = useDashboardSection("anomalies-risk", authReady);
  usePageLoadProfile({
    pageName: "analytics_risk",
    enabled: authReady,
    queries: [
      { name: "dashboard-section:events-flows", isLoading: flows.isLoading, isError: !!flows.error },
      { name: "dashboard-section:anomalies-risk", isLoading: risk.isLoading, isError: !!risk.error }
    ]
  });
  const loading = !authReady || ((!flows.data || !risk.data) && (flows.isLoading || risk.isLoading));
  const showLoading = useDeferredBusyState(loading);

  if (loading) {
    if (!showLoading) return null;
    return (
      <DataState
        kind="loading"
        title={tr("Loading the signal review")}
        body={tr("The anomaly, event, and caution layers are being prepared for review.")}
      />
    );
  }

  if (flows.error || risk.error || !flows.data || !risk.data) {
    return (
      <DataState
        kind="error"
        title={tr("The signal review is unavailable")}
        body={tr("The anomaly and event layers could not load. Check the risk feeds and try again.")}
      />
    );
  }

  const flowRows = flows.data.rows.slice(0, 12) as Array<Record<string, unknown>>;
  const riskRows = risk.data.rows.slice(0, 12) as Array<Record<string, unknown>>;

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr(mode === "beginner" ? "Anomalies" : "Signals / Anomalies")}
        meta={`${tr("Trade date")} ${risk.data.trade_date} • ${tr("Refreshed")} ${risk.data.generated_at ? formatDateTime(risk.data.generated_at, { includeTime: true }) : "—"}`}
        subtitle={
          mode === "beginner"
            ? tr("Spot unusual moves, news-like reactions, and warning signs before you trust a stock move.")
            : tr("Decide whether the tape deserves trust, a fade, or a stand-down.")
        }
        sectionTabs={[...SIGNAL_SECTION_TABS]}
      />

      <section className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Event Load")}</div>
          <div className={styles.metricValue} data-tone={flows.data.accent_token}>
            {formatNumber(num(flows.data.summary_metrics["item_count"]), { maximumFractionDigits: 0 })}
          </div>
          <div className={styles.metricHint}>{tr("Announcements, actions, and flow-driven names.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Risk Load")}</div>
          <div className={styles.metricValue} data-tone={risk.data.accent_token}>
            {formatNumber(num(risk.data.summary_metrics["item_count"]), { maximumFractionDigits: 0 })}
          </div>
          <div className={styles.metricHint}>{tr("Anomalies, caution overlays, and other tape distortion signals.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Flow Strength")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(num(flows.data.summary_metrics["avg_signal_score"]))}>
            {fmtDecimal(num(flows.data.summary_metrics["avg_signal_score"]))}
          </div>
          <div className={styles.metricHint}>{tr("Average importance of the current events-and-flow bucket.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Risk Strength")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(-num(risk.data.summary_metrics["avg_signal_score"]))}>
            {fmtDecimal(num(risk.data.summary_metrics["avg_signal_score"]))}
          </div>
          <div className={styles.metricHint}>{tr("Higher scores here mean more reasons to slow down and inspect the tape.")}</div>
        </div>
      </section>

      <section className={styles.grid2}>
        <DataTable
          title={tr("Events & Flows")}
          subtitle={tr("Names with active event pressure or flow distortion.")}
          rows={flowRows}
          maxHeight={420}
          columns={[
            {
              key: "symbol",
              header: tr("Symbol"),
              cell: (row: Record<string, unknown>) => (
                <div className={styles.headline}>
                  <strong>{text(row.symbol, text(row.title))}</strong>
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
              cell: (row: Record<string, unknown>) => fmtDecimal(num(row.score))
            },
            {
              key: "notes",
              header: tr("Reading"),
              cell: (row: Record<string, unknown>) => text(row.notes)
            }
          ]}
        />

        <DataTable
          title={tr("Anomalies & Risk")}
          subtitle={tr("Names where caution overlays are strong enough to question the raw move.")}
          rows={riskRows}
          maxHeight={420}
          columns={[
            {
              key: "symbol",
              header: tr("Symbol"),
              cell: (row: Record<string, unknown>) => (
                <div className={styles.headline}>
                  <strong>{text(row.symbol, text(row.title))}</strong>
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
              cell: (row: Record<string, unknown>) => fmtDecimal(num(row.score))
            },
            {
              key: "notes",
              header: tr("Reading"),
              cell: (row: Record<string, unknown>) => text(row.notes)
            }
          ]}
        />
      </section>

      <section className={styles.grid3}>
        <WatchlistBlock slug="events-flow" title={tr("Events & Flow Watchlist")} />
        <WatchlistBlock slug="anomalies" title={tr("Anomaly Watchlist")} />
        <WatchlistBlock slug="risk-caution" title={tr("Risk & Caution Watchlist")} />
      </section>

      <section className={styles.guidanceGrid}>
        <article className={styles.guideCard}>
          <span className={styles.guideStep}>1</span>
          <h2 className={styles.guideTitle}>{tr("Events create motion, not always durable direction.")}</h2>
          <p className={styles.guideText}>{tr("A headline can explain the move without validating it. Look for confirmation in delivery, breadth, and follow-through.")}</p>
        </article>
        <article className={styles.guideCard}>
          <span className={styles.guideStep}>2</span>
          <h2 className={styles.guideTitle}>{tr("Anomalies are a warning to ask a second question.")}</h2>
          <p className={styles.guideText}>{tr("A strong move with anomaly pressure is not an automatic short. It means the move needs stronger proof before you trust it.")}</p>
        </article>
        <article className={styles.guideCard}>
          <span className={styles.guideStep}>3</span>
          <h2 className={styles.guideTitle}>{tr("Use the watchlists as filters, not instructions.")}</h2>
          <p className={styles.guideText}>{tr("These lists tell you where to inspect first. They do not replace the setup and regime pages.")}</p>
        </article>
      </section>

      <PageIntroAccordion
        label={tr("How to use this page")}
        title={tr(mode === "beginner" ? "Read caution load first, then inspect the tables and watchlists." : "Use this as a trust filter, not a signal generator.")}
        body={
          mode === "beginner"
            ? tr("If both event and anomaly pressure are high, slow down before acting.")
            : tr("If both event and anomaly pressure are high, reduce confidence in raw momentum.")
        }
        items={[
          tr("Events explain motion, but they do not guarantee durable follow-through."),
          tr("Anomaly load is a cue to slow down and verify, not an automatic fade signal."),
          tr("Use the RSI and WILLR tabs as context layers after you review this caution surface.")
        ]}
        defaultOpen={mode === "beginner"}
      />

      <section className={styles.nextSteps}>
        <Link to="/analytics/setups" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Go back one step")}</span>
          <strong>{tr("Return to Setups")}</strong>
          <span className={styles.muted}>{tr("Use this if risk looks contained and you want to select cleaner names.")}</span>
        </Link>
        <Link to="/analytics/learn" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Research path")}</span>
          <strong>{tr("Open Learn")}</strong>
          <span className={styles.muted}>{tr("Use this to see which signal families historically followed through and which ones degraded.")}</span>
        </Link>
      </section>
    </div>
  );
}
