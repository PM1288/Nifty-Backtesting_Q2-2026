import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useAuthGate } from "../auth/AuthGateProvider";
import { getSessionCsrfToken, refreshCsrfToken } from "../lib/session";
import { useSearchParams } from "react-router-dom";
import {
  LearnAboutThisAnalysis,
  RelatedJourney,
} from "../components/navigation/StrategicPrimitives";
import {
  AccountingLaneOverview,
  AnalysisContextBar,
  CalculationTraceDrawer,
  PaperWorkbenchHeader,
  PaperWorkbenchSubnav,
} from "../components/paper/PaperWorkbenchPrimitives";
import {
  DEFAULT_PAPER_CONTEXT,
  PAPER_METRIC_DEFINITIONS,
  parsePaperWorkbenchContext,
  paperPeriodStart,
  serializePaperWorkbenchContext,
  type PaperMetricDefinition,
  type PaperWorkbenchContext,
  type PaperWorkbenchSection,
} from "../lib/paperWorkbench";
import styles from "./PaperTradingCommandCenter.module.css";
import { isPaperExecutionClosed } from "../lib/paperAtlas";
import { PAPER_EVIDENCE_DENSITIES, PAPER_EVIDENCE_PRESETS } from "../lib/paperEvidenceGeometry";
import {
  buildOiisSurfaceGrid,
  oiisAxisDefinitions,
  oiisSurfaceColor,
  oiisSurfaceDomain,
  oiisSurfacePoints,
  type OiisAxisPreset,
  type OiisSurfaceLens,
} from "../lib/paperOiisSurface";
import {
  buildPaperParallelRows,
  minimumOneAxisScale,
  paperParallelAxes,
  type PaperParallelAxisId,
} from "../lib/paperParallelPlot";
import { downloadStandaloneParallelHtml } from "../lib/paperParallelHtml";
import {
  buildPaperSimpleCsv,
  buildPaperSimpleExcel,
  buildPaperSimpleRow,
  paperSimpleIstDateTime,
  type PaperSimpleRow,
} from "../lib/paperSimpleView";
import { matchesStockProfile, type StockProfile, type StockProfileFilters, useProfileIndex } from "../lib/stockProfiles";
import { StockIdentity, StockUniverseFilterBar } from "../components/stocks/StockProfileControls";
import { StockLogo } from "../components/stocks/StockProfileControls";
import {
  ActionCell,
  CapitalCell,
  CarryCell,
  CommentsCell,
  DirectionCell,
  EconomicsCell,
  HorizonCell,
  QualityCell,
  RewardPainCell,
  StrategyCell,
  TargetOutcomeCell,
  TimeInTradeCell,
  TradeIdentityCell,
} from "../components/paper/PaperEvidenceCells";
import { PaperTrackedStocks } from "../components/paper/PaperTrackedStocks";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
type AnyRow = Record<string, any>;
type DrawerTab = "Journey" | "Targets" | "Market Book" | "Evidence" | "Economics" | "Comments" | "Audit" | "Calculation Trace";
type AtlasLens = "Intraday" | "5D" | "30D";
type PageView = "PORTFOLIO" | "SIMPLE" | "TRACKED" | "WHAT_GOOD_LOOKS_LIKE";
type HeatmapView = "YEAR" | "WEEK" | "INTRADAY";
type HeatmapMetric = "EOD_PNL" | "MAX_PROFIT" | "MAX_DRAWDOWN" | "TARGET_HITS";
type IntradayEventFilter = "ALL" | "ENTRY" | "TARGET" | "EOD";
type CalculationTrace = { definition: PaperMetricDefinition; value: unknown; inputs: Record<string, unknown>; asOf: string };

const number = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const qualityRatingColor = (value: unknown) => {
  const rating = Math.max(0, Math.min(5, number(value)));
  return `hsl(${(rating / 5) * 130} 68% 39%)`;
};
const compact = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number(value));
const money = (value: unknown) =>
  `${number(value) < 0 ? "−" : ""}₹${Math.abs(number(value)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const moneyOrDash = (value: unknown) =>
  value == null || !Number.isFinite(Number(value)) ? "—" : money(value);
const compactOrDash = (value: unknown) =>
  value == null || !Number.isFinite(Number(value)) ? "—" : compact(value);
const percent = (value: unknown, digits = 2) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : `${number(value) > 0 ? "+" : ""}${number(value).toFixed(digits)}%`;
const ratioPercent = (value: unknown, digits = 1) =>
  value == null ? "—" : percent(number(value) * 100, digits);
const time = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

function istDateKey(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00.000Z`);
}

function shiftDateKey(key: string, days: number) {
  const date = dateFromKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function displayDateKey(key: string, options?: Intl.DateTimeFormatOptions) {
  return dateFromKey(key).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  });
}

function targetLabel(value: unknown) {
  const target = number(value) * 100;
  return `+${target.toFixed(target < 1 ? 1 : 0)}%`;
}

function targetState(target: AnyRow) {
  if (["HIT", "CLOSED_AT_TARGET"].includes(String(target.status))) return "HIT";
  if (["NOT_HIT_INTRADAY", "TIMED_OUT"].includes(String(target.status)))
    return "FAILED";
  return "PENDING";
}

type HorizonTarget = {
  label: string;
  value: string;
  hits?: number;
  eligible?: number;
};

function targetProfit(target: AnyRow, trade: AnyRow) {
  const entryPrice = number(trade.average_entry_price);
  const targetPrice = number(target.target_price);
  const quantity = number(trade.opened_quantity);
  if (entryPrice <= 0 || targetPrice <= 0 || quantity <= 0) return null;
  const perShare =
    String(trade.side).toUpperCase() === "SELL"
      ? entryPrice - targetPrice
      : targetPrice - entryPrice;
  const fixedQuantity = number(trade.fixed_investment_quantity);
  return {
    perShare,
    total: perShare * quantity,
    quantity,
    fixedTotal: fixedQuantity > 0 ? perShare * fixedQuantity : null,
  };
}

function downloadPaperCsv(trades: AnyRow[], context: PaperWorkbenchContext, asOf: string) {
  const exportTrades = trades.map((trade) => ({
    ...trade,
    booked_accounting_class: "BOOKED",
    open_accounting_class: "OPEN_ACTUAL",
    target_accounting_class: "OBSERVED",
    carry_accounting_class: "HYPOTHETICAL",
    fixed_capital_accounting_class: "SIMULATED",
    gross_net_warning: "realised_net_pnl is NET; open_unrealised_gross_pnl and counterfactual paths are GROSS",
  }));
  const columns = [...new Set(exportTrades.flatMap((trade) => Object.keys(trade).filter((key) => !["targets", "horizons", "trade_quality"].includes(key))))].sort();
  const escape = (value: unknown) => {
    const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const metadata = [
    ["exported_at", new Date().toISOString()],
    ["data_as_of", asOf],
    ["environment", "PAPER"],
    ["filters", JSON.stringify(context)],
    ["population", trades.length],
    ["policy_version", "CASH_EQUITY_TRADE_QUALITY_V1"],
    ["warning", "Booked, open, observed, hypothetical and simulated values are separate accounting classes."],
  ];
  const rows = [
    ...metadata.map(([key, value]) => `${escape(key)},${escape(value)}`),
    "",
    columns.map(escape).join(","),
    ...exportTrades.map((trade) => columns.map((column) => escape(trade[column as keyof typeof trade])).join(",")),
  ];
  const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `paper-trading-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function usePaperData(authReady: boolean, authenticatedUserId?: string) {
  const [data, setData] = useState<AnyRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!authReady || !authenticatedUserId) {
      setData(null);
      setError(null);
      setDetailError(null);
      setDetailsLoading(false);
      setLoadingSlow(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setError(null);
    setDetailError(null);
    setDetailsLoading(true);
    setLoadingSlow(false);
    const slowTimer = window.setTimeout(() => {
      if (active) setLoadingSlow(true);
    }, 3_000);
    const fetchPayload = async (pathname: string) => {
      const response = await fetch(`${API_BASE_URL}${pathname}`, {
        credentials: "include",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
      return response.json();
    };
    const load = async () => {
      let bootstrapLoaded = false;
      try {
        const bootstrap = await fetchPayload("/v1/workspace/paper-trading/bootstrap");
        if (!active) return;
        bootstrapLoaded = true;
        setData(bootstrap);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        if (active) setDetailError(`Summary bootstrap delayed: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
      try {
        const payload = await fetchPayload("/v1/workspace/paper-trading");
        if (!active) return;
        window.clearTimeout(slowTimer);
        setLoadingSlow(false);
        setDetailError(null);
        setData(payload);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        window.clearTimeout(slowTimer);
        if (!active) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        if (bootstrapLoaded || data) setDetailError(message);
        else setError(message);
      } finally {
        if (active) setDetailsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      window.clearTimeout(slowTimer);
      controller.abort();
    };
  }, [authReady, authenticatedUserId, key]);
  return { data, error, detailError, detailsLoading, loadingSlow, reload: () => setKey((value) => value + 1) };
}

export function PaperTradingCommandCenter() {
  const { user, authReady } = useAuthGate();
  const query = usePaperData(authReady, user?.uid);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [entryFilter, setEntryFilter] = useState("ALL");
  const [sort, setSort] = useState("NEWEST");
  const [lens, setLens] = useState<AtlasLens>("5D");
  const [selectedTrade, setSelectedTrade] = useState<AnyRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [calm, setCalm] = useState(false);
  const [profileFilters, setProfileFilters] = useState<StockProfileFilters>({ universe: "ALL", capBucket: "ALL", sector: "ALL" });
  const profiles = useProfileIndex();
  const [routeParams, setRouteParams] = useSearchParams();
  const [workbenchContext, setWorkbenchContext] = useState<PaperWorkbenchContext>(() => parsePaperWorkbenchContext(routeParams));
  const [calculationTrace, setCalculationTrace] = useState<CalculationTrace | null>(null);
  const [pageView, setPageView] = useState<PageView>(
    routeParams.get("tab") === "tracked"
      ? "TRACKED"
      : routeParams.get("tab") === "quality"
      ? "WHAT_GOOD_LOOKS_LIKE"
      : routeParams.get("tab") === "simple"
        ? "SIMPLE"
        : "PORTFOLIO",
  );

  useEffect(() => {
    const focusSearch = () => searchRef.current?.focus();
    const add = () => setAddOpen(true);
    const close = () => {
      setSelectedTrade(null);
      setAddOpen(false);
    };
    window.addEventListener("n50:focus-page-search", focusSearch);
    window.addEventListener("n50:paper-add", add);
    window.addEventListener("n50:close-active-surface", close);
    return () => {
      window.removeEventListener("n50:focus-page-search", focusSearch);
      window.removeEventListener("n50:paper-add", add);
      window.removeEventListener("n50:close-active-surface", close);
    };
  }, []);

  useEffect(() => {
    if (routeParams.get("action") === "add") setAddOpen(true);
  }, [routeParams]);
  useEffect(() => {
    const tab = routeParams.get("tab");
    setPageView(tab === "tracked" ? "TRACKED" : tab === "quality" ? "WHAT_GOOD_LOOKS_LIKE" : tab === "simple" ? "SIMPLE" : "PORTFOLIO");
  }, [routeParams]);
  useEffect(() => {
    setFilter(workbenchContext.status);
    setEntryFilter(workbenchContext.strategy);
    if (workbenchContext.horizon !== "Intraday") setLens(workbenchContext.horizon);
  }, []);

  const changeWorkbenchContext = <K extends keyof PaperWorkbenchContext>(key: K, value: PaperWorkbenchContext[K]) => {
    const next = { ...workbenchContext, [key]: value };
    setWorkbenchContext(next);
    setRouteParams(serializePaperWorkbenchContext(next, routeParams), { replace: true });
    if (key === "status") setFilter(String(value));
    if (key === "strategy") setEntryFilter(String(value));
    if (key === "horizon" && value !== "Intraday") setLens(value as AtlasLens);
  };

  const changePageView = (view: PageView) => {
    setPageView(view);
    const next = new URLSearchParams(routeParams);
    if (view === "TRACKED") next.set("tab", "tracked");
    else if (view === "SIMPLE") next.set("tab", "simple");
    else if (view === "WHAT_GOOD_LOOKS_LIKE") next.set("tab", "quality");
    else next.delete("tab");
    setRouteParams(next, { replace: true });
  };

  const selectWorkbenchSection = (section: PaperWorkbenchSection) => {
    changeWorkbenchContext("section", section);
    window.requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" }));
  };
  const openSelectedTrade = (trade: AnyRow) => {
    setSelectedTrade(trade);
    const next = new URLSearchParams(routeParams);
    next.set("tradeId", String(trade.trade_group_id));
    setRouteParams(next, { replace: true });
  };
  const closeSelectedTrade = () => {
    setSelectedTrade(null);
    const next = new URLSearchParams(routeParams);
    next.delete("tradeId");
    setRouteParams(next, { replace: true });
  };
  useEffect(() => {
    const tradeId = routeParams.get("tradeId");
    if (!tradeId || !query.data?.stockTrades?.length) return;
    const trade = query.data.stockTrades.find(
      (row: AnyRow) => String(row.trade_group_id) === tradeId,
    );
    if (trade) setSelectedTrade(trade);
  }, [query.data?.stockTrades, routeParams]);

  if (query.error && !query.data)
    return (
      <div className={styles.state}>
        <strong>Paper evaluation unavailable</strong>
        <span>{query.error}</span>
        <button type="button" onClick={query.reload}>Retry paper observations</button>
      </div>
    );
  if (!query.data)
    return (
      <div className={styles.state}>
        <span>{query.loadingSlow ? "Paper observations are taking longer than expected…" : "Loading durable PAPER observations…"}</span>
        {query.loadingSlow ? <small>The page is waiting for the canonical ledger; no paper action is being repeated.</small> : null}
      </div>
    );

  const data = query.data;
  const canManageComments =
    user?.role === "admin" && data.permissions?.can_manage_comments === true;
  const canManageTradeQuality =
    user?.role === "admin" && data.permissions?.can_manage_trade_quality === true;
  const summary = data.summary ?? {};
  const trades: AnyRow[] = data.stockTrades ?? [];
  const gradeCounts = summary.grade_counts ?? {};
  const filtered = trades
    .filter((trade) => {
      const term = search.trim().toUpperCase();
      if (
        term &&
        !String(trade.symbol).toUpperCase().includes(term) &&
        !String(trade.strategy_id).toUpperCase().includes(term) &&
        !String(trade.entry_strategy ?? "").toUpperCase().includes(term) &&
        !String(trade.latest_comment ?? "")
          .toUpperCase()
          .includes(term)
      )
        return false;
      if (entryFilter !== "ALL" && String(trade.entry_strategy) !== entryFilter)
        return false;
      if (!matchesStockProfile(profiles.bySymbol.get(String(trade.symbol).toUpperCase()), profileFilters)) return false;
      if (workbenchContext.direction !== "ALL" && String(trade.side).toUpperCase() !== workbenchContext.direction)
        return false;
      const periodStart = paperPeriodStart(workbenchContext.period);
      if (periodStart != null && new Date(String(trade.opened_at)).getTime() < periodStart)
        return false;
      if (filter === "OPEN") return number(trade.remaining_quantity) > 0;
      if (filter === "CLOSED") return number(trade.remaining_quantity) <= 0;
      if (filter === "ATTENTION")
        return ["BAD", "AT_RISK", "MIXED"].includes(trade.analytical_grade);
      if (filter === "DEVELOPING")
        return trade.analytical_grade === "DEVELOPING";
      if (filter === "GOOD")
        return ["EXCELLENT", "GOOD"].includes(trade.analytical_grade);
      if (filter === "BAD_RISK")
        return ["BAD", "AT_RISK"].includes(trade.analytical_grade);
      if (filter === "MIXED")
        return ["MIXED", "WEAK"].includes(trade.analytical_grade);
      return true;
    })
    .sort((a, b) =>
      sort === "NEWEST"
        ? new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()
        : sort === "MFE"
          ? number(b.mfe_5d_pct) - number(a.mfe_5d_pct)
          : sort === "MAE"
            ? number(a.mae_5d_pct) - number(b.mae_5d_pct)
            : sort === "PNL"
              ? number(b.actual_pnl) - number(a.actual_pnl)
              : number(b.quality_score) - number(a.quality_score),
    );
  const conversions: AnyRow[] = data.targetConversion ?? [];
  const intradayConversion = conversions.filter(
    (item) => item.lifecycle === "INTRADAY",
  );
  const swingConversion = conversions.filter(
    (item) => item.lifecycle === "SWING",
  );
  const good = number(gradeCounts.EXCELLENT) + number(gradeCounts.GOOD);
  const bad = number(gradeCounts.BAD) + number(gradeCounts.AT_RISK);
  const mixed = number(gradeCounts.MIXED) + number(gradeCounts.WEAK);
  const developing = number(gradeCounts.DEVELOPING);
  const scenarios: AnyRow[] = data.targetExitScenarios ?? [];
  const fixedCapitalScenarios: AnyRow[] = data.fixedCapitalPortfolioScenarios ?? [];
  const fixedCapitalStrategyComparisons: AnyRow[] = data.fixedCapitalPortfolioStrategyComparisons ?? [];
  const fixedCapitalSwingOnlyScenarios: AnyRow[] = data.fixedCapitalSwingOnlyScenarios ?? [];
  const fixedCapitalSwingOnlyStrategyComparisons: AnyRow[] = data.fixedCapitalSwingOnlyStrategyComparisons ?? [];
  const mature = number(summary.mature_trade_count);
  const evidenceTitle =
    mature === 0
      ? "Too early to judge portfolio quality"
      : bad > good
        ? "Risk-heavy evidence"
        : good > bad
          ? "Favourable evidence"
          : "Mixed evidence";
  const evidenceCopy =
    mature === 0
      ? `None of the ${trades.length} trades has reached five-session maturity. ${bad} ${bad === 1 ? "trade needs" : "trades need"} attention now; ${developing} ${developing === 1 ? "is" : "are"} still developing.`
      : `${mature} of ${trades.length} trades have reached five-session maturity. Evidence remains separate from booked execution P&L.`;
  const strategyOptions = [...new Set(trades.map((trade) => String(trade.entry_strategy ?? "UNSPECIFIED")))].sort();
  const appliedFilterCount = (Object.keys(DEFAULT_PAPER_CONTEXT) as Array<keyof PaperWorkbenchContext>)
    .filter((key) => key !== "section" && workbenchContext[key] !== DEFAULT_PAPER_CONTEXT[key]).length;
  const overviewSummary = {
    ...summary,
    never_closed_carry: trades.reduce((total, trade) => total + number(trade.hypothetical_carry_pnl), 0),
  };
  const formattedAsOf = time(data.asOf);
  const openTrace = (definition: PaperMetricDefinition, value: unknown, inputs: Record<string, unknown>) => setCalculationTrace({ definition, value, inputs, asOf: formattedAsOf });
  const exportCurrentView = () => downloadPaperCsv(filtered, workbenchContext, String(data.asOf));
  const saveCurrentView = () => {
    window.localStorage.setItem("n50.paper-workbench.saved-view", JSON.stringify({ name: `Paper view ${new Date().toLocaleString("en-IN")}`, context: workbenchContext, savedAt: new Date().toISOString() }));
  };
  const copyCurrentLink = () => navigator.clipboard?.writeText(window.location.href);

  return (
    <div className={styles.page} data-calm={calm ? "true" : "false"}>
      <PaperWorkbenchHeader
        tradeCount={trades.length || number(summary.total_groups)}
        openCount={number(summary.open_positions)}
        trackCount={number(summary.active_target_tracks)}
        incidentCount={number(summary.open_data_incidents)}
        asOf={formattedAsOf}
        version={String(summary.quality_policy_version ?? "—")}
        onAdd={() => setAddOpen(true)}
        onExport={exportCurrentView}
        onSave={saveCurrentView}
        calm={calm}
        onCalm={() => setCalm((value) => !value)}
      />

      {query.detailsLoading ? (
        <section className={styles.hydrationNotice} role="status">
          <strong>Portfolio summary ready</strong>
          <span>Loading complete trade paths, targets, quality evidence and simulations in the background. This request will continue beyond 60 seconds if necessary.</span>
        </section>
      ) : query.detailError || query.error ? (
        <section className={styles.hydrationNotice} data-error="true" role="alert">
          <strong>Summary remains available</strong>
          <span>{query.detailError ?? query.error}</span>
          <button type="button" onClick={query.reload}>Retry detailed evidence</button>
        </section>
      ) : null}

      <nav className={styles.pageTabs} aria-label="Paper Trading views">
        <button type="button" data-active={pageView === "PORTFOLIO"} onClick={() => changePageView("PORTFOLIO")}>
          Portfolio &amp; trades
        </button>
        <button type="button" data-active={pageView === "SIMPLE"} onClick={() => changePageView("SIMPLE")}>
          Simple view
        </button>
        <button type="button" data-active={pageView === "TRACKED"} onClick={() => changePageView("TRACKED")}>
          Stocks being tracked today
        </button>
        <button type="button" data-active={pageView === "WHAT_GOOD_LOOKS_LIKE"} onClick={() => changePageView("WHAT_GOOD_LOOKS_LIKE")}>
          What good looks like
        </button>
      </nav>

      {pageView !== "WHAT_GOOD_LOOKS_LIKE" && pageView !== "TRACKED" ? <>
        {pageView === "PORTFOLIO" ? <PaperWorkbenchSubnav
          active={workbenchContext.section}
          onSelect={selectWorkbenchSection}
          counts={{
            "trade-evidence": `${filtered.length} trades`,
            "path-through-time": `${mature} mature · ${developing} developing`,
            "reward-pain": `${bad} attention`,
            "methodology-audit": `${number(summary.open_data_incidents)} incidents`,
          }}
        /> : null}
        <AnalysisContextBar
          context={workbenchContext}
          strategyOptions={strategyOptions}
          appliedCount={appliedFilterCount}
          asOf={formattedAsOf}
          onChange={changeWorkbenchContext}
          onClear={() => {
            setWorkbenchContext(DEFAULT_PAPER_CONTEXT);
            setFilter("ALL");
            setEntryFilter("ALL");
            setRouteParams(serializePaperWorkbenchContext(DEFAULT_PAPER_CONTEXT, routeParams), { replace: true });
          }}
          onLoadSaved={() => {
            try {
              const saved = JSON.parse(window.localStorage.getItem("n50.paper-workbench.saved-view") ?? "null");
              const restored = saved?.context ? parsePaperWorkbenchContext(serializePaperWorkbenchContext(saved.context)) : DEFAULT_PAPER_CONTEXT;
              setWorkbenchContext(restored);
              setFilter(restored.status);
              setEntryFilter(restored.strategy);
              setRouteParams(serializePaperWorkbenchContext(restored, routeParams), { replace: true });
            } catch {
              window.localStorage.removeItem("n50.paper-workbench.saved-view");
            }
          }}
          onCopy={copyCurrentLink}
          onExport={exportCurrentView}
          classificationFilters={<StockUniverseFilterBar profiles={profiles.payload?.records ?? []} filters={profileFilters} onChange={setProfileFilters} count={filtered.length} compact />}
        />
      </> : null}

      {pageView === "WHAT_GOOD_LOOKS_LIKE" ? (
        <TradeQualityGuide
          policy={data.tradeQualityPolicy}
          trades={trades}
          canReview={canManageTradeQuality}
          onSaved={query.reload}
        />
      ) : pageView === "SIMPLE" ? (
        <PaperSimpleView
          trades={filtered}
          profiles={profiles.bySymbol}
          search={search}
          onSearch={setSearch}
          sort={sort}
          onSort={setSort}
          onSelect={openSelectedTrade}
        />
      ) : pageView === "TRACKED" ? (
        <PaperTrackedStocks />
      ) : (
      <>

      {trades.length === 0 && query.detailsLoading ? (
        <section className={styles.emptyPortfolio} aria-busy="true">
          <span>DETAILED EVIDENCE LOADING</span>
          <h1>{number(summary.total_groups)} durable paper trades found</h1>
          <p>The accounting summary is ready. Complete targets, horizons, reward/pain paths and simulations are still being assembled.</p>
        </section>
      ) : trades.length === 0 ? (
        <section className={styles.emptyPortfolio}>
          <span>PAPER ONLY</span>
          <h1>No filled paper observations yet</h1>
          <p>
            Add a paper trade to begin D0, swing, D+5 and D+30 evaluation. No
            broker order is created.
          </p>
          <button onClick={() => setAddOpen(true)}>Add paper trade</button>
        </section>
      ) : (
        <>
          {workbenchContext.section === "overview" ? <div id="overview" className={styles.workbenchSection}>
            <header className={styles.workbenchSectionHeader}><span>OVERVIEW</span><h2>What is happening now?</h2><p>Execution accounting, path evidence, simulations and trust state remain in separate lanes.</p></header>
          <section className={styles.sessionNotice}>
            <i />
            <strong>Market observation status</strong>
            <span>
              Execution and analytical tracking are independent. Latest
              evaluated evidence: {time(data.asOf)} IST.
            </span>
          </section>
          <AccountingLaneOverview summary={overviewSummary} tradeCount={trades.length} asOf={String(data.asOf)} accounting={workbenchContext.accounting} onTrace={openTrace} onNavigate={selectWorkbenchSection} />
          <section id="executive" className={styles.summaryGrid} aria-label="Paper trading evidence summary" tabIndex={0}>
            <article className={styles.maturityBanner}>
              <span>EVIDENCE MATURITY</span>
              <h2>{evidenceTitle}</h2>
              <p>{evidenceCopy}</p>
              <div>
                <b>
                  {mature} / {trades.length} five-session mature
                </b>
                <b data-tone="risk">{bad} need attention</b>
                <b data-tone="developing">{developing} developing</b>
              </div>
            </article>
            <SummaryMetric
              label="Booked realised net"
              value={money(summary.realised_pnl)}
              note="Closed fills after costs and tax provision"
              tone={number(summary.realised_pnl) >= 0 ? "positive" : "negative"}
            />
            <SummaryMetric
              label="Open unrealised gross"
              value={money(summary.unrealised_pnl)}
              note={`${number(summary.open_positions)} execution positions still open`}
              tone={
                number(summary.unrealised_pnl) >= 0 ? "positive" : "negative"
              }
            />
            <SummaryMetric
              label="Observed favourable value"
              value={money(summary.analytical_upside)}
              note="Maximum reward observed; not a booked result"
              tone="positive"
            />
            <SummaryMetric
              label="Observed adverse value"
              value={money(summary.analytical_downside)}
              note="Maximum observed pain; direction normalised"
              tone="negative"
            />
          </section>
          </div> : null}

          {workbenchContext.section === "factor-analysis" ? <div id="factor-analysis" className={styles.workbenchSection}>
            <header className={styles.workbenchSectionHeader}><span>FACTOR ANALYSIS</span><h2>How do entry conditions connect to every outcome horizon?</h2><p>The primary view now follows each stock across O/X factors, entry indicators, entry point and D0, swing, 5D and 30D evidence in one parallel-coordinates plot.</p></header>
            <PaperParallelEvidencePlot trades={filtered} onSelect={openSelectedTrade} />
            <details className={styles.legacyFactorSurface}>
              <summary>Open two-factor contour surfaces</summary>
              <p>The prior pairwise contour view remains available as secondary evidence; it is no longer the main Paper Trading factor chart.</p>
              <OiisContourSurface trades={filtered} onSelect={openSelectedTrade} />
            </details>
          </div> : null}

          {workbenchContext.section === "capital-recycling" ? <div id="capital-recycling" className={styles.workbenchSection}>
            <header className={styles.workbenchSectionHeader}><span>CAPITAL RECYCLING</span><h2>How did fixed-capital allocation behave?</h2><p>Each entry strategy runs in its own ledger. First-governed and swing-only exit policies remain separate simulations.</p></header>
          <FixedCapitalPortfolioSimulator mode="FIRST_GOVERNED" comparisons={fixedCapitalStrategyComparisons} fallbackScenarios={fixedCapitalScenarios} trades={trades} onSelect={openSelectedTrade} />
          <FixedCapitalPortfolioSimulator mode="SWING_ONLY" comparisons={fixedCapitalSwingOnlyStrategyComparisons} fallbackScenarios={fixedCapitalSwingOnlyScenarios} trades={trades} onSelect={openSelectedTrade} />
          </div> : null}

          {workbenchContext.section === "path-through-time" ? <div id="path-through-time" className={styles.workbenchSection}>
            <header className={styles.workbenchSectionHeader}><span>PATH THROUGH TIME</span><h2>When did evidence mature, improve or deteriorate?</h2><p>Market-closed, no-event, missing and ineligible states remain distinct.</p></header>
            <TradePerformanceHeatmap trades={filtered} />
          </div> : null}

          {workbenchContext.section === "reward-pain" ? <div id="reward-pain" className={styles.workbenchSection}>
            <header className={styles.workbenchSectionHeader}><span>REWARD &amp; PAIN</span><h2>How much favourable and adverse path did each trade experience?</h2><p>Observed excursions are evidence, not booked execution and not proof of an executable extreme.</p></header>
          <section id="atlas" className={styles.analyticsGrid}>
            <article className={styles.atlasPanel}>
              <header>
                <div>
                  <h2>Reward vs pain map</h2>
                  <p>
                    Higher is more favourable. Further right is deeper adverse
                    excursion. Bubble colour and number show the live trade-quality
                    grade and percentage; a green border means execution is closed.
                  </p>
                </div>
                <div className={styles.lensTabs}>
                  {(["5D", "30D"] as AtlasLens[]).map((item) => (
                    <button
                      key={item}
                      data-active={lens === item}
                      onClick={() => setLens(item)}
                    >
                      {item} observed
                    </button>
                  ))}
                </div>
              </header>
              <RewardPainAtlas
                trades={trades}
                lens={lens}
                onSelect={openSelectedTrade}
              />
            </article>
            <article className={styles.conversionPanel}>
              <header>
                <h2>Outcome conversion</h2>
                <p>
                  Eligible evidence only; intraday uses minutes and swing uses
                  trading sessions.
                </p>
              </header>
              <ConversionSummary
                intraday={intradayConversion}
                swing={swingConversion}
                trades={trades}
              />
              <AttentionList trades={trades} onSelect={openSelectedTrade} />
            </article>
          </section>
          </div> : null}

          {workbenchContext.section === "trade-evidence" ? <section id="trade-evidence" className={`${styles.tradeMatrixPanel} ${styles.workbenchSection}`}>
            <header>
              <div>
                <span>ALL PAPER TRADES</span>
                <h2>Complete trade evidence</h2>
                <p>
                  Seven target outcomes, the entry-session 15:30 result, 5D and 30D
                  maturity, maximum reward/pain and never-closed carry stay together.
                </p>
              </div>
              <div className={styles.matrixTools}>
                <label>
                  <span>Find</span>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Symbol or strategy · /"
                  />
                </label>
                <select
                  aria-label="Filter paper trades"
                  value={filter}
                  onChange={(event) => { setFilter(event.target.value); changeWorkbenchContext("status", event.target.value); }}
                >
                  <option value="ALL">All trades</option>
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                  <option value="ATTENTION">Needs attention</option>
                  <option value="DEVELOPING">Developing</option>
                </select>
                <select
                  aria-label="Sort paper trades"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="NEWEST">Entry date · newest first</option>
                  <option value="QUALITY">Evidence state</option>
                  <option value="MFE">Highest MFE</option>
                  <option value="MAE">Deepest MAE</option>
                  <option value="PNL">Actual P&amp;L</option>
                </select>
                <select
                  aria-label="Filter by entry strategy"
                  value={entryFilter}
                  onChange={(event) => { setEntryFilter(event.target.value); changeWorkbenchContext("strategy", event.target.value); }}
                >
                  <option value="ALL">All entry strategies</option>
                  <option value="RSI_WILLR">RSI / Williams %R</option>
                  <option value="PRICE_MOMENTUM_1D_1H_15M">Price momentum 1D / 1H / 15M</option>
                  <option value="QUALITY_SUM_THRESHOLD">Legacy run-quality entry</option>
                  <option value="UNSPECIFIED">Manual / unspecified</option>
                </select>
              </div>
            </header>
            <TradeEvidenceTotals trades={filtered} />
            <UnifiedTradeMatrix
              trades={filtered}
              onSelect={openSelectedTrade}
              showComments={canManageComments}
              profiles={profiles.bySymbol}
            />
          </section> : null}

          {workbenchContext.section === "scenario-analysis" ? <div id="scenario-analysis" className={styles.workbenchSection}>
            <header className={styles.workbenchSectionHeader}><span>SCENARIO ANALYSIS</span><h2>How do governed and counterfactual exits differ?</h2><p>Low, medium and high target scenarios remain hypothetical and never overwrite the canonical ledger.</p></header>
            <TargetScenarioStrip scenarios={scenarios} />
          </div> : null}
          <section id="open-monitor" className={styles.monitorStrip}>
            <strong>Observation monitor</strong>
            <span>
              {number(summary.open_positions)} execution positions open
            </span>
            <span>
              {number(summary.active_target_tracks)} analytical tracks active
            </span>
            <span>{number(summary.open_data_incidents)} data incidents</span>
            <time>Evaluated {time(data.asOf)} IST</time>
          </section>
        </>
      )}
      </>
      )}

      {pageView !== "SIMPLE" && (pageView === "WHAT_GOOD_LOOKS_LIKE" || workbenchContext.section === "methodology-audit") ? <div id="methodology-audit" className={styles.workbenchSection}>
      <header className={styles.workbenchSectionHeader}><span>METHODOLOGY, DATA QUALITY &amp; AUDIT</span><h2>Can this evidence be trusted and reproduced?</h2><p>Definitions, source freshness, versioned formula ownership and direct links to affected evidence are kept together.</p></header>
      <PaperDataQualityPanel data={data} trades={trades} />
      <RelatedJourney
        title="Related evidence"
        items={[
          {
            id: "oiis",
            title: "Originating strategy evidence",
            detail: "Inspect current OIIS selection and gates",
            to: "/strategy/oiis-live?source=paper-trading",
            actionLabel: "Open OIIS",
          },
          {
            id: "stock",
            title: "Stock 360",
            detail: selectedTrade
              ? `${selectedTrade.symbol} at entry and current evidence`
              : "Open a trade, then inspect its stock context",
            to: selectedTrade
              ? `/analytics/stock/${encodeURIComponent(selectedTrade.symbol)}?tradeId=${encodeURIComponent(selectedTrade.trade_group_id)}&source=paper-trading`
              : "/analytics/stock/RELIANCE?source=paper-trading",
          },
          {
            id: "history",
            title: "Historical cohort",
            detail: "Compare similar 30-day outcomes",
            to: "/backtesting/h30?source=paper-trading",
          },
          {
            id: "quality",
            title: "Data Quality",
            detail: `${number(summary.open_data_incidents)} current paper-data incidents`,
            to: "/analytics/system/quality?source=paper-trading",
          },
        ]}
      />
      <LearnAboutThisAnalysis
        sections={[
          {
            id: "read",
            title: "How to read this page",
            content: (
              <p>
                Actual execution economics and analytical observation are
                separate. Select a trade to inspect its journey, targets,
                evidence and audit record.
              </p>
            ),
          },
          {
            id: "methodology",
            title: "Methodology and calculation rules",
            content: (
              <p>
                Intraday uses the remaining D0 session. Swing uses D+1 through
                D+5. Five-session and thirty-session MFE and MAE continue after
                execution closes.
              </p>
            ),
          },
          {
            id: "definitions",
            title: "Definitions",
            content: (
              <>
                <p id="mfe">
                  <strong>MFE</strong> is maximum favourable excursion from the
                  entry price.
                </p>
                <p id="mae">
                  <strong>MAE</strong> is maximum adverse excursion from entry;
                  it is not portfolio drawdown.
                </p>
              </>
            ),
          },
          {
            id: "sources",
            title: "Data sources and freshness",
            content: (
              <p>
                Execution uses the durable paper ledger. Observation uses
                canonical cash-equity bars, exchange sessions and versioned
                target rules. Current evidence is dated above.
              </p>
            ),
          },
          {
            id: "limitations",
            title: "Limitations and assumptions",
            content: (
              <p>
                Daily and minute bars can leave same-bar target chronology
                unresolved. Such cases must remain explicitly ambiguous rather
                than inferred.
              </p>
            ),
          },
          {
            id: "version",
            title: "Formula and policy version",
            content: (
              <p>
                Each trade retains its immutable strategy, target-rule and
                quality-policy versions in the Audit tab.
              </p>
            ),
          },
        ]}
      />
      </div> : null}

      {selectedTrade ? (
        <TradeDrawer
          trade={selectedTrade}
          canManageComments={canManageComments}
          onCommentAdded={query.reload}
          onClose={closeSelectedTrade}
        />
      ) : null}
      {addOpen ? (
        <AddPaperTradeDialog
          initialSymbol={routeParams.get("symbol") ?? ""}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            query.reload();
          }}
        />
      ) : null}
      <CalculationTraceDrawer trace={calculationTrace} onClose={() => setCalculationTrace(null)} />
    </div>
  );
}

function downloadPaperSimpleFile(contents: string, mimeType: string, extension: "csv" | "xls") {
  const prefix = extension === "csv" ? "\uFEFF" : "";
  const url = URL.createObjectURL(new Blob([prefix, contents], { type: `${mimeType};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `paper-trading-simple-view-${new Date().toISOString().slice(0, 10)}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function simpleMoney(value: number | null) {
  return value == null ? "—" : money(value);
}

function simplePercent(value: number | null) {
  return value == null ? "—" : percent(value);
}

function simpleFactor(value: number | null) {
  return value == null ? "—" : value.toFixed(2);
}

function PaperSimpleView({
  trades,
  profiles,
  search,
  onSearch,
  sort,
  onSort,
  onSelect,
}: {
  trades: AnyRow[];
  profiles: Map<string, StockProfile>;
  search: string;
  onSearch: (value: string) => void;
  sort: string;
  onSort: (value: string) => void;
  onSelect: (trade: AnyRow) => void;
}) {
  type SimpleColumn = "stock" | "openedDate" | "openedTime" | "entry" | "oFactor" | "xFactor" | "dayHigh" | "dayLow" | "monthHigh" | "monthDrawdown" | "current";
  const [columnSort, setColumnSort] = useState<{ column: SimpleColumn; direction: "asc" | "desc" }>({ column: "openedDate", direction: "desc" });
  const [columnFilters, setColumnFilters] = useState<Partial<Record<SimpleColumn, string>>>({});
  const sourceRows: PaperSimpleRow[] = useMemo(() => trades.map((trade) => {
    const profile = profiles.get(String(trade.symbol).toUpperCase());
    return buildPaperSimpleRow(trade, profile?.name);
  }), [profiles, trades]);
  const filterValue = (row: PaperSimpleRow, column: SimpleColumn) => {
    const opened = paperSimpleIstDateTime(row.openedAt);
    const values: Record<SimpleColumn, unknown[]> = {
      stock: [row.stockName, row.symbol],
      openedDate: [opened.date, row.openedAt],
      openedTime: [opened.time],
      entry: [row.entryPrice],
      oFactor: [row.oFactor],
      xFactor: [row.xFactor],
      dayHigh: [row.dayHigh, row.dayHighPnl, row.dayHighPnlPct],
      dayLow: [row.dayLow, row.dayMaxDrawdown, row.dayMaxDrawdownPct],
      monthHigh: [row.monthHigh, row.monthHighPnl, row.monthHighPnlPct, row.monthPathState],
      monthDrawdown: [row.monthAdversePrice, row.monthMaxDrawdown, row.monthMaxDrawdownPct, row.monthPathState],
      current: [row.currentPrice, row.currentPnl, row.currentPnlPct, row.currentPnlBasis],
    };
    return values[column].filter((value) => value != null).join(" ").toUpperCase();
  };
  const sortValue = (row: PaperSimpleRow, column: SimpleColumn): string | number | null => {
    if (column === "stock") return `${row.stockName} ${row.symbol}`.toUpperCase();
    if (column === "openedDate" || column === "openedTime") return row.openedAt ? new Date(row.openedAt).getTime() : null;
    if (column === "entry") return row.entryPrice;
    if (column === "oFactor") return row.oFactor;
    if (column === "xFactor") return row.xFactor;
    if (column === "dayHigh") return row.dayHigh;
    if (column === "dayLow") return row.dayMaxDrawdown;
    if (column === "monthHigh") return row.monthHigh;
    if (column === "monthDrawdown") return row.monthMaxDrawdown;
    return row.currentPnl;
  };
  const rows = useMemo(() => sourceRows
    .filter((row) => (Object.entries(columnFilters) as Array<[SimpleColumn, string]>).every(([column, value]) => (
      !value.trim() || filterValue(row, column).includes(value.trim().toUpperCase())
    )))
    .sort((left, right) => {
      const a = sortValue(left, columnSort.column);
      const b = sortValue(right, columnSort.column);
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      return columnSort.direction === "asc" ? comparison : -comparison;
    }), [columnFilters, columnSort, sourceRows]);
  const changePresetSort = (value: string) => {
    onSort(value);
    const presets: Record<string, { column: SimpleColumn; direction: "asc" | "desc" }> = {
      NEWEST: { column: "openedDate", direction: "desc" },
      PNL: { column: "current", direction: "desc" },
      MFE: { column: "dayHigh", direction: "desc" },
      MAE: { column: "dayLow", direction: "asc" },
      QUALITY: { column: "oFactor", direction: "desc" },
    };
    setColumnSort(presets[value] ?? presets.NEWEST);
  };
  const toggleColumnSort = (column: SimpleColumn) => setColumnSort((current) => ({
    column,
    direction: current.column === column && current.direction === "asc" ? "desc" : "asc",
  }));
  const header = (column: SimpleColumn, label: string, detail?: string) => (
    <th aria-sort={columnSort.column === column ? (columnSort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={styles.simpleHeaderSort} onClick={() => toggleColumnSort(column)}>
        <span>{label}{detail ? <small>{detail}</small> : null}</span>
        <i aria-hidden="true">{columnSort.column === column ? (columnSort.direction === "asc" ? "▲" : "▼") : "↕"}</i>
      </button>
      <input
        aria-label={`Filter ${label}`}
        value={columnFilters[column] ?? ""}
        onChange={(event) => setColumnFilters((current) => ({ ...current, [column]: event.target.value }))}
        placeholder="Filter"
      />
    </th>
  );
  const downloadCsv = () => downloadPaperSimpleFile(buildPaperSimpleCsv(rows), "text/csv", "csv");
  const downloadExcel = () => downloadPaperSimpleFile(buildPaperSimpleExcel(rows), "application/vnd.ms-excel", "xls");

  return (
    <section className={styles.simpleView} aria-labelledby="paper-simple-view-title">
      <header className={styles.simpleViewHeader}>
        <div>
          <span>PAPER TRADING · SIMPLE VIEW</span>
          <h2 id="paper-simple-view-title">Entry-day, entry-month path and current P/L</h2>
          <p>Month evidence runs from the buy timestamp to that month end, or to date while the entry month is still active.</p>
        </div>
        <div className={styles.simpleViewActions}>
          <label>
            <span>Find</span>
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Stock or strategy" />
          </label>
          <select aria-label="Sort simple paper trades" value={sort} onChange={(event) => changePresetSort(event.target.value)}>
            <option value="NEWEST">Newest first</option>
            <option value="PNL">Highest current P/L</option>
            <option value="MFE">Highest D0 opportunity</option>
            <option value="MAE">Deepest drawdown</option>
            <option value="QUALITY">Quality score</option>
          </select>
          <button type="button" onClick={downloadCsv}>Download CSV</button>
          <button type="button" onClick={downloadExcel}>Download Excel</button>
        </div>
      </header>
      <div className={styles.simpleTableFrame} tabIndex={0} aria-label="Scrollable simple paper-trading evidence table">
        <table>
          <caption>{rows.length} filtered paper trades. Prices and factors remain blank when canonical evidence is unavailable.</caption>
          <thead>
            <tr>
              {header("stock", "Stock Name", "Symbol")}
              {header("openedDate", "Date bought at", "IST")}
              {header("openedTime", "Time bought at", "IST")}
              {header("entry", "Entry Strike Price")}
              {header("oFactor", "O Factor")}
              {header("xFactor", "X Factor")}
              {header("dayHigh", "Max Price · P/L", "Entry day")}
              {header("dayLow", "Low · Max Drawdown", "Entry day")}
              {header("monthHigh", "Max Price · P/L", "Buy → month end / to date")}
              {header("monthDrawdown", "Adverse · Max Drawdown", "Buy → month end / to date")}
              {header("current", "Current Price · P/L")}
              <th aria-label="Open trade evidence" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const opened = paperSimpleIstDateTime(row.openedAt);
              return (
                <tr
                  key={row.tradeId}
                  tabIndex={0}
                  onClick={() => onSelect(row.trade as AnyRow)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(row.trade as AnyRow);
                    }
                  }}
                >
                  <td className={styles.simpleStockCell}>
                    <StockIdentity symbol={row.symbol} profile={profiles.get(row.symbol.toUpperCase())} />
                  </td>
                  <td><strong>{opened.date || "—"}</strong></td>
                  <td><strong>{opened.time || "—"}</strong></td>
                  <td className={styles.simpleNumber}><strong>{simpleMoney(row.entryPrice)}</strong></td>
                  <td className={styles.simpleNumber}><strong>{simpleFactor(row.oFactor)}</strong></td>
                  <td className={styles.simpleNumber}><strong>{simpleFactor(row.xFactor)}</strong></td>
                  <td className={styles.simpleNumber}>
                    <strong>{simpleMoney(row.dayHigh)}</strong>
                    <small data-sign={row.dayHighPnl != null && row.dayHighPnl >= 0 ? "positive" : "negative"}>
                      {simpleMoney(row.dayHighPnl)} · {simplePercent(row.dayHighPnlPct)}
                    </small>
                  </td>
                  <td className={styles.simpleNumber}>
                    <strong>{simpleMoney(row.dayLow)}</strong>
                    <small data-sign={row.dayMaxDrawdown != null && row.dayMaxDrawdown >= 0 ? "positive" : "negative"}>
                      {simpleMoney(row.dayMaxDrawdown)} · {simplePercent(row.dayMaxDrawdownPct)}
                    </small>
                  </td>
                  <td className={styles.simpleNumber}>
                    <strong>{simpleMoney(row.monthHigh)}</strong>
                    <small data-sign={row.monthHighPnl != null && row.monthHighPnl >= 0 ? "positive" : "negative"}>
                      {simpleMoney(row.monthHighPnl)} · {simplePercent(row.monthHighPnlPct)}
                    </small>
                    <em>{row.monthPathState === "MONTH_END_COMPLETE" ? "Month end complete" : "Tracking to date"}</em>
                  </td>
                  <td className={styles.simpleNumber}>
                    <strong>{simpleMoney(row.monthAdversePrice)}</strong>
                    <small data-sign={row.monthMaxDrawdown != null && row.monthMaxDrawdown >= 0 ? "positive" : "negative"}>
                      {simpleMoney(row.monthMaxDrawdown)} · {simplePercent(row.monthMaxDrawdownPct)}
                    </small>
                    <em>{row.monthSessions == null ? "—" : `${row.monthSessions} session${row.monthSessions === 1 ? "" : "s"}`}</em>
                  </td>
                  <td className={styles.simpleNumber}>
                    <strong>{simpleMoney(row.currentPrice)}</strong>
                    <small data-sign={row.currentPnl != null && row.currentPnl >= 0 ? "positive" : "negative"}>
                      {simpleMoney(row.currentPnl)} · {simplePercent(row.currentPnlPct)}
                    </small>
                    <em>{row.currentPnlBasis === "OPEN_ACTUAL_GROSS" ? "Open actual · gross" : "Current path · hypothetical gross"}</em>
                  </td>
                  <td><button type="button" onClick={(event) => { event.stopPropagation(); onSelect(row.trade as AnyRow); }}>View</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <div className={styles.noResults}>No paper trades match these filters.</div> : null}
      </div>
    </section>
  );
}

function TradeQualityGuide({
  policy,
  trades,
  canReview,
  onSaved,
}: {
  policy: AnyRow;
  trades: AnyRow[];
  canReview: boolean;
  onSaved: () => void;
}) {
  const [selectedId, setSelectedId] = useState(() => String(trades[0]?.trade_group_id ?? ""));
  const [qualityFilter, setQualityFilter] = useState<"ALL" | "GOOD" | "DEVELOPING" | "ATTENTION">("ALL");
  const [qualityPeriod, setQualityPeriod] = useState<"7D" | "30D" | "90D" | "ALL">("30D");
  const [qualitySearch, setQualitySearch] = useState("");
  const estimable = trades.filter((trade) => trade.trade_quality?.totalScore != null);
  const badRisk = trades.filter((trade) => trade.trade_quality?.label === "BAD_RISK");
  const awaitingEvidence = trades.filter((trade) => trade.trade_quality?.totalScore == null);
  const average = estimable.length
    ? estimable.reduce((sum, trade) => sum + number(trade.trade_quality.totalScore), 0) / estimable.length
    : null;
  const sections = [
    { key: "cash", title: "Cash equity · 55 process + 45 outcome", data: policy?.cash },
    { key: "options", title: "Options · 60 process + 40 outcome", data: policy?.options },
  ];
  const periodDays = qualityPeriod === "7D" ? 7 : qualityPeriod === "30D" ? 30 : qualityPeriod === "90D" ? 90 : null;
  const periodTrades = trades.filter((trade) => {
    if (periodDays == null) return true;
    const openedAt = trade.opened_at ? new Date(String(trade.opened_at)).getTime() : Number.NaN;
    return Number.isFinite(openedAt) && openedAt >= Date.now() - periodDays * 86_400_000;
  });
  const visibleTrades = periodTrades.filter((trade) => {
    const label = String(trade.trade_quality?.label ?? "");
    const status = String(trade.trade_quality?.status ?? "");
    const matchesSearch = `${trade.symbol} ${trade.strategy_id}`.toLowerCase().includes(qualitySearch.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (qualityFilter === "GOOD") return label.startsWith("GOOD_");
    if (qualityFilter === "DEVELOPING") return status === "DEVELOPING";
    if (qualityFilter === "ATTENTION") return ["BAD_RISK", "BAD", "WEAK", "DATA_INVALID"].includes(label);
    return true;
  });
  const selected =
    visibleTrades.find((trade) => String(trade.trade_group_id) === selectedId) ??
    visibleTrades[0] ??
    trades.find((trade) => String(trade.trade_group_id) === selectedId) ??
    trades[0];
  return (
    <main className={styles.qualityGuide}>
      <section className={styles.qualityHero}>
        <span>VERSIONED TRADE-QUALITY POLICY · {policy?.version ?? "—"}</span>
        <h2>A good result is not automatically a good trade.</h2>
        <p>
          Process is judged only from information available at entry. Outcome is judged later from after-cost,
          estimated after-tax R, MAE, drawdown and exit efficiency. A confirmed critical risk failure overrides profit.
        </p>
        <div>
          <SummaryMetric label="Live quality scores" value={`${estimable.length} / ${trades.length}`} note="Point-in-time entry evidence plus current outcome" tone="neutral" />
          <SummaryMetric label="Average quality" value={average == null ? "—" : `${average.toFixed(2)}%`} note="Normalised to the evidence available now" tone="positive" />
          <SummaryMetric label="Awaiting entry evidence" value={String(awaitingEvidence.length)} note="Automatic source matching continues" tone="warning" />
          <SummaryMetric label="Confirmed bad-risk" value={String(badRisk.length)} note="Hard-fail override" tone="negative" />
        </div>
      </section>

      <section className={styles.qualityScopeBar} aria-label="Trade-quality matrix filters">
        <div>
          <span>Evaluation window</span>
          <div className={styles.qualityFilterBar} role="group" aria-label="Filter trade period">
            {([ ["7D", "Last 7 days"], ["30D", "Last 30 days"], ["90D", "Last 90 days"], ["ALL", "All history"] ] as const).map(([value, label]) => <button key={value} type="button" data-active={qualityPeriod === value} onClick={() => setQualityPeriod(value)}>{label}</button>)}
          </div>
        </div>
        <div>
          <span>Quality state</span>
          <div className={styles.qualityFilterBar} role="group" aria-label="Filter trade quality">
            {([
              ["ALL", `All · ${periodTrades.length}`],
              ["GOOD", `Good · ${periodTrades.filter((trade) => String(trade.trade_quality?.label ?? "").startsWith("GOOD_")).length}`],
              ["DEVELOPING", `Developing · ${periodTrades.filter((trade) => trade.trade_quality?.status === "DEVELOPING").length}`],
              ["ATTENTION", `Needs attention · ${periodTrades.filter((trade) => ["BAD_RISK", "BAD", "WEAK", "DATA_INVALID"].includes(String(trade.trade_quality?.label ?? ""))).length}`],
            ] as const).map(([value, label]) => <button key={value} type="button" data-active={qualityFilter === value} onClick={() => setQualityFilter(value)}>{label}</button>)}
          </div>
        </div>
        <label>Find trade<input value={qualitySearch} onChange={(event) => setQualitySearch(event.target.value)} placeholder="Symbol or strategy" /></label>
      </section>

      {selected ? (
        <TradeQualityEvaluator
          key={`${selected.trade_group_id}-${selected.trade_quality_review?.reviewedAt ?? "unreviewed"}`}
          policy={policy}
          trade={selected}
          trades={visibleTrades}
          onSelect={setSelectedId}
          canReview={canReview}
          onSaved={onSaved}
        />
      ) : null}

      <section className={styles.philosophyGrid}>
        {[
          ["01", "Separate decision from outcome", "A valid loss can reflect strong process; a lucky winner can reflect weak process."],
          ["02", "Use R, not profit alone", "After-cost and estimated after-tax P&L is divided by effective economic risk."],
          ["03", "Make drawdown first-class", "MAE, drawdown-budget use and time under water must be visible beside return."],
          ["04", "Never leak the future", "MFE, MAE and future returns are outcome labels, never live-entry features."],
          ["05", "Risk failures override profit", "Undefined risk, oversizing, stop, margin or settlement failures classify BAD_RISK."],
          ["06", "Reconstruct before judging", "Use the originating candidate snapshot, canonical market history, fills and observation path; expose every fallback and its timestamp."],
        ].map(([index, title, copy]) => (
          <article key={index}><b>{index}</b><div><h3>{title}</h3><p>{copy}</p></div></article>
        ))}
      </section>

      <section className={styles.ratingScale}>
        <header><h2>How every factor is rated</h2><p>Weighted points = criterion weight × rating ÷ 5.</p></header>
        {[5, 4, 3, 2, 1, 0].map((rating) => (
          <div key={rating}><b>{rating}</b><span>{["Failed or contrary", "Poor", "Weak", "Acceptable", "Good", "Excellent"][rating]}</span></div>
        ))}
      </section>

      {sections.map((section) => (
        <section className={styles.criteriaPanel} key={section.key}>
          <header><h2>{section.title}</h2><p>Every weight is explicit; select a trade from the portfolio to see its available evidence.</p></header>
          <div className={styles.criteriaColumns}>
            {(["PROCESS", "OUTCOME"] as const).map((phase) => (
              <article key={phase}>
                <h3>{phase === "PROCESS" ? "Before / at entry" : "After entry"}</h3>
                {(section.data?.criteria ?? []).filter((row: AnyRow) => row.phase === phase).map((row: AnyRow) => (
                  <div key={row.id}><span><b>{row.id}</b>{row.title}</span><strong>{row.weight} pts</strong></div>
                ))}
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className={styles.classificationMatrix}>
        <header><h2>Final interpretation</h2><p>Live estimates use entry-time-safe evidence; full scores replace them as outcomes mature.</p></header>
        <div>
          <article><b>85–100</b><h3>GOOD HIGH</h3><p>Strong process, efficient economic result and controlled drawdown.</p></article>
          <article><b>75–84</b><h3>GOOD MEDIUM</h3><p>Normal eligible trade with complete evidence.</p></article>
          <article><b>65–74</b><h3>GOOD LOW</h3><p>Positive but conditional evidence; review sizing or confirmation.</p></article>
          <article><b>Any score</b><h3>BAD RISK</h3><p>A confirmed governance failure overrides P&amp;L.</p></article>
        </div>
      </section>

      <section className={styles.qualityPortfolio} aria-labelledby="all-trade-quality-title">
        <header>
          <div><span>ALL PAPER TRADES</span><h2 id="all-trade-quality-title">Trade-quality register</h2><p>Showing {visibleTrades.length} matching trades. The same period, quality and search filters control the matrix above.</p></div>
        </header>
        {visibleTrades.length ? <div className={styles.qualityTableWrap}>
          <table className={styles.qualityTable}>
            <thead><tr><th>Trade</th><th>Opened</th><th>Lifecycle</th><th>Score</th><th>Grade</th><th>Process</th><th>Outcome</th><th>5D reward / pain</th></tr></thead>
            <tbody>{visibleTrades.map((trade) => {
              const score = trade.trade_quality?.totalScore;
              const label = String(trade.trade_quality?.label ?? "AWAITING_EVIDENCE");
              return <tr key={trade.trade_group_id} data-active={String(trade.trade_group_id) === String(selected?.trade_group_id)} data-grade={label}>
                <td><button type="button" className={styles.qualityTradeLink} onClick={() => setSelectedId(String(trade.trade_group_id))} aria-label={`Inspect ${trade.symbol} trade-quality evidence`}><b>{trade.symbol}</b><small>{trade.strategy_id}</small></button></td>
                <td>{time(trade.opened_at)}</td><td>{trade.group_status}</td>
                <td><strong>{score == null ? "—" : `${number(score).toFixed(2)}%`}</strong></td>
                <td><em>{label.replaceAll("_", " ")}</em></td>
                <td>{number(trade.trade_quality?.process?.scorePct).toFixed(2)}%</td>
                <td>{number(trade.trade_quality?.outcome?.scorePct).toFixed(2)}%</td>
                <td><span className={styles.qualityReward}>{percent(trade.mfe_5d_pct)}</span> / <span className={styles.qualityPain}>{percent(trade.mae_5d_pct)}</span></td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <div className={styles.qualityEmpty}><b>No matching trades</b><span>Change the period, quality filter or search term.</span></div>}
      </section>
    </main>
  );
}

function TradeQualityEvaluator({
  policy,
  trade,
  trades,
  onSelect,
  canReview,
  onSaved,
}: {
  policy: AnyRow;
  trade: AnyRow;
  trades: AnyRow[];
  onSelect: (tradeId: string) => void;
  canReview: boolean;
  onSaved: () => void;
}) {
  const quality = trade.trade_quality ?? {};
  const assetClass = String(quality.assetClass ?? trade.asset_class).toUpperCase() === "OPTION" ? "OPTION" : "EQUITY";
  const policySection = assetClass === "OPTION" ? policy?.options : policy?.cash;
  const existing = trade.trade_quality_review ?? {};
  const [ratings, setRatings] = useState<Record<string, number | null>>(() => ({ ...(existing.ratings ?? {}) }));
  const [hardFails, setHardFails] = useState<string[]>(() => [...(existing.hardFailFlags ?? [])]);
  const [entryConfirmed, setEntryConfirmed] = useState(existing.entryEvidenceConfirmed === true);
  const [note, setNote] = useState(String(existing.evidenceNote ?? ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const process = quality.process ?? {};
  const outcome = quality.outcome ?? {};
  const processGate = number(policySection?.processGatePct ?? (assetClass === "OPTION" ? 80 : 75));
  const outcomeGate = number(policySection?.outcomeGatePct ?? 65);
  const matrixTrades = trades.flatMap((item) => {
    const itemQuality = item.trade_quality ?? {};
    if (itemQuality.process?.scorePct == null || itemQuality.outcome?.scorePct == null) return [];
    return [{
      trade: item,
      process: Math.max(0, Math.min(100, number(itemQuality.process.scorePct))),
      outcome: Math.max(0, Math.min(100, number(itemQuality.outcome.scorePct))),
    }];
  });

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (!canReview || busy) return;
    const cleanRatings = Object.fromEntries(Object.entries(ratings).filter(([, value]) => value != null));
    setBusy(true);
    setMessage(null);
    const send = () => {
      const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
      const csrf = getSessionCsrfToken();
      if (csrf) headers["X-CSRF-Token"] = csrf;
      return fetch(`${API_BASE_URL}/v1/workspace/paper-trading/trades/${trade.trade_group_id}/quality-review`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ ratings: cleanRatings, hardFailFlags: hardFails, entryEvidenceConfirmed: entryConfirmed, evidenceNote: note }),
      });
    };
    try {
      let response = await send();
      if (response.status === 403) { await refreshCsrfToken(); response = await send(); }
      if (!response.ok) throw new Error(`Quality review API ${response.status}: ${await response.text()}`);
      setMessage("Review saved. The canonical score will refresh from server evidence.");
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.qualityEvaluator} aria-labelledby="trade-quality-evaluator-title">
      <header>
        <div>
          <span>SERVER-SIDE PAPER EVALUATION</span>
          <h2 id="trade-quality-evaluator-title">{trade.symbol} · Trade Quality Matrix</h2>
          <p>{trade.strategy_id} · {trades.length} filtered {trades.length === 1 ? "trade" : "trades"} plotted. Select any stock to inspect its process, outcome and hard-risk evidence.</p>
        </div>
        <b className={styles.selectedTradeGrade} data-grade={quality.label}>{quality.totalScore == null ? "—" : `${number(quality.totalScore).toFixed(2)}%`} · {String(quality.label ?? "AWAITING EVIDENCE").replaceAll("_", " ")}</b>
      </header>
      <div className={styles.qualityKpis}>
        <SummaryMetric label="Trade quality" value={quality.totalScore == null ? "—" : `${number(quality.totalScore).toFixed(2)}%`} note={quality.label ?? "AWAITING ENTRY EVIDENCE"} tone={quality.label === "BAD_RISK" ? "negative" : "neutral"} />
        <SummaryMetric label="Process" value={process.scorePct == null ? "—" : `${number(process.scorePct).toFixed(2)}%`} note={`${number(process.coveragePct).toFixed(2)}% evidence coverage`} tone="neutral" />
        <SummaryMetric label="Outcome" value={outcome.scorePct == null ? "—" : `${number(outcome.scorePct).toFixed(2)}%`} note={`${number(outcome.coveragePct).toFixed(2)}% evidence coverage`} tone="neutral" />
        <SummaryMetric label="Path risk" value={trade.mae_5d_pct == null ? "—" : percent(trade.mae_5d_pct)} note={`MFE ${percent(trade.mfe_5d_pct)}`} tone="warning" />
      </div>
      <div className={styles.qualityMatrixLayout}>
        <div className={styles.qualityMatrixChart}>
          <div className={styles.matrixQuadrants}>
            <span>Valid loss / good process</span><span>Good trade</span><span>Bad trade</span><span>Lucky winner / bad process</span>
          </div>
          <i className={styles.processGate} style={{ left: `${processGate}%` }} />
          <i className={styles.outcomeGate} style={{ bottom: `${outcomeGate}%` }} />
          {matrixTrades.length ? matrixTrades.map((point) => {
            const isSelected = String(point.trade.trade_group_id) === String(trade.trade_group_id);
            return <button
              key={point.trade.trade_group_id}
              type="button"
              className={styles.matrixPoint}
              data-selected={isSelected}
              style={{ left: `${point.process}%`, bottom: `${point.outcome}%` }}
              title={`${point.trade.symbol}: process ${point.process.toFixed(2)}%, outcome ${point.outcome.toFixed(2)}%`}
              aria-label={`Inspect ${point.trade.symbol}: process ${point.process.toFixed(2)}%, outcome ${point.outcome.toFixed(2)}%`}
              onClick={() => onSelect(String(point.trade.trade_group_id))}
            >{point.trade.symbol}</button>;
          }) : <p>No filtered trade has evidence for both axes.</p>}
          <small className={styles.matrixXAxis}>Process quality →</small>
          <small className={styles.matrixYAxis}>Outcome quality →</small>
        </div>
        <div className={styles.qualityCriteriaSummary}>
          <h3>Available criterion evidence</h3>
          {(quality.criteria ?? []).map((criterion: AnyRow) => {
            const rating = criterion.status === "SCORED" ? Math.max(0, Math.min(5, number(criterion.rating))) : null;
            const ratingColor = rating == null ? "#8996a8" : qualityRatingColor(rating);
            return <div key={criterion.id} data-status={criterion.status} style={{ borderLeftColor: ratingColor }}>
              <span><b>{criterion.id}</b>{criterion.title}</span>
              <strong style={{ color: ratingColor, borderColor: ratingColor }}>{rating == null ? criterion.status.replaceAll("_", " ") : `${rating.toFixed(2)} / 5`}</strong>
              <small>{criterion.reason}</small>
              <i className={styles.criterionRatingRail} aria-hidden="true"><span style={{ width: `${rating == null ? 0 : (rating / 5) * 100}%`, backgroundColor: ratingColor }} /></i>
            </div>;
          })}
        </div>
      </div>
      <form className={styles.qualityReviewForm} onSubmit={saveReview}>
        <header><div><h3>Admin evidence review</h3><p>Blank stays unknown. Process ratings count only when evidence is confirmed as existing at or before entry.</p></div><b>{canReview ? "ADMIN" : "READ ONLY"}</b></header>
        <div className={styles.qualityRatingGrid}>
          {(policySection?.criteria ?? []).map((criterion: AnyRow) => (
            <label key={criterion.id}>
              <span><b>{criterion.id}</b> {criterion.title} · {criterion.weight} pts</span>
              <select disabled={!canReview} value={ratings[criterion.id] ?? ""} onChange={(event) => setRatings((current) => ({ ...current, [criterion.id]: event.target.value === "" ? null : Number(event.target.value) }))}>
                <option value="">Use automatic estimate</option>
                {[5, 4, 3, 2, 1, 0].map((rating) => <option key={rating} value={rating}>{rating} · {rating === 5 ? "Excellent" : rating === 4 ? "Good" : rating === 3 ? "Acceptable" : rating === 2 ? "Weak" : rating === 1 ? "Poor" : "Failed"}</option>)}
              </select>
            </label>
          ))}
        </div>
        <fieldset disabled={!canReview}>
          <legend>Confirmed hard-risk overrides</legend>
          {(policySection?.hardFails ?? []).map((item: AnyRow) => (
            <label key={item.id}><input type="checkbox" checked={hardFails.includes(item.id)} onChange={(event) => setHardFails((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><b>{item.id} · {item.title}</b><small>{item.detail}</small></span></label>
          ))}
        </fieldset>
        <label className={styles.entryEvidenceCheck}><input type="checkbox" disabled={!canReview} checked={entryConfirmed} onChange={(event) => setEntryConfirmed(event.target.checked)} /><span><b>Entry-time evidence confirmed</b><small>I verified that process evidence existed at or before entry. Without this confirmation, retrospective process ratings remain excluded.</small></span></label>
        <label className={styles.qualityNote}>Evidence note<textarea disabled={!canReview} minLength={10} maxLength={2000} required={canReview} rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reference the plan, source timestamps, risk approval and outcome evidence…" /></label>
        <footer>{existing.reviewedAt ? <small>Last reviewed {time(existing.reviewedAt)} by {existing.reviewerEmail ?? "admin"}</small> : <small>No durable admin review yet.</small>}<button type="submit" disabled={!canReview || busy || note.trim().length < 10}>{busy ? "Saving…" : "Save versioned review"}</button></footer>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </section>
  );
}

function Outcome({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone: string;
}) {
  return (
    <div className={styles.outcome} data-tone={tone}>
      <i />
      <div>
        <strong>{label}</strong>
        <small>{note}</small>
      </div>
      <b>{value}</b>
    </div>
  );
}
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong data-tone={tone}>{value}</strong>
    </div>
  );
}
function SummaryMetric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <article className={styles.summaryMetric} data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function TargetScenarioStrip({ scenarios }: { scenarios: AnyRow[] }) {
  return (
    <details className={styles.scenarioPanel}>
      <summary>
        <span>
          <b>Scenario analysis</b>
          <small>
            Hypothetical low, medium and high target exits—not booked accounting
          </small>
        </span>
        <em>Actual governed exit · Intraday +1% or Swing +3%</em>
      </summary>
      <div className={styles.scenarioTableWrap}>
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Intraday</th>
              <th>Swing</th>
              <th>Exited</th>
              <th>Still marked</th>
              <th>Realised gross</th>
              <th>Open marked</th>
              <th>Combined gross</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => (
              <tr key={scenario.id}>
                <td>
                  <b>{scenario.id}</b>
                </td>
                <td>+{number(scenario.intraday_target_pct).toFixed(2)}%</td>
                <td>+{number(scenario.swing_target_pct).toFixed(2)}%</td>
                <td>{number(scenario.realised_count)}</td>
                <td>{number(scenario.open_count)}</td>
                <td>{money(scenario.realised_gross)}</td>
                <td>{money(scenario.unrealised_gross)}</td>
                <td
                  data-sign={
                    number(scenario.combined_gross) >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  {money(scenario.combined_gross)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        A higher target can show a lower combined result when fewer trades have
        exited and more remain marked at the latest cash price.
      </p>
    </details>
  );
}

function HorizonCard({
  title,
  subtitle,
  value,
  note,
  targets,
  tone,
}: {
  title: string;
  subtitle: string;
  value: string;
  note: string;
  targets: HorizonTarget[];
  tone: string;
}) {
  return (
    <article className={styles.horizonCard} data-tone={tone}>
      <header>
        <div>
          <h3>{title}</h3>
          <small>{subtitle}</small>
        </div>
        <i />
      </header>
      <strong>{value}</strong>
      <div>
        {targets.map((target) => (
          <span
            key={`${target.label}-${target.value}`}
            data-has-count={target.hits != null ? "true" : "false"}
          >
            <small>{target.label}</small>
            <b>{target.value}</b>
            {target.hits != null ? (
              <em>
                {target.hits}/{target.eligible ?? 0} hit
              </em>
            ) : null}
          </span>
        ))}
      </div>
      <footer>{note}</footer>
    </article>
  );
}

function conversionRow(rows: AnyRow[], target: number) {
  return rows.find(
    (item) => Math.abs(number(item.target_pct) - target) < 0.0000001,
  );
}
function conversionTarget(
  rows: AnyRow[],
  target: number,
  label: string,
): HorizonTarget {
  const row = conversionRow(rows, target);
  return {
    label,
    value: targetLabel(target),
    hits: number(row?.hits),
    eligible: number(row?.eligible),
  };
}
function conversionHeadline(rows: AnyRow[], target: number) {
  const row = conversionRow(rows, target);
  return row && number(row.eligible)
    ? `${Math.round((number(row.hits) / number(row.eligible)) * 100)}%`
    : "Pending";
}
function conversionTime(rows: AnyRow[], target: number) {
  const row = conversionRow(rows, target);
  return row?.median_minutes == null
    ? "—"
    : `${Math.round(number(row.median_minutes))}m`;
}
function conversionDay(rows: AnyRow[], target: number) {
  const row = conversionRow(rows, target);
  return row?.median_minutes == null
    ? "—"
    : `D+${Math.max(1, Math.round(number(row.median_minutes) / 385))}`;
}
function medianNumber(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[half]
    : (sorted[half - 1] + sorted[half]) / 2;
}
function median(values: number[]) {
  return percent(medianNumber(values), 2);
}

const oiisSurfaceLenses: Array<{ id: OiisSurfaceLens; label: string; detail: string }> = [
  { id: "INTRADAY_MAX_PROFIT", label: "Intraday max profit", detail: "Entry session" },
  { id: "SWING_5D_MAX_PROFIT", label: "Swing max profit", detail: "D0–D5 MFE" },
  { id: "SWING_5D_MAX_DRAWDOWN", label: "Swing drawdown", detail: "D0–D5 MAE" },
  { id: "HORIZON_30D_MAX_PROFIT", label: "30D max profit", detail: "D0–D30 MFE" },
  { id: "HORIZON_30D_MAX_DRAWDOWN", label: "30D drawdown", detail: "D0–D30 MAE" },
];

function FixedCapitalPortfolioSimulator({ mode, comparisons, fallbackScenarios, trades, onSelect }: { mode: "FIRST_GOVERNED" | "SWING_ONLY"; comparisons: AnyRow[]; fallbackScenarios: AnyRow[]; trades: AnyRow[]; onSelect: (trade: AnyRow) => void }) {
  const [selectedStrategy, setSelectedStrategy] = useState(String(comparisons[0]?.entryStrategy ?? ""));
  const [selectedId, setSelectedId] = useState("ALLOC_2L");
  const swingOnly = mode === "SWING_ONLY";
  const titleId = swingOnly ? "fixed-capital-swing-title" : "fixed-capital-title";
  const activeComparison = comparisons.find((comparison) => String(comparison.entryStrategy) === selectedStrategy) ?? comparisons[0];
  const scenarios: AnyRow[] = activeComparison?.scenarios ?? fallbackScenarios;
  if (!scenarios.length) return (
    <section className={styles.capitalSimulatorPanel} data-capital-policy={mode} aria-labelledby={titleId}>
      <header><div><span>FIXED-CAPITAL PORTFOLIO</span><h2 id={titleId}>{swingOnly ? "Swing-only ₹10 lakh capital recycling" : "₹10 lakh capital recycling simulation"}</h2><p>The server has not returned scenario evidence yet.</p></div></header>
    </section>
  );
  const selected = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];
  const rankedScenarios = [...scenarios].sort((left, right) => number(right.totalGrossPnl) - number(left.totalGrossPnl));
  const bestScenario = rankedScenarios[0];
  const weakestScenario = rankedScenarios[rankedScenarios.length - 1];
  const hasPositiveAllocation = number(bestScenario?.totalGrossPnl) > 0;
  const strategyName = (id: unknown) => ({
    RSI_WILLR: "RSI + Williams entry",
    PRICE_MOMENTUM_1D_1H_15M: "1D + 1H + 15M momentum",
    QUALITY_SUM_THRESHOLD: "Quality threshold entry",
    UNSPECIFIED: "Legacy / unspecified entry",
  }[String(id)] ?? String(id).replaceAll("_", " "));
  const positions: AnyRow[] = selected.positions ?? [];
  const firstMs = Math.min(...positions.map((position) => new Date(position.entryAt).getTime()).filter(Number.isFinite));
  const lastMs = Math.max(...positions.map((position) => new Date(position.exitAt).getTime()).filter(Number.isFinite));
  const spanMs = Math.max(1, lastMs - firstMs);
  const tradeById = new Map(trades.map((trade) => [String(trade.trade_group_id), trade]));
  const ticks = Array.from({ length: 5 }, (_, index) => firstMs + index / 4 * spanMs);
  const dateTick = (value: number) => new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
  return (
    <section className={styles.capitalSimulatorPanel} data-capital-policy={mode} aria-labelledby={titleId}>
      <header>
        <div><span>{swingOnly ? "SWING-ONLY FIXED CAPITAL · INTRADAY HITS IGNORED" : "FIXED-CAPITAL PORTFOLIO · ONE ENTRY STRATEGY AT A TIME"}</span><h2 id={titleId}>{swingOnly ? "Swing-only ₹10 lakh capital recycling" : "₹10 lakh capital recycling simulation"}</h2><p>{swingOnly ? "This separate ledger ignores every intraday target. Choose one entry strategy; capital remains locked until that trade reaches the governed swing +3% target, then returns for the next eligible trade." : "Choose one entry strategy. Its ledger starts from that strategy's first trade only; capital never crosses into another strategy. Capital returns at the earlier governed execution target: intraday +1% or swing +3%."}</p></div>
        <div className={styles.capitalPolicy}><b>{swingOnly ? "SWING ONLY · GROSS" : "GROSS ANALYTICAL"}</b><small>Whole cash-equity shares · buy/sell direction normalised</small></div>
      </header>
      {comparisons.length ? <div className={styles.capitalStrategyPicker} role="tablist" aria-label={swingOnly ? "Swing-only paper entry strategy" : "Paper entry strategy"}>
        {comparisons.map((comparison) => <button type="button" role="tab" aria-selected={comparison.entryStrategy === activeComparison?.entryStrategy} data-active={comparison.entryStrategy === activeComparison?.entryStrategy} key={String(comparison.entryStrategy)} onClick={() => setSelectedStrategy(String(comparison.entryStrategy))}>
          <span>{strategyName(comparison.entryStrategy)}</span><small>{comparison.sourceTradeCount} source trades · from {comparison.firstEntryAt ? time(comparison.firstEntryAt) : "—"}</small>
        </button>)}
      </div> : null}
      <div className={styles.capitalBenefitComparison}>
        <span>{hasPositiveAllocation ? "Highest benefit" : "Lowest loss"} for {strategyName(activeComparison?.entryStrategy)}</span>
        <strong data-sign={number(bestScenario?.totalGrossPnl) >= 0 ? "positive" : "negative"}>{money(bestScenario?.allocationPerTrade)} / trade · {money(bestScenario?.totalGrossPnl)}</strong>
        <small>{money(number(bestScenario?.totalGrossPnl) - number(weakestScenario?.totalGrossPnl))} {hasPositiveAllocation ? "benefit" : "less loss"} versus the weakest allocation in this strategy-only comparison.</small>
      </div>
      <div className={styles.capitalScenarioCards} role="tablist" aria-label={swingOnly ? "Swing-only investment per trade scenario" : "Investment per trade scenario"}>
        {scenarios.map((scenario) => <button type="button" role="tab" aria-selected={scenario.id === selected.id} data-active={scenario.id === selected.id} key={scenario.id} onClick={() => setSelectedId(String(scenario.id))}>
          <span>{money(scenario.allocationPerTrade)} / trade</span>
          <strong data-sign={number(scenario.totalGrossPnl) >= 0 ? "positive" : "negative"}>{money(scenario.totalGrossPnl)}</strong>
          <small>{scenario.maximumConcurrentSlots} slots · {scenario.tradesTaken} trades · {percent(scenario.totalReturnPct)}</small>
        </button>)}
      </div>
      <div className={styles.capitalSummaryGrid}>
        <article><span>Ending equity</span><strong data-sign={number(selected.totalGrossPnl) >= 0 ? "positive" : "negative"}>{money(selected.endingEquity)}</strong><small>Started with ₹10,00,000</small></article>
        <article><span>Realised / open</span><strong>{money(selected.realisedGrossPnl)}</strong><small>Open marked {money(selected.openMarkedGrossPnl)}</small></article>
        <article><span>Maximum drawdown</span><strong data-sign="negative">{money(-Math.abs(number(selected.maxEventDrawdown)))}</strong><small>{percent(-Math.abs(number(selected.maxEventDrawdownPct)))} event-equity drawdown</small></article>
        <article><span>Best / worst trade</span><strong>{selected.bestTradePnl == null ? "—" : money(selected.bestTradePnl)}</strong><small>Worst {selected.worstTradePnl == null ? "—" : money(selected.worstTradePnl)}</small></article>
        <article><span>Trades till date</span><strong>{number(selected.tradesTaken)}</strong><small>{selected.closedTargetTrades} target exits · {selected.openTrades} open · {selected.tradesSkipped} skipped</small></article>
        <article><span>Capital now</span><strong>{money(selected.endingCash)}</strong><small>{money(selected.deployedOpenCapital)} deployed in open trades</small></article>
      </div>
      {positions.length ? <div className={styles.capitalGanttScroll}>
        <div className={styles.capitalGantt} style={{ "--gantt-rows": positions.length } as CSSProperties}>
          <div className={styles.capitalGanttHeader}><strong>{swingOnly ? "Swing-only allocation timeline" : "Trade allocation timeline"}</strong><div>{ticks.map((tick) => <span key={tick} style={{ left: `${(tick - firstMs) / spanMs * 100}%` }}>{dateTick(tick)}</span>)}</div></div>
          {positions.map((position) => {
            const start = (new Date(position.entryAt).getTime() - firstMs) / spanMs * 100;
            const width = Math.max(1.2, (new Date(position.exitAt).getTime() - new Date(position.entryAt).getTime()) / spanMs * 100);
            const linkedTrade = tradeById.get(String(position.tradeGroupId));
            return <div className={styles.capitalGanttRow} key={String(position.tradeGroupId)}>
              <button type="button" className={styles.capitalGanttIdentity} onClick={() => linkedTrade && onSelect(linkedTrade)} disabled={!linkedTrade}><b>{String(position.symbol)}</b><small>{compact(position.quantity)} shares · {position.side}</small></button>
              <div className={styles.capitalGanttTrack}>{ticks.map((tick) => <i key={tick} style={{ left: `${(tick - firstMs) / spanMs * 100}%` }} />)}<button type="button" className={styles.capitalGanttBar} data-status={position.status} style={{ left: `${start}%`, width: `${Math.min(100 - start, width)}%` }} onClick={() => linkedTrade && onSelect(linkedTrade)} disabled={!linkedTrade} aria-label={`${position.symbol}, ${position.side}, ${compact(position.quantity)} shares, entry ${time(position.entryAt)}, ${position.exitReason} ${time(position.exitAt)}, P and L ${money(position.pnl)}`}><span>{money(position.pnl)}</span><title>{position.symbol} · {compact(position.quantity)} shares · {money(position.deployed)} deployed · {position.exitReason} · {money(position.pnl)}</title></button></div>
              <strong data-sign={number(position.pnl) >= 0 ? "positive" : "negative"}>{money(position.pnl)}</strong>
            </div>;
          })}
        </div>
      </div> : <div className={styles.capitalGanttEmpty}>No valid chronological paper entries are available.</div>}
      <footer><span>{selected.maximumConcurrentUsed}/{selected.maximumConcurrentSlots} maximum slots used</span><span>{selected.winningTrades} profitable · {selected.losingTrades} losing marked outcomes</span><span>Evaluated through {time(selected.lastEvaluatedAt)}</span><em>Drawdown uses chronological realised exit equity plus the latest marks for open trades; it is not a fabricated minute-level portfolio path.</em></footer>
    </section>
  );
}

function parallelValueLabel(value: number | null, unit: "NUMBER" | "PERCENT" | "INR") {
  if (value == null) return "—";
  if (unit === "INR") return money(value);
  if (unit === "PERCENT") return percent(value);
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function parallelLineColor(value: number | null, minimum: number, maximum: number, axisId: PaperParallelAxisId) {
  if (value == null) return "#8996a8";
  const outcome = ["INTRADAY_MAX_PROFIT", "SWING_TARGET_PROFIT", "FIVE_DAY_MAX_PROFIT", "THIRTY_DAY_MAX_PROFIT"].includes(axisId);
  if (outcome) {
    if (value < 0) return "#c72f47";
    if (Math.abs(value) <= 100) return "#9a7b00";
    const strength = Math.max(0, Math.min(1, value / Math.max(1, maximum)));
    return `hsl(156 70% ${36 - strength * 12}%)`;
  }
  const ratio = Math.max(0, Math.min(1, (value - minimum) / Math.max(1, maximum - minimum)));
  return `hsl(${235 - ratio * 95} 66% ${48 - ratio * 9}%)`;
}

function PaperParallelEvidencePlot({ trades, onSelect }: { trades: AnyRow[]; onSelect: (trade: AnyRow) => void }) {
  const profiles = useProfileIndex();
  const [colourAxis, setColourAxis] = useState<PaperParallelAxisId>("THIRTY_DAY_MAX_PROFIT");
  const [strategy, setStrategy] = useState("ALL");
  const [stockSearch, setStockSearch] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const allRows = buildPaperParallelRows(trades);
  const strategies = Array.from(new Set(allRows.map((row) => row.strategy))).sort();
  const needle = stockSearch.trim().toUpperCase();
  const rows = allRows.filter((row) => (strategy === "ALL" || row.strategy === strategy) && (!needle || row.symbol.toUpperCase().includes(needle)));
  const scales = new Map(paperParallelAxes.map((axis) => [axis.id, minimumOneAxisScale(rows.flatMap((row) => row.values[axis.id] == null ? [] : [row.values[axis.id] as number]), axis.bounds)]));
  const plot = { left: 74, top: 88, width: 1260, height: 370 };
  const xFor = (index: number) => plot.left + index / Math.max(1, paperParallelAxes.length - 1) * plot.width;
  const yFor = (axisId: PaperParallelAxisId, value: number) => {
    const scale = scales.get(axisId)!;
    return plot.top + (scale.max - value) / Math.max(1, scale.max - scale.min) * plot.height;
  };
  const pathFor = (values: Record<PaperParallelAxisId, number | null>) => {
    let drawing = false;
    return paperParallelAxes.map((axis, index) => {
      const value = values[axis.id];
      if (value == null) { drawing = false; return ""; }
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${xFor(index).toFixed(2)},${yFor(axis.id, value).toFixed(2)}`;
    }).filter(Boolean).join(" ");
  };
  const colourScale = scales.get(colourAxis)!;
  const focused = rows.find((row) => row.id === focusedId) ?? null;
  const complete = rows.filter((row) => row.availableDimensions === paperParallelAxes.length).length;
  const colourDefinition = paperParallelAxes.find((axis) => axis.id === colourAxis)!;
  const downloadCsv = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const header = ["trade_id", "symbol", "strategy", "direction", "entry_at", ...paperParallelAxes.map((axis) => axis.id)];
    const body = rows.map((row) => [row.id, row.symbol, row.strategy, row.direction, row.trade.opened_at, ...paperParallelAxes.map((axis) => row.values[axis.id])].map(quote).join(","));
    const url = URL.createObjectURL(new Blob([[header.map(quote).join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `paper-parallel-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const downloadSvg = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const url = URL.createObjectURL(new Blob([clone.outerHTML], { type: "image/svg+xml;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `paper-parallel-evidence-${new Date().toISOString().slice(0, 10)}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className={styles.parallelPanel} aria-labelledby="paper-parallel-title">
      <header>
        <div><span>PARALLEL EVIDENCE · HIPLOT-STYLE</span><h2 id="paper-parallel-title">Every stock from entry evidence to 30-session opportunity</h2><p>Each line is one paper trade. Entry-time factors are kept separate from later outcome labels; every money outcome uses the fixed ₹2 lakh comparison basis.</p></div>
        <div className={styles.parallelStats}><span><small>Visible</small><b>{rows.length}/{allRows.length}</b></span><span><small>All dimensions</small><b>{complete}</b></span><span><small>Minimum Y tick</small><b>1 unit</b></span></div>
      </header>
      <div className={styles.parallelToolbar}>
        <label>Stock filter<input value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} placeholder="Symbol" /></label>
        <label>Entry strategy<select value={strategy} onChange={(event) => setStrategy(event.target.value)}><option value="ALL">All strategies</option>{strategies.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Colour lines by<select value={colourAxis} onChange={(event) => setColourAxis(event.target.value as PaperParallelAxisId)}>{paperParallelAxes.map((axis) => <option key={axis.id} value={axis.id}>{axis.label}</option>)}</select></label>
        <button type="button" onClick={downloadCsv}>Download data CSV</button>
        <button type="button" onClick={downloadSvg}>Download plot SVG</button>
        <button type="button" onClick={() => downloadStandaloneParallelHtml(rows)}>Download interactive HTML</button>
      </div>
      {!rows.length ? <div className={styles.oiisSurfaceEmpty}><strong>No matching paper evidence</strong><span>Clear the local stock or strategy filter. Missing evidence is not replaced with zero.</span></div> : <>
        <div className={styles.parallelScroll}>
          <div className={styles.parallelCanvas}>
            {focused ? <aside className={styles.parallelInspector} aria-live="polite"><header><div><strong>{focused.symbol}</strong><small>{focused.strategy} · {focused.direction}</small></div><button type="button" onClick={() => onSelect(focused.trade as AnyRow)}>Open trade</button></header><dl>{paperParallelAxes.map((axis) => <div key={axis.id}><dt>{axis.shortLabel}</dt><dd>{parallelValueLabel(focused.values[axis.id], axis.unit)}</dd></div>)}</dl></aside> : null}
            <svg ref={svgRef} className={styles.parallelChart} viewBox="0 0 1410 520" role="group" aria-label={`Parallel coordinates for ${rows.length} paper trades, coloured by ${colourDefinition.label}`}>
              <rect x="44" y="54" width="1332" height="430" rx="12" fill="#f8fbff" stroke="#d6e2ee" />
              {paperParallelAxes.map((axis, index) => {
                const scale = scales.get(axis.id)!;
                const x = xFor(index);
                return <g key={axis.id}><line x1={x} x2={x} y1={plot.top} y2={plot.top + plot.height} className={styles.parallelAxis} /><text x={x} y="69" textAnchor="middle" className={styles.parallelAxisLabel}>{axis.shortLabel}</text><title>{axis.label}</title>{scale.ticks.map((tick) => <g key={tick}><line x1={x - 4} x2={x + 4} y1={yFor(axis.id, tick)} y2={yFor(axis.id, tick)} className={styles.parallelTick} /><text x={x - 7} y={yFor(axis.id, tick) + 3} textAnchor="end" className={styles.parallelTickLabel}>{axis.unit === "INR" ? compact(tick) : Number(tick.toFixed(2))}</text></g>)}</g>;
              })}
              {rows.map((row) => {
                const colourValue = row.values[colourAxis];
                const active = row.id === focusedId;
                return <path key={row.id} d={pathFor(row.values)} fill="none" stroke={parallelLineColor(colourValue, colourScale.min, colourScale.max, colourAxis)} className={styles.parallelLine} data-active={active} tabIndex={0} role="button" aria-label={`${row.symbol}, ${row.strategy}, ${row.availableDimensions} of ${paperParallelAxes.length} dimensions available`} onMouseEnter={() => setFocusedId(row.id)} onFocus={() => setFocusedId(row.id)} onMouseLeave={() => setFocusedId((current) => current === row.id ? null : current)} onBlur={() => setFocusedId((current) => current === row.id ? null : current)} onClick={() => onSelect(row.trade as AnyRow)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(row.trade as AnyRow); }}><title>{row.symbol} · {row.strategy} · click to open trade evidence</title></path>;
              })}
              <text x="705" y="505" textAnchor="middle" className={styles.parallelFooterLabel}>Entry-time evidence → entry point → observed outcome horizons</text>
            </svg>
          </div>
        </div>
        <footer><b>Line colour: {colourDefinition.label}</b><span>Grey segments indicate missing evidence, never zero.</span><span>Hover/focus to inspect; click a stock line to open the canonical trade drawer.</span></footer>
        <details className={styles.parallelData}><summary>Open and download the {rows.length}-row HiPlot data table</summary><div><table><thead><tr><th>Stock</th><th>Strategy</th>{paperParallelAxes.map((axis) => <th key={axis.id}>{axis.shortLabel}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} onClick={() => onSelect(row.trade as AnyRow)}><td><StockIdentity symbol={row.symbol} profile={profiles.bySymbol.get(row.symbol)} compact /></td><td>{row.strategy}</td>{paperParallelAxes.map((axis) => <td key={axis.id}>{parallelValueLabel(row.values[axis.id], axis.unit)}</td>)}</tr>)}</tbody></table></div></details>
      </>}
    </section>
  );
}

function OiisContourSurface({ trades, onSelect }: { trades: AnyRow[]; onSelect: (trade: AnyRow) => void }) {
  const [lens, setLens] = useState<OiisSurfaceLens>("INTRADAY_MAX_PROFIT");
  const [axisPreset, setAxisPreset] = useState<OiisAxisPreset>("O_X");
  const [hoveredPoint, setHoveredPoint] = useState<ReturnType<typeof oiisSurfacePoints>[number] | null>(null);
  const axes = oiisAxisDefinitions.find((definition) => definition.id === axisPreset) ?? oiisAxisDefinitions[0];
  const points = oiisSurfacePoints(trades, lens, axisPreset);
  const domain = oiisSurfaceDomain(points, axisPreset);
  const columns = 34;
  const rows = 24;
  const grid = domain ? buildOiisSurfaceGrid(points, domain, columns, rows) : [];
  const plot = { left: 76, top: 42, width: 748, height: 330 };
  const cellWidth = plot.width / columns;
  const cellHeight = plot.height / rows;
  const xFor = (value: number) => domain ? plot.left + (value - domain.oMin) / Math.max(1, domain.oMax - domain.oMin) * plot.width : plot.left;
  const yFor = (value: number) => domain ? plot.top + (domain.xMax - value) / Math.max(1, domain.xMax - domain.xMin) * plot.height : plot.top;
  const oTicks = domain ? minimumOneAxisScale(points.map((point) => point.o), [domain.oMin, domain.oMax], 5).ticks : [];
  const xTicks = domain ? minimumOneAxisScale(points.map((point) => point.x), [domain.xMin, domain.xMax], 5).ticks : [];
  const thresholds = [-1000, -100, 100, 1000];
  const cellsByPosition = new Map(grid.map((cell) => [`${cell.column}:${cell.row}`, cell]));
  const contourSegments = thresholds.flatMap((threshold) => grid.flatMap((cell) => {
    if (cell.value == null) return [];
    const segments: Array<{ x1: number; y1: number; x2: number; y2: number; threshold: number }> = [];
    const right = cellsByPosition.get(`${cell.column + 1}:${cell.row}`);
    if (right?.value != null && (cell.value - threshold) * (right.value - threshold) < 0) {
      const x = plot.left + (cell.column + 1) * cellWidth;
      segments.push({ x1: x, y1: plot.top + cell.row * cellHeight, x2: x, y2: plot.top + (cell.row + 1) * cellHeight, threshold });
    }
    const below = cellsByPosition.get(`${cell.column}:${cell.row + 1}`);
    if (below?.value != null && (cell.value - threshold) * (below.value - threshold) < 0) {
      const y = plot.top + (cell.row + 1) * cellHeight;
      segments.push({ x1: plot.left + cell.column * cellWidth, y1: y, x2: plot.left + (cell.column + 1) * cellWidth, y2: y, threshold });
    }
    return segments;
  }));
  const average = points.length ? points.reduce((sum, point) => sum + point.value, 0) / points.length : null;
  const med = points.length ? medianNumber(points.map((point) => point.value)) : null;
  const activeLens = oiisSurfaceLenses.find((item) => item.id === lens)!;
  const hoveredTrade = hoveredPoint?.trade as AnyRow | undefined;
  const hoveredTargets = Array.isArray(hoveredTrade?.targets)
    ? [...hoveredTrade.targets]
      .filter((target: AnyRow) => String(target.lifecycle).toUpperCase() === "INTRADAY")
      .sort((left: AnyRow, right: AnyRow) => number(left.target_pct) - number(right.target_pct))
    : [];
  return (
    <section className={styles.oiisSurfacePanel} aria-labelledby="oiis-surface-title">
      <header>
        <div>
          <span>OIIS ENTRY-FACTOR OUTCOME SURFACES · FIXED ₹2 LAKH</span>
          <h2 id="oiis-surface-title">Which entry conditions produced reward or pain</h2>
          <p>Switch between five point-in-time factor combinations. Filled contours interpolate between actual OIIS entry observations; the labelled stock points remain authoritative.</p>
        </div>
        <div className={styles.oiisSurfaceStats}>
          <span><small>Evidence</small><b>{points.length}/{trades.length} trades</b></span>
          <span><small>Average</small><b data-sign={average != null && average >= 0 ? "positive" : "negative"}>{average == null ? "—" : money(average)}</b></span>
          <span><small>Median</small><b data-sign={med != null && med >= 0 ? "positive" : "negative"}>{med == null ? "—" : money(med)}</b></span>
        </div>
      </header>
      <div className={styles.oiisAxisTabs} role="tablist" aria-label="OIIS entry factor axes">
        {oiisAxisDefinitions.map((item) => <button type="button" role="tab" aria-selected={item.id === axisPreset} key={item.id} data-active={item.id === axisPreset} onClick={() => { setAxisPreset(item.id); setHoveredPoint(null); }}><b>{item.label}</b><small>{item.detail}</small></button>)}
      </div>
      <div className={styles.oiisSurfaceLenses} role="group" aria-label="OIIS surface outcome">
        {oiisSurfaceLenses.map((item) => <button type="button" key={item.id} data-active={item.id === lens} onClick={() => setLens(item.id)}><b>{item.label}</b><small>{item.detail}</small></button>)}
      </div>
      {!domain || points.length < 2 ? (
        <div className={styles.oiisSurfaceEmpty}><strong>Insufficient OIIS factor coverage</strong><span>At least two paper observations with entry-time OFactor, XFactor and this outcome are required.</span></div>
      ) : (
        <div className={styles.oiisSurfaceScroll}>
          <div className={styles.oiisSurfaceCanvas}>
          {hoveredPoint && hoveredTrade ? <aside className={styles.oiisSurfaceHoverCard} aria-live="polite">
            <header><div><strong>{String(hoveredTrade.symbol)}</strong><small>{String(hoveredTrade.evidence_sector ?? hoveredTrade.strategy_id ?? "OIIS paper trade")}</small></div><b>{money(hoveredPoint.value)}</b></header>
            <div className={styles.surfaceHoverFacts}>
              <span><small>Quantity</small><b>{compact(hoveredTrade.opened_quantity)}</b></span>
              <span><small>Entry price</small><b>{money(hoveredTrade.average_entry_price)}</b></span>
              <span><small>₹2L quantity</small><b>{compact(hoveredTrade.fixed_investment_quantity)}</b></span>
              <span><small>Entry time</small><b>{time(hoveredTrade.opened_at)}</b></span>
              <span><small>{axes.xShort}</small><b>{hoveredPoint.o.toFixed(2)}</b></span>
              <span><small>{axes.yShort}</small><b>{hoveredPoint.x.toFixed(2)}</b></span>
            </div>
            <div className={styles.surfaceHoverTargets}><small>Intraday analytical levels</small>{hoveredTargets.length ? hoveredTargets.map((target: AnyRow) => {
              const profit = targetProfit(target, hoveredTrade);
              return <span key={String(target.target_pct)} data-state={targetState(target)}><b>{targetLabel(target.target_pct)}</b><em>{targetState(target)}</em><small>{target.first_hit_at ? time(target.first_hit_at) : "No hit time"}</small><small>{profit ? `${money(profit.perShare)}/share · ${money(profit.total)}` : "P/L unavailable"}</small></span>;
            }) : <p>No intraday target records.</p>}</div>
          </aside> : null}
          <svg className={styles.oiisSurfaceChart} viewBox="0 0 960 430" role="group" aria-label={`${activeLens.label} by ${axes.xLabel} and ${axes.yLabel} for a fixed two-lakh investment`}>
            <defs>
              <pattern id="surface-missing" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="#c8d3df" strokeWidth="1" /></pattern>
              <linearGradient id="surface-legend" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ff164f" /><stop offset="47.5%" stopColor="#f4ff30" /><stop offset="52.5%" stopColor="#f4ff30" /><stop offset="100%" stopColor="#007a45" />
              </linearGradient>
            </defs>
            <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} fill="url(#surface-missing)" rx="8" />
            {grid.map((cell) => <rect key={`${cell.column}-${cell.row}`} x={plot.left + cell.column * cellWidth} y={plot.top + cell.row * cellHeight} width={cellWidth + .4} height={cellHeight + .4} fill={oiisSurfaceColor(cell.value)} fillOpacity={cell.value == null ? .42 : .9}><title>{cell.value == null ? "Outside supported observations" : `Interpolated ${money(cell.value)} near O ${cell.o.toFixed(1)}, X ${cell.x.toFixed(1)}`}</title></rect>)}
            {oTicks.map((tick) => <g key={`o-${tick}`}><line x1={xFor(tick)} x2={xFor(tick)} y1={plot.top} y2={plot.top + plot.height} className={styles.surfaceGridLine} /><text x={xFor(tick)} y={plot.top + plot.height + 20} textAnchor="middle">{tick.toFixed(1)}</text></g>)}
            {xTicks.map((tick) => <g key={`x-${tick}`}><line x1={plot.left} x2={plot.left + plot.width} y1={yFor(tick)} y2={yFor(tick)} className={styles.surfaceGridLine} /><text x={plot.left - 12} y={yFor(tick) + 4} textAnchor="end">{tick.toFixed(1)}</text></g>)}
            {contourSegments.map((segment, index) => <line key={`${segment.threshold}-${index}`} x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} className={styles.surfaceContourLine}><title>{money(segment.threshold)} contour</title></line>)}
            {(axes.xField === "evidence_ofactor" || axes.xField === "evidence_rsi14") && domain.oMin <= 70 && domain.oMax >= 70 ? <line x1={xFor(70)} x2={xFor(70)} y1={plot.top} y2={plot.top + plot.height} className={styles.surfaceGateLine}><title>{axes.xShort} 70 reference</title></line> : null}
            {(axes.yField === "evidence_xfactor" || axes.yField === "evidence_rsi14") && domain.xMin <= 70 && domain.xMax >= 70 ? <line x1={plot.left} x2={plot.left + plot.width} y1={yFor(70)} y2={yFor(70)} className={styles.surfaceGateLine}><title>{axes.yShort} 70 reference</title></line> : null}
            {points.map((point) => {
              const selectedColor = oiisSurfaceColor(point.value);
              const targetSummary = Array.isArray(point.trade.targets) ? point.trade.targets.filter((target: AnyRow) => String(target.lifecycle).toUpperCase() === "INTRADAY").map((target: AnyRow) => `${targetLabel(target.target_pct)} ${targetState(target)}`).join(" · ") : "No intraday targets";
              return <g key={String(point.trade.trade_group_id)} role="button" tabIndex={0} onMouseEnter={() => setHoveredPoint(point)} onMouseLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint(point)} onBlur={() => setHoveredPoint(null)} onClick={() => onSelect(point.trade as AnyRow)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(point.trade as AnyRow); }} aria-label={`${String(point.trade.symbol)}, quantity ${compact(point.trade.opened_quantity)}, entry ${money(point.trade.average_entry_price)}, ${axes.xShort} ${point.o.toFixed(2)}, ${axes.yShort} ${point.x.toFixed(2)}, ${activeLens.label} ${money(point.value)}. ${targetSummary}`}>
                <title>{String(point.trade.symbol)} · Qty {compact(point.trade.opened_quantity)} · Entry {money(point.trade.average_entry_price)} · {axes.xShort} {point.o.toFixed(2)} · {axes.yShort} {point.x.toFixed(2)} · {activeLens.label} {money(point.value)} · {targetSummary}</title>
                <circle cx={xFor(point.o)} cy={yFor(point.x)} r="8" fill={selectedColor} className={styles.surfaceEvidencePoint} />
                <text x={xFor(point.o) + 10} y={yFor(point.x) - 8} className={styles.surfaceSymbol}>{String(point.trade.symbol)}</text>
              </g>;
            })}
            <text x={plot.left + plot.width / 2} y="424" textAnchor="middle" className={styles.surfaceAxisTitle}>{axes.xLabel} →</text>
            <text x="18" y={plot.top + plot.height / 2} textAnchor="middle" transform={`rotate(-90 18 ${plot.top + plot.height / 2})`} className={styles.surfaceAxisTitle}>{axes.yLabel} →</text>
            <rect x="858" y={plot.top} width="22" height={plot.height} fill="url(#surface-legend)" rx="6" />
            {[2000, 100, 0, -100, -2000].map((value) => <text key={value} x="888" y={plot.top + (2000 - value) / 4000 * plot.height + 4}>{value === 0 ? "₹0" : `${value > 0 ? "+" : "−"}₹${Math.abs(value).toLocaleString("en-IN")}`}</text>)}
            <text x="848" y="395" className={styles.surfaceLegendTitle}>₹2L outcome</text>
          </svg>
          </div>
        </div>
      )}
      <footer><span><i data-tone="loss" /> −₹2,000 neon red</span><span><i data-tone="flat" /> −₹100 to +₹100 neon yellow</span><span><i data-tone="profit" /> +₹2,000 neon dark green</span><em>Values beyond ±₹2,000 are colour-capped; hover/focus retains exact amounts and target evidence. Grey hatch means unsupported interpolation.</em></footer>
      {points.length ? <details className={styles.oiisSurfaceEvidence}><summary>View {points.length} underlying OIIS observations</summary><div><table><thead><tr><th>Stock</th><th>{axes.xShort}</th><th>{axes.yShort}</th><th>{activeLens.label}</th></tr></thead><tbody>{[...points].sort((a, b) => b.value - a.value).map((point) => <tr key={String(point.trade.trade_group_id)} onClick={() => onSelect(point.trade as AnyRow)}><td>{String(point.trade.symbol)}</td><td>{point.o.toFixed(2)}</td><td>{point.x.toFixed(2)}</td><td data-sign={point.value >= 0 ? "positive" : "negative"}>{money(point.value)}</td></tr>)}</tbody></table></div></details> : null}
    </section>
  );
}

function RewardPainAtlas({
  trades,
  lens,
  onSelect,
}: {
  trades: AnyRow[];
  lens: AtlasLens;
  onSelect: (trade: AnyRow) => void;
}) {
  const raw = trades.map((trade) => ({
    trade,
    mfe: Math.max(
      0,
      lens === "30D" ? number(trade.mfe_30d_pct) : number(trade.mfe_5d_pct),
    ),
    pain: Math.max(
      0,
      -(lens === "30D" ? number(trade.mae_30d_pct) : number(trade.mae_5d_pct)),
    ),
  }));
  const rewardScale = minimumOneAxisScale([0, ...raw.map((point) => point.mfe)]);
  const painScale = minimumOneAxisScale([0, ...raw.map((point) => point.pain)]);
  const rewardMax = rewardScale.max;
  const painMax = painScale.max;
  const points = raw.map((point) => ({
    ...point,
    x: 60 + (Math.min(point.pain, painMax) / painMax) * 760,
    y: 285 - (Math.min(point.mfe, rewardMax) / rewardMax) * 235,
  }));
  const rewardTicks = rewardScale.ticks.map((value) => ({ ratio: value / rewardMax, value }));
  const painTicks = painScale.ticks.map((value) => ({ ratio: value / painMax, value }));
  return (
    <svg
      className={styles.atlas}
      viewBox="0 0 880 330"
      role="group"
      aria-label={`${lens} reward versus pain chart`}
    >
      <rect x="60" y="50" width="380" height="117.5" fill="#edf9f5" />
      <rect x="440" y="50" width="380" height="117.5" fill="#fff8e9" />
      <rect x="60" y="167.5" width="380" height="117.5" fill="#f3f7fc" />
      <rect x="440" y="167.5" width="380" height="117.5" fill="#fff0f3" />
      {rewardTicks.map(({ ratio, value }) => (
        <g key={`r-${ratio}`}>
          <line
            x1="60"
            x2="820"
            y1={285 - ratio * 235}
            y2={285 - ratio * 235}
            stroke="#d7e2ee"
          />
          <text x="14" y={289 - ratio * 235}>
            {value.toFixed(1)}%
          </text>
        </g>
      ))}
      {painTicks.map(({ ratio, value }) => (
        <g key={`p-${ratio}`}>
          <line
            y1="50"
            y2="285"
            x1={60 + ratio * 760}
            x2={60 + ratio * 760}
            stroke="#d7e2ee"
          />
          <text x={52 + ratio * 760} y="306">
            {value.toFixed(1)}%
          </text>
        </g>
      ))}
      <text x="72" y="69" className={styles.goodZone}>
        EFFICIENT REWARD
      </text>
      <text x="452" y="69" className={styles.warningZone}>
        REWARD WITH HIGH PAIN
      </text>
      <text x="72" y="270">
        LOW MOVEMENT
      </text>
      <text x="452" y="270" className={styles.badZone}>
        UNFAVOURABLE PATH
      </text>
      {points.map(({ trade, mfe, pain, x, y }) => {
        const executionClosed = isPaperExecutionClosed(trade.remaining_quantity);
        const qualityScore = trade.trade_quality?.totalScore == null ? null : number(trade.trade_quality.totalScore);
        const qualityLabel = String(trade.trade_quality?.label ?? trade.quality_label ?? "DEVELOPING");
        return (
        <g
          key={trade.trade_group_id}
          role="button"
          tabIndex={0}
          aria-label={`${trade.symbol}, quality ${qualityScore == null ? "awaiting evidence" : `${qualityScore.toFixed(1)} percent ${qualityLabel}`}, reward ${percent(mfe)}, pain ${percent(pain)}, execution ${executionClosed ? "closed" : "open"}`}
          onClick={() => onSelect(trade)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onSelect(trade);
          }}
        >
          <title>
            {trade.symbol} · Quality {qualityScore == null ? "—" : `${qualityScore.toFixed(2)}%`} {qualityLabel} · MFE {percent(mfe)} · MAE {percent(-pain)}
          </title>
          <circle
            cx={x}
            cy={y}
            r={Math.max(
              9,
              Math.min(
                17,
                8 + Math.sqrt(Math.max(1, number(trade.entry_notional))) / 22,
              ),
            )}
            data-grade={qualityLabel}
            data-execution-closed={executionClosed}
          />
          {qualityScore != null ? <text x={x} y={y + 3.5} textAnchor="middle" className={styles.atlasQualityScore}>{Math.round(qualityScore)}</text> : null}
        </g>
        );
      })}
      <text x="330" y="327">
        Pain · absolute MAE → worse to the right
      </text>
    </svg>
  );
}

function ConversionSummary({
  intraday,
  swing,
  trades,
}: {
  intraday: AnyRow[];
  swing: AnyRow[];
  trades: AnyRow[];
}) {
  const rows = [
    {
      label: "Intraday T1 +0.30%",
      row: conversionRow(intraday, 0.003),
      kind: "reward",
    },
    {
      label: "Intraday T3 +0.50%",
      row: conversionRow(intraday, 0.005),
      kind: "reward",
    },
    {
      label: "Intraday T4 +1.00%",
      row: conversionRow(intraday, 0.01),
      kind: "reward",
    },
    { label: "Swing +1.00%", row: conversionRow(swing, 0.01), kind: "reward" },
    {
      label: "Adverse −1.00%",
      hits: trades.filter((trade) => number(trade.mae_5d_pct) <= -1).length,
      eligible: trades.length,
      kind: "risk",
    },
    {
      label: "Adverse −2.00%",
      hits: trades.filter((trade) => number(trade.mae_5d_pct) <= -2).length,
      eligible: trades.length,
      kind: "risk",
    },
  ];
  return (
    <section className={styles.conversionSummary}>
      {rows.map((item) => {
        const eligible = number(item.row?.eligible ?? item.eligible);
        const hits = number(item.row?.hits ?? item.hits);
        const rate = eligible ? (hits / eligible) * 100 : 0;
        const timing =
          item.kind === "risk"
            ? "Risk review"
            : item.row?.median_minutes == null
              ? "Pending"
              : item.label.startsWith("Swing")
                ? `Median D+${Math.max(1, Math.round(number(item.row.median_minutes) / 385))}`
                : `Median ${Math.round(number(item.row.median_minutes))}m`;
        return (
          <article key={item.label} data-kind={item.kind}>
            <div>
              <strong>{item.label}</strong>
              <small>{timing}</small>
              <b>
                {hits} / {eligible}{" "}
                {item.kind === "risk" ? "breached" : "reached"}
              </b>
            </div>
            <span>
              <i style={{ width: `${rate}%` }} />
            </span>
          </article>
        );
      })}
    </section>
  );
}

function AttentionList({
  trades,
  onSelect,
}: {
  trades: AnyRow[];
  onSelect: (trade: AnyRow) => void;
}) {
  const reasons = (trade: AnyRow) => {
    const result: string[] = [];
    if (number(trade.mae_5d_pct) <= -2) result.push(`MAE ${percent(trade.mae_5d_pct)} breached the −2% review threshold`);
    if (["BAD", "AT_RISK", "MIXED", "WEAK"].includes(String(trade.analytical_grade))) result.push(`Analytical grade is ${trade.analytical_grade}`);
    if (trade.observation_status === "DATA_INCOMPLETE") result.push("Observation evidence is incomplete");
    if (trade.trade_quality?.hardFailFlags?.length) result.push(`Hard-risk gate: ${trade.trade_quality.hardFailFlags.join(", ")}`);
    if (trade.quality_score != null && number(trade.quality_score) < 65) result.push(`Quality score ${number(trade.quality_score).toFixed(2)}% is below 65%`);
    if (trade.hypothetical_carry_pnl != null && Math.abs(number(trade.hypothetical_carry_pnl) - number(trade.realised_net_pnl)) > Math.max(6000, Math.abs(number(trade.realised_net_pnl)))) result.push("Large gap between governed result and never-closed carry");
    return result;
  };
  const attention = trades.map((trade) => ({ trade, reasons: reasons(trade) })).filter((item) => item.reasons.length).slice(0, 6);
  if (!attention.length) return null;
  return (
    <section className={styles.attentionList}>
      <h3>Needs attention</h3>
      {attention.map(({ trade, reasons: tradeReasons }) => (
        <button key={trade.trade_group_id} onClick={() => onSelect(trade)} title={tradeReasons.join(" · ")}>
          <span>
            <b>{trade.symbol}</b>
            <small>
              {tradeReasons[0]} · rule-based review queue
            </small>
          </span>
          <strong>{percent(trade.mae_5d_pct)}</strong>
        </button>
      ))}
    </section>
  );
}

function PaperDataQualityPanel({ data, trades }: { data: AnyRow; trades: AnyRow[] }) {
  const incidents: AnyRow[] = data.incidents ?? [];
  const incomplete = trades.filter((trade) => String(trade.observation_status).includes("INCOMPLETE") || String(trade.analytical_grade).includes("INCOMPLETE"));
  const missingMarks = trades.filter((trade) => trade.hypothetical_carry_mark == null);
  const developing = trades.filter((trade) => number(trade.sessions_observed) < 30);
  const validQuantities = trades.filter((trade) => number(trade.opened_quantity) > 0 && number(trade.average_entry_price) > 0);
  return <section className={styles.dataQualityWorkbench} aria-label="Paper data quality">
    <header><div><span>DATA QUALITY</span><h3>Canonical paper evidence trust matrix</h3><p>Fresh transport, source completeness and analytical maturity are separate states.</p></div><a href="/n50/analytics/system/quality?source=paper-trading">Open affected data issues</a></header>
    <div>
      <article><span>Workspace transport</span><strong>CONNECTED</strong><small>Response evaluated {time(data.asOf)} IST</small></article>
      <article data-state={missingMarks.length ? "warning" : "ok"}><span>Latest carry marks</span><strong>{trades.length - missingMarks.length} / {trades.length}</strong><small>{missingMarks.length ? `${missingMarks.length} missing or unavailable` : "All trade marks available"}</small></article>
      <article data-state={incomplete.length ? "error" : "ok"}><span>Observation completeness</span><strong>{trades.length - incomplete.length} / {trades.length}</strong><small>{incomplete.length} explicitly incomplete</small></article>
      <article><span>Evidence maturity</span><strong>{trades.length - developing.length} / {trades.length}</strong><small>Thirty-session complete · {developing.length} developing</small></article>
      <article data-state={validQuantities.length === trades.length ? "ok" : "error"}><span>Valid price and quantity</span><strong>{validQuantities.length} / {trades.length}</strong><small>Required for capital-dependent values</small></article>
      <article data-state={incidents.length ? "error" : "ok"}><span>Open incident groups</span><strong>{incidents.length}</strong><small>{incidents.length ? incidents.map((item) => `${item.incident_type}: ${item.count}`).join(" · ") : "No reported paper-data incident"}</small></article>
    </div>
  </section>;
}

function ConversionGroup({ title, rows }: { title: string; rows: AnyRow[] }) {
  return (
    <section className={styles.conversionGroup}>
      <h3>{title}</h3>
      {rows.map((row) => {
        const eligible = number(row.eligible);
        const hits = number(row.hits);
        const rate = eligible ? (hits / eligible) * 100 : 0;
        return (
          <div key={`${row.lifecycle}-${row.target_pct}`}>
            <strong>{targetLabel(row.target_pct)}</strong>
            <span>
              <i style={{ width: `${rate}%` }} />
              <b>
                {hits}/{eligible}
              </b>
            </span>
            <small>
              {row.median_minutes == null
                ? "—"
                : `${Math.round(number(row.median_minutes))}m`}
            </small>
          </div>
        );
      })}
    </section>
  );
}
function AdverseLadder({ trades }: { trades: AnyRow[] }) {
  return (
    <section className={styles.conversionGroup}>
      <h3>ADVERSE EXCURSION LADDER</h3>
      {[-0.5, -1, -2, -5].map((threshold) => {
        const count = trades.filter(
          (trade) => number(trade.mae_5d_pct) <= threshold,
        ).length;
        return (
          <div key={threshold}>
            <strong>{threshold}%</strong>
            <span data-adverse="true">
              <i
                style={{
                  width: `${trades.length ? (count / trades.length) * 100 : 0}%`,
                }}
              />
              <b>
                {count}/{trades.length}
              </b>
            </span>
            <small>breached</small>
          </div>
        );
      })}
    </section>
  );
}

function targetCell(trade: AnyRow, lifecycle: string, value: number) {
  const target = (trade.targets ?? []).find(
    (item: AnyRow) =>
      item.lifecycle === lifecycle &&
      Math.abs(number(item.target_pct) - value) < 0.0000001,
  );
  if (!target) return <span data-state="unavailable">—</span>;
  const state = targetState(target);
  const profit = state === "HIT" ? targetProfit(target, trade) : null;
  return (
    <span
      data-state={state.toLowerCase()}
      title={
        target.first_hit_at ? `First hit ${time(target.first_hit_at)}` : state
      }
    >
      {state === "HIT" ? "✓" : state === "FAILED" ? "×" : "○"}
      <small>{target.first_hit_at ? time(target.first_hit_at) : state}</small>
      {profit ? (
        <span className={styles.targetProfit} data-testid="target-profit">
          <b>Profit/share {money(profit.perShare)}</b>
          <small>
            Profit × {compact(profit.quantity)} qty {money(profit.total)}
          </small>
        </span>
      ) : null}
    </span>
  );
}
function entryStrategyLabel(value: unknown) {
  if (value === "RSI_WILLR") return "RSI / Williams %R";
  if (value === "PRICE_MOMENTUM_1D_1H_15M") return "Price momentum";
  if (value === "QUALITY_SUM_THRESHOLD") return "Legacy run-quality";
  return "Manual / unspecified";
}

function entryStrategyDetail(value: unknown) {
  if (value === "RSI_WILLR") return "Existing pullback trigger";
  if (value === "PRICE_MOMENTUM_1D_1H_15M") return "Prior close + completed 1H + completed 15M";
  if (value === "QUALITY_SUM_THRESHOLD") return "Historical immediate entry";
  return "No governed method recorded";
}

function highestTarget(trade: AnyRow, lifecycle: string, values: number[]) {
  const targets = values
    .map((value) =>
      (trade.targets ?? []).find(
        (item: AnyRow) =>
          item.lifecycle === lifecycle &&
          Math.abs(number(item.target_pct) - value) < 0.0000001,
      ),
    )
    .filter(Boolean);
  const hit = values.filter((value) => {
    const target = targets.find(
      (item: AnyRow) => Math.abs(number(item.target_pct) - value) < 0.0000001,
    );
    return target && targetState(target) === "HIT";
  });
  if (!hit.length) {
    const windowFailed =
      targets.length > 0 &&
      targets.every((target: AnyRow) => targetState(target) === "FAILED");
    return windowFailed
      ? {
          label: "Failed",
          time:
            lifecycle === "INTRADAY"
              ? "D0 window closed"
              : "Observation window closed",
        }
      : { label: "Pending", time: "No target hit yet" };
  }
  const value = Math.max(...hit);
  const target = targets.find(
    (item: AnyRow) => Math.abs(number(item.target_pct) - value) < 0.0000001,
  );
  return {
    label: targetLabel(value),
    time: target?.first_hit_at ? time(target.first_hit_at) : "Hit",
  };
}

const evidenceTargets = [
  { lifecycle: "INTRADAY", value: 0.003, group: "Intraday", label: "+0.3%" },
  { lifecycle: "INTRADAY", value: 0.004, group: "Intraday", label: "+0.4%" },
  { lifecycle: "INTRADAY", value: 0.005, group: "Intraday", label: "+0.5%" },
  { lifecycle: "INTRADAY", value: 0.01, group: "Intraday", label: "+1.0%" },
  { lifecycle: "SWING", value: 0.01, group: "Swing", label: "+1%" },
  { lifecycle: "SWING", value: 0.03, group: "Swing", label: "+3%" },
  { lifecycle: "SWING", value: 0.05, group: "Swing", label: "+5%" },
] as const;

function targetRecord(trade: AnyRow, lifecycle: string, value: number) {
  return (trade.targets ?? []).find(
    (item: AnyRow) =>
      item.lifecycle === lifecycle &&
      Math.abs(number(item.target_pct) - value) < 0.0000001,
  );
}

function targetCompletion(trade: AnyRow) {
  const states = evidenceTargets.map((definition) => {
    const target = targetRecord(trade, definition.lifecycle, definition.value);
    return target ? targetState(target) : "PENDING";
  });
  return {
    hits: states.filter((state) => state === "HIT").length,
    failed: states.filter((state) => state === "FAILED").length,
    pending: states.filter((state) => state === "PENDING").length,
    total: states.length,
  };
}

function elapsedCalendarDays(openedAt: unknown) {
  const opened = openedAt ? new Date(String(openedAt)).getTime() : Number.NaN;
  if (!Number.isFinite(opened)) return null;
  return Math.max(0, Math.floor((Date.now() - opened) / 86_400_000));
}

function horizonRecord(trade: AnyRow, sessions: number) {
  return (trade.horizons ?? []).find(
    (item: AnyRow) => number(item.horizon_sessions) === sessions,
  );
}

function horizonPnl(trade: AnyRow, sessions: number) {
  const horizon = horizonRecord(trade, sessions);
  if (!horizon) return null;
  if (horizon.after_tax_pnl != null) return number(horizon.after_tax_pnl);
  if (horizon.after_cost_pnl != null) return number(horizon.after_cost_pnl);
  if (horizon.closing_return != null)
    return number(trade.entry_notional) * number(horizon.closing_return);
  return null;
}

function EvidenceTargetCell({
  trade,
  lifecycle,
  value,
  groupStart,
}: {
  trade: AnyRow;
  lifecycle: string;
  value: number;
  groupStart?: boolean;
}) {
  const target = targetRecord(trade, lifecycle, value);
  const state = target ? targetState(target) : "PENDING";
  const profit = target && state === "HIT" ? targetProfit(target, trade) : null;
  return (
    <TargetOutcomeCell
      groupStart={groupStart}
      state={state === "HIT" ? "HIT" : state === "FAILED" ? "FAILED" : "OPEN"}
      primary={state === "HIT" ? "✓ HIT" : state === "FAILED" ? "× NOT HIT" : "○ OPEN"}
      secondary={target?.first_hit_at ? time(target.first_hit_at) : state === "FAILED" ? "Window closed" : "Tracking"}
      detail={profit ? money(profit.total) : "—"}
      supporting={profit?.fixedTotal != null ? `₹2L: ${money(profit.fixedTotal)}` : "—"}
    />
  );
}

function HorizonOutcomeCell({ trade, sessions }: { trade: AnyRow; sessions: 5 | 30 }) {
  const horizon = horizonRecord(trade, sessions);
  const observed = number(trade.sessions_observed);
  const completed = horizon?.status === "COMPLETED" || observed >= sessions;
  const pnl = horizonPnl(trade, sessions);
  const returnPct = horizon?.closing_return == null ? null : number(horizon.closing_return) * 100;
  const positive = pnl != null ? pnl >= 0 : returnPct != null ? returnPct >= 0 : number(trade[`mfe_${sessions}d_pct`]) > Math.abs(number(trade[`mae_${sessions}d_pct`]));
  const fixedPnl = returnPct == null || trade.fixed_investment_deployed == null
    ? null
    : number(trade.fixed_investment_deployed) * returnPct / 100;
  return (
    <HorizonCell
      groupStart={sessions === 5}
      state={completed ? "mature" : "developing"}
      tone={completed ? (positive ? "positive" : "negative") : "info"}
      primary={completed ? (sessions === 30 ? "TIME UP" : "MATURE") : `${Math.min(observed, sessions)}/${sessions} DAYS`}
      secondary={`MFE ${percent(trade[`mfe_${sessions}d_pct`])}`}
      detail={`MAE ${percent(trade[`mae_${sessions}d_pct`])}`}
      supporting={pnl != null ? money(pnl) : "—"}
      metadata={fixedPnl != null ? `₹2L: ${money(fixedPnl)}` : "—"}
    />
  );
}

function TradePerformanceHeatmap({ trades }: { trades: AnyRow[] }) {
  const [view, setView] = useState<HeatmapView>("YEAR");
  const [metric, setMetric] = useState<HeatmapMetric>("EOD_PNL");
  const [eventFilter, setEventFilter] = useState<IntradayEventFilter>("ALL");
  const availableDates = Array.from(new Set(trades.map((trade) => istDateKey(trade.opened_at)).filter(Boolean) as string[])).sort();
  const todayKey = istDateKey(new Date()) ?? new Date().toISOString().slice(0, 10);
  const todayDay = dateFromKey(todayKey).getUTCDay();
  const referenceKey = todayDay === 6 ? shiftDateKey(todayKey, -1) : todayDay === 0 ? shiftDateKey(todayKey, -2) : todayKey;
  const [selectedDate, setSelectedDate] = useState(availableDates.filter((date) => date <= referenceKey).at(-1) ?? availableDates.at(-1) ?? referenceKey);
  const byDate = new Map<string, { trades: AnyRow[]; eod: number; maxProfit: number; maxDrawdown: number; targetHits: number }>();
  for (const trade of trades) {
    const key = istDateKey(trade.opened_at);
    if (!key) continue;
    const bucket = byDate.get(key) ?? { trades: [], eod: 0, maxProfit: 0, maxDrawdown: 0, targetHits: 0 };
    bucket.trades.push(trade);
    if (trade.intraday_eod_pnl != null) bucket.eod += number(trade.intraday_eod_pnl);
    bucket.maxProfit += number(trade.intraday_max_profit);
    bucket.maxDrawdown += number(trade.intraday_max_drawdown);
    bucket.targetHits += (trade.targets ?? []).filter((target: AnyRow) => target.lifecycle === "INTRADAY" && targetState(target) === "HIT").length;
    byDate.set(key, bucket);
  }
  const metricValue = (bucket?: ReturnType<typeof byDate.get>, selectedMetric: HeatmapMetric = metric) => {
    if (!bucket) return 0;
    if (selectedMetric === "MAX_PROFIT") return bucket.maxProfit;
    if (selectedMetric === "MAX_DRAWDOWN") return bucket.maxDrawdown;
    if (selectedMetric === "TARGET_HITS") return bucket.targetHits;
    return bucket.eod;
  };
  const recordedBuckets = Array.from(byDate.values());
  const scaleMax = (selectedMetric: HeatmapMetric) => Math.max(1, ...recordedBuckets.map((bucket) => Math.abs(metricValue(bucket, selectedMetric))));
  const cellColor = (bucket?: ReturnType<typeof byDate.get>, selectedMetric: HeatmapMetric = metric) => {
    if (!bucket?.trades.length) return "#e8eef5";
    const value = metricValue(bucket, selectedMetric);
    const strength = Math.max(.18, Math.min(1, Math.abs(value) / scaleMax(selectedMetric)));
    if (selectedMetric === "TARGET_HITS" || selectedMetric === "MAX_PROFIT" || value > 0)
      return `hsl(156 62% ${92 - strength * 45}%)`;
    if (selectedMetric === "MAX_DRAWDOWN" || value < 0)
      return `hsl(352 70% ${94 - strength * 43}%)`;
    return "#dce5ef";
  };
  const valueLabel = (bucket?: ReturnType<typeof byDate.get>, selectedMetric: HeatmapMetric = metric) => {
    if (!bucket?.trades.length) return "No paper entries";
    const value = metricValue(bucket, selectedMetric);
    return selectedMetric === "TARGET_HITS" ? `${value} intraday target hits` : money(value);
  };
  const rollingStart = shiftDateKey(referenceKey, -364);
  const startDay = dateFromKey(rollingStart).getUTCDay();
  const yearStart = shiftDateKey(rollingStart, -(startDay === 0 ? 6 : startDay - 1));
  const yearDays: string[] = [];
  for (let key = yearStart; key <= referenceKey; key = shiftDateKey(key, 1)) yearDays.push(key);
  const yearWeekCount = Math.ceil(yearDays.length / 7);
  const monthLabels = Array.from({ length: yearWeekCount }, (_, weekIndex) => {
    const key = yearDays[Math.min(weekIndex * 7, yearDays.length - 1)];
    const month = dateFromKey(key).toLocaleDateString("en-IN", { timeZone: "UTC", month: "short" });
    const priorKey = weekIndex ? yearDays[(weekIndex - 1) * 7] : null;
    const priorMonth = priorKey ? dateFromKey(priorKey).toLocaleDateString("en-IN", { timeZone: "UTC", month: "short" }) : null;
    return month !== priorMonth ? { month, weekIndex } : null;
  }).filter(Boolean) as { month: string; weekIndex: number }[];
  const referenceDay = dateFromKey(referenceKey).getUTCDay();
  const weekStart = shiftDateKey(referenceKey, -(referenceDay === 0 ? 6 : referenceDay - 1));
  const weekDays = Array.from({ length: 5 }, (_, index) => shiftDateKey(weekStart, index));
  const dateIndex = Math.max(0, availableDates.indexOf(selectedDate));
  const dayTrades = trades.filter((trade) => istDateKey(trade.opened_at) === selectedDate);
  const intradayEvents = dayTrades.flatMap((trade) => {
    const events: AnyRow[] = [{ type: "ENTRY", at: trade.opened_at, symbol: trade.symbol, label: "Paper entry", value: null }];
    for (const target of trade.targets ?? []) {
      if (target.lifecycle !== "INTRADAY" || targetState(target) !== "HIT" || !target.first_hit_at) continue;
      events.push({ type: "TARGET", at: target.first_hit_at, symbol: trade.symbol, label: `${targetLabel(target.target_pct)} hit`, value: targetProfit(target, trade)?.total ?? null });
    }
    if (trade.intraday_eod_mark_at && trade.intraday_eod_pnl != null)
      events.push({ type: "EOD", at: trade.intraday_eod_mark_at, symbol: trade.symbol, label: "15:30 EOD", value: trade.intraday_eod_pnl });
    return events;
  }).filter((event) => eventFilter === "ALL" || event.type === eventFilter)
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  const metricLabels: Record<HeatmapMetric, string> = {
    EOD_PNL: "15:30 EOD P/L",
    MAX_PROFIT: "D0 max profit",
    MAX_DRAWDOWN: "D0 drawdown",
    TARGET_HITS: "Intraday hits",
  };
  const intradaySlots = [...Array.from({ length: 13 }, (_, index) => 9 * 60 + 15 + index * 30), 15 * 60 + 30];
  const timeInIst = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
    return number(parts.find((part) => part.type === "hour")?.value) * 60 + number(parts.find((part) => part.type === "minute")?.value);
  };
  const slotForEvent = (event: AnyRow) => {
    if (event.type === "EOD") return intradaySlots.length - 1;
    const eventMinute = timeInIst(event.at);
    let closest = 0;
    for (let index = 0; index < intradaySlots.length; index += 1) if (eventMinute >= intradaySlots[index]) closest = index;
    return Math.min(closest, intradaySlots.length - 1);
  };
  const eventsForCell = (trade: AnyRow, slotIndex: number) => intradayEvents.filter((event) => event.symbol === trade.symbol && slotForEvent(event) === slotIndex);
  const renderCell = (key: string) => {
    const bucket = byDate.get(key);
    return (
      <button
        type="button"
        key={key}
        className={styles.yearHeatCell}
        style={{ "--heat-cell": cellColor(bucket) } as CSSProperties}
        data-has-trades={bucket?.trades.length ? "true" : "false"}
        title={`${displayDateKey(key)} · ${valueLabel(bucket)} · ${bucket?.trades.length ?? 0} trades`}
        aria-label={`${displayDateKey(key)}: ${valueLabel(bucket)}, ${bucket?.trades.length ?? 0} trades`}
        onClick={() => { setSelectedDate(key); setView("INTRADAY"); }}
      >
      </button>
    );
  };
  return (
    <section className={styles.performanceHeatmap} aria-label="Paper performance heatmap">
      <header>
        <div>
          <span>PATH THROUGH TIME</span>
          <h2>Paper performance heatmap</h2>
          <p>Entry-session 15:30 marks, D0 opportunity, drawdown and target events are separate from booked accounting.</p>
        </div>
        <div className={styles.heatmapViewTabs}>
          <button type="button" data-active={view === "YEAR"} onClick={() => setView("YEAR")}>Year</button>
          <button type="button" data-active={view === "WEEK"} onClick={() => setView("WEEK")}>Current week</button>
          <button type="button" data-active={view === "INTRADAY"} onClick={() => setView("INTRADAY")}>Intraday events</button>
        </div>
      </header>
      {view !== "INTRADAY" ? (
        <>
          <div className={styles.heatmapMetricTabs} aria-label="Heatmap measure">
            {(Object.keys(metricLabels) as HeatmapMetric[]).map((item) => <button type="button" key={item} data-active={metric === item} onClick={() => setMetric(item)}>{metricLabels[item]}</button>)}
          </div>
          <div className={styles.heatmapLegend}><span>Loss / pain</span><i /><i /><i /><span>Profit / opportunity</span></div>
          {view === "YEAR" ? (
            <div className={styles.yearHeatmapWrap}>
              <div className={styles.yearCalendar} style={{ "--heat-weeks": yearWeekCount } as CSSProperties}>
                <div className={styles.yearMonthLabels} aria-hidden="true">
                  {monthLabels.map(({ month, weekIndex }) => <span key={`${month}-${weekIndex}`} style={{ gridColumn: weekIndex + 1 }}>{month}</span>)}
                </div>
                <div className={styles.yearWeekdayLabels} aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
                <div className={styles.yearHeatmap} role="grid" aria-label={`Rolling year ending ${displayDateKey(referenceKey)}`}>{yearDays.map((key) => renderCell(key))}</div>
              </div>
              <small>{displayDateKey(yearStart)} – {displayDateKey(referenceKey)} · blank days have no paper entries</small>
            </div>
          ) : (
            <div className={styles.weekHeatmap}>
              <div className={styles.weekContext}><b>{displayDateKey(weekStart)} – {displayDateKey(weekDays.at(-1) ?? referenceKey)}</b><span>{todayDay === 0 || todayDay === 6 ? "Weekend: showing the previous completed trading week" : "Current trading week"}</span></div>
              <div className={styles.weekHeatmapScroll}>
                <div className={styles.weekHeatmapGrid} role="grid" aria-label="Weekly paper performance by metric and trading day">
                  <span className={styles.weekCorner}>Measure</span>
                  {weekDays.map((key) => <b className={styles.weekDayHeader} key={key}>{displayDateKey(key, { weekday: "short", day: "2-digit" })}</b>)}
                  {(Object.keys(metricLabels) as HeatmapMetric[]).map((weekMetric) => (
                    <div className={styles.weekMetricRow} key={weekMetric} role="row">
                      <strong>{metricLabels[weekMetric]}</strong>
                      {weekDays.map((key) => {
                        const bucket = byDate.get(key);
                        return <button type="button" key={`${weekMetric}-${key}`} className={styles.weekHeatCell} style={{ "--heat-cell": cellColor(bucket, weekMetric) } as CSSProperties} title={`${displayDateKey(key)} · ${metricLabels[weekMetric]} · ${valueLabel(bucket, weekMetric)}`} aria-label={`${displayDateKey(key)}, ${metricLabels[weekMetric]}: ${valueLabel(bucket, weekMetric)}`} onClick={() => { setSelectedDate(key); setView("INTRADAY"); }}><b>{bucket?.trades.length ? (weekMetric === "TARGET_HITS" ? metricValue(bucket, weekMetric) : money(metricValue(bucket, weekMetric))) : "—"}</b><small>{bucket?.trades.length ?? 0} trades</small></button>;
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.intradayHeatmap}>
          <div className={styles.intradayToolbar}>
            <button type="button" disabled={dateIndex <= 0} onClick={() => setSelectedDate(availableDates[dateIndex - 1])}>← Previous day</button>
            <strong>{displayDateKey(selectedDate)}</strong>
            <button type="button" disabled={dateIndex < 0 || dateIndex >= availableDates.length - 1} onClick={() => setSelectedDate(availableDates[dateIndex + 1])}>Next day →</button>
          </div>
          <div className={styles.eventFilterTabs} aria-label="Intraday event type">
            {(["ALL", "ENTRY", "TARGET", "EOD"] as IntradayEventFilter[]).map((item) => <button type="button" key={item} data-active={eventFilter === item} onClick={() => setEventFilter(item)}>{item === "ALL" ? "All events" : item === "ENTRY" ? "Entries" : item === "TARGET" ? "Target hits" : "15:30 EOD"}</button>)}
          </div>
          <div className={styles.intradayChartScroll}>
            <div className={styles.intradayChart} role="grid" aria-label={`Intraday paper events for ${displayDateKey(selectedDate)}`}>
              <span className={styles.intradayCorner}>Stock</span>
              {intradaySlots.map((minutes) => <b className={styles.intradayTimeHeader} key={minutes}>{`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`}</b>)}
              {dayTrades.map((trade) => (
                <div className={styles.intradayStockRow} role="row" key={trade.trade_group_id ?? `${trade.symbol}-${trade.opened_at}`}>
                  <strong>{trade.symbol}</strong>
                  {intradaySlots.map((_, slotIndex) => {
                    const cellEvents = eventsForCell(trade, slotIndex);
                    const kinds = new Set(cellEvents.map((event) => event.type));
                    const eodEvent = cellEvents.find((event) => event.type === "EOD");
                    const targetEvents = cellEvents.filter((event) => event.type === "TARGET");
                    const kind = kinds.size > 1 ? "mixed" : String(cellEvents[0]?.type ?? "empty").toLowerCase();
                    const label = !cellEvents.length ? "" : targetEvents.length ? `${targetEvents.length} target${targetEvents.length > 1 ? "s" : ""}` : kinds.has("ENTRY") ? "Entry" : eodEvent ? compact(eodEvent.value) : "Event";
                    const eventDescription = cellEvents.map((event) => `${event.label}${event.value == null ? "" : ` ${money(event.value)}`}`).join(", ");
                    return <button type="button" key={slotIndex} className={styles.intradayHeatCell} data-event-kind={kind} data-has-event={cellEvents.length ? "true" : "false"} data-sign={eodEvent ? (number(eodEvent.value) >= 0 ? "positive" : "negative") : undefined} title={cellEvents.length ? `${trade.symbol} · ${eventDescription}` : `${trade.symbol} · no matching event`} aria-label={cellEvents.length ? `${trade.symbol}: ${eventDescription}` : `${trade.symbol}: no matching event in this interval`}><span>{label}</span></button>;
                  })}
                </div>
              ))}
            </div>
            {!dayTrades.length ? <p className={styles.intradayEmpty}>No paper entries for this date.</p> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function TradeEvidenceTotals({ trades }: { trades: AnyRow[] }) {
  const horizonBucket = (sessions: 5 | 30) => {
    const snapshotField = sessions === 5 ? "horizon_5d_snapshot_pnl" : "horizon_30d_snapshot_pnl";
    const available = trades.filter((trade) => trade[snapshotField] != null);
    const completed = trades.filter((trade) => horizonRecord(trade, sessions)?.status === "COMPLETED");
    return {
      total: available.reduce((sum, trade) => sum + number(trade[snapshotField]), 0),
      completed: completed.reduce((sum, trade) => sum + (horizonPnl(trade, sessions) ?? 0), 0),
      count: completed.length,
      developingCount: trades.length - completed.length,
      availableCount: available.length,
    };
  };
  const intradayClosed = trades.filter((trade) => trade.closed_in_intraday === true);
  const swingPath = trades.filter((trade) => trade.closed_in_intraday !== true);
  const eodTrades = trades.filter((trade) => trade.intraday_eod_pnl != null);
  const intradayEod = eodTrades.reduce((sum, trade) => sum + number(trade.intraday_eod_pnl), 0);
  const intradayOpportunity = trades.reduce((sum, trade) => sum + number(trade.intraday_max_profit), 0);
  const intradayBooked = intradayClosed.reduce((sum, trade) => sum + number(trade.realised_net_pnl), 0);
  const swingRealised = swingPath.filter((trade) => number(trade.remaining_quantity) <= 0).reduce((sum, trade) => sum + number(trade.realised_net_pnl), 0);
  const swingOpen = swingPath.filter((trade) => number(trade.remaining_quantity) > 0).reduce((sum, trade) => sum + number(trade.open_unrealised_gross_pnl), 0);
  const five = horizonBucket(5);
  const thirty = horizonBucket(30);
  const carry = trades.reduce((sum, trade) => sum + number(trade.hypothetical_carry_pnl), 0);
  const maxProfit = trades.reduce((sum, trade) => sum + number(trade.entry_notional) * Math.max(0, number(trade.mfe_30d_pct)) / 100, 0);
  const maxDrawdown = -trades.reduce((sum, trade) => sum + number(trade.entry_notional) * Math.abs(Math.min(0, number(trade.mae_30d_pct))) / 100, 0);
  const stopLossTrades = trades.filter((trade) => trade.stop_loss_scenario_pnl != null);
  const stopLossScenario = stopLossTrades.reduce((sum, trade) => sum + number(trade.stop_loss_scenario_pnl), 0);
  const stopLossHits = trades.filter((trade) => trade.stop_loss_hit === true).length;
  const fixedEligible = trades.filter((trade) => number(trade.fixed_investment_quantity) > 0);
  const fixedBudget = fixedEligible.reduce((sum, trade) => sum + number(trade.fixed_investment_budget), 0);
  const fixedDeployed = fixedEligible.reduce((sum, trade) => sum + number(trade.fixed_investment_deployed), 0);
  const fixedActual = fixedEligible.reduce((sum, trade) => sum + number(trade.fixed_investment_actual_pnl), 0);
  const fixedCarry = fixedEligible.reduce((sum, trade) => sum + number(trade.fixed_investment_carry_pnl), 0);
  const fixedMaxProfit = fixedEligible.reduce((sum, trade) => sum + number(trade.fixed_investment_mfe_30d_pnl), 0);
  const fixedMaxDrawdown = fixedEligible.reduce((sum, trade) => sum + number(trade.fixed_investment_mae_30d_pnl), 0);
  const fnoCapital = trades.reduce((sum, trade) => sum + number(trade.fno_quantity_investment_required), 0);
  const cards = [
    { label: "D0 15:30 sums", primaryLabel: "EOD hypothetical P/L", primary: intradayEod, secondaryLabel: "D0 maximum opportunity", secondary: intradayOpportunity, note: `${eodTrades.length}/${trades.length} complete entry-session closes` },
    { label: "Intraday booked", primaryLabel: "Realised net on D0 exits", primary: intradayBooked, secondaryLabel: "Trades closed on D0", secondary: null, note: `${intradayClosed.length} execution exits before the entry-session close` },
    { label: "Swing path", primaryLabel: "Realised after D0", primary: swingRealised, secondaryLabel: "Still-open gross P/L", secondary: swingOpen, note: `${swingPath.filter((trade) => number(trade.remaining_quantity) > 0).length} positions carried beyond intraday` },
    { label: "5-day path", primaryLabel: "Current 5D total", primary: five.total, secondaryLabel: "Frozen completed 5D", secondary: five.completed, note: `${five.availableCount}/${trades.length} valued · ${five.count} frozen · ${five.developingCount} still tracking` },
    { label: "30-day inclusive path", primaryLabel: "Current D0–D30 total", primary: thirty.total, secondaryLabel: "Completed at 30D", secondary: thirty.completed, note: `${thirty.availableCount}/${trades.length} valued · includes the first five sessions · ${thirty.developingCount} still tracking` },
    { label: "Observed reward / pain", primaryLabel: "Maximum profit to date", primary: maxProfit, secondaryLabel: "Maximum drawdown to date", secondary: maxDrawdown, note: `${trades.length} direction-normalised observation paths` },
    { label: "Never-closed carry", primaryLabel: "Hypothetical total", primary: carry, secondaryLabel: "Marked trades", secondary: null, note: `${trades.filter((trade) => trade.hypothetical_carry_mark != null).length}/${trades.length} using latest cached quotes` },
    { label: "₹6,000 stop simulation", primaryLabel: "First-breach gross result", primary: stopLossScenario, secondaryLabel: "Versus never-closed carry", secondary: stopLossScenario - carry, note: `${stopLossHits} first breaches · ${stopLossTrades.length}/${trades.length} valued · gap-aware · before hypothetical exit costs` },
  ];
  return (
    <div className={styles.evidenceTotals} aria-label="Paper trade horizon totals">
      {cards.map((card) => (
        <article key={card.label}>
          <span>{card.label}</span>
          <strong data-sign={card.primary >= 0 ? "positive" : "negative"}>{money(card.primary)}</strong>
          <small>{card.primaryLabel}</small>
          {card.secondary != null ? <><b data-sign={card.secondary >= 0 ? "positive" : "negative"}>{money(card.secondary)}</b><small>{card.secondaryLabel}</small></> : null}
          <em>{card.note}</em>
        </article>
      ))}
      <section className={styles.capitalScenarioSummary} aria-label="Capital basis comparison">
        <header>
          <span>Capital basis</span>
          <strong>F&amp;O quantity vs fixed ₹2 lakh per trade</strong>
        </header>
        <div><small>F&amp;O-quantity investment</small><b>{money(fnoCapital)}</b><em>Cash entry price × captured trade quantity</em></div>
        <div><small>₹2L budget / deployed</small><b>{money(fixedBudget)} / {money(fixedDeployed)}</b><em>{fixedEligible.length} eligible trades · whole shares only</em></div>
        <div><small>₹2L scaled actual / current carry</small><b data-sign={fixedActual >= 0 ? "positive" : "negative"}>{money(fixedActual)} / {money(fixedCarry)}</b><em>Actual economics and never-closed scenario remain separate</em></div>
        <div><small>₹2L maximum reward / pain</small><b><i data-sign="positive">{money(fixedMaxProfit)}</i> / <i data-sign="negative">{money(fixedMaxDrawdown)}</i></b><em>Observed D0–D30 MFE / MAE to date</em></div>
      </section>
      <p>D0 EOD uses the final canonical one-minute mark at 15:30 IST. The 30D path starts at entry and includes D0–D5: both horizon totals use the same live mark until 5D freezes, while 30D continues to track. The ₹6,000 stop simulation exits at the first one-minute breach, is gross before hypothetical exit costs, and remains separate from booked accounting.</p>
    </div>
  );
}

function UnifiedTradeMatrix({
  trades,
  onSelect,
  showComments,
  profiles,
}: {
  trades: AnyRow[];
  onSelect: (trade: AnyRow) => void;
  showComments: boolean;
  profiles: Map<string, StockProfile>;
}) {
  const [density, setDensity] = useState<"COMFORTABLE" | "DENSE" | "AUDIT">("DENSE");
  const [preset, setPreset] = useState<"ALL" | "EXECUTION" | "TARGETS" | "HORIZON" | "RISK" | "QUALITY">("ALL");
  const visible = (group: "EXECUTION" | "TARGETS" | "HORIZON" | "RISK" | "QUALITY") => preset === "ALL" || preset === group;
  const rowAction = (
    trade: AnyRow,
    event?: ReactKeyboardEvent<HTMLTableRowElement>,
  ) => {
    if (!event || event.key === "Enter" || event.key === " ") {
      event?.preventDefault();
      onSelect(trade);
    }
  };
  return (
    <>
      <div className={styles.gridViewControls}>
        <div><span>Column view</span>{PAPER_EVIDENCE_PRESETS.map((item) => <button type="button" key={item} data-active={preset === item} onClick={() => setPreset(item)}>{item === "ALL" ? "All fields" : item[0] + item.slice(1).toLowerCase()}</button>)}</div>
        <div><span>Density</span>{PAPER_EVIDENCE_DENSITIES.map((item) => <button type="button" key={item} data-active={density === item} onClick={() => setDensity(item)}>{item[0] + item.slice(1).toLowerCase()}</button>)}</div>
        <small>{preset === "ALL" ? "Every current field is visible." : `The ${preset.toLowerCase()} preset is active; switch to All fields to restore hidden groups.`}</small>
      </div>
      <div className={styles.unifiedTable} data-density={density.toLowerCase()}>
        <table>
          <colgroup>
            <col className={styles.colTrade} /><col className={styles.colDirection} /><col className={styles.colStrategy} />
            {visible("EXECUTION") ? <><col className={styles.colCapital} /><col className={styles.colEconomics} /><col className={styles.colEconomics} /></> : null}
            {visible("TARGETS") ? evidenceTargets.map((definition) => <col className={styles.colTarget} key={`col-${definition.lifecycle}-${definition.value}`} />) : null}
            {visible("HORIZON") ? <><col className={styles.colHorizon} /><col className={styles.colHorizon} /><col className={styles.colTime} /></> : null}
            {visible("RISK") ? <><col className={styles.colRewardPain} /><col className={styles.colRewardPain} /><col className={styles.colCarry} /></> : null}
            {visible("QUALITY") ? <><col className={styles.colQuality} />{showComments ? <col className={styles.colComments} /> : null}</> : null}
            <col className={styles.colAction} />
          </colgroup>
          <caption>
            Target and horizon cells are observational evidence. Booked execution and
            the never-closed carry scenario remain separate. Select a row for its audit trail.
          </caption>
          <thead>
            <tr className={styles.groupHeaderRow}>
              <th colSpan={3}>Trade &amp; Entry</th>
              {visible("EXECUTION") ? <th className={styles.tableGroupStart} colSpan={3}>Capital &amp; Actual Economics</th> : null}
              {visible("TARGETS") ? <th className={styles.tableGroupStart} colSpan={evidenceTargets.length}>Target Outcomes</th> : null}
              {visible("HORIZON") ? <th className={styles.tableGroupStart} colSpan={3}>Horizon Evidence</th> : null}
              {visible("RISK") ? <th className={styles.tableGroupStart} colSpan={3}>Reward, Pain &amp; Carry</th> : null}
              {visible("QUALITY") ? <th className={styles.tableGroupStart} colSpan={showComments ? 2 : 1}>Quality &amp; Governance</th> : null}
              <th className={styles.stickyActionHeader} rowSpan={2} aria-label="Action" />
            </tr>
            <tr>
              <th>Trade</th>
              <th>Direction</th>
              <th>Entry strategy</th>
              {visible("EXECUTION") ? <><th className={styles.tableGroupStart}>Investment required</th><th>Actual economics</th><th>D0 15:30 P/L</th></> : null}
              {visible("TARGETS") ? evidenceTargets.map((definition, index) => (
                <th className={index === 0 ? styles.tableGroupStart : undefined} key={`${definition.lifecycle}-${definition.value}`}>
                  <span>{definition.group}</span><b>{definition.label}</b>
                </th>
              )) : null}
              {visible("HORIZON") ? <><th className={styles.tableGroupStart}><span>Horizon</span><b>5D</b></th><th><span>Horizon</span><b>30D</b></th><th>Time since entry</th></> : null}
              {visible("RISK") ? <><th className={styles.tableGroupStart}>Maximum profit</th><th>Maximum drawdown</th><th>Never-closed carry</th></> : null}
              {visible("QUALITY") ? <><th className={styles.tableGroupStart}>Quality</th>{showComments ? <th>Admin comments</th> : null}</> : null}
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const actual =
                number(trade.remaining_quantity) > 0
                  ? number(trade.open_unrealised_gross_pnl)
                  : number(trade.realised_net_pnl);
              const completion = targetCompletion(trade);
              const allFailed = completion.failed === completion.total;
              const allHit = completion.hits === completion.total;
              const completionRatio = completion.hits / completion.total;
              const rowHue = allFailed ? 0 : allHit ? 130 : completion.hits === 0 && completion.pending > 0 ? 40 : completionRatio * 130;
              const elapsedDays = elapsedCalendarDays(trade.opened_at);
              const maxProfit = number(trade.entry_notional) * Math.max(0, number(trade.mfe_30d_pct)) / 100;
              const maxDrawdown = number(trade.entry_notional) * Math.abs(Math.min(0, number(trade.mae_30d_pct))) / 100;
              const carry = trade.hypothetical_carry_pnl == null ? null : number(trade.hypothetical_carry_pnl);
              const fixedCarry = trade.fixed_investment_carry_pnl == null ? null : number(trade.fixed_investment_carry_pnl);
              return (
                <tr
                  key={trade.trade_group_id}
                  tabIndex={0}
                  data-target-result={allHit ? "all-hit" : allFailed ? "all-failed" : "mixed"}
                  style={{ "--target-row-tint": `hsl(${rowHue} 45% 98.5%)`, "--target-row-edge": `hsl(${rowHue} 58% 43%)` } as CSSProperties}
                  onClick={() => rowAction(trade)}
                  onKeyDown={(event) => rowAction(trade, event)}
                >
                  <TradeIdentityCell
                    title={`${String(trade.symbol)} · ${profiles.get(String(trade.symbol).toUpperCase())?.name ?? "Name unavailable"} · ${trade.strategy_id ?? "Strategy unavailable"} · ${time(trade.opened_at)}`}
                    primary={<span className={styles.evidenceSymbol}><StockLogo symbol={String(trade.symbol)} profile={profiles.get(String(trade.symbol).toUpperCase())} size={14} />{String(trade.symbol)}</span>}
                    secondary={profiles.get(String(trade.symbol).toUpperCase())?.name ?? "—"}
                    detail={`${trade.strategy_id ?? "—"} · ${trade.side === "BUY" ? "LONG" : "SHORT"}`}
                    supporting={trade.side === "BUY" ? "BUY then SELL" : "SELL then BUY"}
                    metadata={`Opened ${time(trade.opened_at)}`}
                  />
                  <DirectionCell
                    direction={trade.trade_direction === "SHORT" ? "SHORT" : "LONG"}
                    primary={trade.trade_direction === "SHORT" ? "SHORT" : "LONG"}
                    secondary={trade.trade_direction === "SHORT" ? "Sold first" : "Bought first"}
                  />
                  <StrategyCell
                    title={`${entryStrategyLabel(trade.entry_strategy)} · ${entryStrategyDetail(trade.entry_strategy)} · ${trade.entry_strategy ?? "No governed method recorded"}`}
                    primary={entryStrategyLabel(trade.entry_strategy)}
                    secondary={entryStrategyDetail(trade.entry_strategy)}
                    detail={trade.entry_strategy ?? "—"}
                  />
                  {visible("EXECUTION") ? <CapitalCell
                    groupStart
                    primary={moneyOrDash(trade.fno_quantity_investment_required)}
                    secondary={`F&O qty: ${compactOrDash(trade.investment_quantity_basis)} × ${moneyOrDash(trade.investment_price_basis)}`}
                    detail={moneyOrDash(trade.fixed_investment_deployed)}
                    supporting={`₹2L: ${compactOrDash(trade.fixed_investment_quantity)} shares`}
                    metadata={`${moneyOrDash(trade.fixed_investment_cash_remaining)} cash`}
                  /> : null}
                  {visible("EXECUTION") ? <EconomicsCell
                    tone={actual >= 0 ? "positive" : "negative"}
                    primary={money(actual)}
                    secondary={number(trade.remaining_quantity) > 0 ? "OPEN" : "BOOKED"}
                    detail={number(trade.remaining_quantity) > 0 ? "Open unrealised gross" : "Booked realised net"}
                    supporting={`${compactOrDash(trade.remaining_quantity)} / ${compactOrDash(trade.opened_quantity)} qty remains`}
                    metadata={`₹2L scaled: ${moneyOrDash(trade.fixed_investment_actual_pnl)}`}
                  /> : null}
                  {visible("EXECUTION") ? <EconomicsCell
                    tone={trade.intraday_eod_pnl == null ? "neutral" : number(trade.intraday_eod_pnl) >= 0 ? "positive" : "negative"}
                    primary={moneyOrDash(trade.intraday_eod_pnl)}
                    secondary={trade.intraday_eod_mark == null ? "FINAL CLOSE UNAVAILABLE" : `Close ${money(trade.intraday_eod_mark)}`}
                    detail={trade.intraday_eod_mark_at ? time(trade.intraday_eod_mark_at) : "Not final"}
                    supporting={trade.fixed_investment_intraday_eod_pnl != null ? `₹2L: ${money(trade.fixed_investment_intraday_eod_pnl)}` : "—"}
                  /> : null}
                  {visible("TARGETS") ? evidenceTargets.map((definition, index) => <EvidenceTargetCell key={`${definition.lifecycle}-${definition.value}`} trade={trade} lifecycle={definition.lifecycle} value={definition.value} groupStart={index === 0} />) : null}
                  {visible("HORIZON") ? <HorizonOutcomeCell trade={trade} sessions={5} /> : null}
                  {visible("HORIZON") ? <HorizonOutcomeCell trade={trade} sessions={30} /> : null}
                  {visible("HORIZON") ? <TimeInTradeCell
                    primary={number(trade.sessions_observed) >= 30 ? "TIME UP" : elapsedDays === 0 ? "D0" : `${elapsedDays ?? "—"} DAYS`}
                    secondary={`${number(trade.sessions_observed)} trading sessions`}
                    detail={`Since ${time(trade.opened_at)}`}
                  /> : null}
                  {visible("RISK") ? <RewardPainCell groupStart tone="positive" primary={money(maxProfit)} secondary={`${percent(trade.mfe_30d_pct)} to date`} detail={`₹2L: ${moneyOrDash(trade.fixed_investment_mfe_30d_pnl)}`} /> : null}
                  {visible("RISK") ? <RewardPainCell tone="negative" primary={`−${money(maxDrawdown).replace("−", "")}`} secondary={`${percent(trade.mae_30d_pct)} to date`} detail={`₹2L: ${moneyOrDash(trade.fixed_investment_mae_30d_pnl)}`} /> : null}
                  {visible("RISK") ? <CarryCell
                    tone={carry == null ? "neutral" : carry >= 0 ? "positive" : "negative"}
                    primary={carry == null ? "—" : money(carry)}
                    secondary={trade.hypothetical_carry_mark == null ? "No current mark" : `At ${money(trade.hypothetical_carry_mark)}`}
                    detail={trade.hypothetical_carry_mark_at ? `Marked ${time(trade.hypothetical_carry_mark_at)}` : "—"}
                    supporting={fixedCarry != null ? `₹2L: ${money(fixedCarry)}` : "—"}
                  /> : null}
                  {visible("QUALITY") ? <QualityCell
                    groupStart
                    grade={trade.quality_label}
                    tone={["GOOD", "EXCELLENT"].includes(String(trade.quality_label)) ? "positive" : ["BAD", "AT_RISK"].includes(String(trade.quality_label)) ? "negative" : "info"}
                    primary={`${trade.quality_score == null ? "—" : `${number(trade.quality_score).toFixed(2)}%`} · ${trade.quality_label ?? "—"}`}
                    secondary={`${completion.hits} / ${completion.total} targets hit`}
                    detail={`${completion.pending} open`}
                    supporting={`Analytical horizon: ${trade.analytical_grade ?? "—"}`}
                  /> : null}
                  {visible("QUALITY") && showComments ? (
                    <CommentsCell
                      primary={`${number(trade.comment_count)} ${number(trade.comment_count) === 1 ? "comment" : "comments"}`}
                      secondary={trade.latest_comment ? String(trade.latest_comment) : "+ Add note"}
                      title={trade.latest_comment ? String(trade.latest_comment) : "Add an admin note"}
                    />
                  ) : null}
                  <ActionCell>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(trade);
                      }}
                      aria-label={`Open ${trade.symbol} evidence`}
                    >
                      View
                    </button>
                  </ActionCell>
                </tr>
              );
            })}
          </tbody>
        </table>
        {trades.length === 0 ? (
          <div className={styles.noResults}>
            No paper trades match these filters.
          </div>
        ) : null}
      </div>
      <div className={styles.tradeCards}>
        {trades.map((trade) => {
          const actual =
            number(trade.remaining_quantity) > 0
              ? number(trade.open_unrealised_gross_pnl)
              : number(trade.realised_net_pnl);
          const completion = targetCompletion(trade);
          const elapsedDays = elapsedCalendarDays(trade.opened_at);
          const carry = trade.hypothetical_carry_pnl == null ? null : number(trade.hypothetical_carry_pnl);
          const rowHue = completion.failed === completion.total ? 0 : completion.hits === completion.total ? 130 : completion.hits === 0 && completion.pending > 0 ? 40 : completion.hits / completion.total * 130;
          return (
            <button key={trade.trade_group_id} onClick={() => onSelect(trade)} style={{ "--target-row-tint": `hsl(${rowHue} 70% 96%)`, "--target-row-edge": `hsl(${rowHue} 63% 42%)` } as CSSProperties}>
              <header>
                <span>
                  <StockIdentity symbol={String(trade.symbol)} profile={profiles.get(String(trade.symbol).toUpperCase())} />
                  <small>
                    {trade.side === "BUY" ? "LONG" : "SHORT"} ·{" "}
                    {number(trade.remaining_quantity) > 0 ? "OPEN" : "CLOSED"}
                  </small>
                  <small>{entryStrategyLabel(trade.entry_strategy)}</small>
                </span>
                <b data-grade={trade.quality_label}>
                  {trade.quality_score == null ? "—" : `${number(trade.quality_score).toFixed(2)}%`} · {trade.quality_label}
                </b>
              </header>
              <div className={styles.mobileEconomics}>
                <span className={styles.mobileInvestmentBasis}>
                  <small>Investment required · F&amp;O quantity</small>
                  <strong>{money(trade.fno_quantity_investment_required)}</strong>
                  <small>{compact(trade.investment_quantity_basis)} × {money(trade.investment_price_basis)}</small>
                </span>
                <span className={styles.mobileInvestmentBasis}>
                  <small>Fixed ₹2L scenario</small>
                  <strong>{compact(trade.fixed_investment_quantity)} shares · {money(trade.fixed_investment_deployed)}</strong>
                  <small>{money(trade.fixed_investment_cash_remaining)} uninvested</small>
                </span>
                <span>
                  <small>Actual economics</small>
                  <strong data-sign={actual >= 0 ? "positive" : "negative"}>
                    {money(actual)}
                  </strong>
                  <small>₹2L scaled: {money(trade.fixed_investment_actual_pnl)}</small>
                </span>
                <span>
                  <small>D0 15:30 P/L</small>
                  <strong data-sign={trade.intraday_eod_pnl != null && number(trade.intraday_eod_pnl) >= 0 ? "positive" : "negative"}>
                    {trade.intraday_eod_pnl == null ? "—" : money(trade.intraday_eod_pnl)}
                  </strong>
                  {trade.fixed_investment_intraday_eod_pnl != null ? <small>₹2L: {money(trade.fixed_investment_intraday_eod_pnl)}</small> : null}
                </span>
                <span>
                  <small>Time since entry</small>
                  <strong>{number(trade.sessions_observed) >= 30 ? "TIME UP" : elapsedDays === 0 ? "D0" : `${elapsedDays ?? "—"} days`}</strong>
                </span>
                <span>
                  <small>Max profit / drawdown</small>
                  <strong>
                    {money(number(trade.entry_notional) * Math.max(0, number(trade.mfe_30d_pct)) / 100)} / −{money(number(trade.entry_notional) * Math.abs(Math.min(0, number(trade.mae_30d_pct))) / 100).replace("−", "")}
                  </strong>
                  <small>₹2L: {money(trade.fixed_investment_mfe_30d_pnl)} / {money(trade.fixed_investment_mae_30d_pnl)}</small>
                </span>
                <span>
                  <small>Never-closed carry</small>
                  <strong data-sign={carry != null && carry >= 0 ? "positive" : "negative"}>{carry == null ? "—" : money(carry)}</strong>
                  {trade.fixed_investment_carry_pnl != null ? <small>₹2L: {money(trade.fixed_investment_carry_pnl)}</small> : null}
                </span>
                {showComments ? (
                  <span>
                    <small>Admin comments</small>
                    <strong>{number(trade.comment_count)}</strong>
                  </span>
                ) : null}
              </div>
              <div className={styles.mobileTargetGrid}>
                {evidenceTargets.map((definition) => {
                  const target = targetRecord(trade, definition.lifecycle, definition.value);
                  const state = target ? targetState(target) : "PENDING";
                  return <span key={`${definition.lifecycle}-${definition.value}`} data-target-state={state.toLowerCase()}><small>{definition.group} {definition.label}</small><b>{state === "HIT" ? "✓ HIT" : state === "FAILED" ? "× NOT HIT" : "○ OPEN"}</b></span>;
                })}
                <span data-horizon-state={number(trade.sessions_observed) >= 5 ? "positive" : "developing"}><small>5D horizon</small><b>{number(trade.sessions_observed) >= 5 ? "MATURE" : `${number(trade.sessions_observed)}/5`}</b></span>
                <span data-horizon-state={number(trade.sessions_observed) >= 30 ? "positive" : "developing"}><small>30D horizon</small><b>{number(trade.sessions_observed) >= 30 ? "TIME UP" : `${number(trade.sessions_observed)}/30`}</b></span>
              </div>
              <footer>
                Open complete trade evidence <span>→</span>
              </footer>
            </button>
          );
        })}
      </div>
    </>
  );
}

function TradeDrawer({
  trade,
  canManageComments,
  onCommentAdded,
  onClose,
}: {
  trade: AnyRow;
  canManageComments: boolean;
  onCommentAdded: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("Journey");
  const [detail, setDetail] = useState<AnyRow | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    fetch(
      `${API_BASE_URL}/v1/workspace/paper-trading/trades/${trade.trade_group_id}`,
      { credentials: "include", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`Evidence API ${response.status}`);
        return response.json();
      })
      .then(setDetail)
      .catch((reason) => {
        if (reason?.name !== "AbortError")
          setDetail({ error: String(reason?.message ?? reason) });
      });
    return () => controller.abort();
  }, [trade.trade_group_id, detailVersion]);
  const commentsAvailable =
    canManageComments && detail?.permissions?.can_manage_comments === true;
  const tabs: DrawerTab[] = commentsAvailable
    ? ["Journey", "Targets", "Market Book", "Evidence", "Economics", "Comments", "Audit", "Calculation Trace"]
    : ["Journey", "Targets", "Market Book", "Evidence", "Economics", "Audit", "Calculation Trace"];
  return (
    <div
      className={styles.drawerBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className={styles.drawer}
        aria-label={`${trade.symbol} paper trade detail`}
      >
        <header>
          <div>
            <span>{trade.symbol.slice(0, 3)}</span>
            <div>
              <h2>{trade.symbol}</h2>
              <small>
                {trade.strategy_id} ·{" "}
                {trade.side === "SELL"
                  ? "SHORT · sold first, buy to close"
                  : "LONG · bought first, sell to close"}
              </small>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close trade detail">
            ×
          </button>
        </header>
        <div className={styles.drawerKpis}>
          <Metric
            label="Entry"
            value={money(trade.average_entry_price)}
            tone="neutral"
          />
          <Metric
            label="Direction"
            value={trade.trade_direction === "SHORT" ? "SHORT · sold first" : "LONG · bought first"}
            tone={trade.trade_direction === "SHORT" ? "negative" : "positive"}
          />
          <Metric
            label="Entry strategy"
            value={entryStrategyLabel(trade.entry_strategy)}
            tone="neutral"
          />
          <Metric
            label="Quantity"
            value={`${compact(trade.opened_quantity)} shares`}
            tone="neutral"
          />
          <Metric
            label="P&L / share"
            value={`${money(trade.actual_pnl_per_unit)} (${money(trade.actual_pnl_total)} total)`}
            tone={number(trade.actual_pnl_total) >= 0 ? "positive" : "negative"}
          />
          <Metric
            label="5D MFE / MAE"
            value={`${percent(trade.mfe_5d_pct)} / ${percent(trade.mae_5d_pct)}`}
            tone="neutral"
          />
          <Metric label="30D MFE / MAE" value={`${percent(trade.mfe_30d_pct)} / ${percent(trade.mae_30d_pct)}`} tone="neutral" />
          <Metric label="Never-closed carry" value={trade.hypothetical_carry_pnl == null ? "—" : money(trade.hypothetical_carry_pnl)} tone={number(trade.hypothetical_carry_pnl) >= 0 ? "positive" : "negative"} />
        </div>
        <nav>
          {tabs.map((item) => (
            <button
              key={item}
              data-active={tab === item}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        {!detail ? (
          <div className={styles.drawerLoading}>
            Loading durable trade evidence…
          </div>
        ) : detail.error ? (
          <div className={styles.drawerLoading}>
            Trade evidence is temporarily unavailable: {detail.error}
          </div>
        ) : (
          <div className={styles.drawerBody}>
            {tab === "Journey" ? (
              <Journey detail={detail} />
            ) : tab === "Targets" ? (
              <DrawerTargets detail={detail} />
            ) : tab === "Market Book" ? (
              <EntryMarketBook trade={detail.trade} />
            ) : tab === "Evidence" ? (
              <Evidence evidence={detail.evidence} quality={detail.trade.trade_quality} />
            ) : tab === "Economics" ? (
              <DrawerEconomics trade={detail.trade} scenarios={detail.horizons ?? []} />
            ) : tab === "Comments" && commentsAvailable ? (
              <DrawerComments
                detail={detail}
                onSaved={() => {
                  setDetailVersion((value) => value + 1);
                  onCommentAdded();
                }}
              />
            ) : tab === "Calculation Trace" ? (
              <DrawerCalculationTrace detail={detail} />
            ) : (
              <Audit events={detail.events} />
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Journey({ detail }: { detail: AnyRow }) {
  const series: AnyRow[] = detail.series ?? [];
  const values = series.map((row) => number(row.return_pct));
  const min = Math.min(-2, ...values),
    max = Math.max(5, ...values),
    width = 700,
    height = 230;
  const path = series
    .map(
      (row, index) =>
        `${index ? "L" : "M"} ${20 + (series.length <= 1 ? 0 : (index / (series.length - 1)) * (width - 40))} ${20 + ((max - number(row.return_pct)) / (max - min)) * (height - 40)}`,
    )
    .join(" ");
  return (
    <>
      <section className={styles.journeyCard}>
        <header>
          <div>
            <h3>Trade journey · actual and analytical path</h3>
            <p>Entry-normalised market path with target and adverse levels.</p>
          </div>
          <b data-grade={detail.trade.analytical_grade}>
            {detail.trade.analytical_grade}
          </b>
        </header>
        {series.length ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${detail.trade.symbol} entry-normalised journey`}
          >
            {[-2, 0, 1, 3, 5].map((level) => (
              <g key={level}>
                <line
                  x1="20"
                  x2={width - 20}
                  y1={20 + ((max - level) / (max - min)) * (height - 40)}
                  y2={20 + ((max - level) / (max - min)) * (height - 40)}
                  stroke={level < 0 ? "#d95364" : "#9fcdbb"}
                  strokeDasharray="5 5"
                />
                <text
                  x="22"
                  y={16 + ((max - level) / (max - min)) * (height - 40)}
                >
                  {level > 0 ? "+" : ""}
                  {level}%
                </text>
              </g>
            ))}
            <path d={path} fill="none" stroke="#2469d8" strokeWidth="3" />
          </svg>
        ) : (
          <div className={styles.noSeries}>
            No post-entry one-minute series is available yet.
          </div>
        )}
      </section>
      <section className={styles.captureCards}>
        <Metric
          label="Actual return"
          value={percent(detail.trade.actual_return_pct)}
          tone={
            number(detail.trade.actual_return_pct) >= 0
              ? "positive"
              : "negative"
          }
        />
        <Metric
          label="Max potential"
          value={percent(detail.trade.mfe_5d_pct)}
          tone="positive"
        />
        <Metric
          label="Observed downside"
          value={percent(detail.trade.mae_5d_pct)}
          tone="negative"
        />
        <Metric
          label="Capture efficiency"
          value={
            detail.trade.capture_efficiency_pct == null
              ? "—"
              : percent(detail.trade.capture_efficiency_pct)
          }
          tone="neutral"
        />
      </section>
      <section className={styles.interpretation}>
        <strong>
          {detail.trade.analytical_grade === "AT_RISK"
            ? "Adverse excursion requires attention"
            : detail.trade.analytical_grade === "DEVELOPING"
              ? "Observation window is still developing"
              : "Reward and pain are evaluated independently"}
        </strong>
        <p>This deterministic description is evidence, not a recommendation.</p>
      </section>
    </>
  );
}
function DrawerTargets({ detail }: { detail: AnyRow }) {
  return (
    <section className={styles.drawerList}>
      <h3>Favourable target chronology</h3>
      {(detail.targets ?? []).map((target: AnyRow) => {
        const state = targetState(target);
        const profit =
          state === "HIT" ? targetProfit(target, detail.trade) : null;
        return (
          <article key={`${target.lifecycle}-${target.target_pct}`}>
            <div>
              <b>
                {target.lifecycle} {targetLabel(target.target_pct)}
              </b>
              <small>Target price {money(target.target_price)}</small>
            </div>
            <strong data-state={state.toLowerCase()}>{state}</strong>
            <span>
              {target.first_hit_at
                ? `First hit ${time(target.first_hit_at)}`
                : "No first-hit evidence yet"}
            </span>
            {profit ? (
              <span className={styles.drawerTargetProfit}>
                <b>Profit per share {money(profit.perShare)}</b>
                <b>
                  Profit × {compact(profit.quantity)} qty {money(profit.total)}
                </b>
                <small>
                  Gross analytical target value; cash price × F&amp;O lot
                  quantity.
                </small>
              </span>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
function EntryMarketBook({ trade }: { trade: AnyRow }) {
  const bids = Array.isArray(trade.entry_bid_levels) ? trade.entry_bid_levels : [];
  const asks = Array.isArray(trade.entry_ask_levels) ? trade.entry_ask_levels : [];
  const captured = Boolean(trade.entry_book_status);
  const statusLabel = !captured
    ? "NOT CAPTURED"
    : String(trade.entry_book_status).replaceAll("_", " ");
  const bookMetric = (value: unknown, formatter: (input: unknown) => string = compact) =>
    value == null || number(value) <= 0 ? "—" : formatter(value);
  return (
    <section className={styles.entryMarketBook}>
      <header>
        <div>
          <span className={styles.observedBadge}>OBSERVED · INFO ONLY</span>
          <h3>Entry-time SmartAPI market book</h3>
          <p>
            A frozen reference snapshot for entry executability review. It does not
            alter the governed paper fill or imply that the displayed quantity was executable.
          </p>
        </div>
        <strong data-state={captured ? String(trade.entry_book_status).toLowerCase() : "not-captured"}>{statusLabel}</strong>
      </header>
      {!captured ? (
        <div className={styles.entryBookUnavailable}>
          <b>Historical entry book unavailable</b>
          <span>Entry-depth logging begins with new paper fills after this release; older trades are not inferred or shown as zero.</span>
        </div>
      ) : (
        <>
          <div className={styles.entryBookMetrics}>
            <div><span>Reference touch</span><strong>{bookMetric(trade.entry_book_reference_touch, money)}</strong><small>{trade.entry_book_reference_touch_side ?? "—"} for this {trade.trade_direction ?? "trade"} entry</small></div>
            <div><span>Best bid / ask</span><strong>{bookMetric(trade.entry_book_best_bid_price, money)} / {bookMetric(trade.entry_book_best_ask_price, money)}</strong><small>Spread {bookMetric(trade.entry_book_spread, money)} · {trade.entry_book_spread_bps == null ? "—" : `${number(trade.entry_book_spread_bps).toFixed(2)} bps`}</small></div>
            <div><span>LTP / last quantity</span><strong>{bookMetric(trade.entry_book_ltp, money)} / {bookMetric(trade.entry_book_last_trade_qty)}</strong><small>Cumulative volume {bookMetric(trade.entry_book_cumulative_volume)}</small></div>
            <div><span>Total buy / sell qty</span><strong>{bookMetric(trade.entry_book_total_buy_qty)} / {bookMetric(trade.entry_book_total_sell_qty)}</strong><small>{trade.entry_book_quote_ts ? `${time(trade.entry_book_quote_ts)} IST · ${compact(trade.entry_book_quote_age_ms)} ms old` : "Quote time unavailable"}</small></div>
          </div>
          <div className={styles.entryBookLadders}>
            {([{ side: "BID", rows: bids }, { side: "ASK", rows: asks }] as const).map((book) => (
              <article key={book.side} data-side={book.side.toLowerCase()}>
                <header><b>Top 3 {book.side}</b><span>Price</span><span>Qty</span><span>Orders</span></header>
                {[0, 1, 2].map((index) => {
                  const level = book.rows[index] as AnyRow | undefined;
                  return <div key={index}><b>L{index + 1}</b><span>{level ? bookMetric(level.price, money) : "—"}</span><span>{level ? bookMetric(level.quantity) : "—"}</span><span>{level ? bookMetric(level.orders) : "—"}</span></div>;
                })}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Evidence({ evidence, quality }: { evidence: AnyRow; quality: AnyRow }) {
  return (
    <section className={styles.evidence}>
      <h3>Trade quality · {quality?.policyVersion ?? "—"}</h3>
      <div><span>Total score</span><strong>{quality?.totalScore == null ? "Awaiting entry evidence" : `${number(quality.totalScore).toFixed(2)}% · ${quality.label}`}</strong></div>
      <div><span>Process evidence</span><strong>{number(quality?.process?.coveragePct).toFixed(2)}% covered · {quality?.process?.scorePct == null ? "—" : `${number(quality.process.scorePct).toFixed(2)}% observed score`}</strong></div>
      <div><span>Outcome evidence</span><strong>{number(quality?.outcome?.coveragePct).toFixed(2)}% covered · {quality?.outcome?.scorePct == null ? "—" : `${number(quality.outcome.scorePct).toFixed(2)}% observed score`}</strong></div>
      <div><span>Risk gate</span><strong>{quality?.hardFailFlags?.length ? `BAD RISK · ${quality.hardFailFlags.join(", ")}` : quality?.criticalRiskComplete ? "Complete" : "Estimated from current risk evidence"}</strong></div>
      {(quality?.criteria ?? []).map((criterion: AnyRow) => (
        <div key={criterion.id}><span>{criterion.id} · {criterion.title} · {criterion.weight} pts</span><strong>{criterion.status === "SCORED" ? `${number(criterion.rating).toFixed(2)}/5 · ${number(criterion.points).toFixed(2)} pts` : criterion.status}</strong></div>
      ))}
      <h3>Calculation evidence and provenance</h3>
      {Object.entries(evidence ?? {}).map(([key, value]) => (
        <div key={key}>
          <span>{key.replaceAll("_", " ")}</span>
          <strong>{value == null ? "—" : String(value)}</strong>
        </div>
      ))}
    </section>
  );
}
function DrawerEconomics({ trade, scenarios }: { trade: AnyRow; scenarios: AnyRow[] }) {
  const lanes = [
    { label: "Booked execution", className: "BOOKED", value: trade.realised_net_pnl, detail: `Gross ${money(trade.realised_gross_pnl)} · governed fills` },
    { label: "Open actual", className: "OPEN ACTUAL", value: trade.open_unrealised_gross_pnl, detail: `${compact(trade.remaining_quantity)} quantity remains · latest mark ${money(trade.last_mark)}` },
    { label: "D0 15:30", className: "HYPOTHETICAL", value: trade.intraday_eod_pnl, detail: trade.intraday_eod_mark_at ? `Final entry-session mark ${time(trade.intraday_eod_mark_at)} IST` : "Entry-session final mark unavailable" },
    { label: "Never-closed carry", className: "HYPOTHETICAL", value: trade.hypothetical_carry_pnl, detail: `${trade.hypothetical_carry_mark_source ?? "No mark source"} · ${time(trade.hypothetical_carry_mark_at)} IST` },
    { label: "₹6,000 stop", className: "HYPOTHETICAL", value: trade.stop_loss_scenario_pnl, detail: `${trade.stop_loss_scenario_state ?? "Unavailable"} · gross before hypothetical exit costs` },
    { label: "Fixed ₹2 lakh", className: "SIMULATED", value: trade.fixed_investment_actual_pnl, detail: `${compact(trade.fixed_investment_quantity)} whole shares · ${money(trade.fixed_investment_deployed)} deployed` },
  ];
  return <section className={styles.drawerEconomics}><header><h3>Economics lanes</h3><p>These values share a trade but not necessarily an accounting, capital or cost basis. They are never summed into one misleading total.</p></header><div>{lanes.map((lane) => <article key={lane.label}><span>{lane.className}</span><h4>{lane.label}</h4><strong data-sign={lane.value != null && number(lane.value) >= 0 ? "positive" : "negative"}>{lane.value == null ? "—" : money(lane.value)}</strong><small>{lane.detail}</small></article>)}</div>{scenarios.length ? <footer>{scenarios.map((scenario) => <span key={scenario.horizon_sessions}><b>D+{scenario.horizon_sessions}</b> {scenario.status} · {scenario.after_tax_pnl != null ? money(scenario.after_tax_pnl) : scenario.after_cost_pnl != null ? money(scenario.after_cost_pnl) : percent(number(scenario.closing_return) * 100)}</span>)}</footer> : null}</section>;
}

function DrawerCalculationTrace({ detail }: { detail: AnyRow }) {
  const trade = detail.trade ?? {};
  const traces = [
    { definition: PAPER_METRIC_DEFINITIONS.bookedRealisedNet, value: trade.realised_net_pnl },
    { definition: PAPER_METRIC_DEFINITIONS.openUnrealisedGross, value: trade.open_unrealised_gross_pnl },
    { definition: PAPER_METRIC_DEFINITIONS.d0EodPnl, value: trade.intraday_eod_pnl },
    { definition: PAPER_METRIC_DEFINITIONS.mfe5d, value: trade.mfe_5d_pct },
    { definition: PAPER_METRIC_DEFINITIONS.mae5d, value: trade.mae_5d_pct },
    { definition: PAPER_METRIC_DEFINITIONS.mfe30d, value: trade.mfe_30d_pct },
    { definition: PAPER_METRIC_DEFINITIONS.mae30d, value: trade.mae_30d_pct },
    { definition: PAPER_METRIC_DEFINITIONS.neverClosedCarry, value: trade.hypothetical_carry_pnl },
    { definition: PAPER_METRIC_DEFINITIONS.stopSimulation, value: trade.stop_loss_scenario_pnl },
    { definition: PAPER_METRIC_DEFINITIONS.fixed2lActual, value: trade.fixed_investment_actual_pnl },
    { definition: PAPER_METRIC_DEFINITIONS.captureEfficiency, value: trade.capture_efficiency_pct },
    { definition: PAPER_METRIC_DEFINITIONS.qualityScore, value: trade.quality_score },
  ];
  return <section className={styles.drawerTrace}><header><h3>Calculation trace</h3><p>Canonical fields, formula ownership and basis metadata for this trade. Missing is never replaced with zero.</p></header>{traces.map(({ definition, value }) => <details key={definition.id}><summary><span>{definition.label}<small>{definition.accountingClass.replace("_", " ")} · {definition.timeBasis}</small></span><strong>{value == null ? "— missing" : definition.unit === "INR" ? money(value) : definition.unit === "PERCENT" ? percent(value) : String(value)}</strong></summary><dl><dt>Formula</dt><dd>{definition.formula ?? "Direct source value"}</dd><dt>Source</dt><dd>{definition.dataSource}</dd><dt>Source fields</dt><dd>{definition.sourceFields.join(", ")}</dd><dt>Capital basis</dt><dd>{definition.capitalBasis}</dd><dt>Cost basis</dt><dd>{definition.costBasis}</dd><dt>Policy</dt><dd>{definition.policyVersion ?? detail.evidence?.calculation_version ?? "Source-defined"}</dd></dl></details>)}</section>;
}
function DrawerComments({
  detail,
  onSaved,
}: {
  detail: AnyRow;
  onSaved: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const comments: AnyRow[] = detail.comments ?? [];
  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanBody = body.trim();
    if (!cleanBody || busy) return;
    setBusy(true);
    setError(null);
    const send = () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const csrf = getSessionCsrfToken();
      if (csrf) headers["X-CSRF-Token"] = csrf;
      return fetch(
        `${API_BASE_URL}/v1/workspace/paper-trading/trades/${detail.trade.trade_group_id}/comments`,
        {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ body: cleanBody }),
        },
      );
    };
    try {
      let response = await send();
      if (response.status === 403) {
        await refreshCsrfToken();
        response = await send();
      }
      if (!response.ok)
        throw new Error(
          `Comment API ${response.status}: ${await response.text()}`,
        );
      setBody("");
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.commentsPanel}>
      <header>
        <div>
          <h3>Admin comments</h3>
          <p>Private operational notes. Visible only to administrators.</p>
        </div>
        <b>{comments.length}</b>
      </header>
      <form onSubmit={submit}>
        <label htmlFor="paper-trade-admin-comment">Add comment</label>
        <textarea
          id="paper-trade-admin-comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Record entry context, review notes, follow-up, or outcome interpretation…"
          required
        />
        <footer>
          <small>{body.length}/2000</small>
          <button type="submit" disabled={busy || !body.trim()}>
            {busy ? "Saving…" : "Save comment"}
          </button>
        </footer>
        {error ? (
          <p className={styles.commentError} role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <div className={styles.commentHistory}>
        {comments.length ? (
          comments.map((comment) => (
            <article key={comment.comment_id}>
              <p>{comment.body}</p>
              <footer>
                <span>{comment.author_email || comment.author_uid}</span>
                <time>{time(comment.created_at)}</time>
              </footer>
            </article>
          ))
        ) : (
          <div className={styles.commentEmpty}>No admin comments yet.</div>
        )}
      </div>
    </section>
  );
}
function Audit({ events }: { events: AnyRow[] }) {
  return (
    <section className={styles.audit}>
      <h3>Immutable paper-trade audit</h3>
      {(events ?? []).map((event) => (
        <article key={event.event_id}>
          <span>{event.sequence}</span>
          <div>
            <strong>{event.event_type}</strong>
            <small>{time(event.event_time)}</small>
          </div>
        </article>
      ))}
    </section>
  );
}

function AddPaperTradeDialog({
  initialSymbol,
  onClose,
  onCreated,
}: {
  initialSymbol?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user, openAuthGate } = useAuthGate();
  const [symbol, setSymbol] = useState((initialSymbol ?? "").toUpperCase());
  const [side, setSide] = useState("BUY");
  const [initialStopPct, setInitialStopPct] = useState("1");
  const [maxHoldingSessions, setMaxHoldingSessions] = useState("5");
  const [tradeReason, setTradeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      openAuthGate();
      return;
    }
    setBusy(true);
    setError(null);
    const send = () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const csrf = getSessionCsrfToken();
      if (csrf) headers["X-CSRF-Token"] = csrf;
      return fetch(`${API_BASE_URL}/v1/workspace/paper-trading/manual-trades`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          assetClass: "EQUITY",
          symbol,
          side,
          orderType: "MARKET",
          initialStopPct,
          maxHoldingSessions,
          tradeReason,
          notes: "Paper Command Center observation",
        }),
      });
    };
    try {
      let response = await send();
      if (response.status === 403) {
        await refreshCsrfToken();
        response = await send();
      }
      if (!response.ok)
        throw new Error(`API ${response.status}: ${await response.text()}`);
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className={styles.modal} onSubmit={submit}>
        <header>
          <div>
            <span>PAPER ONLY</span>
            <h2>Add analytical paper trade</h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <p>
          This creates a simulated market order for exactly one current F&amp;O
          lot and starts D0, swing, D+5 and D+30 observation. It cannot place a
          broker order.
        </p>
        <label>
          Stock symbol
          <input
            autoFocus
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="RELIANCE"
            required
            pattern="[A-Za-z0-9&-]+"
          />
        </label>
        <div>
          <label>
            Direction
            <select
              value={side}
              onChange={(event) => setSide(event.target.value)}
            >
              <option value="BUY">Long · buy then sell</option>
              <option value="SELL">Short · sell then buy</option>
            </select>
          </label>
          <label>
            Quantity
            <input
              value="1 current F&amp;O lot"
              readOnly
              aria-label="Paper trade quantity policy"
            />
          </label>
        </div>
        <div>
          <label>
            Initial risk limit
            <input type="number" min="0.1" max="20" step="0.1" value={initialStopPct} onChange={(event) => setInitialStopPct(event.target.value)} required />
            <small>Percent from the simulated fill; used as the effective-risk basis.</small>
          </label>
          <label>
            Maximum holding period
            <input type="number" min="1" max="30" step="1" value={maxHoldingSessions} onChange={(event) => setMaxHoldingSessions(event.target.value)} required />
            <small>NSE trading sessions, not calendar days.</small>
          </label>
        </div>
        <label>
          Entry thesis and reason
          <textarea value={tradeReason} onChange={(event) => setTradeReason(event.target.value)} minLength={10} maxLength={500} required placeholder="State the setup, invalidation and why this entry is appropriate now." />
        </label>
        <section>
          <strong>Execution and evaluation policy</strong>
          <span>Quantity resolved from nearest active FUTSTK contract</span>
          <span>Actual paper exit: first of intraday +1% or swing +3%</span>
          <span>Analytical ladders: intraday +0.3 / +0.4 / +0.5 / +1%</span>
          <span>Analytical ladders: swing +1 / +3 / +5%</span>
          <span>D+5 and D+30 MFE / MAE continue after exit</span>
        </section>
        {error ? <p className={styles.modalError}>{error}</p> : null}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy
              ? "Creating…"
              : user
                ? "Create PAPER observation"
                : "Sign in to continue"}
          </button>
        </footer>
      </form>
    </div>
  );
}
