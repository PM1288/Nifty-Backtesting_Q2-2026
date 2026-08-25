export type CommandGroup = "Recent" | "Go to" | "Stocks" | "Strategies" | "Paper trades" | "Backtest runs" | "Actions" | "Help" | "Data issues" | "Saved views";

export type CommandItem = {
  id: string;
  group: CommandGroup;
  label: string;
  description?: string;
  context?: string;
  freshness?: string;
  to: string;
  keywords?: string[];
  aliases?: string[];
  actionLabel?: string;
  disabledReason?: string;
  permission?: string;
};

type RouteEntry = Omit<CommandItem, "group"> & { group?: "Go to" | "Strategies" | "Help" | "Actions" };

export const ROUTE_COMMANDS: readonly RouteEntry[] = [
  { id: "today", label: "Today", to: "/", description: "Live market canvas and current decisions", keywords: ["home", "market canvas", "sectors"] },
  { id: "market-story", label: "Market Story", to: "/analytics", description: "Market overview, evidence and breadth", keywords: ["market overview", "supporting metrics"] },
  { id: "leadership", label: "Market Leadership", to: "/analytics/leadership", description: "Leaders, laggards and sector rotation" },
  { id: "daily-setups", label: "Daily Setups", to: "/analytics/daily-setups", description: "Current stock setup shortlist" },
  { id: "regime", label: "Market Regime", to: "/analytics/regime", description: "State, transition risk and history", keywords: ["market state"] },
  { id: "risk", label: "Risk Queue", to: "/analytics/risk", description: "Prioritised market risks and anomalies" },
  { id: "indicators", label: "Indicator Explorer", to: "/analytics/indicators", description: "RSI, Williams and technical evidence" },
  { id: "stock-360", label: "Stock 360", to: "/analytics/stock/RELIANCE", description: "Price, indicators, signals and evidence", keywords: ["stock detail"] },
  { id: "events-context", label: "Catalyst Context", to: "/catalysts/context", description: "Stock and market catalyst context" },
  { id: "events", label: "Catalyst Events", to: "/catalysts/events", description: "Event timeline and affected stocks" },
  { id: "institutional-flow", label: "FII / DII Flow", to: "/institutional/flow", description: "Dated institutional flow evidence", keywords: ["institutional flow"] },
  { id: "institutional-reports", label: "Institutional Report Ingestion", to: "/institutional/reports", description: "Source reports and ingestion status" },
  { id: "nse-intelligence", label: "NSE Intelligence", to: "/institutional/nse-intelligence", description: "Official bhavcopy intelligence and report health", keywords: ["bhavcopy", "Nifty reports", "NSE reports", "daily ingestion"] },
  { id: "options-structure", label: "Options Structure", to: "/options/structure", description: "OI structure, walls and skew" },
  { id: "options-overview", label: "Options Snapshot", to: "/options/intelligence", description: "Current chain, expiry and expected move", keywords: ["option chain"] },
  { id: "options-advanced", label: "Options Advanced Data", to: "/options/snapshot", description: "Detailed options evidence" },
  { id: "volatility-signals", label: "F&O Volatility Signals", to: "/options/volatility-signals", description: "Qualified and near-miss volatility candidates" },
  { id: "oiis-live", group: "Strategies", label: "OIIS Live", to: "/strategy/oiis-live", description: "Current selection, gates and near misses", keywords: ["strategy evaluation"] },
  { id: "oiss-v1-202608", group: "Strategies", label: "OISS v1.202608", to: "/strategy/oiss-v1-202608", description: "Independent explainable decision and risk framework", keywords: ["OISS", "radar", "carry", "rejected"] },
  { id: "oiis-history", group: "Strategies", label: "OIIS Run History", to: "/strategy/oiis-live/history", description: "Historical 30-minute selection runs" },
  { id: "monthly-strategy", group: "Strategies", label: "Monthly Strategy", to: "/strategy/monthly", description: "Expiry, calendar-month closure and first-session evidence in one table" },
  { id: "rolling-monthly", group: "Strategies", label: "Rolling Strategy", to: "/strategy/rolling-monthly", description: "Independent rolling 5, 30 and 60-session research" },
  { id: "trendlyne-summary", group: "Strategies", label: "Trendlyne Summary", to: "/strategy/trendlyne-summary", description: "Six-month analyst recommendation, target, 5D and 30D evidence", keywords: ["broker research", "fund house", "research house", "target hit"] },
  { id: "long-options", group: "Strategies", label: "Long Options", to: "/strategy/long-options", description: "Independent derivatives router for long straddles, strangles and shadow directional options", keywords: ["derivatives strategy", "buy call", "buy put", "long straddle", "long strangle"] },
  { id: "nifty-weekly-options", group: "Strategies", label: "NIFTY Options", to: "/strategy/nifty-options", description: "Independent NIFTY weekly and monthly long-premium strategy using canonical W0 and M0 chains", keywords: ["nifty weekly", "nifty monthly", "weekly expiry", "monthly expiry", "nifty options", "long straddle", "long strangle"] },
  { id: "paper", label: "Paper Trading", to: "/paper-trading", description: "Execution and observation command centre", keywords: ["paper positions", "paper portfolio"] },
  { id: "breadth", label: "Market Breadth History", to: "/market/nifty-500", description: "Universe participation and breadth history", keywords: ["nifty 500"] },
  { id: "futures", label: "Futures", to: "/futures", description: "Basis, OI, liquidity and roll" },
  { id: "flows", label: "Advanced Flow Signals", to: "/analytics/flows", description: "Flow archive and anomalies" },
  { id: "data-quality", label: "Data Quality", to: "/analytics/system/quality", description: "Trust matrix and affected modules", keywords: ["data issues", "stale"] },
  { id: "system-map", label: "System Map", to: "/analytics/system/map", description: "Sources, services and provenance" },
  { id: "heatmap-change", label: "Change Heatmap", to: "/heatmap/change", description: "Price-change market surface" },
  { id: "heatmap-rsi", label: "RSI Heatmap", to: "/heatmap/rsi", description: "RSI market surface" },
  { id: "heatmap-will", label: "Williams %R Heatmap", to: "/heatmap/will", description: "Williams %R market surface" },
  { id: "backtest-overview", group: "Strategies", label: "Backtesting Overview", to: "/backtesting", description: "Selected-run decision and acceptance gates" },
  { id: "backtest-lab", group: "Strategies", label: "Backtesting Lab", to: "/backtesting/lab", description: "Configure and run governed experiments" },
  { id: "strategy-catalogue", group: "Strategies", label: "Strategy Catalogue", to: "/backtesting/strategies", description: "Versioned strategies and acceptance state" },
  { id: "portfolio-results", group: "Strategies", label: "Portfolio Results", to: "/backtesting/results", description: "Equity, drawdown, costs and trades" },
  { id: "regime-diagnostics", group: "Strategies", label: "Backtest Regime Diagnostics", to: "/backtesting/regimes", description: "Sample-aware regime evidence" },
  { id: "stock-fit", group: "Strategies", label: "Backtest Stock Fit", to: "/backtesting/stocks", description: "Stock-level expectancy and risk" },
  { id: "latest-session", group: "Strategies", label: "Latest Backtest Session", to: "/backtesting/daily-summary", description: "Entries, exits and skipped signals" },
  { id: "compare", group: "Strategies", label: "Compare Strategies", to: "/backtesting/compare", description: "Return, risk and assumption comparison" },
  { id: "runs", label: "Run Monitor", to: "/backtesting/runs", description: "Active, completed and failed processing runs" },
  { id: "h30", group: "Strategies", label: "30-Day Opportunity", to: "/backtesting/h30", description: "Opportunity, adverse excursion and maturity" },
  { id: "learning", group: "Strategies", label: "Strategy Learning", to: "/analytics/learn", description: "Feature evidence, sample and confidence" },
  { id: "simulator", group: "Strategies", label: "Strategy Simulator", to: "/analytics/simulator", description: "Scenario setup and results" },
  { id: "admin", label: "Administration", to: "/control-plane", description: "Authorised database and system controls", permission: "admin" },
  { id: "feedback", label: "Settings and feedback", to: "/feedback", description: "Preferences, support and feedback" },
  { id: "add-paper", group: "Actions", label: "Add paper trade", to: "/paper-trading?action=add", description: "Open a PAPER-only confirmation form", actionLabel: "Preview", keywords: ["new paper position"] },
  { id: "help-mfe", group: "Help", label: "What is MFE?", to: "/paper-trading?learn=definitions#mfe", description: "Maximum favourable excursion definition", aliases: ["maximum favourable excursion", "profit opportunity"] },
  { id: "help-mae", group: "Help", label: "What is MAE?", to: "/paper-trading?learn=definitions#mae", description: "Maximum adverse excursion definition", aliases: ["maximum adverse excursion", "drawdown"] },
  { id: "help-willr", group: "Help", label: "How is Williams %R calculated?", to: "/heatmap/will?learn=methodology", description: "Formula, thresholds and missing-data policy" },
  { id: "help-shortcuts", group: "Help", label: "Keyboard shortcuts", to: "#shortcuts", description: "Open the shortcut guide", keywords: ["hotkeys", "keyboard"] },
] as const;

export function routeCommandItems(isAdmin: boolean): CommandItem[] {
  return ROUTE_COMMANDS
    .filter((item) => !item.permission || (item.permission === "admin" && isAdmin))
    .map((item) => ({ ...item, group: item.group ?? "Go to" }));
}
