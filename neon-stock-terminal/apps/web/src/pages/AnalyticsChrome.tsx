import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PerformanceDebugPanel } from "../analytics/PerformanceDebugPanel";
import { useI18n } from "../i18n/LocaleProvider";
import {
  ButtonLink,
  SectionTabs,
  StatusBadge
} from "../components/ui/DashboardPrimitives";
import styles from "./AnalyticsPage.module.css";

export type AnalyticsExperienceMode = "beginner" | "advanced";
export type UnifiedSection =
  | "overview"
  | "market"
  | "catalysts"
  | "institutional"
  | "stocks"
  | "strategy"
  | "signals"
  | "options"
  | "backtesting"
  | "watchlists"
  | "learning"
  | "system";

const ANALYTICS_MODE_STORAGE_KEY = "n50.analytics.experienceMode";
const ANALYTICS_MODE_EVENT = "n50:analytics-experience-mode";

export const SECTION_META: Record<
  UnifiedSection,
  {
    label: string;
    blurb: string;
  }
> = {
  overview: {
    label: "Overview",
    blurb: "Start with the market headline and the learning path before drilling into detail."
  },
  market: {
    label: "Market",
    blurb: "Breadth, regime, and context first. Detail comes after the tape is clear."
  },
  catalysts: {
    label: "Catalysts",
    blurb: "Map events, deals, and institutional overlays into watchlists instead of trading hype."
  },
  institutional: {
    label: "Institutional",
    blurb: "Participant flows are daily context. Use them to frame risk, not to force exact entries."
  },
  stocks: {
    label: "Stocks",
    blurb: "Scan leaders, inspect individual names, and keep setups inside broader market context."
  },
  strategy: {
    label: "Strategy",
    blurb: "Separate score, confidence, and realized expectancy before trusting any model output."
  },
  signals: {
    label: "Signals",
    blurb: "Use momentum and anomaly surfaces as context, not as standalone trade engines."
  },
  options: {
    label: "Options",
    blurb: "Option ladders, ATM context, and derivatives pressure now live inside the same learning shell."
  },
  backtesting: {
    label: "Backtesting",
    blurb: "Review historical strategy evidence, compare capital modes, and inspect regime-aware trade behavior."
  },
  watchlists: {
    label: "Watchlists",
    blurb: "Monitor live boards, practice, and compact watch views without leaving the product."
  },
  learning: {
    label: "Learning",
    blurb: "Explain the market first, then support it with drills, simulation, and deeper tables."
  },
  system: {
    label: "System",
    blurb: "Trust, freshness, and operational quality for the public analytics surface."
  }
};

export const MARKET_SECTION_TABS = [
  {
    label: "Market Hub",
    to: "/analytics",
    end: true,
    badge: "Hub"
  },
  {
    label: "Market State",
    to: "/analytics/market-state",
    badge: "State"
  },
  {
    label: "Market Story",
    to: "/analytics/regime",
    badge: "Story"
  },
  {
    label: "Supporting Metrics",
    to: "/analytics/supporting-metrics",
    badge: "Macro"
  },
  {
    label: "Heatmap",
    to: "/heatmap/change",
    badge: "Map",
    activeMatch: (pathname: string) => pathname === "/heatmap/change" || pathname === "/change-heatmap"
  }
] as const;

export const CATALYSTS_SECTION_TABS = [
  {
    label: "Event Context",
    to: "/catalysts/context",
    badge: "Ctx"
  },
  {
    label: "Events Calendar",
    to: "/catalysts/events",
    badge: "Cal"
  }
] as const;

export const INSTITUTIONAL_SECTION_TABS = [
  {
    label: "Participant Flow",
    to: "/institutional/flow",
    badge: "Flow"
  },
  {
    label: "FII Reports",
    to: "/institutional/reports",
    badge: "Files"
  }
] as const;

export const STOCKS_SECTION_TABS = [
  {
    label: "Stock Leadership",
    to: "/analytics/leadership",
    badge: "Lead"
  },
  {
    label: "Daily Setups",
    to: "/analytics/daily-setups",
    badge: "Set"
  },
  {
    label: "Stock Detail",
    to: "/analytics/stock/RELIANCE",
    badge: "Name",
    activeMatch: (pathname: string) => pathname.startsWith("/analytics/stock/")
  }
] as const;

export const OPTIONS_SECTION_TABS = [
  {
    label: "Options Structure",
    to: "/options/structure",
    badge: "Struct"
  },
  {
    label: "Option Snapshot",
    to: "/options/snapshot",
    badge: "Chain"
  }
] as const;

export const STRATEGY_SECTION_TABS = [
  {
    label: "Strategy Evaluation",
    to: "/strategy/evaluation",
    badge: "Eval"
  },
  {
    label: "Backtesting Overview",
    to: "/backtesting",
    badge: "BT"
  },
  {
    label: "Compare",
    to: "/backtesting/compare",
    badge: "Cmp"
  },
  {
    label: "Runs",
    to: "/backtesting/runs",
    badge: "Audit"
  }
] as const;

export const SIGNAL_SECTION_TABS = [
  {
    label: "Anomalies",
    to: "/analytics/risk",
    badge: "Risk"
  },
  {
    label: "RSI",
    to: "/heatmap/rsi",
    badge: "RSI",
    activeMatch: (pathname: string) => pathname === "/heatmap/rsi" || pathname === "/rsi-surface"
  },
  {
    label: "WILLR",
    to: "/heatmap/will",
    badge: "Will",
    activeMatch: (pathname: string) => pathname === "/heatmap/will" || pathname === "/will-surface"
  },
  {
    label: "Archive",
    to: "/analytics/flows",
    badge: "Flow"
  }
] as const;

export const LEARNING_SECTION_TABS = [
  {
    label: "Strategy Lab",
    to: "/analytics/learn",
    badge: "Learn"
  },
  {
    label: "Simulator",
    to: "/analytics/simulator",
    badge: "Sim"
  },
  {
    label: "Indicators",
    to: "/analytics/indicators",
    badge: "Ind"
  }
] as const;

export const SYSTEM_SECTION_TABS = [
  {
    label: "System Map",
    to: "/analytics/system/map",
    badge: "Flow",
    activeMatch: (pathname: string) => pathname.startsWith("/analytics/system/map")
  },
  {
    label: "Quality & Freshness",
    to: "/analytics/system/quality",
    badge: "Trust",
    activeMatch: (pathname: string) =>
      pathname.startsWith("/analytics/system/quality") || pathname.startsWith("/analytics/quality")
  }
] as const;

function readAnalyticsExperienceMode(): AnalyticsExperienceMode {
  if (typeof window === "undefined") return "beginner";
  const stored = window.localStorage.getItem(ANALYTICS_MODE_STORAGE_KEY);
  return stored === "advanced" ? "advanced" : "beginner";
}

export function resolvePrimarySection(pathname: string): UnifiedSection {
  if (pathname === "/") return "overview";
  if (pathname.startsWith("/strategy")) return "strategy";
  if (pathname.startsWith("/backtesting")) return "backtesting";
  if (pathname.startsWith("/options") || pathname.startsWith("/option-chain")) return "options";
  if (pathname.startsWith("/institutional")) return "institutional";
  if (pathname.startsWith("/catalysts")) return "catalysts";
  if (pathname === "/watcher" || pathname.startsWith("/watcher/") || pathname === "/paper" || pathname.startsWith("/paper") || pathname.startsWith("/lite/")) {
    return "watchlists";
  }
  if (pathname.startsWith("/analytics/events")) return "catalysts";
  if (pathname.startsWith("/analytics/supporting-metrics")) return "market";
  if (
    pathname.startsWith("/gateway/") ||
    pathname.startsWith("/analytics/quality") ||
    pathname.startsWith("/analytics/system/quality") ||
    pathname.startsWith("/analytics/system/map")
  ) return "system";
  if (
    pathname.startsWith("/analytics/learn") ||
    pathname.startsWith("/analytics/simulator") ||
    pathname.startsWith("/analytics/indicators")
  ) {
    return "learning";
  }
  if (
    pathname.startsWith("/analytics/risk") ||
    pathname.startsWith("/analytics/flows") ||
    pathname === "/heatmap/rsi" ||
    pathname === "/rsi-surface" ||
    pathname === "/heatmap/will" ||
    pathname === "/will-surface"
  ) {
    return "signals";
  }
  if (
    pathname.startsWith("/analytics/leadership") ||
    pathname.startsWith("/analytics/daily-setups") ||
    pathname.startsWith("/analytics/setups") ||
    pathname.startsWith("/analytics/stock/") ||
    pathname.startsWith("/stock/")
  ) {
    return "stocks";
  }
  return "market";
}

export function useAnalyticsExperienceMode() {
  const [mode, setModeState] = useState<AnalyticsExperienceMode>(() => readAnalyticsExperienceMode());

  useEffect(() => {
    const sync = () => {
      setModeState(readAnalyticsExperienceMode());
    };

    window.addEventListener("storage", sync);
    window.addEventListener(ANALYTICS_MODE_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ANALYTICS_MODE_EVENT, sync as EventListener);
    };
  }, []);

  const setMode = (nextMode: AnalyticsExperienceMode) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ANALYTICS_MODE_STORAGE_KEY, nextMode);
    setModeState(nextMode);
    window.dispatchEvent(new CustomEvent(ANALYTICS_MODE_EVENT, { detail: { mode: nextMode } }));
  };

  return { mode, setMode };
}

type AnalyticsHeaderProps = {
  title: string;
  subtitle: string;
  meta?: string;
  learningPrompt?: string;
  action?: ReactNode;
  learningPoints?: string[];
  learningDefaultOpen?: boolean;
  sectionTabs?: Array<{
    label: string;
    to: string;
    badge?: string;
    end?: boolean;
    external?: boolean;
    activeMatch?: (pathname: string) => boolean;
  }>;
};

export function AnalyticsHeader({
  title,
  subtitle,
  meta,
  learningPrompt,
  action,
  sectionTabs
}: AnalyticsHeaderProps) {
  const location = useLocation();
  const { mode } = useAnalyticsExperienceMode();
  const { t, tr } = useI18n();
  const section = resolvePrimarySection(location.pathname);
  const sectionMeta = SECTION_META[section];
  const showBreadcrumb =
    section === "system" ||
    location.pathname.startsWith("/analytics/stock/") ||
    location.pathname.startsWith("/stock/");

  return (
    <header className={styles.analyticsHeader} data-clarity-region="page_header">
      <div className={styles.topNav}>
        <div className={styles.meta}>
          {showBreadcrumb ? (
            <div className={styles.breadcrumbs} aria-label={tr("Breadcrumb")}>
              <ButtonLink to="/" variant="secondary" size="s">
                {tr("Overview")}
              </ButtonLink>
              <span className={styles.breadcrumbSeparator}>/</span>
              <span className={styles.breadcrumbItem}>{tr(sectionMeta.label)}</span>
              <span className={styles.breadcrumbSeparator}>/</span>
              <span className={styles.breadcrumbItem}>{tr(title)}</span>
            </div>
          ) : (
            <>
              <StatusBadge label={tr(`${sectionMeta.label} workspace`)} tone="white" />
            </>
          )}
        </div>
        <div className={styles.meta}>
          <span className={styles.pageMeta}>
            {mode === "beginner"
              ? t("preferences.audienceOptions.beginner", "Beginner")
              : t("preferences.audienceOptions.advanced", "Advanced")}{" "}
            {t("preferences.audienceSuffix", "audience")}
          </span>
        </div>
      </div>

      <div className={styles.pageHeaderBand}>
        <div className={styles.pageHeaderCopy}>
          <div className={styles.pageMetaRow}>
            <span className={styles.pageEyebrow}>{tr(sectionMeta.label)}</span>
            {meta ? <span className={styles.pageMeta}>{meta}</span> : null}
          </div>
          <h1 className={styles.pageTitle}>{tr(title)}</h1>
          <p className={styles.pageSubtitle}>{tr(subtitle)}</p>
          {learningPrompt ? <p className={styles.pageQuestion}>{tr(learningPrompt)}</p> : null}
        </div>
        {action ? <div className={styles.pageHeaderActions}>{action}</div> : null}
        {sectionTabs?.length ? <SectionTabs label={`${tr(sectionMeta.label)} ${t("ui.subsections", "subsections")}`} items={sectionTabs} /> : null}
      </div>
      <PerformanceDebugPanel />
    </header>
  );
}

type ExplainThisProps = {
  label: string;
  summary: string;
  detail?: string;
  takeaway?: string;
};

export function ExplainThis({ label, summary, detail, takeaway }: ExplainThisProps) {
  const { t, tr } = useI18n();
  return (
    <details className={styles.explainBox}>
      <summary className={styles.explainSummary}>
        {t("ui.explainThis", "Explain this")}: {tr(label)}
      </summary>
      <div className={styles.explainBody}>
        <p className={styles.explainText}>{tr(summary)}</p>
        {detail ? <p className={styles.explainText}>{tr(detail)}</p> : null}
        {takeaway ? <div className={styles.explainTakeaway}>{tr(takeaway)}</div> : null}
      </div>
    </details>
  );
}

export function toneFromNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "white";
  if (value > 0) return "green";
  if (value < 0) return "red";
  return "white";
}

export function num(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? NaN);
}

export function text(value: unknown, fallback = "—") {
  return typeof value === "string" && value ? value : fallback;
}

export function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}
