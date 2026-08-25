import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Command,
  MoreHorizontal,
  Presentation,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { trackNavClick } from "../../analytics/events";
import {
  STRATEGY_MENU_ROUTES,
  WORKSPACE_ROUTES,
  resolveWorkspaceRoute,
} from "./workspaceRoutes";
import styles from "./ResponsiveWorkspaceNavigation.module.css";

const MOBILE_BREAKPOINT = 720;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type SheetState =
  | { status: "closed" }
  | { status: "open"; returnFocusTo: HTMLElement | null };

export function ResponsiveWorkspaceNavigation({
  pathname,
  isAdmin,
  presentationMode,
  onPresentationModeChange,
  onPrefetch,
}: {
  pathname: string;
  isAdmin: boolean;
  presentationMode: boolean;
  onPresentationModeChange: (enabled: boolean) => void;
  onPrefetch: (path: string) => void;
}) {
  const [sheet, setSheet] = useState<SheetState>({ status: "closed" });
  const sheetRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const desktopActiveRef = useRef<HTMLAnchorElement>(null);
  const desktopDockRef = useRef<HTMLElement>(null);
  const touchStartY = useRef<number | null>(null);
  const current = resolveWorkspaceRoute(pathname);
  const desktopRoutes = useMemo(
    () => WORKSPACE_ROUTES.filter((route) => route.primaryDesktop),
    [],
  );
  const mobileRoutes = useMemo(
    () => WORKSPACE_ROUTES.filter((route) => route.primaryMobile),
    [],
  );
  const sheetRoutes = useMemo(
    () => WORKSPACE_ROUTES.filter((route) => !route.primaryMobile),
    [],
  );
  const sheetOpen = sheet.status === "open";
  const moreActive = !current.primaryMobile;
  const currentDesktopId = current.parentId ?? current.id;

  const closeSheet = (restoreFocus: boolean) => {
    setSheet((state) => {
      if (state.status === "open" && restoreFocus) {
        window.requestAnimationFrame(() => state.returnFocusTo?.focus());
      }
      return { status: "closed" };
    });
  };

  useEffect(() => {
    closeSheet(false);
  }, [pathname]);

  useEffect(() => {
    const active = desktopActiveRef.current;
    active?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet(true);
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) closeSheet(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [sheetOpen]);

  useEffect(() => {
    const closeForBlockingSurface = () => closeSheet(false);
    window.addEventListener(
      "n50:blocking-surface-open",
      closeForBlockingSurface,
    );
    return () =>
      window.removeEventListener(
        "n50:blocking-surface-open",
        closeForBlockingSurface,
      );
  }, []);

  const recordNavigation = (
    path: string,
    label: string,
    source: "desktop_dock" | "mobile_dock" | "mobile_sheet",
  ) => {
    void trackNavClick({
      nav_type: source,
      source_page: pathname,
      target_page: path,
      target_label: label,
      app_area: "workspace_navigation",
    });
  };

  if (presentationMode) {
    return (
      <button
        type="button"
        className={styles.exitPresentation}
        onClick={() => onPresentationModeChange(false)}
      >
        Exit presentation
      </button>
    );
  }

  return (
    <>
      <div className={styles.desktopWrap}>
        <nav
          ref={desktopDockRef}
          className={styles.desktopDock}
          aria-label="Workspace navigation"
          onKeyDown={(event) => {
            if (
              !desktopDockRef.current ||
              !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            )
              return;
            const links = Array.from(
              desktopDockRef.current.querySelectorAll<HTMLAnchorElement>(
                'a[data-workspace-primary="true"]',
              ),
            );
            const currentIndex = links.indexOf(
              document.activeElement as HTMLAnchorElement,
            );
            if (currentIndex < 0) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? links.length - 1
                  : event.key === "ArrowRight"
                    ? Math.min(links.length - 1, currentIndex + 1)
                    : Math.max(0, currentIndex - 1);
            links[next]?.focus();
          }}
        >
          {desktopRoutes.map((route) => {
            const active = route.id === currentDesktopId;
            const Icon = route.icon;
            if (route.id === "oiis-lab") {
              return (
                <div
                  key={route.id}
                  className={styles.desktopMenu}
                  data-active={active ? "true" : "false"}
                >
                  <Link
                    ref={active ? desktopActiveRef : undefined}
                    to={route.path}
                    className={styles.desktopItem}
                    data-workspace-primary="true"
                    data-active={active ? "true" : "false"}
                    aria-current={active ? "page" : undefined}
                    aria-haspopup="menu"
                    title={route.description}
                    onMouseEnter={() =>
                      STRATEGY_MENU_ROUTES.forEach((item) =>
                        onPrefetch(item.path),
                      )
                    }
                    onFocus={() => onPrefetch(route.path)}
                    onClick={() =>
                      recordNavigation(route.path, route.label, "desktop_dock")
                    }
                  >
                    <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                    <span>
                      <strong>{route.label}</strong>
                    </span>
                    <ChevronDown
                      className={styles.menuChevron}
                      size={14}
                      aria-hidden="true"
                    />
                  </Link>
                  <div
                    className={styles.desktopDropdown}
                    role="menu"
                    aria-label="Strategy dashboards"
                  >
                    {STRATEGY_MENU_ROUTES.map((item) => {
                      const ItemIcon = item.icon;
                      const itemActive = pathname.startsWith(item.path);
                      return (
                        <Link
                          key={item.id}
                          role="menuitem"
                          to={item.path}
                          data-active={itemActive ? "true" : "false"}
                          onMouseEnter={() => onPrefetch(item.path)}
                          onFocus={() => onPrefetch(item.path)}
                          onClick={() =>
                            recordNavigation(
                              item.path,
                              item.label,
                              "desktop_dock",
                            )
                          }
                        >
                          <ItemIcon size={19} aria-hidden="true" />
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>
                        </Link>
                      );
                    })}
                    <p>New strategy dashboards will be added here.</p>
                  </div>
                </div>
              );
            }
            return (
              <Link
                ref={active ? desktopActiveRef : undefined}
                key={route.id}
                to={route.path}
                className={styles.desktopItem}
                data-workspace-primary="true"
                data-active={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
                title={route.description}
                onMouseEnter={() => onPrefetch(route.path)}
                onFocus={() => onPrefetch(route.path)}
                onClick={() =>
                  recordNavigation(route.path, route.label, "desktop_dock")
                }
              >
                <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                <span>
                  <strong>{route.label}</strong>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <nav
        className={styles.mobileDock}
        aria-label="Mobile workspace navigation"
      >
        {mobileRoutes.map((route) => {
          const active = route.id === current.id;
          const Icon = route.icon;
          return (
            <Link
              key={route.id}
              to={route.path}
              className={styles.mobileItem}
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              onClick={() =>
                recordNavigation(route.path, route.label, "mobile_dock")
              }
            >
              <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
              <span>{route.compactLabel}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={styles.mobileItem}
          data-active={moreActive || sheetOpen ? "true" : "false"}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          aria-controls="mobile-workspace-sheet"
          onClick={(event) =>
            setSheet({ status: "open", returnFocusTo: event.currentTarget })
          }
        >
          <MoreHorizontal size={20} strokeWidth={1.9} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {sheetOpen ? (
        <div
          className={styles.sheetBackdrop}
          role="presentation"
          onMouseDown={() => closeSheet(true)}
        >
          <section
            ref={sheetRef}
            id="mobile-workspace-sheet"
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-workspace-sheet-title"
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => {
              touchStartY.current = event.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchStartY.current;
              const end = event.changedTouches[0]?.clientY;
              touchStartY.current = null;
              if (start != null && end != null && end - start > 72)
                closeSheet(true);
            }}
          >
            <div className={styles.sheetHandle} aria-hidden="true" />
            <header className={styles.sheetHeader}>
              <div>
                <h2 id="mobile-workspace-sheet-title">More workspaces</h2>
                <p>Research, derivatives, and system tools</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => closeSheet(true)}
                aria-label="Close more workspaces"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className={styles.sheetGrid}>
              {sheetRoutes.map((route) => {
                const active = route.id === current.id;
                const Icon = route.icon;
                return (
                  <Link
                    key={route.id}
                    to={route.path}
                    className={styles.sheetTile}
                    data-active={active ? "true" : "false"}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      recordNavigation(route.path, route.label, "mobile_sheet");
                      closeSheet(false);
                    }}
                  >
                    <Icon size={21} aria-hidden="true" />
                    <span>
                      <strong>
                        {route.id === "oiis-lab" ? "OIIS Lab" : route.label}
                      </strong>
                      <small>{route.description}</small>
                    </span>
                  </Link>
                );
              })}
              <button
                type="button"
                className={styles.sheetTile}
                onClick={() => {
                  closeSheet(false);
                  window.requestAnimationFrame(() =>
                    window.dispatchEvent(new Event("n50:open-command-palette")),
                  );
                }}
              >
                <Command size={21} aria-hidden="true" />
                <span>
                  <strong>Commands</strong>
                  <small>Find any page or stock</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sheetTile}
                onClick={() => {
                  closeSheet(false);
                  onPresentationModeChange(true);
                }}
              >
                <Presentation size={21} aria-hidden="true" />
                <span>
                  <strong>Presentation</strong>
                  <small>Distraction-free canvas</small>
                </span>
              </button>
              <Link
                to="/feedback"
                className={styles.sheetTile}
                onClick={() => closeSheet(false)}
              >
                <Settings size={21} aria-hidden="true" />
                <span>
                  <strong>Settings & feedback</strong>
                  <small>Preferences and support</small>
                </span>
              </Link>
              {isAdmin ? (
                <Link
                  to="/control-plane"
                  className={styles.sheetTile}
                  onClick={() => closeSheet(false)}
                >
                  <ShieldCheck size={21} aria-hidden="true" />
                  <span>
                    <strong>Administration</strong>
                    <small>Admin-only controls</small>
                  </span>
                </Link>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
