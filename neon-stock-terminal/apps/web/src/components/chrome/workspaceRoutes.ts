import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  FlaskConical,
  Globe2,
  Home,
  CalendarRange,
  ShieldCheck,
  TrendingUp,
  LibraryBig,
} from "lucide-react";

export type WorkspaceRouteId =
  | "today"
  | "markets"
  | "stocks"
  | "oiis-lab"
  | "rolling-monthly"
  | "monthly-strategy"
  | "trendlyne-summary"
  | "long-options"
  | "nifty-weekly-options"
  | "paper-trading"
  | "derivatives"
  | "data-operations";

export type WorkspaceRouteDefinition = {
  id: WorkspaceRouteId;
  label: string;
  compactLabel: string;
  description: string;
  path: string;
  icon: LucideIcon;
  primaryDesktop: boolean;
  primaryMobile: boolean;
  parentId?: WorkspaceRouteId;
  match: (pathname: string) => boolean;
};

export const STRATEGY_MENU_ROUTES = [
  {
    id: "trendlyne-summary",
    label: "Trendlyne Summary",
    description: "Six-month analyst recommendation outcomes and research-house track records",
    path: "/strategy/trendlyne-summary",
    icon: LibraryBig,
  },
  {
    id: "oiis",
    label: "OIIS Lab",
    description: "Live selection, evidence and backtests",
    path: "/strategy/oiis-live",
    icon: FlaskConical,
  },
  {
    id: "monthly-strategy",
    label: "Monthly Strategy",
    description: "Expiry, calendar closure and first-session entries in one ledger",
    path: "/strategy/monthly",
    icon: CalendarRange,
  },
  {
    id: "rolling-monthly",
    label: "Rolling Strategy",
    description: "Independent 5/30/60-session signal research",
    path: "/strategy/rolling-monthly",
    icon: CalendarRange,
  },
  {
    id: "long-options",
    label: "Long Options",
    description: "Independent long-premium derivatives router",
    path: "/strategy/long-options",
    icon: BarChart3,
  },
  {
    id: "nifty-weekly-options",
    label: "NIFTY Options",
    description: "Independent NIFTY weekly and monthly long-premium research",
    path: "/strategy/nifty-options",
    icon: BarChart3,
  },
] as const;

export const WORKSPACE_ROUTES: readonly WorkspaceRouteDefinition[] = [
  {
    id: "today",
    label: "Today",
    compactLabel: "Today",
    description: "Decisions and alerts",
    path: "/",
    icon: Home,
    primaryDesktop: true,
    primaryMobile: true,
    match: (pathname) => pathname === "/",
  },
  {
    id: "markets",
    label: "Markets",
    compactLabel: "Markets",
    description: "Regime and breadth",
    path: "/analytics",
    icon: Globe2,
    primaryDesktop: true,
    primaryMobile: true,
    match: (pathname) =>
      pathname === "/analytics" ||
      pathname.startsWith("/analytics/market") ||
      pathname.startsWith("/analytics/regime") ||
      pathname.startsWith("/analytics/supporting") ||
      pathname.startsWith("/analytics/risk") ||
      pathname.startsWith("/analytics/flows") ||
      pathname.startsWith("/analytics/leadership") ||
      pathname.startsWith("/institutional/flow") ||
      pathname.startsWith("/market/") ||
      pathname.startsWith("/heatmap/"),
  },
  {
    id: "stocks",
    label: "Stocks",
    compactLabel: "Stocks",
    description: "Stock 360 and setups",
    path: "/analytics/stock/RELIANCE",
    icon: TrendingUp,
    primaryDesktop: true,
    primaryMobile: true,
    match: (pathname) =>
      pathname.startsWith("/analytics/daily-setups") ||
      pathname.startsWith("/analytics/stock/") ||
      pathname.startsWith("/analytics/indicators") ||
      pathname.startsWith("/catalysts/") ||
      pathname.startsWith("/stock/"),
  },
  {
    id: "oiis-lab",
    label: "Strategy",
    compactLabel: "Strategy",
    description: "OIIS, monthly and options strategy dashboards",
    path: "/strategy/oiis-live",
    icon: FlaskConical,
    primaryDesktop: true,
    primaryMobile: false,
    match: (pathname) =>
      (pathname.startsWith("/strategy/") &&
        !pathname.startsWith("/strategy/monthly") &&
        !pathname.startsWith("/strategy/rolling-monthly") &&
        !pathname.startsWith("/strategy/trendlyne-summary") &&
        !pathname.startsWith("/strategy/long-options") &&
        !pathname.startsWith("/strategy/nifty-weekly-options") &&
        !pathname.startsWith("/strategy/nifty-options")) ||
      (pathname.startsWith("/backtesting") &&
        !pathname.startsWith("/backtesting/runs")) ||
      pathname.startsWith("/analytics/strategy-evaluation") ||
      pathname.startsWith("/analytics/learn") ||
      pathname.startsWith("/analytics/simulator"),
  },
  {
    id: "trendlyne-summary",
    label: "Trendlyne Summary",
    compactLabel: "Trendlyne",
    description: "Analyst recommendations, targets and 5D/30D evidence",
    path: "/strategy/trendlyne-summary",
    icon: LibraryBig,
    primaryDesktop: false,
    primaryMobile: false,
    parentId: "oiis-lab",
    match: (pathname) => pathname.startsWith("/strategy/trendlyne-summary"),
  },
  {
    id: "monthly-strategy",
    label: "Monthly Strategy",
    compactLabel: "Monthly",
    description: "Unified expiry, closure and first-session evidence",
    path: "/strategy/monthly",
    icon: CalendarRange,
    primaryDesktop: false,
    primaryMobile: false,
    parentId: "oiis-lab",
    match: (pathname) => pathname.startsWith("/strategy/monthly"),
  },
  {
    id: "rolling-monthly",
    label: "Rolling Strategy",
    compactLabel: "Rolling",
    description: "Independent 5/30/60-session research",
    path: "/strategy/rolling-monthly",
    icon: CalendarRange,
    primaryDesktop: false,
    primaryMobile: false,
    parentId: "oiis-lab",
    match: (pathname) => pathname.startsWith("/strategy/rolling-monthly"),
  },
  {
    id: "long-options",
    label: "Long Options",
    compactLabel: "Options",
    description: "Independent long-premium derivatives research",
    path: "/strategy/long-options",
    icon: BarChart3,
    primaryDesktop: false,
    primaryMobile: false,
    parentId: "oiis-lab",
    match: (pathname) => pathname.startsWith("/strategy/long-options"),
  },
  {
    id: "nifty-weekly-options",
    label: "NIFTY Options",
    compactLabel: "NIFTY Options",
    description: "NIFTY weekly and monthly long-premium research",
    path: "/strategy/nifty-options",
    icon: BarChart3,
    primaryDesktop: false,
    primaryMobile: false,
    parentId: "oiis-lab",
    match: (pathname) => pathname.startsWith("/strategy/nifty-options") || pathname.startsWith("/strategy/nifty-weekly-options"),
  },
  {
    id: "paper-trading",
    label: "Paper Trading",
    compactLabel: "Paper",
    description: "Positions and outcomes",
    path: "/paper-trading",
    icon: ClipboardList,
    primaryDesktop: true,
    primaryMobile: true,
    match: (pathname) => pathname.startsWith("/paper-trading"),
  },
  {
    id: "derivatives",
    label: "Derivatives",
    compactLabel: "Derivatives",
    description: "Options and futures",
    path: "/options/intelligence",
    icon: BarChart3,
    primaryDesktop: true,
    primaryMobile: false,
    match: (pathname) =>
      pathname.startsWith("/options/") ||
      pathname.startsWith("/option-chain") ||
      pathname.startsWith("/futures"),
  },
  {
    id: "data-operations",
    label: "Data & Operations",
    compactLabel: "Data Ops",
    description: "Trust and system health",
    path: "/analytics/system/quality",
    icon: ShieldCheck,
    primaryDesktop: true,
    primaryMobile: false,
    match: (pathname) =>
      pathname.startsWith("/analytics/system/") ||
      pathname.startsWith("/analytics/quality") ||
      pathname.startsWith("/backtesting/runs") ||
      pathname.startsWith("/institutional/reports") ||
      pathname.startsWith("/institutional/nse-intelligence") ||
      pathname.startsWith("/control-plane"),
  },
] as const;

export function resolveWorkspaceRoute(
  pathname: string,
): WorkspaceRouteDefinition {
  return (
    WORKSPACE_ROUTES.find((route) => route.match(pathname)) ??
    WORKSPACE_ROUTES[1]
  );
}
