import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import {
  ButtonButton,
  ChartCard,
  DataState,
  DataTable,
  KpiCard,
  LoadingSkeletonCard,
  PageIntroAccordion,
  SymbolPill
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { formatDateIST, formatNumber } from "../lib/format";
import { useAnalyticsEvents } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import type { AnalyticsCalendarEventRow, AnalyticsEventsResponse } from "../lib/types";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, CATALYSTS_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsEventsPage.module.css";

type DailyBucket = {
  date: string;
  count: number;
  rows: AnalyticsCalendarEventRow[];
};

function formatEventDate(value: string | null | undefined) {
  if (!value) return "—";
  return formatDateIST(value);
}

function buildCalendarOption(
  payload: AnalyticsEventsResponse,
  buckets: DailyBucket[],
  tr: (value: string) => string
): EChartsOption {
  const startDate = buckets[0]?.date ?? payload.summary.dateRange.start ?? new Date().toISOString().slice(0, 10);
  const endDate = buckets.at(-1)?.date ?? payload.summary.dateRange.end ?? startDate;
  const detailsByDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return {
    tooltip: {
      formatter: (params: unknown) => {
        const value = params && typeof params === "object" && "value" in params
          ? (params as { value?: unknown }).value
          : undefined;
        const rawDate = Array.isArray(value) ? String(value[0] ?? "") : "";
        const bucket = detailsByDate.get(rawDate);
        if (!bucket) return `${formatEventDate(rawDate)}<br/>${tr("No events")}`;
        const preview = bucket.rows
          .slice(0, 3)
          .map((row) => `${row.symbol}: ${row.purpose ?? tr("Scheduled event")}`)
          .join("<br/>");
        const remainder = bucket.rows.length > 3 ? `<br/>+${bucket.rows.length - 3} ${tr("more")}` : "";
        return `${formatEventDate(rawDate)}<br/>${bucket.count} ${tr("events")}<br/>${preview}${remainder}`;
      }
    },
    visualMap: {
      min: 0,
      max: maxCount,
      orient: "horizontal",
      left: "center",
      bottom: 8,
      text: [tr("Busy"), tr("Quiet")],
      inRange: {
        color: ["#1a1d24", "#6d5127", "#d4af37"]
      }
    },
    calendar: {
      range: [startDate, endDate],
      splitLine: {
        show: false
      },
      itemStyle: {
        borderColor: "rgba(255,255,255,0.05)",
        borderWidth: 1
      },
      yearLabel: {
        show: true
      }
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: buckets.map((bucket) => [bucket.date, bucket.count])
      }
    ]
  };
}

export function AnalyticsEventsPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const eventsQuery = useAnalyticsEvents(authReady);

  usePageLoadProfile({
    pageName: "analytics_events",
    enabled: authReady,
    queries: [{ name: "analytics-events", isLoading: eventsQuery.isLoading, isError: !!eventsQuery.error }]
  });

  const loading = !authReady || (!eventsQuery.data && eventsQuery.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const [symbolFilter, setSymbolFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPayload = useMemo(() => {
    const payload = eventsQuery.data;
    if (!payload) return null;
    const query = searchQuery.trim().toLowerCase();
    const filteredEvents = payload.events.filter((row) => {
      const matchesSymbol = symbolFilter === "all" || row.symbol === symbolFilter;
      const matchesQuery =
        !query ||
        row.symbol.toLowerCase().includes(query) ||
        row.companyName?.toLowerCase().includes(query) ||
        row.purpose?.toLowerCase().includes(query) ||
        row.details?.toLowerCase().includes(query);
      return matchesSymbol && matchesQuery;
    });

    const bucketMap = new Map<string, DailyBucket>();
    for (const row of filteredEvents) {
      if (!row.eventDate) continue;
      const existing = bucketMap.get(row.eventDate);
      if (existing) {
        existing.count += 1;
        existing.rows.push(row);
        continue;
      }
      bucketMap.set(row.eventDate, {
        date: row.eventDate,
        count: 1,
        rows: [row]
      });
    }

    const buckets = [...bucketMap.values()].sort((left, right) => left.date.localeCompare(right.date));
    const uniqueSymbols = new Set(filteredEvents.map((row) => row.symbol));
    const upcomingEvents = filteredEvents.filter((row) => row.eventDate && row.eventDate >= new Date().toISOString().slice(0, 10)).length;
    const attachmentCount = filteredEvents.reduce((total, row) => total + (row.attachment ? 1 : 0), 0);
    const busiestDay = buckets.reduce<{ date: string | null; count: number }>(
      (current, bucket) => (bucket.count > current.count ? { date: bucket.date, count: bucket.count } : current),
      { date: null, count: 0 }
    );

    return {
      payload,
      filteredEvents,
      buckets,
      summary: {
        totalEvents: filteredEvents.length,
        uniqueSymbols: uniqueSymbols.size,
        upcomingEvents,
        attachmentCount,
        busiestDay
      }
    };
  }, [eventsQuery.data, searchQuery, symbolFilter]);

  const chartOption = useMemo(
    () =>
      filteredPayload
        ? buildCalendarOption(filteredPayload.payload, filteredPayload.buckets, tr)
        : undefined,
    [filteredPayload, tr]
  );

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Total events")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Covered symbols")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Upcoming")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Busiest day")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("Calendar heatmap")} lines={8} />
      </div>
    );
  }

  if (eventsQuery.error || !filteredPayload) {
    return (
      <DataState
        kind="error"
        title={tr("The event calendar is unavailable")}
        body={tr("The dashboard could not read the latest loaded NSE event calendar run from Postgres.")}
      />
    );
  }

  const { payload, filteredEvents, summary } = filteredPayload;
  const symbolOptions = ["all", ...payload.topSymbols.map((item) => item.symbol)];

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title="Event Calendar"
        meta={`${tr("Latest run")} ${payload.latestRunId ?? "—"} • ${tr("Updated")} ${formatDateIST(payload.latestLoadedAt, { includeTime: true })}`}
        subtitle={tr("Read scheduled company events as a calendar first, then inspect the raw list to see which symbols are clustering around the same dates.")}
        learningPrompt={tr("This page answers one question: when is event pressure concentrated, and which names are contributing to that cluster?")}
        sectionTabs={[...CATALYSTS_SECTION_TABS]}
      />

      <section className={styles.metricGrid}>
        <KpiCard
          label={tr("Total events")}
          value={formatNumber(summary.totalEvents, { maximumFractionDigits: 0 })}
          meta={tr("Rows from the latest loaded NSE event calendar run after filters are applied.")}
        />
        <KpiCard
          label={tr("Covered symbols")}
          value={formatNumber(summary.uniqueSymbols, { maximumFractionDigits: 0 })}
          meta={tr("Distinct symbols represented in the current filtered view.")}
        />
        <KpiCard
          label={tr("Upcoming")}
          value={formatNumber(summary.upcomingEvents, { maximumFractionDigits: 0 })}
          meta={tr("Events dated today or later in the currently filtered result set.")}
        />
        <KpiCard
          label={tr("Busiest day")}
          value={summary.busiestDay.date ? `${formatEventDate(summary.busiestDay.date)} • ${summary.busiestDay.count}` : "—"}
          meta={tr("Use this as a quick scan for the densest event cluster in the latest run.")}
        />
      </section>

      <ChartCard
        title={tr("Calendar heatmap")}
        subtitle={tr("Each cell shows how many event-calendar rows fall on that date. Use symbol and text filters before reading the raw list below.")}
        meta={
          <div className={styles.filterRow}>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              className={styles.searchInput}
              placeholder={tr("Search symbol, company, purpose")}
              aria-label={tr("Search event calendar rows")}
            />
            {symbolOptions.map((symbol) => (
              <ButtonButton
                key={symbol}
                size="s"
                variant={symbolFilter === symbol ? "primary" : "secondary"}
                onClick={() => setSymbolFilter(symbol)}
              >
                {symbol === "all" ? tr("All symbols") : symbol}
              </ButtonButton>
            ))}
          </div>
        }
        footer={
          <span className={styles.chartMetaText}>
            {tr("Loaded rows")}: {formatNumber(payload.summary.loadedRowCount, { maximumFractionDigits: 0 })} • {tr("Attachments")}: {formatNumber(summary.attachmentCount, { maximumFractionDigits: 0 })} • {tr("Combined CSV")}: {payload.latestCombinedFile ?? "—"}
          </span>
        }
      >
        <div className={styles.calendarWrap}>
          <div className={styles.chipRow}>
            {payload.topSymbols.map((item) => (
              <SymbolPill key={item.symbol} label={item.symbol} detail={`${item.count} ${tr("events")}`} tone="white" />
            ))}
          </div>
          {chartOption ? (
            <EChartSurface ariaLabel="Event activity calendar heatmap" className={styles.calendarSurface} option={chartOption} />
          ) : (
            <div className={styles.caption}>{tr("No calendar rows match the current filters.")}</div>
          )}
          <div className={styles.caption}>
            {tr("Cells summarize event density by date. A day can be busy even when only a few symbols are active if each symbol has multiple purposes or broadcasts.")}
          </div>
        </div>
      </ChartCard>

      <DataTable
        title={tr("Event list")}
        subtitle={tr("Sorted by event date first so you can confirm which corporate actions or meetings contribute to the current heatmap pattern.")}
        tableName="analytics_event_calendar"
        rows={filteredEvents}
        maxHeight={560}
        columns={[
          {
            key: "eventDate",
            header: tr("Date"),
            sortable: true,
            sortValue: (row) => row.eventDate ?? "",
            cell: (row) => (
              <div className={styles.dateCell}>
                <strong>{formatEventDate(row.eventDate)}</strong>
                <span>{row.broadcastDatetime ? formatDateIST(row.broadcastDatetime, { includeTime: true }) : tr("No broadcast time")}</span>
              </div>
            )
          },
          {
            key: "symbol",
            header: tr("Symbol"),
            sortable: true,
            sortValue: (row) => row.symbol,
            cell: (row) => (
              <div className={styles.symbolCell}>
                <strong>{row.symbol}</strong>
                <span className={styles.detailText}>{row.companyName ?? "—"}</span>
              </div>
            )
          },
          {
            key: "purpose",
            header: tr("Purpose"),
            sortable: true,
            sortValue: (row) => row.purpose ?? row.details ?? "",
            cell: (row) => (
              <div className={styles.tablePurpose}>
                <strong>{row.purpose ?? tr("Scheduled event")}</strong>
                <span>{row.details ?? tr("No extra details from NSE")}</span>
              </div>
            )
          },
          {
            key: "attachment",
            header: tr("Attachment"),
            sortValue: (row) => row.attachment ?? "",
            cell: (row) =>
              row.attachment ? (
                <a className={styles.attachmentLink} href={row.attachment} target="_blank" rel="noreferrer">
                  {tr("Open link")}
                </a>
              ) : (
                <span className={styles.attachmentText}>{tr("None")}</span>
              )
          },
          {
            key: "source",
            header: tr("Source"),
            sortable: true,
            sortValue: (row) => row.source,
            cell: (row) => row.source
          }
        ]}
        emptyTitle={tr("No events match these filters")}
        emptyBody={tr("Clear the symbol chip or broaden the search query to see more rows from the latest run.")}
      />

      <PageIntroAccordion
        label={tr("How to use this page")}
        title={tr("Read the calendar first, then confirm the contributing rows in the event list.")}
        body={tr("The heatmap helps you see where event pressure is clustering. The list underneath tells you whether that cluster comes from one heavyweight symbol, a broad wave of meetings, or repeated updates on a smaller set of names.")}
        widgetId="analytics_events_help"
        items={[
          tr("A busy day does not automatically mean broad market risk. Check how many symbols, not just how many rows, are involved."),
          tr("Event-calendar rows are schedule-oriented. Use Market Story and the stock page before treating a meeting date as a directional signal."),
          tr("If a symbol has an attachment, inspect it directly. The dashboard only shows the registry row, not the attachment contents.")
        ]}
      />
    </div>
  );
}
