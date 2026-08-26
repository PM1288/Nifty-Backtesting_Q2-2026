import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { AudioLines, VolumeX } from "lucide-react";
import { useAuthGate } from "../../auth/AuthGateProvider";
import { useTrackPageViews } from "../../analytics/useTrackPageViews";
import { DataAge, EnvironmentBadge } from "../../design-system/TradingPrimitives";
import { DataQualityBadge } from "../../design-system/WorkspacePrimitives";
import { buildMarketQuoteQuality } from "../../design-system/quality";
import { useI18n } from "../../i18n/LocaleProvider";
import { useHeaderMarketSummary, useLiveQuotesWithStatus } from "../../lib/hooks";
import { useDashboardPrefetch } from "../../lib/useDashboardPrefetch";
import { arrow, fmtPct, fmtPrice } from "../../lib/format";
import { useAnalyticsExperienceMode } from "../../pages/AnalyticsChrome";
import { AuthGateModal } from "../auth/AuthGateModal";
import { AuthStatus } from "./AuthStatus";
import { CommandPalette, type CommandPaletteItem } from "./CommandPalette";
import { ResponsiveWorkspaceNavigation } from "./ResponsiveWorkspaceNavigation";
import { resolveWorkspaceRoute } from "./workspaceRoutes";
import { routeCommandItems } from "../../interaction/routeCatalog";
import { NavigationStateManager } from "../../interaction/NavigationStateManager";
import { MarketGradientWaves } from "../visual/MarketGradientWaves";
import { MarketTargetCursor } from "../visual/MarketTargetCursor";
import { MarketRsiParticles } from "../visual/MarketRsiParticles";
import { pctClass } from "../utils/pctClass";
import { PaperTradeNotifier } from "./PaperTradeNotifier";
import { paperVoiceEnabledByDefault } from "./paperTradeNotifications";
import styles from "./AppShell.module.css";

type WorkspaceLink = { label: string; to: string; match?: (pathname: string) => boolean };

function workspaceLinks(workspace: string, isAdmin: boolean): WorkspaceLink[] {
  if (workspace === "markets") return [
    { label: "Market Story", to: "/analytics", match: (path) => path === "/analytics" },
    { label: "Regime", to: "/analytics/regime" },
    { label: "Leadership", to: "/analytics/leadership" },
    { label: "Risk", to: "/analytics/risk" },
    { label: "Breadth", to: "/market/nifty-500" },
    { label: "Heatmaps", to: "/heatmap/change", match: (path) => path.startsWith("/heatmap/") },
    { label: "Advanced Flows", to: "/analytics/flows" }
  ];
  if (workspace === "stocks") return [
    { label: "Indicator Explorer", to: "/analytics/indicators" },
    { label: "Stock 360", to: "/analytics/stock/RELIANCE", match: (path) => path.startsWith("/analytics/stock/") },
    { label: "Signals", to: "/analytics/daily-setups" },
    { label: "Events", to: "/catalysts/context", match: (path) => path.startsWith("/catalysts/") },
    { label: "Institutional Context", to: "/institutional/flow" }
  ];
  if (workspace === "oiis-lab") return [
    { label: "Live Selection", to: "/strategy/oiis-live", match: (path) => path === "/strategy/oiis-live" },
    { label: "OISS v1.202608", to: "/strategy/oiss-v1-202608", match: (path) => path.startsWith("/strategy/oiss-v1-202608") },
    { label: "Strategy Definition", to: "/backtesting/strategies" },
    { label: "Backtest Builder", to: "/backtesting/lab" },
    { label: "Results", to: "/backtesting/results" },
    { label: "Compare", to: "/backtesting/compare" },
    {
      label: "Diagnostics",
      to: "/backtesting/h30",
      match: (path) => path.startsWith("/backtesting/h30") || path.startsWith("/backtesting/regimes") || path.startsWith("/backtesting/stocks")
    },
    { label: "Runs", to: "/strategy/oiis-live/history" }
  ];
  if (workspace === "rolling-monthly") return [
    { label: "Rolling 5/30/60", to: "/strategy/rolling-monthly" },
    { label: "Monthly anchors", to: "/strategy/monthly" }
  ];
  if (workspace === "monthly-strategy") return [
    { label: "All entry methods", to: "/strategy/monthly" },
    { label: "Expiry", to: "/strategy/monthly?entryMethod=EXPIRY" },
    { label: "Monthly closure", to: "/strategy/monthly?entryMethod=MONTHLY_CLOSURE" },
    { label: "First session", to: "/strategy/monthly?entryMethod=FIRST_SESSION" },
    { label: "Rolling 5/30/60", to: "/strategy/rolling-monthly" }
  ];
  if (workspace === "trendlyne-summary") return [
    { label: "Recommendation ledger", to: "/strategy/trendlyne-summary" },
    { label: "Stock 360", to: "/analytics/stock/RELIANCE" },
    { label: "Data quality", to: "/analytics/system/quality" }
  ];
  if (workspace === "long-options") return [
    { label: "Router", to: "/strategy/long-options" },
    { label: "Option Evidence", to: "/options/intelligence" },
    { label: "Movement Signals", to: "/options/volatility-signals" },
    { label: "Futures Context", to: "/futures" }
  ];
  // This route owns a URL-backed lens bar with the same destinations. Keep
  // one page-level navigation system instead of rendering duplicate rows.
  if (workspace === "nifty-weekly-options") return [];
  if (workspace === "paper-trading") return [];
  if (workspace === "derivatives") return [
    { label: "Options Overview", to: "/options/intelligence", match: (path) => path === "/options/intelligence" },
    { label: "Structure", to: "/options/structure" },
    { label: "Volatility Signals", to: "/options/volatility-signals" },
    { label: "Futures", to: "/futures" },
    { label: "Advanced Data", to: "/options/snapshot" }
  ];
  if (workspace === "data-operations") {
    const links: WorkspaceLink[] = [
      { label: "Trust & Data Quality", to: "/analytics/system/quality" },
      { label: "Run Monitor", to: "/backtesting/runs" },
      { label: "Report Ingestion", to: "/institutional/reports" },
      { label: "NSE Intelligence", to: "/institutional/nse-intelligence", match: (path) => path.startsWith("/institutional/nse-intelligence") },
      { label: "Sources & Provenance", to: "/analytics/system/map" }
    ];
    if (isAdmin) links.push({ label: "Administration", to: "/control-plane" });
    return links;
  }
  return [];
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { tr } = useI18n();
  const { authReady, user } = useAuthGate();
  const { mode: analyticsMode } = useAnalyticsExperienceMode();
  const [presentationMode, setPresentationMode] = useState(false);
  const [paperVoiceEnabled, setPaperVoiceEnabled] = useState(() => typeof window !== "undefined" && paperVoiceEnabledByDefault(window.localStorage.getItem("n50.paper-alert-voice")));
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const sessionEnabled = authReady && Boolean(user);
  const overview = useHeaderMarketSummary(sessionEnabled);
  const liveFeed = useLiveQuotesWithStatus(["NIFTY50", "BANKNIFTY", "INDIAVIX"], sessionEnabled);
  const live = liveFeed.quotes;
  const niftyChangePct =
    live.NIFTY50?.changePct ??
    overview.data?.indices?.nifty50?.changePct ??
    null;
  const niftyLevel =
    live.NIFTY50?.price ??
    overview.data?.indices?.nifty50?.last ??
    null;
  const niftyRsi = overview.data?.indices?.nifty50?.rsi ?? null;
  const workspaceRoute = resolveWorkspaceRoute(location.pathname);
  const workspace = workspaceRoute.id;
  const isAdminRoute = location.pathname.startsWith("/control-plane");
  const secondaryLinks = workspaceLinks(workspace, user?.role === "admin");
  const pageTitle = tr(workspaceRoute.label);
  const authState = authReady && user ? "signed_in" : "guest";
  const prefetchDashboardRoute = useDashboardPrefetch(authReady);
  const compactV5 = import.meta.env.VITE_UI_COMPACT_V5 === "true";
  const commandItems = useMemo<CommandPaletteItem[]>(() => routeCommandItems(user?.role === "admin"), [user?.role]);

  const loadCommandEntities = useCallback(async (): Promise<CommandPaletteItem[]> => {
    const [paperResponse, runResponse, profileResponse] = await Promise.allSettled([
      fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/workspace/paper-trading`, { credentials: "include", headers: { Accept: "application/json" } }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error(`Paper API ${response.status}`))),
      fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/backtesting/lab/runs?limit=25`, { credentials: "include", headers: { Accept: "application/json" } }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error(`Runs API ${response.status}`))),
      fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/instrument-profiles`, { credentials: "include", headers: { Accept: "application/json" } }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error(`Profiles API ${response.status}`)))
    ]);
    const dynamic: CommandPaletteItem[] = [];
    if (profileResponse.status === "fulfilled") {
      for (const profile of profileResponse.value?.records ?? []) dynamic.push({
        id: `stock:${profile.symbol}`,
        group: "Stocks",
        label: String(profile.symbol),
        description: `${profile.name || profile.symbol}${profile.sector ? ` · ${profile.sector}` : ""}`,
        to: `/analytics/stock/${encodeURIComponent(String(profile.symbol))}?source=command-palette`,
        keywords: [profile.name, profile.sector, profile.capBucket, profile.fno ? "fno" : null, "stock", "instrument"].filter(Boolean),
        actionLabel: "Stock 360"
      });
    }
    if (paperResponse.status === "fulfilled") {
      for (const trade of paperResponse.value?.stockTrades ?? []) dynamic.push({
        id: `paper:${trade.trade_group_id}`,
        group: "Paper trades",
        label: `${trade.symbol} paper trade`,
        description: `${trade.group_status ?? trade.status ?? "Observation"} · ${trade.side ?? ""} · ${trade.strategy_id ?? "Manual"}`,
        freshness: trade.last_mark_at ? `Marked ${new Date(trade.last_mark_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : undefined,
        to: `/paper-trading?tradeId=${encodeURIComponent(trade.trade_group_id)}&source=command-palette`,
        keywords: [trade.symbol, trade.strategy_id, trade.group_status, "paper position"].filter(Boolean),
        actionLabel: "Open journey"
      });
    }
    if (runResponse.status === "fulfilled") {
      for (const run of runResponse.value?.items ?? []) dynamic.push({
        id: `run:${run.runId}`,
        group: "Backtest runs",
        label: `${run.strategyVersionId ?? "Strategy"} run`,
        description: `${run.status ?? "UNKNOWN"} · ${run.requestedDateStart ?? "—"} to ${run.requestedDateEnd ?? "—"}`,
        freshness: run.createdAt ? `Created ${new Date(run.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : undefined,
        to: `/backtesting/lab?runId=${encodeURIComponent(run.runId)}&source=command-palette`,
        keywords: [run.runId, run.strategyVersionId, run.status, "backtest"].filter(Boolean),
        actionLabel: "Open run"
      });
    }
    return dynamic;
  }, []);

  useTrackPageViews({
    pathname: location.pathname,
    search: location.search,
    mode: analyticsMode,
    authState,
    trackingReady: authReady
  });

  const newestQuoteTime = Object.values(live).reduce<string | undefined>((latest, quote) => {
    if (!latest) return quote.timestamp;
    return Date.parse(quote.timestamp) > Date.parse(latest) ? quote.timestamp : latest;
  }, undefined);
  const feedQuality = buildMarketQuoteQuality({
    transport: liveFeed.transport,
    quoteTimestamp: newestQuoteTime,
    snapshotTimestamp: overview.data?.asOf,
    receiveTimestamp: liveFeed.lastReceivedAt,
    sequence: liveFeed.sequence,
    gapDetected: liveFeed.gapDetected,
    snapshotFailed: overview.isError
  });

  if (!authReady || !user) {
    return (
      <div className={styles.shell} data-ui-generation="trading-v2" data-workspace-theme="light">
        <NavigationStateManager />
        <AuthGateModal />
      </div>
    );
  }

  return (
    <div
      className={styles.shell}
      data-ui-generation="trading-v2"
      data-workspace-theme="light"
      data-has-ticker="false"
      data-ui-compact-v5={compactV5 ? "true" : "false"}
      data-admin-shell={isAdminRoute ? "true" : "false"}
      data-presentation-mode={presentationMode ? "true" : "false"}
    >
      <NavigationStateManager />
      <MarketGradientWaves changePct={niftyChangePct} rsi={niftyRsi} />
      <MarketRsiParticles rsi={niftyRsi} />
      <div className={styles.chrome}>
        <MarketTargetCursor changePct={niftyChangePct} />
        <header className={styles.header}>
          <div className={styles.topBar}>
            <div className={styles.topBarLeft}>
              <Link to="/" className={styles.brandLink} onMouseEnter={() => prefetchDashboardRoute("/")} onFocus={() => prefetchDashboardRoute("/")}>
                <span className={styles.brandMark}>{isAdminRoute ? "NIFTY 50 ADMIN" : "NIFTY 50 TRADER"}</span>
              </Link>
              <CommandPalette items={commandItems} loadItems={loadCommandEntities} />
            </div>
            <div className={styles.topBarCenter}>
              <div className={styles.headerContext}>
                <EnvironmentBadge value={isAdminRoute ? "ADMIN" : "PAPER"} />
                <div
                  className={styles.niftyHeaderQuote}
                  data-testid="nifty-header-quote"
                  data-tone={niftyChangePct == null ? "neutral" : niftyChangePct > 0 ? "positive" : niftyChangePct < 0 ? "negative" : "neutral"}
                  aria-label={niftyLevel == null || niftyChangePct == null ? "NIFTY 50 data pending" : `NIFTY 50 ${fmtPrice(niftyLevel)}, ${fmtPct(niftyChangePct)}`}
                >
                  <span>NIFTY 50</span>
                  <strong>{niftyLevel == null ? "—" : fmtPrice(niftyLevel)}</strong>
                  <em className={niftyChangePct == null ? undefined : pctClass(niftyChangePct)}>
                    {niftyChangePct == null ? "Pending" : `${arrow(niftyChangePct)} ${fmtPct(niftyChangePct)}`}
                  </em>
                </div>
                <span className={styles.marketSession}>{overview.data?.market?.label === "OPEN" ? "Market open" : "Market closed"}</span>
                {overview.data?.asOf ? (
                  <DataAge>Data {new Date(overview.data.asOf).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                  })}</DataAge>
                ) : null}
                <DataQualityBadge quality={feedQuality} compact />
              </div>
            </div>
            <div className={styles.topBarRight}>
              <button
                type="button"
                className={styles.paperVoiceToggle}
                data-active={paperVoiceEnabled ? "true" : "false"}
                aria-pressed={paperVoiceEnabled}
                aria-label={paperVoiceEnabled ? "Mute paper trade voice alerts" : "Enable concise paper trade voice alerts"}
                title={speechSupported ? (paperVoiceEnabled ? "Mute paper trade voice alerts" : "Speak stock, entry and target using this browser") : "Browser speech is unavailable"}
                disabled={!speechSupported}
                onClick={() => setPaperVoiceEnabled((current) => {
                  const next = !current;
                  window.localStorage.setItem("n50.paper-alert-voice", next ? "speak" : "mute");
                  if (!next) window.speechSynthesis.cancel();
                  return next;
                })}
              >
                {paperVoiceEnabled ? <AudioLines size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
                <span>{paperVoiceEnabled ? "Speak" : "Muted"}</span>
              </button>
              <div className={styles.sessionStatus}><AuthStatus /></div>
            </div>
          </div>
        </header>

        {isAdminRoute ? (
          <nav className={styles.adminNavigation} aria-label="Administration navigation">
            <Link to="/analytics/system/quality">← Data &amp; Operations</Link>
            <strong>Authorised administration</strong>
          </nav>
        ) : (
          <ResponsiveWorkspaceNavigation
            pathname={location.pathname}
            isAdmin={user.role === "admin"}
            presentationMode={presentationMode}
            onPresentationModeChange={setPresentationMode}
            onPrefetch={prefetchDashboardRoute}
          />
        )}

        <div className={styles.body}>
          <div className={styles.contentColumn}>
            {secondaryLinks.length > 0 && !isAdminRoute ? (
              <nav className={styles.workspaceTabs} aria-label={`${pageTitle} workspace sections`}>
                {secondaryLinks.map((item) => {
                  const active = item.match ? item.match(location.pathname) : location.pathname.startsWith(item.to);
                  return <Link key={item.to} to={item.to} className={styles.workspaceTab} data-active={active ? "true" : "false"}>{item.label}</Link>;
                })}
              </nav>
            ) : null}
            <main className={styles.main}>{children}</main>
          </div>
        </div>
      </div>
      <PaperTradeNotifier enabled={sessionEnabled} audible={paperVoiceEnabled} />
      <AuthGateModal />
    </div>
  );
}
