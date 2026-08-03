import type { RouteMeta } from "./types";

type RouteMatcher = {
  match: RegExp;
  meta: RouteMeta;
};

const ROUTES: RouteMatcher[] = [
  {
    match: /^\/$/,
    meta: { pageName: "home", module: "overview", appArea: "overview", section: "home" }
  },
  {
    match: /^\/analytics$/,
    meta: { pageName: "market_hub", module: "market", appArea: "market", section: "hub" }
  },
  {
    match: /^\/backtesting$/,
    meta: { pageName: "backtesting_overview", module: "backtesting", appArea: "backtesting", section: "overview" }
  },
  {
    match: /^\/backtesting\/strategies$/,
    meta: { pageName: "backtesting_library", module: "backtesting", appArea: "backtesting", section: "library" }
  },
  {
    match: /^\/backtesting\/strategies\/[^/]+/,
    meta: { pageName: "backtesting_strategy_detail", module: "backtesting", appArea: "backtesting", section: "strategy_detail" }
  },
  {
    match: /^\/backtesting\/results/,
    meta: { pageName: "backtesting_results", module: "backtesting", appArea: "backtesting", section: "results" }
  },
  {
    match: /^\/backtesting\/regimes/,
    meta: { pageName: "backtesting_regimes", module: "backtesting", appArea: "backtesting", section: "regimes" }
  },
  {
    match: /^\/backtesting\/stocks/,
    meta: { pageName: "backtesting_stocks", module: "backtesting", appArea: "backtesting", section: "stocks" }
  },
  {
    match: /^\/backtesting\/daily-summary/,
    meta: { pageName: "backtesting_daily_summary", module: "backtesting", appArea: "backtesting", section: "daily_summary" }
  },
  {
    match: /^\/backtesting\/compare/,
    meta: { pageName: "backtesting_compare", module: "backtesting", appArea: "backtesting", section: "compare" }
  },
  {
    match: /^\/backtesting\/runs/,
    meta: { pageName: "backtesting_runs", module: "backtesting", appArea: "backtesting", section: "runs" }
  },
  {
    match: /^\/analytics\/regime/,
    meta: { pageName: "market_story", module: "market", appArea: "market", section: "story" }
  },
  {
    match: /^\/analytics\/setups/,
    meta: { pageName: "stocks", module: "stocks", appArea: "market", section: "setups" }
  },
  {
    match: /^\/analytics\/risk/,
    meta: { pageName: "signals", module: "signals", appArea: "market", section: "risk" }
  },
  {
    match: /^\/analytics\/flows/,
    meta: { pageName: "signals_archive", module: "signals", appArea: "market", section: "archive" }
  },
  {
    match: /^\/analytics\/learn/,
    meta: { pageName: "strategy_lab", module: "learning", appArea: "learning", section: "lab" }
  },
  {
    match: /^\/analytics\/simulator/,
    meta: { pageName: "simulator", module: "learning", appArea: "learning", section: "simulator" }
  },
  {
    match: /^\/analytics\/indicators/,
    meta: { pageName: "indicators", module: "learning", appArea: "learning", section: "indicators" }
  },
  {
    match: /^\/analytics\/stock\/[^/]+/,
    meta: { pageName: "stock_explorer", module: "stocks", appArea: "market", section: "stock" }
  },
  {
    match: /^\/options|^\/option-chain/,
    meta: { pageName: "option_chain", module: "market", appArea: "market", section: "options" }
  },
  {
    match: /^\/analytics\/system\/quality|^\/analytics\/quality/,
    meta: { pageName: "trust_board", module: "system", appArea: "system", section: "quality" }
  },
  {
    match: /^\/heatmap\/change|^\/change-heatmap/,
    meta: { pageName: "heatmap_change", module: "heatmaps", appArea: "heatmaps", section: "change" }
  },
  {
    match: /^\/heatmap\/rsi|^\/rsi-surface/,
    meta: { pageName: "heatmap_rsi", module: "heatmaps", appArea: "heatmaps", section: "rsi" }
  },
  {
    match: /^\/heatmap\/will|^\/will-surface/,
    meta: { pageName: "heatmap_willr", module: "heatmaps", appArea: "heatmaps", section: "willr" }
  }
];

export function resolveRouteMeta(pathname: string): RouteMeta {
  const matched = ROUTES.find((route) => route.match.test(pathname));
  return (
    matched?.meta ?? {
      pageName: "unknown",
      module: "unknown",
      appArea: "overview",
      section: "unknown"
    }
  );
}
