import { Link, useParams } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import {
  DataState,
  DataTable,
  InterpretationCard,
  KpiCard,
  LoadingSkeletonCard,
  LoadingTableCard,
  PlainLanguageCard,
  SectionDivider
} from "../components/ui/DashboardPrimitives";
import { fmtDecimal, fmtPct, fmtPrice, fmtWholeNumber, formatCurrencyINR, formatDateIST, formatTime } from "../lib/format";
import { useBacktestingCompare, useIntradayAnalyticsStock, useIntradayAnalyticsSummary, useOverview, useStock } from "../lib/hooks";
import { useI18n } from "../i18n/LocaleProvider";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { AnalyticsHeader, num, text, toneFromNumber, useAnalyticsExperienceMode } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

function signedPct(value: unknown) {
  const parsed = num(value);
  if (!Number.isFinite(parsed)) return "—";
  return fmtPct(parsed);
}

function fmtMaybe(value: unknown, digits = 2) {
  const parsed = num(value);
  return Number.isFinite(parsed) ? fmtDecimal(parsed, digits) : "—";
}

function topEntries(record: Record<string, number> | undefined, take = 4, descending = true) {
  return Object.entries(record ?? {})
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => (descending ? b[1] - a[1] : a[1] - b[1]))
    .slice(0, take);
}

function humanizeKey(value: string) {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function latestCloseFromBars(bars: Array<{ c: number }> | undefined) {
  return bars?.length ? bars[bars.length - 1]!.c : null;
}

function computeWindowReturnPct(bars: Array<{ c: number }> | undefined) {
  if (!bars || bars.length < 2) return null;
  const first = bars[0]?.c;
  const last = bars[bars.length - 1]?.c;
  if (!Number.isFinite(first) || !Number.isFinite(last) || !first) return null;
  return ((last - first) / first) * 100;
}

function buildReading(
  signal: string,
  marketState: string,
  conclusion: string,
  t: (key: string, fallback?: string, values?: Record<string, string | number>) => string
) {
  const normalized = signal.toLowerCase();
  if (normalized.includes("strength")) {
    return {
      title: t("literals.The stock is acting stronger than the average tape.", "The stock is acting stronger than the average tape."),
      body: t(
        "literals.{{conclusion}} In a {{marketState}} session, that usually means buyers are still willing to support this name even if the broad market is mixed.",
        "{{conclusion}} In a {{marketState}} session, that usually means buyers are still willing to support this name even if the broad market is mixed.",
        { conclusion, marketState }
      )
    };
  }
  if (normalized.includes("weakness")) {
    return {
      title: t("literals.The stock is staying weak while the tape moves around it.", "The stock is staying weak while the tape moves around it."),
      body: t(
        "literals.{{conclusion}} In a {{marketState}} session, that usually means sellers still have control and bounce attempts need stronger proof.",
        "{{conclusion}} In a {{marketState}} session, that usually means sellers still have control and bounce attempts need stronger proof.",
        { conclusion, marketState }
      )
    };
  }
  if (normalized.includes("reversal")) {
    return {
      title: t("literals.The stock is trying to change character late in the move.", "The stock is trying to change character late in the move."),
      body: t(
        "literals.{{conclusion}} Reversal reads become more useful when they line up with improving breadth and calmer risk conditions.",
        "{{conclusion}} Reversal reads become more useful when they line up with improving breadth and calmer risk conditions.",
        { conclusion }
      )
    };
  }
  return {
    title: t("literals.Read this stock as a context-dependent setup.", "Read this stock as a context-dependent setup."),
    body: t(
      "literals.{{conclusion}} Use the market state and the quality metrics below to decide whether this is leadership, noise, or a watchlist-only name.",
      "{{conclusion}} Use the market state and the quality metrics below to decide whether this is leadership, noise, or a watchlist-only name.",
      { conclusion }
    )
  };
}

export function AnalyticsStockPage() {
  const { authReady } = useAuthGate();
  const { mode } = useAnalyticsExperienceMode();
  const { t, tr } = useI18n();
  const params = useParams();
  const symbol = (params.symbol ?? "").toUpperCase();
  const stock = useIntradayAnalyticsStock(symbol, authReady);
  const summary = useIntradayAnalyticsSummary(authReady);
  const overview = useOverview(authReady);
  const monthHistory = useStock(symbol, "1M", authReady);
  const yearHistory = useStock(symbol, "1Y", authReady);
  const strategyCompare = useBacktestingCompare(authReady);
  usePageLoadProfile({
    pageName: "analytics_stock",
    enabled: authReady && !!symbol,
    queries: [
      { name: `intraday-analytics-stock:${symbol}`, isLoading: stock.isLoading, isError: !!stock.error },
      { name: "intraday-analytics-summary", isLoading: summary.isLoading, isError: !!summary.error },
      { name: `stock:${symbol}:1M`, isLoading: monthHistory.isLoading, isError: !!monthHistory.error },
      { name: `stock:${symbol}:1Y`, isLoading: yearHistory.isLoading, isError: !!yearHistory.error },
      { name: "overview", isLoading: overview.isLoading, isError: !!overview.error },
      { name: "backtesting-compare", isLoading: strategyCompare.isLoading, isError: !!strategyCompare.error }
    ],
    extra: { symbol }
  });
  const loading = !authReady || stock.isLoading || summary.isLoading;
  const showLoading = useDeferredBusyState(loading);

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Price context")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Session return")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Dominant signal")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Market state")} lines={3} compact />
        </section>
        <div className={styles.summaryGrid}>
          <LoadingSkeletonCard title={tr("Plain-language stock read")} lines={5} />
        </div>
        <div className={styles.grid2}>
          <LoadingTableCard title={tr("Move quality")} rows={5} />
          <LoadingTableCard title={tr("Relative to the index")} rows={4} />
        </div>
      </div>
    );
  }

  if (stock.error || summary.error || !stock.data || !summary.data) {
    return (
      <DataState
        kind="error"
        title={tr("The stock explorer is unavailable")}
        body={tr("The stock explanation or the market-summary context could not load. Check the stock analytics feed and refresh.")}
      />
    );
  }

  const payload = stock.data.payload ?? {};
  const explanation = stock.data.explanation ?? {};
  const quality = (explanation.quality ?? {}) as Record<string, number>;
  const scores = (explanation.scores ?? {}) as Record<string, number>;
  const residual = (explanation.raw_vs_residual ?? {}) as Record<string, number>;
  const marketState = text(summary.data.state?.primary_state, "balanced-session");
  const dominantSignalLabel = tr(humanizeKey(text(stock.data.dominant_signal, "neutral")));
  const marketStateLabel = tr(humanizeKey(marketState));
  const reading = buildReading(
    text(stock.data.dominant_signal, "neutral"),
    marketStateLabel,
    tr(text(stock.data.conclusion, "No conclusion is available yet.")),
    t
  );
  const strongestDrivers = topEntries(scores, 4, true);
  const biggestQualityFlags = topEntries(quality, 4, false);
  const monthReturnPct = computeWindowReturnPct(monthHistory.data?.intraday);
  const yearReturnPct = computeWindowReturnPct(yearHistory.data?.intraday);
  const monthClose = latestCloseFromBars(monthHistory.data?.intraday);
  const yearClose = latestCloseFromBars(yearHistory.data?.intraday);
  const allSectors = overview.data?.sectors ?? [];
  const rankedSectors = [...allSectors]
    .map((sector) => ({
      ...sector,
      avgChangePct: sector.stocks.length
        ? sector.stocks.reduce((sum, item) => sum + item.changePct, 0) / sector.stocks.length
        : 0
    }))
    .sort((left, right) => right.avgChangePct - left.avgChangePct);
  const sectorName = text(stock.data.sector_name, "Unknown sector");
  const sectorIndex = rankedSectors.findIndex((item) => item.sector === sectorName);
  const sectorContext = sectorIndex >= 0 ? rankedSectors[sectorIndex] : null;
  const sectorRankLabel =
    sectorIndex >= 0
      ? t("literals.#{{rank}} of {{count}} sectors", "#{{rank}} of {{count}} sectors", {
          rank: sectorIndex + 1,
          count: rankedSectors.length
        })
      : tr("Not ranked");
  const topSectorPeers = sectorContext?.stocks.filter((item) => item.symbol !== symbol).slice(0, 3) ?? [];
  const marketGainers = overview.data?.leaderboards.gainers.slice(0, 3) ?? [];
  const relatedStrategyRows = (strategyCompare.data?.stockSuitability ?? [])
    .filter(
      (row) =>
        row.symbol === symbol &&
        row.capitalMode === "capital_10l" &&
        (row.universeMode === "nifty_100" || row.universeMode === "single_stock")
    )
    .sort((left, right) => right.totalNetPnl - left.totalNetPnl)
    .slice(0, 5);
  const glossaryCards = [
    {
      title: tr("Residual Strength"),
      body: tr("This shows whether the stock is outperforming the index after removing the broad-market effect. Positive values mean the stock is doing better than the average tape.")
    },
    {
      title: tr("VWAP Hold Quality"),
      body: tr("VWAP is the average traded price for the day. A higher hold-quality score means buyers managed to keep the stock above or around VWAP instead of giving up the move.")
    },
    {
      title: tr("Volume Curve Surprise"),
      body: tr("This compares current activity with the stock’s usual minute-by-minute activity pattern. Above 1 means participation is stronger than normal for this time of day.")
    },
    {
      title: tr("Range Efficiency"),
      body: tr("This asks whether the stock moved smoothly or noisily. Higher efficiency means cleaner trend behavior, while lower efficiency usually means choppy movement.")
    }
  ];

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={
          mode === "beginner"
            ? t("literals.{{symbol}} Stock Report", "{{symbol}} Stock Report", { symbol })
            : t("literals.{{symbol}} Stock Lens", "{{symbol}} Stock Lens", { symbol })
        }
        meta={t(
          "literals.{{sector}} • {{tradeDate}} • As of {{time}}",
          "{{sector}} • {{tradeDate}} • As of {{time}}",
          {
            sector: tr(text(stock.data.sector_name, "Unknown sector")),
            tradeDate: stock.data.trade_date,
            time: formatTime(stock.data.as_of, { hour12: false })
          }
        )}
        subtitle={tr("Use the stock lens to decide whether this move is genuine leadership, fragile noise, or a watchlist-only name.")}
        learningPrompt={tr("Start with the quick read, then check market context, then stock-specific evidence, then decide whether strategy evidence or broader market context is the right next page.")}
        learningPoints={[
          tr("Quick read first, because it explains the stock’s character today."),
          tr("Market context next, because strong names still behave differently in weak tapes."),
          tr("Strategy relevance last, because historical evidence only matters after current context is clear.")
        ]}
      />

      <SectionDivider
        eyebrow={tr("Stocks")}
        title={tr("Quick read / current state")}
        subtitle={tr("This report is designed to answer one question in order: what is happening in this stock, how much context supports it, and where should you go next?")}
      />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("Last price")} value={fmtPrice(num(stock.data.last_price))} tone={text(stock.data.accent_token, "white") as "green" | "red" | "white"} meta={tr("Current session print.")} />
        <KpiCard
          label={tr("Session Return")}
          value={signedPct(stock.data.change_pct_from_prev_close)}
          tone={text(stock.data.accent_token, "white") as "green" | "red" | "white"}
          meta={tr("Relative to previous close.")}
        />
        <KpiCard label={tr("Dominant Signal")} value={dominantSignalLabel} meta={tr("The primary read driving the explainer below.")} />
        <KpiCard label={tr("Market State")} value={marketStateLabel} meta={tr("Context from the broader tape.")} />
        <KpiCard label={tr("1M return")} value={monthReturnPct == null ? "—" : fmtPct(monthReturnPct)} meta={monthClose == null ? tr("Waiting for monthly price context.") : tr("Built from the published 1M stock history view.")} />
        <KpiCard label={tr("1Y return")} value={yearReturnPct == null ? "—" : fmtPct(yearReturnPct)} meta={yearClose == null ? tr("Waiting for yearly price context.") : tr("Built from the published 1Y stock history view.")} />
        <KpiCard label={tr("Sector standing")} value={sectorRankLabel} meta={sectorContext ? t("literals.Sector average {{value}}", "Sector average {{value}}", { value: fmtPct(sectorContext.avgChangePct) }) : tr("Sector context unavailable")} />
      </section>

      <section className={styles.summaryGrid}>
        <PlainLanguageCard
          title={reading.title}
          body={reading.body}
          secondaryTitle={tr("Current conclusion")}
          secondaryBody={tr(text(stock.data.conclusion, "No conclusion is available yet."))}
        />
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("Key market context")}</h2>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Tape state")}</div>
                <div className={styles.muted}>{tr("This is the broad intraday context the stock is being judged against.")}</div>
              </div>
              <div className={styles.smallStat}>{marketStateLabel}</div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Nifty move")}</div>
                <div className={styles.muted}>{tr("Use this to decide whether the stock is moving with the tape or against it.")}</div>
              </div>
              <div className={styles.smallStat} data-tone={toneFromNumber(overview.data?.indices.nifty50.changePct)}>
                {overview.data ? fmtPct(overview.data.indices.nifty50.changePct) : "—"}
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Sector standing")}</div>
                <div className={styles.muted}>{tr("A strong stock inside a weak sector means something different from a strong stock inside the leading sector.")}</div>
              </div>
              <div className={styles.smallStat} data-tone={toneFromNumber(sectorContext?.avgChangePct)}>
                {sectorRankLabel}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider
        eyebrow={tr("Context")}
        title={tr("Key market context")}
        subtitle={tr("This section explains the tape around the stock before you treat any one signal as enough on its own.")}
      />

      <section className={styles.grid2}>
        <DataTable
          title={tr("Sector context")}
          subtitle={tr("These are the nearest sector peers from the same current market snapshot.")}
          rows={topSectorPeers}
          emptyTitle={tr("Sector peers are unavailable")}
          emptyBody={tr("Sector-relative context is not available for this stock in the current overview snapshot.")}
          columns={[
            { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
            { key: "name", header: tr("Name"), cell: (row) => row.name },
            { key: "last", header: tr("Last"), align: "right", cell: (row) => fmtPrice(row.last) },
            { key: "changePct", header: tr("Change"), align: "right", cell: (row) => fmtPct(row.changePct) }
          ]}
        />
        <DataTable
          title={tr("Broad market leaders")}
          subtitle={tr("Use these names to judge whether this stock is part of broad leadership or an isolated move.")}
          rows={marketGainers}
          emptyTitle={tr("Market leaders are unavailable")}
          emptyBody={tr("The leaderboard snapshot is not available right now.")}
          columns={[
            { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
            { key: "sector", header: tr("Sector"), cell: (row) => tr(text(row.sector, "Unknown")) },
            { key: "last", header: tr("Last"), align: "right", cell: (row) => fmtPrice(row.last) },
            { key: "changePct", header: tr("Change"), align: "right", cell: (row) => fmtPct(row.changePct) }
          ]}
        />
      </section>

      <SectionDivider
        eyebrow={tr("Signals")}
        title={tr("Stock-specific signals")}
        subtitle={tr("Use these numbers to validate the move after the market context checks, not before them.")}
      />

      <section className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Beta 20D")}</div>
          <div className={styles.metricValue}>{fmtMaybe(payload.beta_20d)}</div>
          <div className={styles.metricHint}>{tr("How much this stock usually amplifies index movement.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Residual 60M")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(num(payload.residual_return_60m_pct))}>
            {signedPct(payload.residual_return_60m_pct)}
          </div>
          <div className={styles.metricHint}>{tr("Stock return after subtracting the index effect.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("VWAP Hold Quality")}</div>
          <div className={styles.metricValue}>{fmtMaybe(payload.vwap_hold_quality_score)}</div>
          <div className={styles.metricHint}>{tr("Higher is better. It measures how well the move held around VWAP.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Volume Curve Surprise")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(num(payload.volume_curve_surprise) - 1)}>
            {fmtMaybe(payload.volume_curve_surprise)}
          </div>
          <div className={styles.metricHint}>{tr("Above 1 means activity is running hotter than its normal minute-of-day profile.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Range Efficiency")}</div>
          <div className={styles.metricValue}>{fmtMaybe(payload.range_efficiency_pct)}</div>
          <div className={styles.metricHint}>{tr("Higher means the move is smoother, lower means noisier.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("History Samples")}</div>
          <div className={styles.metricValue}>{fmtWholeNumber(num(stock.data.history_context?.sample_count))}</div>
          <div className={styles.metricHint}>{tr("How many times this dominant signal has been observed in the historical learner context.")}</div>
        </div>
      </section>

      <section className={styles.guidanceGrid}>
        {glossaryCards.map((card, index) => (
          <article key={card.title} className={styles.guideCard}>
            <span className={styles.guideStep}>{index + 1}</span>
            <h2 className={styles.guideTitle}>{tr(card.title)}</h2>
            <p className={styles.guideText}>{card.body}</p>
          </article>
        ))}
      </section>

      <section className={styles.summaryGrid}>
        <InterpretationCard
          title={tr("How to use the stock-specific signals")}
          items={[
            tr("Move quality first, because a large return without quality is often unstable."),
            tr("Residual metrics next, because they tell you whether the stock is still strong after removing the index effect."),
            tr("History last, because a clean historical context helps you decide whether the move deserves strategy review.")
          ]}
        />
      </section>

      <section className={styles.guidanceGrid}>
        <article className={styles.guideCard}>
          <span className={styles.guideStep}>1</span>
            <h2 className={styles.guideTitle}>{tr("What supports this move")}</h2>
            <p className={styles.guideText}>
              {strongestDrivers.length
                ? strongestDrivers.map(([key, value]) => `${tr(humanizeKey(key))} ${fmtDecimal(value, 2)}`).join(" • ")
                : tr("No strong supporting drivers are available yet.")}
            </p>
          </article>
          <article className={styles.guideCard}>
            <span className={styles.guideStep}>2</span>
            <h2 className={styles.guideTitle}>{tr("What could weaken it")}</h2>
            <p className={styles.guideText}>
              {biggestQualityFlags.length
                ? biggestQualityFlags.map(([key, value]) => `${tr(humanizeKey(key))} ${fmtDecimal(value, 2)}`).join(" • ")
                : tr("No quality flags are available yet.")}
            </p>
          </article>
          <article className={styles.guideCard}>
            <span className={styles.guideStep}>3</span>
            <h2 className={styles.guideTitle}>{tr("Where to go next")}</h2>
            <p className={styles.guideText}>{tr("If this still looks constructive, open the detailed stock page. If it looks conditional or fragile, step back to Setups or Risk before acting.")}</p>
          </article>
      </section>

      <section className={styles.grid2}>
        <DataTable
          title={tr("Move Quality")}
          subtitle={tr("Use the same shared table styling as the rest of the app to compare the stock-quality signals.")}
          rows={[
            {
              metric: tr("Time Above VWAP"),
              value: signedPct(quality.time_above_vwap_pct),
              read: tr("Higher means the stock spent more of the session holding constructive territory.")
            },
            {
              metric: tr("VWAP Hold Quality"),
              value: fmtMaybe(quality.vwap_hold_quality_score),
              read: tr("Higher means better control around VWAP after the move began.")
            },
            {
              metric: tr("Persistence"),
              value: fmtMaybe(quality.relative_strength_persistence_score),
              read: tr("Higher means the stock kept outperforming instead of flashing briefly.")
            },
            {
              metric: tr("Close Location"),
              value: fmtMaybe(quality.close_location_quality_pct),
              read: tr("Higher means the stock finished nearer the strong part of its intraday range.")
            }
          ]}
          columns={[
            { key: "metric", header: tr("Quality Signal"), cell: (row: { metric: string }) => row.metric },
            { key: "value", header: tr("Value"), align: "right", cell: (row: { value: string }) => row.value },
            { key: "read", header: tr("How to read it"), cell: (row: { read: string }) => row.read }
          ]}
        />

        {mode === "advanced" ? (
          <DataTable
            title={tr("Relative To The Index")}
            subtitle={tr("Residual metrics strip out part of the broad-market effect so you can judge true stock strength.")}
            rows={[
              {
                metric: tr("Stock Change"),
                value: signedPct(residual.stock_change_pct),
                read: tr("The raw session move.")
              },
              {
                metric: tr("Index Change"),
                value: signedPct(residual.index_change_pct),
                read: tr("The broad move it is being compared against.")
              },
              {
                metric: tr("Residual 15M"),
                value: signedPct(residual.residual_return_15m_pct),
                read: tr("Positive means the stock outperformed after removing index effect over 15 minutes.")
              },
              {
                metric: tr("Residual 60M"),
                value: signedPct(residual.residual_return_60m_pct),
                read: tr("This is the cleaner “is it really strong?” read for the last hour.")
              }
            ]}
            columns={[
              { key: "metric", header: tr("Metric"), cell: (row: { metric: string }) => row.metric },
              { key: "value", header: tr("Value"), align: "right", cell: (row: { value: string }) => row.value },
              { key: "read", header: tr("Why it matters"), cell: (row: { read: string }) => row.read }
            ]}
          />
        ) : (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{tr("How To Read The Move")}</h2>
            <div className={styles.signalGrid}>
              <div className={styles.signalItem}>
                <div>
                  <div className={styles.strong}>{tr("Stock change")}</div>
                  <div className={styles.muted}>{tr("This is the raw move you can see on the chart.")}</div>
                </div>
                <div className={styles.smallStat} data-tone={toneFromNumber(num(residual.stock_change_pct))}>
                  {signedPct(residual.stock_change_pct)}
                </div>
              </div>
              <div className={styles.signalItem}>
                <div>
                  <div className={styles.strong}>{tr("Residual 60M")}</div>
                  <div className={styles.muted}>{tr("This is the cleaner “is it stronger than the market?” check.")}</div>
                </div>
                <div className={styles.smallStat} data-tone={toneFromNumber(num(residual.residual_return_60m_pct))}>
                  {signedPct(residual.residual_return_60m_pct)}
                </div>
              </div>
              <div className={styles.signalItem}>
                <div>
                  <div className={styles.strong}>{tr("Index context")}</div>
                  <div className={styles.muted}>{tr("Use the market state above to decide whether strength is broad, narrow, or fragile.")}</div>
                </div>
                <div className={styles.smallStat}>{signedPct(residual.index_change_pct)}</div>
              </div>
            </div>
          </div>
        )}
      </section>

      <SectionDivider
        eyebrow={tr("History")}
        title={tr("Related strategy relevance")}
        subtitle={tr("This section does not invent a recommendation. It shows whether the current stock has strong published strategy fit in the existing backtesting snapshots.")}
      />

      <section className={styles.grid2}>
        <DataTable
          title={tr("Published strategy fit")}
          subtitle={tr("Built from the published stock-suitability snapshot under the 10L lens.")}
          rows={relatedStrategyRows}
          emptyTitle={tr("No related strategy evidence yet")}
          emptyBody={tr("There is no published stock-suitability row for this symbol under the current comparison lens.")}
          columns={[
            { key: "strategy", header: tr("Strategy"), cell: (row) => tr(row.displayName) },
            { key: "universe", header: tr("Scope"), cell: (row) => tr(row.universeMode === "single_stock" ? "Single Stock" : "Nifty 100") },
            { key: "winRate", header: tr("Win rate"), align: "right", cell: (row) => fmtPct(row.winRatePct) },
            { key: "avgReturn", header: tr("Avg return"), align: "right", cell: (row) => fmtPct(row.avgReturnPct) },
            { key: "netPnl", header: tr("Net P&L"), align: "right", cell: (row) => formatCurrencyINR(row.totalNetPnl, true) },
            { key: "bestRegime", header: tr("Best regime"), cell: (row) => tr(row.bestRegime) },
            { key: "lastSignal", header: tr("Last signal"), cell: (row) => formatDateIST(row.lastSignalDate) }
          ]}
        />
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("What this means")}</h2>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Good strategy fit")}</div>
                <div className={styles.muted}>{tr("If one or two strategies keep showing up with strong win rate, acceptable drawdown, and a sensible best regime, this stock deserves deeper strategy review.")}</div>
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Weak strategy fit")}</div>
                <div className={styles.muted}>{tr("If the stock does not have a clean published fit, treat the current move as observation first and evidence second.")}</div>
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Best next move")}</div>
                <div className={styles.muted}>{tr("Open the strategy leaderboard if this stock still looks constructive after the market and signal checks.")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.nextSteps}>
        <Link to="/analytics/regime" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Broader tape")}</span>
          <strong>{tr("Open Market Story")}</strong>
          <span className={styles.muted}>{tr("Use this when you need to know whether the stock is aligned with broad breadth and regime, not just flashing on its own.")}</span>
        </Link>
        <Link to="/analytics/risk" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Risk context")}</span>
          <strong>{tr("Review anomalies and signal stress")}</strong>
          <span className={styles.muted}>{tr("Use this when you want to see whether this stock’s move is confirmed, noisy, or part of a broader anomaly cluster.")}</span>
        </Link>
        <Link to="/backtesting/strategies" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Historical evidence")}</span>
          <strong>{tr("Open the Strategy Leaderboard")}</strong>
          <span className={styles.muted}>{tr("Use this if the stock still looks constructive and you want to see which strategy family has the strongest published evidence for it.")}</span>
        </Link>
        <Link to="/analytics/system/map" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Where to go next")}</span>
          <strong>{tr("Open the System Map")}</strong>
          <span className={styles.muted}>{tr("Use this when you want the shortest route from this stock read to the next product workspace.")}</span>
        </Link>
      </section>
    </div>
  );
}
