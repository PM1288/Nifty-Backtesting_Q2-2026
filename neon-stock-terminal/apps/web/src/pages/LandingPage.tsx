import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import SlotCounter from "react-slot-counter";
import { trackSelectContent, trackWidgetExpanded } from "../analytics/events";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useWorkspaceEngagement, useWorkspaceSectionViews } from "../analytics/useWorkspaceAnalytics";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { useLiveQuotes, useOverview, useSupportingMetrics } from "../lib/hooks";
import { trackAnalyticsEvent, trackCtaClick } from "../lib/analytics";
import { directionFromChangePct, type Quote, type SupportingMetricQuote } from "../lib/types";
import { arrow, formatNumber, formatTime, fmtPct, fmtPrice } from "../lib/format";
import { IndicatorMarkers } from "../components/market/IndicatorMarkers";
import { StockPill } from "../components/market/StockPill";
import { DashboardInfoPopup } from "../components/market/DashboardInfoPopup";
import { PageIntroAccordion } from "../components/ui/DashboardPrimitives";
import { useAnalyticsExperienceMode } from "./AnalyticsChrome";
import styles from "./LandingPage.module.css";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { PerformanceDebugPanel } from "../analytics/PerformanceDebugPanel";
import type { AnalyticsParams } from "../analytics/types";

function mergeQuote<T extends Quote>(
  quote: T,
  live: Record<string, { price: number; change: number; changePct: number; timestamp: string }>
) {
  const lq = live[quote.symbol];
  if (!lq) return quote;
  const previousClose = quote.last - quote.change;
  const canDeriveFromPreviousClose = Number.isFinite(previousClose) && Math.abs(previousClose) > 1e-9;
  const nextChange = canDeriveFromPreviousClose ? lq.price - previousClose : lq.change;
  const nextChangePct = canDeriveFromPreviousClose ? (nextChange / previousClose) * 100 : lq.changePct;
  return {
    ...quote,
    last: lq.price,
    change: Number.isFinite(nextChange) ? nextChange : lq.change,
    changePct: Number.isFinite(nextChangePct) ? nextChangePct : lq.changePct,
    timestamp: lq.timestamp
  };
}

function formatSupportingMetricValue(item: SupportingMetricQuote) {
  if (item.value == null || !Number.isFinite(item.value)) return "—";
  if (item.unit === "index_points") return formatNumber(Math.round(item.value), { maximumFractionDigits: 0 });
  if (item.unit === "INR_per_kg") return formatNumber(item.value, { maximumFractionDigits: 0 });
  return fmtPrice(item.value);
}

function formatSupportingMetricPct(item: SupportingMetricQuote) {
  if (item.changePct == null || !Number.isFinite(item.changePct)) return "—";
  return fmtPct(item.changePct);
}

function supportingMetricDirection(item: SupportingMetricQuote) {
  if (item.changePct == null || !Number.isFinite(item.changePct)) return "flat";
  return directionFromChangePct(item.changePct);
}

function supportingMetricArrow(item: SupportingMetricQuote) {
  if (item.changePct == null || !Number.isFinite(item.changePct)) return "•";
  return arrow(item.changePct);
}

function compactSupportingMetricLabel(item: SupportingMetricQuote) {
  const explicit: Record<string, string> = {
    gift_nifty: "🇮🇳 GIFT",
    dow_jones: "🇺🇸 Dow",
    brent_crude: "🛢 Brent",
    india_gold: "🪙 Gold",
    india_silver: "🥈 Silver",
    europe_natural_gas: "🔥 Gas",
    usd_inr: "🇺🇸🇮🇳 USD/INR",
    sp_500: "🇺🇸 S&P",
    nasdaq_composite: "🇺🇸 Nasdaq",
    russell_2000: "🇺🇸 Russell",
    nifty_50: "🇮🇳 NIFTY",
    bse_sensex: "🇮🇳 Sensex",
    ftse_100: "🇬🇧 FTSE",
    dax: "🇩🇪 DAX",
    cac_40: "🇫🇷 CAC",
    euro_stoxx_50: "🇪🇺 Stoxx",
    nikkei_225: "🇯🇵 Nikkei",
    hang_seng: "🇭🇰 Hang Seng",
    shanghai_composite: "🇨🇳 Shanghai",
    kospi: "🇰🇷 KOSPI",
    sp_asx_200: "🇦🇺 ASX",
    sp_tsx_composite: "🇨🇦 TSX",
    ibovespa: "🇧🇷 Ibovespa"
  };
  return explicit[item.code] ?? item.label;
}

function chunkItems<T>(items: T[], chunkCount: number) {
  if (!items.length || chunkCount <= 0) return [];
  const size = Math.ceil(items.length / chunkCount);
  return Array.from({ length: chunkCount }, (_, index) => items.slice(index * size, (index + 1) * size)).filter(
    (chunk) => chunk.length > 0
  );
}

export function LandingPage() {
  const { tr } = useI18n();
  const [helpOpen, setHelpOpen] = useState(false);
  const { user, authReady } = useAuthGate();
  const { mode, setMode } = useAnalyticsExperienceMode();
  useLayoutEffect(() => {
    if (mode !== "advanced") setMode("advanced");
  }, [mode, setMode]);
  const sessionEnabled = authReady && !!user;
  const q = useOverview(authReady);
  const supportingMetricsQuery = useSupportingMetrics(authReady);
  const loading = !authReady || q.isLoading;
  const showLoading = useDeferredBusyState(loading);
  usePageLoadProfile({
    pageName: "landing",
    enabled: authReady,
    queries: [
      { name: "overview", isLoading: q.isLoading, isError: !!q.error },
      {
        name: "analytics-supporting-metrics",
        isLoading: supportingMetricsQuery.isLoading,
        isError: !!supportingMetricsQuery.error
      }
    ]
  });
  const navigate = useNavigate();
  const sectorsViewportRef = useRef<HTMLDivElement | null>(null);
  const sectorsRef = useRef<HTMLDivElement | null>(null);
  const previousPillRectsRef = useRef<Map<string, DOMRect>>(new Map());

  const sectors = q.data?.sectors ?? [];
  const liveSymbols = useMemo(
    () => [
      "NIFTY50",
      "BANKNIFTY",
      "INDIAVIX",
      ...sectors.flatMap((sec) => sec.stocks.map((s) => s.symbol))
    ],
    [sectors]
  );
  const live = useLiveQuotes(liveSymbols, sessionEnabled);

  const mergedIndices = q.data
    ? {
        nifty50: mergeQuote(q.data.indices.nifty50, live),
        bankNifty: mergeQuote(q.data.indices.bankNifty, live),
        indiaVix: mergeQuote(q.data.indices.indiaVix, live)
      }
    : null;

  const mergedSectors = q.data
    ? q.data.sectors.map((sec) => {
        const stocks = sec.stocks.map((s) => mergeQuote(s, live)).sort((a, b) => b.changePct - a.changePct);
        const avgChangePct = stocks.length ? stocks.reduce((sum, s) => sum + s.changePct, 0) / stocks.length : 0;
        return {
          ...sec,
          stocks,
          avgChangePct,
          avgDir: directionFromChangePct(avgChangePct)
        };
      })
    : [];
  const rankedSectors = useMemo(
    () => [...mergedSectors].sort((a, b) => b.avgChangePct - a.avgChangePct),
    [mergedSectors]
  );
  const sectorByName = useMemo(() => new Map(mergedSectors.map((sec) => [sec.sector, sec])), [mergedSectors]);
  const sectorColumnTemplates = useMemo(
    () => [
      ["Automobile and Auto Components", "Capital Goods"],
      ["Consumer Services", "Fast Moving Consumer Goods"],
      ["Financial Services"],
      ["Metals & Mining", "Oil Gas & Consumable Fuels", "Information Technology"],
      ["Services", "Telecommunication", "Construction", "Construction Materials", "Healthcare"],
      ["Chemicals", "Consumer Durables", "Realty", "Power"]
    ],
    []
  );
  const sectorColumns = useMemo(() => {
    const used = new Set<string>();
    const arranged = sectorColumnTemplates.map((names) =>
      names
        .map((name) => {
          const sector = sectorByName.get(name);
          if (sector) used.add(name);
          return sector ?? null;
        })
        .filter((sector): sector is (typeof mergedSectors)[number] => sector !== null)
    );

    const leftovers = mergedSectors.filter((sec) => !used.has(sec.sector));
    if (leftovers.length) {
      arranged[arranged.length - 1] = [...arranged[arranged.length - 1], ...leftovers];
    }
    return arranged;
  }, [mergedSectors, sectorByName, sectorColumnTemplates]);
  const fitSignature = useMemo(
    () =>
      sectorColumns
        .map((column) => column.map((sec) => `${sec.sector}:${sec.stocks.length}`).join("|"))
        .join("||"),
    [sectorColumns]
  );
  const reorderSignature = useMemo(
    () => mergedSectors.map((sec) => `${sec.sector}:${sec.stocks.map((s) => s.symbol).join(",")}`).join("|"),
    [mergedSectors]
  );
  const homeSupportingMetrics = useMemo(() => {
    const payload = supportingMetricsQuery.data;
    if (!payload) return [];
    const seen = new Set<string>();
    return [...payload.primaryMetrics, ...payload.globalIndices].filter((item) => {
      if (item.code === "nifty_50" || seen.has(item.code)) return false;
      seen.add(item.code);
      return item.value != null && Number.isFinite(item.value);
    });
  }, [supportingMetricsQuery.data]);
  const supportingMetricColumns = useMemo(() => {
    if (!homeSupportingMetrics.length) return [];
    const columnCount = Math.min(6, homeSupportingMetrics.length);
    return chunkItems(homeSupportingMetrics, columnCount);
  }, [homeSupportingMetrics]);

  useLayoutEffect(() => {
    const viewport = sectorsViewportRef.current;
    const sectors = sectorsRef.current;
    if (!viewport || !sectors) return;

    let frame = 0;
    const fit = () => {
      sectors.style.setProperty("--fit-scale", "1");
      const naturalHeight = sectors.scrollHeight;
      const availableHeight = viewport.clientHeight;
      if (!naturalHeight || !availableHeight) return;

      const fitted = Math.min(1, Math.max(0.38, (availableHeight / naturalHeight) * 0.995));
      sectors.style.setProperty("--fit-scale", fitted.toFixed(3));
    };

    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    };

    schedule();
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
    };
  }, [fitSignature]);

  useLayoutEffect(() => {
    const sectors = sectorsRef.current;
    if (!sectors) return;

    const nodes = Array.from(sectors.querySelectorAll<HTMLElement>("[data-stock-pill-symbol]"));
    const nextRects = new Map<string, DOMRect>();

    for (const node of nodes) {
      const symbol = node.dataset.stockPillSymbol;
      if (!symbol) continue;
      const currentRect = node.getBoundingClientRect();
      const previousRect = previousPillRectsRef.current.get(symbol);
      if (previousRect) {
        const deltaY = previousRect.top - currentRect.top;
        const movementThreshold = Math.max(8, currentRect.height * 0.45);
        if (Math.abs(deltaY) > movementThreshold) {
          node.getAnimations().forEach((animation) => animation.cancel());
          node.animate(
            [
              { transform: `translateY(${deltaY}px)` },
              { transform: "translate(0, 0)" }
            ],
            {
              duration: 420,
              easing: "cubic-bezier(0.2, 0.7, 0.2, 1)"
            }
          );
        }
      }
      nextRects.set(symbol, currentRect);
    }

    previousPillRectsRef.current = nextRects;
  }, [reorderSignature]);

  const stripRef = useRef<HTMLElement | null>(null);
  const sectorHeatmapRef = useRef<HTMLElement | null>(null);
  const supportingMetricsRef = useRef<HTMLElement | null>(null);
  const marketStoryRef = useRef<HTMLDivElement | null>(null);
  const whereNextRef = useRef<HTMLDivElement | null>(null);
  const engagementExtrasRef = useRef<AnalyticsParams>({});
  const homeAnalyticsContext = useMemo(
    () => ({
      page_name: "home",
      page_family: "overview",
      section: "landing",
      page_path: "/",
      audience_mode: mode,
    }),
    [mode],
  );
  const sectionRefs = useMemo(
    () => ({
      home_index_strip: stripRef,
      home_sector_heatmap: sectorHeatmapRef,
      home_supporting_metrics: supportingMetricsRef,
      home_market_story: marketStoryRef,
      home_where_next: whereNextRef,
    }),
    [],
  );
  useWorkspaceSectionViews(sectionRefs, homeAnalyticsContext, "home_section_view", authReady && !!q.data);
  useWorkspaceEngagement(homeAnalyticsContext, "home_engagement", authReady && !!q.data, {
    extraParams: engagementExtrasRef,
  });

  const handleSelectStock = (stock: Quote, sourceSurface = "home_heatmap") => {
    const sector = mergedSectors.find((item) => item.stocks.some((candidate) => candidate.symbol === stock.symbol))?.sector;
    if (sourceSurface === "home_heatmap") {
      engagementExtrasRef.current = {
        heatmap_row_focused: true,
        focused_symbol: stock.symbol,
        focused_sector: sector,
      };
      void trackAnalyticsEvent("heatmap_row_focus", {
        symbol: stock.symbol,
        sector,
        page_family: "overview",
        page_path: "/",
        source_surface: sourceSurface,
      });
    }
    void trackSelectContent("stock", stock.symbol, {
      symbol: stock.symbol,
      sector,
      source_surface: sourceSurface
    });
    navigate(`/analytics/stock/${encodeURIComponent(stock.symbol.toUpperCase())}`);
  };

  const handleStripKeyDown = (event: KeyboardEvent<HTMLDivElement>, stock: Quote, sourceSurface = "home_heatmap") => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleSelectStock(stock, sourceSurface);
  };

  if (loading) {
    if (!showLoading) return null;
    return <div className={styles.state}>{tr("Loading market dashboard…")}</div>;
  }

  if (q.error || !q.data || !mergedIndices) {
    return <div className={styles.state}>{tr("Failed to load dashboard. Check API and DB.")}</div>;
  }

  const allStocks = mergedSectors.flatMap((sec) => sec.stocks).sort((a, b) => b.changePct - a.changePct);
  const topUp = allStocks.slice(0, 5);
  const topDown = [...allStocks].reverse().slice(0, 5);
  const breadthRatio = allStocks.length ? allStocks.filter((stock) => stock.changePct > 0).length / allStocks.length : 0;
  const leadSector = rankedSectors[0]?.sector ?? "sector leadership";
  const lagSector = rankedSectors[rankedSectors.length - 1]?.sector ?? "weakest sector";
  const advancers = allStocks.filter((stock) => stock.changePct > 0).length;
  const decliners = allStocks.filter((stock) => stock.changePct < 0).length;
  const medianSectorMove = rankedSectors.length
    ? rankedSectors[Math.floor(rankedSectors.length / 2)]?.avgChangePct ?? 0
    : 0;
  const asOfLabel = q.data.asOf ? formatTime(q.data.asOf) : "—";
  const niftyChange = mergedIndices.nifty50.changePct;
  let marketStoryTitle = tr("Rotation");
  let marketStoryBody = tr("The headline index is moving, but leadership is rotating rather than spreading cleanly across the market.");
  if (niftyChange > 0.35 && breadthRatio > 0.58) {
    marketStoryTitle = tr("Bullish expansion");
    marketStoryBody = tr("The index and the average stock are both rising, which usually gives continuation setups cleaner support.");
  } else if (niftyChange < -0.35 && breadthRatio < 0.42) {
    marketStoryTitle = tr("Broad weakness");
    marketStoryBody = tr("The index and breadth are both weak, so caution matters more than chasing isolated strength.");
  } else if (Math.abs(niftyChange) < 0.35 && breadthRatio > 0.5) {
    marketStoryTitle = tr("Positive rotation");
    marketStoryBody = tr("The index is relatively calm, but enough stocks are still positive to suggest rotation under the surface.");
  }
  const rankBadgeBySymbol = new Map<string, string>();
  topUp.forEach((s, i) => rankBadgeBySymbol.set(s.symbol, `▲★${i + 1}`));
  topDown.forEach((s, i) => rankBadgeBySymbol.set(s.symbol, `▼★${i + 1}`));

  const renderAnimatedPrice = (value: number) => (
    <SlotCounter
      value={fmtPrice(value)}
      duration={0.95}
      speed={0.8}
      animateUnchanged={false}
      useMonospaceWidth
      containerClassName={styles.slotCounter}
      charClassName={styles.slotCounterChar}
      separatorClassName={styles.slotCounterSeparator}
    />
  );

  const renderStablePct = (value: number) => <span className={styles.slotCounterPct}>{fmtPct(value)}</span>;

  return (
    <div className={styles.layout}>
      <DashboardInfoPopup open={helpOpen} onClose={() => setHelpOpen(false)} />
      <PerformanceDebugPanel />

      <section ref={stripRef} data-analytics-section="home_index_strip" className={styles.strip}>
        <div
          className={styles.stripItem}
          data-dir={directionFromChangePct(mergedIndices.nifty50.changePct)}
          role="button"
          tabIndex={0}
          onClick={() => {
            void trackSelectContent("index_card", "NIFTY50", {
              index_name: mergedIndices.nifty50.name,
              source_surface: "home_index_strip"
            });
            handleSelectStock(mergedIndices.nifty50, "home_index_strip");
          }}
          onKeyDown={(event) => handleStripKeyDown(event, mergedIndices.nifty50, "home_index_strip")}
        >
          <IndicatorMarkers rsi={mergedIndices.nifty50.rsi} willr={mergedIndices.nifty50.willr} />
          <div className={styles.stripLine}>
            <span className={styles.stripLabel}>
              <span className={styles.stripArrow}>{arrow(mergedIndices.nifty50.changePct)}</span>
              {mergedIndices.nifty50.name}
            </span>
            <span className={styles.stripPrice}>{renderAnimatedPrice(mergedIndices.nifty50.last)}</span>
            <span className={styles.stripPct}>{renderStablePct(mergedIndices.nifty50.changePct)}</span>
          </div>
        </div>
        <div
          className={styles.stripItem}
          data-dir={directionFromChangePct(mergedIndices.bankNifty.changePct)}
          role="button"
          tabIndex={0}
          onClick={() => {
            void trackSelectContent("index_card", "BANKNIFTY", {
              index_name: mergedIndices.bankNifty.name,
              source_surface: "home_index_strip"
            });
            handleSelectStock(mergedIndices.bankNifty, "home_index_strip");
          }}
          onKeyDown={(event) => handleStripKeyDown(event, mergedIndices.bankNifty, "home_index_strip")}
        >
          <IndicatorMarkers rsi={mergedIndices.bankNifty.rsi} willr={mergedIndices.bankNifty.willr} />
          <div className={styles.stripLine}>
            <span className={styles.stripLabel}>
              <span className={styles.stripArrow}>{arrow(mergedIndices.bankNifty.changePct)}</span>
              {mergedIndices.bankNifty.name}
            </span>
            <span className={styles.stripPrice}>{renderAnimatedPrice(mergedIndices.bankNifty.last)}</span>
            <span className={styles.stripPct}>{renderStablePct(mergedIndices.bankNifty.changePct)}</span>
          </div>
        </div>
        <div
          className={styles.stripItem}
          data-dir={directionFromChangePct(mergedIndices.indiaVix.changePct)}
          role="button"
          tabIndex={0}
          onClick={() => {
            void trackSelectContent("index_card", "INDIAVIX", {
              index_name: mergedIndices.indiaVix.name,
              source_surface: "home_index_strip"
            });
            handleSelectStock(mergedIndices.indiaVix, "home_index_strip");
          }}
          onKeyDown={(event) => handleStripKeyDown(event, mergedIndices.indiaVix, "home_index_strip")}
        >
          <IndicatorMarkers rsi={mergedIndices.indiaVix.rsi} willr={mergedIndices.indiaVix.willr} />
          <div className={styles.stripLine}>
            <span className={styles.stripLabel}>
              <span className={styles.stripArrow}>{arrow(mergedIndices.indiaVix.changePct)}</span>
              {mergedIndices.indiaVix.name}
            </span>
            <span className={styles.stripPrice}>{renderAnimatedPrice(mergedIndices.indiaVix.last)}</span>
            <span className={styles.stripPct}>{renderStablePct(mergedIndices.indiaVix.changePct)}</span>
          </div>
        </div>
      </section>

      <section ref={sectorHeatmapRef} data-analytics-section="home_sector_heatmap" className={`${styles.sectorBlock} ${styles.sectorHero}`}>
        <div className={styles.sectionToolbar}>
          <div className={styles.sectionIntro}>
            <span className={styles.sectionTitle}>{tr("Sector heatmap")}</span>
            <span className={styles.sectionSubtitle}>
              {tr("This answers the first question above the fold: is leadership broad, narrow, or unstable right now?")}
            </span>
          </div>
          <div className={styles.heroActions}>
            <span className={styles.heroTimestamp}>{tr("Updated")} {asOfLabel}</span>
            <button
              type="button"
              className={styles.helpButton}
              onClick={() => {
                engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "open_full_board" };
                void trackCtaClick({
                  cta_name: "open_full_board",
                  page_section: "home_sector_heatmap",
                  page_family: "overview",
                  page_path: "/",
                });
                navigate("/analytics");
              }}
            >
              {tr("Open full board")}
            </button>
          </div>
        </div>
        <div className={styles.sectorSummaryStrip}>
          <div className={styles.storyPoint}>
            <span className={styles.storyPointLabel}>{tr("Advancers / decliners")}</span>
            <strong>{formatNumber(advancers, { maximumFractionDigits: 0 })} / {formatNumber(decliners, { maximumFractionDigits: 0 })}</strong>
          </div>
          <div className={styles.storyPoint}>
            <span className={styles.storyPointLabel}>{tr("Median sector move")}</span>
            <strong>{fmtPct(medianSectorMove)}</strong>
          </div>
          <div className={styles.storyPoint}>
            <span className={styles.storyPointLabel}>{tr("Strongest sector")}</span>
            <strong>{leadSector}</strong>
          </div>
          <div className={styles.storyPoint}>
            <span className={styles.storyPointLabel}>{tr("Weakest sector")}</span>
            <strong>{lagSector}</strong>
          </div>
        </div>
        <div className={styles.sectorsViewport} ref={sectorsViewportRef}>
          <div className={styles.sectors} ref={sectorsRef}>
            <div className={styles.sectorsGrid}>
              {sectorColumns.map((column, columnIndex) => (
                <div key={`col-${columnIndex}`} className={styles.sectorColumn}>
                  {column.map((sec) => (
                    <div key={sec.sector} className={styles.sectorGroup} data-dir={sec.avgDir}>
                      <div className={styles.sectorTitleRow}>
                        <div className={styles.sectorTitle}>{sec.sector}</div>
                        <div className={styles.sectorAvg} data-dir={sec.avgDir}>
                          <span className={styles.sectorAvgMarker} aria-hidden="true">
                            {sec.avgDir === "up" ? "▲" : sec.avgDir === "down" ? "▼" : "•"}
                          </span>
                          <span>{fmtPct(sec.avgChangePct)}</span>
                        </div>
                      </div>
                      <div className={styles.pills}>
                        {sec.stocks.map((s) => (
                          <StockPill
                            key={s.symbol}
                            stock={s}
                            rankBadge={rankBadgeBySymbol.get(s.symbol)}
                            compact
                            onSelect={(stock) => handleSelectStock(stock, "home_heatmap")}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {supportingMetricColumns.length ? (
        <section ref={supportingMetricsRef} data-analytics-section="home_supporting_metrics" className={styles.supportingMetricsSection}>
          <div className={styles.sectionToolbar}>
            <div className={styles.sectionIntro}>
              <span className={styles.sectionTitle}>{tr("Supporting metrics scan")}</span>
              <span className={styles.sectionSubtitle}>
                {tr("Macro, commodities, FX, and major global indices in the same quick-scan bar language as the N100 stock map.")}
              </span>
            </div>
            <button
              type="button"
              className={styles.helpButton}
              onClick={() => {
                engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "open_supporting_metrics" };
                void trackCtaClick({
                  cta_name: "open_supporting_metrics",
                  page_section: "home_supporting_metrics",
                  page_family: "overview",
                  page_path: "/",
                });
                navigate("/analytics/supporting-metrics");
              }}
            >
              {tr("Open full board")}
            </button>
          </div>
          <div className={styles.supportingMetricsColumns}>
            {supportingMetricColumns.map((column, columnIndex) => (
              <div key={`supporting-column-${columnIndex}`} className={styles.supportingMetricsColumn}>
                {column.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className={styles.supportingMetricBar}
                    data-dir={supportingMetricDirection(item)}
                    onClick={() => {
                      engagementExtrasRef.current = {
                        bridge_cta_clicked: true,
                        bridge_cta_name: "supporting_metric_open",
                        metric_code: item.code,
                      };
                      void trackCtaClick({
                        cta_name: "supporting_metric_open",
                        page_section: "home_supporting_metrics",
                        page_family: "overview",
                        page_path: "/",
                        metric_code: item.code,
                      });
                      navigate("/analytics/supporting-metrics");
                    }}
                  >
                    <span className={styles.supportingMetricLabel}>{compactSupportingMetricLabel(item)}</span>
                    <span className={styles.supportingMetricValue}>{formatSupportingMetricValue(item)}</span>
                    <span className={styles.supportingMetricPct}>
                      <span className={styles.supportingMetricArrow}>{supportingMetricArrow(item)}</span>
                      <span>{formatSupportingMetricPct(item)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.marketLead}>
        <div className={styles.overviewIntro}>
          <span className={styles.overviewEyebrow}>{tr("Overview")}</span>
          <h1 className={styles.compactTitle}>{tr("Monitor the tape first.")}</h1>
          <p className={styles.overviewSubtitle}>
            {tr("NIFTY 50, BANK NIFTY, INDIA VIX, then sector rotation. Keep this page for headline monitoring and use the lower support cards only to decide where to go next.")}
          </p>
        </div>
      </section>

      <section className={styles.supportingStack}>
        <details className={styles.foldSection} open={mode === "beginner"}>
          <summary className={styles.foldSummary}>{tr("Market story and leadership")}</summary>
          <div ref={marketStoryRef} data-analytics-section="home_market_story" className={styles.foldBody}>
            <div className={styles.storyGrid}>
              <article className={styles.storyCard}>
                <span className={styles.storyEyebrow}>{tr("Today's market story")}</span>
                <h2 className={styles.storyTitle}>{marketStoryTitle}</h2>
                <p className={styles.storyText}>{marketStoryBody}</p>
                <div className={styles.storyPoints}>
                  <div className={styles.storyPoint}>
                    <span className={styles.storyPointLabel}>{tr("Breadth")}</span>
                    <strong>{fmtPct(breadthRatio)}</strong>
                  </div>
                  <div className={styles.storyPoint}>
                    <span className={styles.storyPointLabel}>{tr("Index move")}</span>
                    <strong>{fmtPct(niftyChange)}</strong>
                  </div>
                  <div className={styles.storyPoint}>
                    <span className={styles.storyPointLabel}>{tr("Leading sector")}</span>
                    <strong>{leadSector}</strong>
                  </div>
                </div>
              </article>

              <article className={styles.storyCard}>
                <span className={styles.storyEyebrow}>{tr("Leaders and laggers")}</span>
                <div className={styles.moversGrid}>
                  <div className={styles.moversColumn}>
                    <h2 className={styles.storyTitle}>{tr("Top gainers")}</h2>
                    {topUp.map((stock) => (
                      <button
                        key={stock.symbol}
                        type="button"
                        className={styles.moverRow}
                        onClick={() => {
                          void trackSelectContent("stock", stock.symbol, {
                            symbol: stock.symbol,
                            source_surface: "home_top_gainers"
                          });
                          navigate(`/analytics/stock/${encodeURIComponent(stock.symbol)}`);
                        }}
                      >
                        <span>{stock.symbol}</span>
                        <strong data-dir="up">{fmtPct(stock.changePct)}</strong>
                      </button>
                    ))}
                  </div>
                  <div className={styles.moversColumn}>
                    <h2 className={styles.storyTitle}>{tr("Top losers")}</h2>
                    {topDown.map((stock) => (
                      <button
                        key={stock.symbol}
                        type="button"
                        className={styles.moverRow}
                        onClick={() => {
                          void trackSelectContent("stock", stock.symbol, {
                            symbol: stock.symbol,
                            source_surface: "home_top_losers"
                          });
                          navigate(`/analytics/stock/${encodeURIComponent(stock.symbol)}`);
                        }}
                      >
                        <span>{stock.symbol}</span>
                        <strong data-dir="down">{fmtPct(stock.changePct)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            </div>
          </div>
        </details>

        <details className={styles.foldSection} open={mode === "beginner"}>
          <summary className={styles.foldSummary}>{tr("Where next?")}</summary>
          <div ref={whereNextRef} data-analytics-section="home_where_next" className={styles.foldBody}>
            <div className={styles.whereNextGrid}>
              <button
                type="button"
                className={styles.whereNextCard}
                onClick={() => {
                  engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "open_market_hub" };
                  void trackCtaClick({
                    cta_name: "open_market_hub",
                    page_section: "home_where_next",
                    page_family: "overview",
                    page_path: "/",
                  });
                  navigate("/analytics");
                }}
              >
                <span className={styles.storyEyebrow}>{tr("Market Hub")}</span>
                <h2 className={styles.storyTitle}>{tr("Understand the current market picture.")}</h2>
                <p className={styles.storyText}>{tr("Open this when you want the headline regime, breadth, and routing decisions in one place.")}</p>
              </button>
              <button
                type="button"
                className={styles.whereNextCard}
                onClick={() => {
                  engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "open_market_story" };
                  void trackCtaClick({
                    cta_name: "open_market_story",
                    page_section: "home_where_next",
                    page_family: "overview",
                    page_path: "/",
                  });
                  navigate("/analytics/regime");
                }}
              >
                <span className={styles.storyEyebrow}>{tr("Market Story")}</span>
                <h2 className={styles.storyTitle}>{tr("Check whether the move is broad enough to trust.")}</h2>
                <p className={styles.storyText}>{tr("Use this when you need to separate healthy participation from narrow or unstable leadership.")}</p>
              </button>
              <button
                type="button"
                className={styles.whereNextCard}
                onClick={() => {
                  engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "open_heatmaps" };
                  void trackCtaClick({
                    cta_name: "open_heatmaps",
                    page_section: "home_where_next",
                    page_family: "overview",
                    page_path: "/",
                  });
                  navigate("/heatmap/change");
                }}
              >
                <span className={styles.storyEyebrow}>{tr("Heatmaps & Signals")}</span>
                <h2 className={styles.storyTitle}>{tr("Inspect stock-level strength and weakness.")}</h2>
                <p className={styles.storyText}>{tr("Move here after the tape is clear and you want a deeper scan of leadership, RSI, or WILLR extremes.")}</p>
              </button>
              <button
                type="button"
                className={styles.whereNextCard}
                onClick={() => {
                  engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "open_strategy_lab" };
                  void trackCtaClick({
                    cta_name: "open_strategy_lab",
                    page_section: "home_where_next",
                    page_family: "overview",
                    page_path: "/",
                  });
                  navigate("/analytics/learn");
                }}
              >
                <span className={styles.storyEyebrow}>{tr("Strategy Lab")}</span>
                <h2 className={styles.storyTitle}>{tr("Check whether history supports the signal family.")}</h2>
                <p className={styles.storyText}>{tr("Use this before the simulator when you want historical evidence, not just the live tape.")}</p>
              </button>
            </div>
          </div>
        </details>

        {mode === "beginner" ? (
          <>
            <div className={styles.sectionToolbar}>
              <div className={styles.sectionIntro}>
                <span className={styles.sectionTitle}>{tr("How to read")}</span>
                <span className={styles.sectionSubtitle}>
                  {tr("Open the visual guide for the full legend, row anatomy, and scan order.")}
                </span>
              </div>
              <button
                type="button"
                className={styles.helpButton}
                onClick={() => {
                  void trackWidgetExpanded({
                    widget_id: "home_how_to_read",
                    source_surface: "home_bottom"
                  });
                  setHelpOpen(true);
                }}
                aria-label={tr("Open how to read visual guide")}
              >
                {tr("Open visual guide")}
              </button>
            </div>
            <PageIntroAccordion
              label={tr("How to read")}
              title={tr("Read the indices, then scan sectors, then drill down.")}
              body={tr("Use the top strip to judge index tone, then use the sector heatmap for breadth and rotation before opening deeper workspaces.")}
              items={[
                tr("NIFTY and BANK NIFTY tell you headline direction."),
                tr("INDIA VIX tells you whether the session is calm or stressed."),
                tr("The sector map tells you whether leadership is broad or concentrated.")
              ]}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}
