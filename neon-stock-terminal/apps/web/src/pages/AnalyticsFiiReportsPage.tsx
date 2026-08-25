import { useEffect, useMemo, useState } from "react";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import {
  ButtonButton,
  ChartCard,
  DataState,
  DataTable,
  KpiCard,
  LoadingSkeletonCard
} from "../components/ui/DashboardPrimitives";
import { formatDateIST, formatNumber } from "../lib/format";
import { useFiiReportsRunDetail, useFiiReportsRuns } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import type { FiiReportsRunDetailResponse, FiiRunKind, FiiRunSummary } from "../lib/types";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, INSTITUTIONAL_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsFiiReportsPage.module.css";

type SelectedRun = {
  kind: FiiRunKind;
  runId: string;
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  return value.includes("T") ? formatDateIST(value, { includeTime: true }) : value;
}

function labelForRun(run: FiiRunSummary) {
  if (run.kind === "daily") {
    return run.trade_date ?? run.run_id;
  }
  return `${run.start_date ?? run.run_id} → ${run.end_date ?? ""}`.trim();
}

function firstAvailableRun(dailyRuns: FiiRunSummary[], backfillRuns: FiiRunSummary[]): SelectedRun | null {
  const candidate = backfillRuns[0] ?? dailyRuns[0];
  if (!candidate) return null;
  return {
    kind: candidate.kind,
    runId: candidate.run_id
  };
}

function summarizeDetail(detail: FiiReportsRunDetailResponse | undefined | null) {
  if (!detail) return null;
  const summary = detail.summary as Record<string, unknown> | undefined;
  const reportRows = detail.report_rows ?? [];
  const manifestRows = detail.manifest_rows ?? [];
  const missingRows = detail.missing_rows ?? [];
  return {
    manifestCount: detail.kind === "daily" ? reportRows.length : manifestRows.length,
    missingCount: missingRows.length,
    reportsDownloaded:
      typeof summary?.reports_downloaded === "number"
        ? summary.reports_downloaded
        : detail.run.reports_downloaded ?? reportRows.length,
    datesTouched:
      typeof summary?.dates_touched === "number"
        ? summary.dates_touched
        : detail.run.dates_touched ?? null
  };
}

export function AnalyticsFiiReportsPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const runsQuery = useFiiReportsRuns(authReady);
  const [selectedRun, setSelectedRun] = useState<SelectedRun | null>(null);

  useEffect(() => {
    if (!runsQuery.data) return;
    const nextSelection = firstAvailableRun(runsQuery.data.daily_runs, runsQuery.data.backfill_runs);
    if (!nextSelection) return;
    setSelectedRun((current) => current ?? nextSelection);
  }, [runsQuery.data]);

  const detailQuery = useFiiReportsRunDetail(
    selectedRun?.kind ?? "backfill",
    selectedRun?.runId ?? "",
    authReady && !!selectedRun
  );

  usePageLoadProfile({
    pageName: "analytics_fii_reports",
    enabled: authReady,
    queries: [
      { name: "fii-reports-runs", isLoading: runsQuery.isLoading, isError: !!runsQuery.error },
      { name: "fii-reports-detail", isLoading: detailQuery.isLoading, isError: !!detailQuery.error }
    ]
  });

  const loading = !authReady || (!runsQuery.data && runsQuery.isLoading);
  const showLoading = useDeferredBusyState(loading);

  const latestBackfill = runsQuery.data?.backfill_runs[0] ?? null;
  const latestDaily = runsQuery.data?.daily_runs[0] ?? null;
  const hasRuns = Boolean(latestBackfill || latestDaily);
  const detailSummary = summarizeDetail(detailQuery.data);
  const detailRun = detailQuery.data?.run;

  const manifestRows = useMemo(() => {
    if (!detailQuery.data) return [];
    if (detailQuery.data.kind === "daily") {
      return detailQuery.data.report_rows ?? [];
    }
    return detailQuery.data.manifest_rows ?? [];
  }, [detailQuery.data]);

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Latest backfill")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Latest daily pull")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Manifest rows")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Missing rows")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("Run browser")} lines={10} />
      </div>
    );
  }

  if (runsQuery.error || !runsQuery.data) {
    return (
      <DataState
        kind="error"
        title={tr("FII reports are unavailable")}
        body={tr("The dashboard could not read the FII reports service run catalog from the main platform API.")}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title="FII Reports"
        meta={`${tr("Output root")} ${runsQuery.data.output_dir}`}
        subtitle={tr("Browse the live FII service runs, inspect what was downloaded, and confirm missing archive dates before any downstream processing is added.")}
        learningPrompt={tr("This page is file-backed. It shows what the service downloaded and parsed, not a Postgres projection.")}
        sectionTabs={[...INSTITUTIONAL_SECTION_TABS]}
      />

      <section className={styles.metricGrid}>
        <KpiCard
          label={tr("Latest backfill")}
          value={latestBackfill ? labelForRun(latestBackfill) : "—"}
          meta={latestBackfill ? `${tr("Generated")} ${formatTimestamp(latestBackfill.generated_at)}` : tr("No backfill has been recorded yet.")}
        />
        <KpiCard
          label={tr("Latest daily pull")}
          value={latestDaily ? labelForRun(latestDaily) : "—"}
          meta={latestDaily ? `${tr("Reports")} ${formatNumber(latestDaily.report_count ?? 0, { maximumFractionDigits: 0 })}` : tr("No daily pull has been recorded yet.")}
        />
        <KpiCard
          label={tr("Manifest rows")}
          value={formatNumber(detailSummary?.manifestCount ?? 0, { maximumFractionDigits: 0 })}
          meta={tr("Rows visible in the selected run detail. For daily pulls, this is one row per report type.")}
        />
        <KpiCard
          label={tr("Missing rows")}
          value={formatNumber(detailSummary?.missingCount ?? 0, { maximumFractionDigits: 0 })}
          meta={tr("Backfill-only gaps captured in missing.csv for the selected run.")}
        />
      </section>

      <ChartCard
        title={tr("Run browser")}
        subtitle={tr("Choose a run to inspect its manifest, file paths, and missing archive entries without leaving the dashboard.")}
        footer={
          detailRun ? (
            <div className={styles.pathGrid}>
              <span><strong>{tr("Output")}: </strong><code>{detailRun.output_dir}</code></span>
              <span><strong>{tr("Manifest")}: </strong><code>{detailRun.manifest_path}</code></span>
              {detailRun.summary_path ? <span><strong>{tr("Summary")}: </strong><code>{detailRun.summary_path}</code></span> : null}
              {detailRun.missing_path ? <span><strong>{tr("Missing")}: </strong><code>{detailRun.missing_path}</code></span> : null}
            </div>
          ) : null
        }
      >
        <div className={styles.browserLayout}>
          <section className={styles.runRail}>
            <h3>{tr("Backfills")}</h3>
            <div className={styles.runButtonGroup}>
              {runsQuery.data.backfill_runs.map((run) => (
                <ButtonButton
                  key={`backfill-${run.run_id}`}
                  size="s"
                  variant={selectedRun?.kind === run.kind && selectedRun.runId === run.run_id ? "primary" : "secondary"}
                  onClick={() => setSelectedRun({ kind: run.kind, runId: run.run_id })}
                >
                  {labelForRun(run)}
                </ButtonButton>
              ))}
            </div>
            <h3>{tr("Daily pulls")}</h3>
            <div className={styles.runButtonGroup}>
              {runsQuery.data.daily_runs.map((run) => (
                <ButtonButton
                  key={`daily-${run.run_id}`}
                  size="s"
                  variant={selectedRun?.kind === run.kind && selectedRun.runId === run.run_id ? "primary" : "secondary"}
                  onClick={() => setSelectedRun({ kind: run.kind, runId: run.run_id })}
                >
                  {labelForRun(run)}
                </ButtonButton>
              ))}
            </div>
          </section>

          <section className={styles.detailRail}>
            {!hasRuns ? (
              <DataState
                kind="empty"
                title={tr("No report runs are available")}
                body={tr("The FII reports service is healthy, but it has not recorded a daily pull or historical backfill yet.")}
              />
            ) : detailQuery.isLoading && !detailQuery.data ? (
              <LoadingSkeletonCard title={tr("Run detail")} lines={6} />
            ) : detailQuery.error || !detailQuery.data ? (
              <DataState
                kind="error"
                title={tr("Run detail is unavailable")}
                body={tr("The selected run could not be read from the FII reports service.")}
              />
            ) : (
              <div className={styles.detailPanel}>
                <div className={styles.detailHeader}>
                  <div>
                    <h3>{labelForRun(detailQuery.data.run)}</h3>
                    <p>{detailQuery.data.kind === "backfill" ? tr("Historical backfill window") : tr("Latest daily archive pull")}</p>
                  </div>
                  <div className={styles.detailStats}>
                    <span>{tr("Generated")}: {formatTimestamp(detailQuery.data.run.generated_at)}</span>
                    {detailSummary?.reportsDownloaded != null ? (
                      <span>{tr("Downloaded")}: {formatNumber(detailSummary.reportsDownloaded, { maximumFractionDigits: 0 })}</span>
                    ) : null}
                    {detailSummary?.datesTouched != null ? (
                      <span>{tr("Dates touched")}: {formatNumber(detailSummary.datesTouched, { maximumFractionDigits: 0 })}</span>
                    ) : null}
                  </div>
                </div>

                {detailQuery.data.kind === "daily" ? (
                  <div className={styles.caption}>
                    {tr("Daily pulls store one manifest.json with one entry per report type. Use this to confirm raw and parsed file paths for the most recent trade date.")}
                  </div>
                ) : (
                  <div className={styles.caption}>
                    {tr("Backfills are written by trading date. manifest.csv shows downloaded artifacts, while missing.csv captures archive gaps so you can distinguish missing source data from service failures.")}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </ChartCard>

      <DataTable
        title={detailQuery.data?.kind === "daily" ? tr("Downloaded reports") : tr("Manifest rows")}
        subtitle={
          detailQuery.data?.kind === "daily"
            ? tr("One row per report type in the selected daily pull.")
            : tr("Downloaded archive entries recorded in manifest.csv for the selected backfill.")
        }
        tableName="fii_reports_manifest"
        rows={manifestRows}
        maxHeight={460}
        columns={
          detailQuery.data?.kind === "daily"
            ? [
                {
                  key: "report_key",
                  header: tr("Report"),
                  sortable: true,
                  sortValue: (row: Record<string, unknown>) => String(row.report_key ?? ""),
                  cell: (row: Record<string, unknown>) => <strong>{String(row.report_key ?? "—")}</strong>
                },
                {
                  key: "row_count",
                  header: tr("Rows"),
                  sortable: true,
                  sortValue: (row: Record<string, unknown>) => Number(row.row_count ?? 0),
                  cell: (row: Record<string, unknown>) => formatNumber(Number(row.row_count ?? 0), { maximumFractionDigits: 0 })
                },
                {
                  key: "raw_path",
                  header: tr("Raw path"),
                  cell: (row: Record<string, unknown>) => <code className={styles.codeCell}>{String(row.raw_path ?? "—")}</code>
                },
                {
                  key: "parsed_path",
                  header: tr("Parsed path"),
                  cell: (row: Record<string, unknown>) => <code className={styles.codeCell}>{String(row.parsed_path ?? "—")}</code>
                }
              ]
            : [
                {
                  key: "trade_date",
                  header: tr("Trade date"),
                  sortable: true,
                  sortValue: (row: Record<string, unknown>) => String(row.trade_date ?? ""),
                  cell: (row: Record<string, unknown>) => <strong>{String(row.trade_date ?? "—")}</strong>
                },
                {
                  key: "report_key",
                  header: tr("Report"),
                  sortable: true,
                  sortValue: (row: Record<string, unknown>) => String(row.report_key ?? ""),
                  cell: (row: Record<string, unknown>) => String(row.report_key ?? "—")
                },
                {
                  key: "row_count",
                  header: tr("Rows"),
                  sortable: true,
                  sortValue: (row: Record<string, unknown>) => Number(row.row_count ?? 0),
                  cell: (row: Record<string, unknown>) => formatNumber(Number(row.row_count ?? 0), { maximumFractionDigits: 0 })
                },
                {
                  key: "raw_path",
                  header: tr("Raw path"),
                  cell: (row: Record<string, unknown>) => <code className={styles.codeCell}>{String(row.raw_path ?? "—")}</code>
                }
              ]
        }
      />

      {detailQuery.data?.kind === "backfill" ? (
        <DataTable
          title={tr("Missing archive entries")}
          subtitle={tr("Rows from missing.csv. These are dates where a specific report was not present in the NSE archive for the selected backfill window.")}
          tableName="fii_reports_missing"
          rows={detailQuery.data.missing_rows ?? []}
          maxHeight={320}
          columns={[
            {
              key: "trade_date",
              header: tr("Trade date"),
              sortable: true,
              sortValue: (row: Record<string, unknown>) => String(row.trade_date ?? ""),
              cell: (row: Record<string, unknown>) => <strong>{String(row.trade_date ?? "—")}</strong>
            },
            {
              key: "report_key",
              header: tr("Report"),
              sortable: true,
              sortValue: (row: Record<string, unknown>) => String(row.report_key ?? ""),
              cell: (row: Record<string, unknown>) => String(row.report_key ?? "—")
            },
            {
              key: "error",
              header: tr("Reason"),
              cell: (row: Record<string, unknown>) => String(row.error ?? "—")
            }
          ]}
        />
      ) : null}
    </div>
  );
}
