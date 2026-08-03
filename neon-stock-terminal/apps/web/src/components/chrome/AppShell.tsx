import React, { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  ClipboardList,
  FlaskConical,
  Gauge,
  Globe2,
  Home,
  LibraryBig,
  LayoutDashboard,
  Menu,
  MessageSquareMore,
  ShieldCheck,
  Sigma,
  TrendingUp,
  X
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuthGate } from "../../auth/AuthGateProvider";
import { trackModeToggle, trackNavClick } from "../../analytics/events";
import { trackAnalyticsEvent } from "../../lib/analytics";
import { useTrackPageViews } from "../../analytics/useTrackPageViews";
import { useLiveQuotes, useOverview } from "../../lib/hooks";
import { useDashboardPrefetch } from "../../lib/useDashboardPrefetch";
import { useI18n } from "../../i18n/LocaleProvider";
import { resolvePrimarySection, SECTION_META, useAnalyticsExperienceMode } from "../../pages/AnalyticsChrome";
import { AuthGateModal } from "../auth/AuthGateModal";
import { ToggleGroup } from "../ui/DashboardPrimitives";
import { AuthStatus } from "./AuthStatus";
import { FooterDisclaimer } from "./FooterDisclaimer";
import { HeaderTicker } from "./HeaderTicker";
import styles from "./AppShell.module.css";

const SIDEBAR_PREFERENCE_KEY = "n50.shell.sidebarCollapsed";

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  external?: boolean;
  match: (pathname: string) => boolean;
};

type NavGroup = {
  id: string;
  label: string;
  hiddenInSidebar?: boolean;
  items: NavItem[];
};

type AmbientGlowStyle = React.CSSProperties & {
  "--ambient-primary-rgb"?: string;
  "--ambient-secondary-rgb"?: string;
  "--ambient-primary-alpha"?: string;
  "--ambient-secondary-alpha"?: string;
};

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 979px)").matches;
}

function readStoredSidebarPreference() {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY);
  if (stored === "collapsed") return true;
  if (stored === "expanded") return false;
  return null;
}

function defaultCollapsedForPath(pathname: string) {
  return pathname === "/" || pathname.startsWith("/heatmap/") || pathname === "/change-heatmap" || pathname === "/rsi-surface" || pathname === "/will-surface";
}

function buildSidebarGroups(tr: (value: string) => string): NavGroup[] {
  return [
    {
      id: "overview",
      label: tr("Overview"),
      items: [
        {
          label: tr("Home"),
          to: "/",
          icon: Home,
          match: (pathname) => pathname === "/"
        }
      ]
    },
    {
      id: "backtesting",
      label: tr("Backtesting"),
      items: [
        {
          label: tr("Overview"),
          to: "/backtesting",
          icon: FlaskConical,
          match: (pathname) => pathname === "/backtesting"
        },
        {
          label: tr("Strategy Leaderboard"),
          to: "/backtesting/strategies",
          icon: LibraryBig,
          match: (pathname) => pathname.startsWith("/backtesting/strategies")
        },
        {
          label: tr("Portfolio Results"),
          to: "/backtesting/results",
          icon: BarChart3,
          match: (pathname) => pathname.startsWith("/backtesting/results")
        },
        {
          label: tr("Regime Analysis"),
          to: "/backtesting/regimes",
          icon: TrendingUp,
          match: (pathname) => pathname.startsWith("/backtesting/regimes")
        },
        {
          label: tr("Stock Insights"),
          to: "/backtesting/stocks",
          icon: Activity,
          match: (pathname) => pathname.startsWith("/backtesting/stocks")
        },
        {
          label: tr("Daily Summary"),
          to: "/backtesting/daily-summary",
          icon: ClipboardList,
          match: (pathname) => pathname.startsWith("/backtesting/daily-summary")
        },
        {
          label: tr("Compare"),
          to: "/backtesting/compare",
          icon: LayoutDashboard,
          match: (pathname) => pathname.startsWith("/backtesting/compare")
        },
        {
          label: tr("Run Monitor"),
          to: "/backtesting/runs",
          icon: ClipboardList,
          match: (pathname) => pathname.startsWith("/backtesting/runs")
        }
      ]
    },
    {
      id: "market",
      label: tr("Market"),
      items: [
        {
          label: tr("Market Hub"),
          to: "/analytics",
          icon: LayoutDashboard,
          match: (pathname) => pathname === "/analytics"
        },
        {
          label: tr("Market State"),
          to: "/analytics/market-state",
          icon: Activity,
          match: (pathname) => pathname.startsWith("/analytics/market-state")
        },
        {
          label: tr("Market Story"),
          to: "/analytics/regime",
          icon: TrendingUp,
          match: (pathname) => pathname.startsWith("/analytics/regime")
        },
        {
          label: tr("Supporting Metrics"),
          to: "/analytics/supporting-metrics",
          icon: Globe2,
          match: (pathname) => pathname.startsWith("/analytics/supporting-metrics")
        }
      ]
    },
    {
      id: "catalysts",
      label: tr("Catalysts"),
      items: [
        {
          label: tr("Event Context"),
          to: "/catalysts/context",
          icon: ClipboardList,
          match: (pathname) => pathname.startsWith("/catalysts/context")
        },
        {
          label: tr("Events Calendar"),
          to: "/catalysts/events",
          icon: LibraryBig,
          match: (pathname) => pathname.startsWith("/catalysts/events") || pathname.startsWith("/analytics/events")
        }
      ]
    },
    {
      id: "institutional",
      label: tr("Institutional"),
      items: [
        {
          label: tr("Participant Flow"),
          to: "/institutional/flow",
          icon: BarChart3,
          match: (pathname) => pathname.startsWith("/institutional/flow")
        },
        {
          label: tr("FII Reports"),
          to: "/institutional/reports",
          icon: LibraryBig,
          match: (pathname) =>
            pathname.startsWith("/institutional/reports") || pathname.startsWith("/analytics/fii-reports")
        }
      ]
    },
    {
      id: "options",
      label: tr("Options"),
      items: [
        {
          label: tr("Options Structure"),
          to: "/options/structure",
          icon: Sigma,
          match: (pathname) => pathname.startsWith("/options/structure") || pathname.startsWith("/option-chain")
        },
        {
          label: tr("Option Snapshot"),
          to: "/options/snapshot",
          icon: BarChart3,
          match: (pathname) => pathname.startsWith("/options/snapshot")
        }
      ]
    },
    {
      id: "stocks",
      label: tr("Stocks"),
      items: [
        {
          label: tr("Stock Leadership"),
          to: "/analytics/leadership",
          icon: TrendingUp,
          match: (pathname) => pathname.startsWith("/analytics/leadership")
        },
        {
          label: tr("Daily Setups"),
          to: "/analytics/daily-setups",
          icon: ClipboardList,
          match: (pathname) => pathname.startsWith("/analytics/daily-setups") || pathname.startsWith("/analytics/setups")
        },
        {
          label: tr("Stock Detail"),
          to: "/analytics/stock/RELIANCE",
          icon: Activity,
          match: (pathname) => pathname.startsWith("/analytics/stock/") || pathname.startsWith("/stock/")
        }
      ]
    },
    {
      id: "strategy",
      label: tr("Strategy"),
      items: [
        {
          label: tr("Strategy Evaluation"),
          to: "/strategy/evaluation",
          icon: FlaskConical,
          match: (pathname) => pathname.startsWith("/strategy/evaluation") || pathname.startsWith("/analytics/strategy-evaluation")
        }
      ]
    },
    {
      id: "heatmaps",
      label: tr("Heatmaps"),
      items: [
        {
          label: tr("% Change"),
          to: "/heatmap/change",
          icon: BarChart3,
          match: (pathname) => pathname === "/heatmap/change" || pathname === "/change-heatmap"
        },
        {
          label: tr("RSI"),
          to: "/heatmap/rsi",
          icon: Activity,
          match: (pathname) => pathname === "/heatmap/rsi" || pathname === "/rsi-surface"
        },
        {
          label: tr("WILLR"),
          to: "/heatmap/will",
          icon: Gauge,
          match: (pathname) => pathname === "/heatmap/will" || pathname === "/will-surface"
        }
      ]
    },
    {
      id: "learning",
      label: tr("Learning"),
      items: [
        {
          label: tr("Strategy Lab"),
          to: "/analytics/learn",
          icon: BookOpen,
          match: (pathname) => pathname.startsWith("/analytics/learn")
        },
        {
          label: tr("Simulator"),
          to: "/analytics/simulator",
          icon: FlaskConical,
          match: (pathname) => pathname.startsWith("/analytics/simulator")
        },
        {
          label: tr("Indicators"),
          to: "/analytics/indicators",
          icon: Sigma,
          match: (pathname) => pathname.startsWith("/analytics/indicators")
        }
      ]
    },
    {
      id: "utility",
      label: tr("Utilities"),
      hiddenInSidebar: true,
      items: [
        {
          label: tr("Feedback"),
          to: "/feedback",
          icon: MessageSquareMore,
          match: (pathname) => pathname.startsWith("/feedback")
        }
      ]
    },
    {
      id: "system",
      label: tr("System"),
      items: [
        {
          label: tr("System Map"),
          to: "/analytics/system/map",
          icon: ClipboardList,
          match: (pathname) => pathname.startsWith("/analytics/system/map")
        },
        {
          label: tr("Quality & Freshness"),
          to: "/analytics/system/quality",
          icon: ShieldCheck,
          match: (pathname) =>
            pathname.startsWith("/analytics/system/quality") || pathname.startsWith("/analytics/quality")
        }
      ]
    }
  ];
}

function findCurrentPage(groups: NavGroup[], pathname: string) {
  for (const group of groups) {
    for (const item of group.items) {
      if (item.match(pathname)) return item;
    }
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildAmbientGlowStyle(changePct: number | null | undefined): AmbientGlowStyle {
  const safeChange = Number.isFinite(changePct) ? Number(changePct) : 0;
  const clamped = clamp(safeChange, -2, 2);
  const magnitude = Math.abs(clamped) / 2;
  const easedMagnitude = Math.pow(magnitude, 1.35);
  const direction = clamped > 0.1 ? "positive" : clamped < -0.1 ? "negative" : "neutral";

  const primaryRgb =
    direction === "positive"
      ? "22, 62, 43"
      : direction === "negative"
        ? "78, 32, 38"
        : "52, 58, 66";
  const secondaryRgb =
    direction === "positive"
      ? "14, 38, 28"
      : direction === "negative"
        ? "42, 18, 22"
        : "30, 36, 42";

  const primaryAlpha =
    direction === "neutral"
      ? 0.014
      : 0.014 + easedMagnitude * 0.018;
  const secondaryAlpha =
    direction === "neutral"
      ? 0.008
      : 0.008 + easedMagnitude * 0.012;

  return {
    "--ambient-primary-rgb": primaryRgb,
    "--ambient-secondary-rgb": secondaryRgb,
    "--ambient-primary-alpha": primaryAlpha.toFixed(3),
    "--ambient-secondary-alpha": secondaryAlpha.toFixed(3)
  };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { language, digits, setLanguage, setDigits, t, tr } = useI18n();
  const allGroups = useMemo(() => buildSidebarGroups(tr), [tr]);
  const sidebarGroups = useMemo(() => allGroups.filter((group) => !group.hiddenInSidebar), [allGroups]);
  const currentPage = useMemo(() => findCurrentPage(allGroups, location.pathname), [allGroups, location.pathname]);

  const { authReady, user } = useAuthGate();
  const { mode: analyticsMode, setMode: setAnalyticsMode } = useAnalyticsExperienceMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarPreference, setSidebarPreference] = useState<boolean | null>(() => readStoredSidebarPreference());

  const sessionEnabled = authReady && !!user;
  const overview = useOverview(authReady);
  const live = useLiveQuotes(["NIFTY50", "BANKNIFTY", "INDIAVIX"], sessionEnabled);
  const tickerItems = useMemo(() => {
    const items = overview.data?.tickerTape ?? [];
    return items.map((item) => {
      const quote = live[item.symbol];
      return quote
        ? {
            ...item,
            last: quote.price,
            changePct: quote.changePct
          }
        : item;
    });
  }, [live, overview.data?.tickerTape]);
  const niftyChangePct =
    live.NIFTY50?.changePct ??
    overview.data?.indices?.nifty50?.changePct ??
    tickerItems.find((item) => item.symbol.toUpperCase() === "NIFTY50")?.changePct ??
    0;
  const ambientGlowStyle = useMemo(() => buildAmbientGlowStyle(niftyChangePct), [niftyChangePct]);

  const currentSection = resolvePrimarySection(location.pathname);
  const currentSectionMeta = SECTION_META[currentSection];
  const desktopSidebarCollapsed = sidebarPreference ?? defaultCollapsedForPath(location.pathname);
  const pageTitle = currentPage?.label ?? tr(currentSectionMeta.label);
  const authState = authReady && user ? "signed_in" : "guest";
  const prefetchDashboardRoute = useDashboardPrefetch(authReady);

  useTrackPageViews({
    pathname: location.pathname,
    search: location.search,
    mode: analyticsMode,
    authState,
    trackingReady: authReady
  });

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      if (!isMobileViewport()) setMobileNavOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleNavigation = () => {
    if (isMobileViewport()) {
      void trackNavClick({
        nav_type: "mobile_drawer_toggle",
        source_page: location.pathname,
        next_state: mobileNavOpen ? "closed" : "open"
      });
      setMobileNavOpen((value) => !value);
      return;
    }

    const nextValue = !desktopSidebarCollapsed;
    void trackNavClick({
      nav_type: "sidebar_toggle",
      source_page: location.pathname,
      next_state: nextValue ? "collapsed" : "expanded"
    });
    setSidebarPreference(nextValue);
    window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, nextValue ? "collapsed" : "expanded");
  };

  const handleAnalyticsModeChange = (nextMode: typeof analyticsMode) => {
    if (nextMode === analyticsMode) return;
    void trackModeToggle({
      from_mode: analyticsMode,
      to_mode: nextMode,
      page_path: location.pathname
    });
    void trackAnalyticsEvent("audience_mode_change", {
      from_mode: analyticsMode,
      to_mode: nextMode,
      page_path: location.pathname
    });
    setAnalyticsMode(nextMode);
  };

  const handleLanguageChange = (nextLanguage: typeof language) => {
    if (nextLanguage === language) return;
    void trackAnalyticsEvent("locale_language_change", {
      from_language: language,
      to_language: nextLanguage,
      page_path: location.pathname
    });
    setLanguage(nextLanguage);
  };

  const handleDigitChange = (nextDigits: typeof digits) => {
    if (nextDigits === digits) return;
    void trackAnalyticsEvent("locale_digits_change", {
      from_digits: digits,
      to_digits: nextDigits,
      page_path: location.pathname
    });
    setDigits(nextDigits);
  };

  const feedbackTarget = useMemo(() => {
    const params = new URLSearchParams();
    if (location.pathname && location.pathname !== "/feedback") {
      params.set("from", `${location.pathname}${location.search}`);
      if (pageTitle) {
        params.set("label", pageTitle);
      }
    }
    const query = params.toString();
    return query ? `/feedback?${query}` : "/feedback";
  }, [location.pathname, location.search, pageTitle]);

  return (
    <div
      className={styles.shell}
      data-mobile-nav-open={mobileNavOpen ? "true" : "false"}
      data-sidebar-collapsed={desktopSidebarCollapsed ? "true" : "false"}
    >
      <div className={styles.ambientBackdrop} style={ambientGlowStyle} aria-hidden="true" />
      <div className={styles.chrome}>
        <header className={styles.header}>
          <div className={styles.topBar}>
            <div className={styles.topBarLeft}>
              <button
                type="button"
                className={styles.menuButton}
                onClick={toggleNavigation}
                aria-controls="primary-site-sidebar"
                aria-expanded={mobileNavOpen ? "true" : desktopSidebarCollapsed ? "false" : "true"}
                aria-label={
                  mobileNavOpen
                    ? t("ui.closeNavigation", "Close navigation")
                    : desktopSidebarCollapsed
                      ? t("ui.expandNavigation", "Expand navigation")
                      : t("ui.collapseNavigation", "Collapse navigation")
                }
              >
                {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
              </button>

              <Link
                to="/"
                className={styles.brandLink}
                onMouseEnter={() => prefetchDashboardRoute("/")}
                onFocus={() => prefetchDashboardRoute("/")}
              >
                <span className={styles.brandMark}>Nifty 50</span>
                <span className={styles.brandWordmark}>{t("brand.storyWordmark", "Market intelligence for today’s Nifty 50 tape")}</span>
              </Link>
            </div>

            <div className={styles.topBarCenter}>
              <span className={styles.pageTitle}>{pageTitle}</span>
            </div>

            <div className={styles.topBarRight}>
              <div className={styles.preferenceStack}>
                <div className={styles.audienceWrap}>
                  <ToggleGroup
                    label={t("preferences.audienceLabel", "Audience")}
                    value={analyticsMode}
                    options={[
                      { label: t("preferences.audienceOptions.beginner", "Beginner"), value: "beginner" },
                      { label: t("preferences.audienceOptions.advanced", "Advanced"), value: "advanced" }
                    ]}
                    onChange={handleAnalyticsModeChange}
                  />
                </div>
                <div className={styles.localeWrap}>
                  <ToggleGroup
                    label={t("preferences.languageLabel", "Language")}
                    value={language}
                    options={[
                      { label: t("preferences.languageOptions.en", "English"), value: "en" },
                      { label: t("preferences.languageOptions.hi", "हिंदी"), value: "hi" },
                      { label: t("preferences.languageOptions.mr", "मराठी"), value: "mr" }
                    ]}
                    onChange={handleLanguageChange}
                  />
                </div>
                <div className={styles.localeWrap}>
                  <ToggleGroup
                    label={t("preferences.digitsLabel", "Digits")}
                    value={digits}
                    options={[
                      { label: t("preferences.digitOptions.latn", "Latin"), value: "latn" },
                      { label: t("preferences.digitOptions.deva", "देवनागरी"), value: "deva" }
                    ]}
                    onChange={handleDigitChange}
                  />
                </div>
              </div>
              <div className={styles.utilityCluster}>
                <Link
                  to={feedbackTarget}
                  className={styles.feedbackButton}
                  onClick={() => {
                    void trackAnalyticsEvent("cta_click", {
                      cta_name: "feedback_topbar",
                      page_section: "topbar",
                      source_page: location.pathname
                    });
                  }}
                >
                  <MessageSquareMore size={16} />
                  <span>{tr("Feedback")}</span>
                </Link>
                <div className={styles.sessionStatus}>
                  <AuthStatus />
                </div>
              </div>
            </div>
          </div>

          <FooterDisclaimer />

          <div className={styles.tickerRail} data-clarity-unmask="true" data-clarity-region="top_ticker">
            <HeaderTicker items={tickerItems} />
          </div>
        </header>

        <div className={styles.body}>
          <button
            type="button"
            className={styles.scrim}
            aria-label={t("ui.closeNavigation", "Close navigation")}
            tabIndex={mobileNavOpen ? 0 : -1}
            onClick={() => setMobileNavOpen(false)}
          />

          <aside
            id="primary-site-sidebar"
            className={styles.sidebar}
            aria-label={t("ui.primaryNavigation", "Primary site navigation")}
            data-clarity-region="left_sidebar"
          >
            <nav className={styles.sidebarNav} aria-label={t("ui.dashboardSections", "Dashboard sections")}>
              {sidebarGroups.map((group) => (
                <section key={group.id} className={styles.navSection} aria-labelledby={`nav-group-${group.id}`}>
                  <h2 id={`nav-group-${group.id}`} className={styles.groupLabel}>
                    {group.label}
                  </h2>
                  <div className={styles.groupItems}>
                    {group.items.map((item) => {
                      const active = item.match(location.pathname);
                      const Icon = item.icon;
                      const body = (
                        <>
                          <span className={styles.navIcon} aria-hidden="true">
                            <Icon size={16} strokeWidth={1.8} />
                          </span>
                          <span className={styles.navLabel}>{item.label}</span>
                          <span className={styles.navTooltip} role="tooltip">
                            {item.label}
                          </span>
                        </>
                      );

                      return item.external ? (
                        <a
                          key={item.label}
                          href={item.to}
                          className={styles.navLink}
                          data-active={active ? "true" : "false"}
                          data-tooltip={item.label}
                          title={desktopSidebarCollapsed ? item.label : undefined}
                          onMouseEnter={() => prefetchDashboardRoute(item.to)}
                          onFocus={() => prefetchDashboardRoute(item.to)}
                          onClick={() =>
                            void trackNavClick({
                              nav_type: "sidebar",
                              source_page: location.pathname,
                              target_page: item.to,
                              target_label: item.label,
                              app_area: group.id
                            })
                          }
                        >
                          {body}
                        </a>
                      ) : (
                        <Link
                          key={item.label}
                          to={item.to}
                          className={styles.navLink}
                          data-active={active ? "true" : "false"}
                          data-tooltip={item.label}
                          aria-current={active ? "page" : undefined}
                          onMouseEnter={() => prefetchDashboardRoute(item.to)}
                          onFocus={() => prefetchDashboardRoute(item.to)}
                          onClick={() => {
                            void trackNavClick({
                              nav_type: "sidebar",
                              source_page: location.pathname,
                              target_page: item.to,
                              target_label: item.label,
                              app_area: group.id
                            });
                            setMobileNavOpen(false);
                          }}
                          title={desktopSidebarCollapsed ? item.label : undefined}
                        >
                          {body}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>
          </aside>

          <div className={styles.contentColumn}>
            <main className={styles.main}>{children}</main>
          </div>
        </div>
      </div>
      <AuthGateModal />
    </div>
  );
}
