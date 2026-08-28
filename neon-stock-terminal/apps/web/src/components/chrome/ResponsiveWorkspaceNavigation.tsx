import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronDown, Menu, MoreVertical, Presentation, X } from "lucide-react";
import { Link } from "react-router-dom";
import { trackNavClick } from "../../analytics/events";
import {
  MARKETS_MENU_ROUTES,
  MORE_MENU_ROUTES,
  STRATEGY_HEADER_ROUTES,
  WORKSPACE_ROUTES,
  resolveWorkspaceRoute,
  type HeaderNavigationItem,
} from "./workspaceRoutes";
import styles from "./ResponsiveWorkspaceNavigation.module.css";

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
type MenuId = "markets" | "strategy" | "more";

function itemActive(item: HeaderNavigationItem, pathname: string) {
  if (item.id === "market-overview") return pathname === "/analytics" || pathname.startsWith("/analytics/regime") || pathname.startsWith("/market/") || pathname.startsWith("/heatmap/");
  if (item.id === "stocks") return pathname.startsWith("/analytics/stock/") || pathname.startsWith("/analytics/indicators") || pathname.startsWith("/analytics/daily-setups") || pathname.startsWith("/catalysts/");
  if (item.id === "derivatives") return pathname.startsWith("/options/") || pathname.startsWith("/futures") || pathname.startsWith("/option-chain");
  return pathname === item.path || pathname.startsWith(`${item.path}/`) || pathname.startsWith(`${item.path}?`);
}

function MenuItems({ items, pathname, onNavigate, twoColumns = false }: { items: readonly HeaderNavigationItem[]; pathname: string; onNavigate: (item: HeaderNavigationItem) => void; twoColumns?: boolean }) {
  return <div className={twoColumns ? styles.menuGrid : styles.menuList}>
    {items.map((item, index) => {
      const Icon = item.icon;
      const previousSection = index > 0 ? items[index - 1]?.section : undefined;
      return <div className={styles.menuItemWrap} key={item.id}>
        {item.section && item.section !== previousSection ? <span className={styles.sectionLabel}>{item.section}</span> : null}
        <Link role="menuitem" to={item.path} data-active={itemActive(item, pathname) ? "true" : "false"} onClick={() => onNavigate(item)}>
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
        </Link>
      </div>;
    })}
  </div>;
}

export function ResponsiveWorkspaceNavigation({
  pathname,
  isAdmin,
  presentationMode,
  onPresentationModeChange,
  onPrefetch,
  brandSlot,
  searchSlot,
  statusSlot,
  voiceSlot,
  userSlot,
}: {
  pathname: string;
  isAdmin: boolean;
  presentationMode: boolean;
  onPresentationModeChange: (enabled: boolean) => void;
  onPrefetch: (path: string) => void;
  brandSlot: ReactNode;
  searchSlot: ReactNode;
  statusSlot: ReactNode;
  voiceSlot: ReactNode;
  userSlot: ReactNode;
}) {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expandedMobile, setExpandedMobile] = useState<MenuId | null>("markets");
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const menuTriggers = useRef<Partial<Record<MenuId, HTMLButtonElement>>>({});
  const current = resolveWorkspaceRoute(pathname);
  const currentParent = current.parentId ?? current.id;
  const moreRoutes = useMemo(() => MORE_MENU_ROUTES.filter((item) => !item.adminOnly || isAdmin), [isAdmin]);
  const marketsActive = currentParent === "markets" || currentParent === "stocks" || currentParent === "derivatives";
  const strategyActive = currentParent === "oiis-lab";
  const paperActive = currentParent === "paper-trading";
  const todayActive = currentParent === "today";
  const moreActive = currentParent === "data-operations";

  const closeMenus = (restore = false) => {
    const active = openMenu;
    setOpenMenu(null);
    if (restore && active) window.requestAnimationFrame(() => menuTriggers.current[active]?.focus());
  };

  useEffect(() => {
    setOpenMenu(null);
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!openMenu) return;
    const outside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null); };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenu(null);
      window.requestAnimationFrame(() => menuTriggers.current[openMenu]?.focus());
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", key); };
  }, [openMenu]);

  useEffect(() => {
    if (!sheetOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setSheetOpen(false); window.requestAnimationFrame(() => mobileTriggerRef.current?.focus()); return; }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const controls = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", key); };
  }, [sheetOpen]);

  const record = (item: HeaderNavigationItem | { path: string; label: string }, source: "desktop_header" | "mobile_sheet") => {
    onPrefetch(item.path);
    void trackNavClick({ nav_type: source, source_page: pathname, target_page: item.path, target_label: item.label, app_area: "global_command_header" });
    closeMenus(false);
    setSheetOpen(false);
  };

  const toggleMenu = (id: MenuId) => {
    setOpenMenu((currentMenu) => currentMenu === id ? null : id);
  };

  const enterMenu = (event: ReactKeyboardEvent<HTMLButtonElement>, id: MenuId) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    setOpenMenu(id);
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-menu-panel="${id}"] ${FOCUSABLE}`)?.focus());
  };

  const navigateMenu = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const currentIndex = controls.indexOf(document.activeElement as HTMLElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : controls.length - 1
      : (currentIndex + direction + controls.length) % controls.length;
    event.preventDefault();
    controls[nextIndex]?.focus();
  };

  if (presentationMode) return <button type="button" className={styles.exitPresentation} onClick={() => onPresentationModeChange(false)}>Exit presentation</button>;

  const today = WORKSPACE_ROUTES.find((route) => route.id === "today")!;
  const paper = WORKSPACE_ROUTES.find((route) => route.id === "paper-trading")!;
  const TodayIcon = today.icon;
  const PaperIcon = paper.icon;
  const MarketsIcon = MARKETS_MENU_ROUTES[0].icon;
  const StrategyIcon = STRATEGY_HEADER_ROUTES[0].icon;

  return <div ref={rootRef} className={styles.commandHeader}>
    <button ref={mobileTriggerRef} type="button" className={styles.mobileMenuTrigger} aria-label="Open navigation" aria-expanded={sheetOpen} aria-controls="mobile-global-navigation" onClick={() => setSheetOpen(true)}><Menu size={20} aria-hidden="true" /></button>
    <div className={styles.brandSlot}>{brandSlot}</div>
    <div className={styles.searchSlot}>{searchSlot}</div>
    <nav className={styles.primaryNavigation} aria-label="Primary navigation">
      <Link to={today.path} className={styles.primaryLink} data-active={todayActive ? "true" : "false"} aria-current={todayActive ? "page" : undefined} onClick={() => record({ path: today.path, label: today.label }, "desktop_header")}><TodayIcon size={18} aria-hidden="true" /><span>Today</span></Link>
      <div className={styles.menuRoot}>
        <button ref={(node) => { if (node) menuTriggers.current.markets = node; }} type="button" className={styles.primaryLink} data-active={marketsActive ? "true" : "false"} aria-haspopup="menu" aria-expanded={openMenu === "markets"} aria-controls="markets-global-menu" onClick={() => toggleMenu("markets")} onKeyDown={(event) => enterMenu(event, "markets")}><MarketsIcon size={18} aria-hidden="true" /><span>Markets</span><ChevronDown size={14} data-open={openMenu === "markets"} aria-hidden="true" /></button>
        {openMenu === "markets" ? <section id="markets-global-menu" data-menu-panel="markets" className={styles.dropdown} role="menu" aria-label="Markets" onKeyDown={navigateMenu}><span className={styles.dropdownEyebrow}>MARKETS</span><MenuItems items={MARKETS_MENU_ROUTES} pathname={pathname} onNavigate={(item) => record(item, "desktop_header")} /><Link className={styles.menuFooter} role="menuitem" to="/analytics" onClick={() => closeMenus(false)}>View all markets →</Link></section> : null}
      </div>
      <div className={styles.menuRoot}>
        <button ref={(node) => { if (node) menuTriggers.current.strategy = node; }} type="button" className={styles.primaryLink} data-active={strategyActive ? "true" : "false"} aria-haspopup="menu" aria-expanded={openMenu === "strategy"} aria-controls="strategy-global-menu" onClick={() => toggleMenu("strategy")} onKeyDown={(event) => enterMenu(event, "strategy")}><StrategyIcon size={18} aria-hidden="true" /><span>Strategy</span><ChevronDown size={14} data-open={openMenu === "strategy"} aria-hidden="true" /></button>
        {openMenu === "strategy" ? <section id="strategy-global-menu" data-menu-panel="strategy" className={`${styles.dropdown} ${styles.strategyDropdown}`} role="menu" aria-label="Strategy workspaces" onKeyDown={navigateMenu}><span className={styles.dropdownEyebrow}>STRATEGY WORKSPACES</span><MenuItems items={STRATEGY_HEADER_ROUTES} pathname={pathname} twoColumns onNavigate={(item) => record(item, "desktop_header")} /><Link className={styles.menuFooter} role="menuitem" to="/strategy/oiis-live" onClick={() => closeMenus(false)}>View all strategies →</Link></section> : null}
      </div>
      <Link to={paper.path} className={styles.primaryLink} data-active={paperActive ? "true" : "false"} aria-current={paperActive ? "page" : undefined} onClick={() => record({ path: paper.path, label: paper.label }, "desktop_header")}><PaperIcon size={18} aria-hidden="true" /><span className={styles.paperLong}>Paper Trading</span><span className={styles.paperShort}>Paper</span></Link>
    </nav>
    <div className={styles.statusSlot}>{statusSlot}</div>
    <div className={styles.voiceSlot}>{voiceSlot}</div>
    <div className={styles.userSlot}>{userSlot}</div>
    <div className={`${styles.menuRoot} ${styles.moreRoot}`}>
      <button ref={(node) => { if (node) menuTriggers.current.more = node; }} type="button" className={styles.moreButton} data-active={moreActive || openMenu === "more" ? "true" : "false"} aria-label="More navigation" aria-haspopup="menu" aria-expanded={openMenu === "more"} aria-controls="more-global-menu" onClick={() => toggleMenu("more")} onKeyDown={(event) => enterMenu(event, "more")}><MoreVertical size={19} aria-hidden="true" /></button>
      {openMenu === "more" ? <section id="more-global-menu" data-menu-panel="more" className={`${styles.dropdown} ${styles.moreDropdown}`} role="menu" aria-label="More navigation" onKeyDown={navigateMenu}><span className={styles.dropdownEyebrow}>MORE</span><MenuItems items={moreRoutes} pathname={pathname} onNavigate={(item) => record(item, "desktop_header")} /><button type="button" className={styles.presentationAction} role="menuitem" onClick={() => { closeMenus(false); onPresentationModeChange(true); }}><Presentation size={19} aria-hidden="true" /><span><strong>Presentation mode</strong><small>Hide application chrome temporarily</small></span></button></section> : null}
    </div>
    {sheetOpen ? <div className={styles.sheetBackdrop} role="presentation" onMouseDown={() => setSheetOpen(false)}>
      <aside ref={sheetRef} id="mobile-global-navigation" className={styles.mobileSheet} role="dialog" aria-modal="true" aria-label="Application navigation" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>NIFTY 50 TRADER</span><strong>Navigation</strong></div><button type="button" aria-label="Close navigation" onClick={() => { setSheetOpen(false); window.requestAnimationFrame(() => mobileTriggerRef.current?.focus()); }}><X size={20} /></button></header>
        <Link className={styles.mobileDirect} data-active={todayActive ? "true" : "false"} to="/" onClick={() => record({ path: "/", label: "Today" }, "mobile_sheet")}><TodayIcon size={20} />Today</Link>
        {(["markets", "strategy"] as MenuId[]).map((id) => {
          const items = id === "markets" ? MARKETS_MENU_ROUTES : STRATEGY_HEADER_ROUTES;
          return <section className={styles.mobileGroup} key={id}><button type="button" aria-expanded={expandedMobile === id} onClick={() => setExpandedMobile((value) => value === id ? null : id)}><span>{id === "markets" ? "Markets" : "Strategy"}</span><ChevronDown size={16} data-open={expandedMobile === id} /></button>{expandedMobile === id ? <MenuItems items={items} pathname={pathname} onNavigate={(item) => record(item, "mobile_sheet")} /> : null}</section>;
        })}
        <Link className={styles.mobileDirect} data-active={paperActive ? "true" : "false"} to="/paper-trading" onClick={() => record({ path: "/paper-trading", label: "Paper Trading" }, "mobile_sheet")}><PaperIcon size={20} />Paper Trading</Link>
        <section className={styles.mobileGroup}><button type="button" aria-expanded={expandedMobile === "more"} onClick={() => setExpandedMobile((value) => value === "more" ? null : "more")}><span>More</span><ChevronDown size={16} data-open={expandedMobile === "more"} /></button>{expandedMobile === "more" ? <MenuItems items={moreRoutes} pathname={pathname} onNavigate={(item) => record(item, "mobile_sheet")} /> : null}</section>
      </aside>
    </div> : null}
  </div>;
}
