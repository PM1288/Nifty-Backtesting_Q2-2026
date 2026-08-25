import { useEffect, useMemo, useRef, useState } from "react";
import { Accessibility, Check, ChevronDown, LogOut, UserRound } from "lucide-react";
import { useAuthGate } from "../../auth/AuthGateProvider";
import { useI18n } from "../../i18n/LocaleProvider";
import { trackAnalyticsEvent } from "../../lib/analytics";
import { useFontMode } from "../../lib/fontMode";
import styles from "./AuthStatus.module.css";

function trimLabel(value: string, max = 22) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function AuthStatus() {
  const { tr } = useI18n();
  const { user, authReady, openAuthGate, signOutUser, requiresEmailVerification, verificationEmail, trackAction } =
    useAuthGate();

  const primaryLabel = useMemo(() => {
    if (!user && requiresEmailVerification && verificationEmail) {
      return trimLabel(verificationEmail);
    }
    if (!user) return tr("Guest");
    if (typeof user.displayName === "string" && user.displayName.trim().length > 0) {
      return trimLabel(user.displayName.trim());
    }
    if (typeof user.email === "string" && user.email.trim().length > 0) {
      return trimLabel(user.email.trim());
    }
    return tr("Trader");
  }, [requiresEmailVerification, tr, user, verificationEmail]);

  const status = authReady
    ? user
      ? tr("Connected")
      : requiresEmailVerification
        ? tr("Verify email")
        : tr("Guest")
    : tr("Loading");
  const [menuOpen, setMenuOpen] = useState(false);
  const [fontMode, setFontMode] = useFontMode();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [menuOpen]);

  const onLoginClick = async () => {
    if (!authReady) return;
    await trackAction("LOGIN_BUTTON_CLICK");
    void trackAnalyticsEvent("auth_cta_click", {
      cta_location: "top_bar",
      action: "open_auth_gate"
    });
    openAuthGate();
  };

  const onLogoutClick = async () => {
    setMenuOpen(false);
    await signOutUser();
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button type="button" className={styles.identity} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
        <UserRound size={16} aria-hidden="true" /><span className={styles.labels}>
        <span className={styles.primary}>{primaryLabel}</span>
        <span className={styles.secondary} data-auth={user ? "yes" : requiresEmailVerification ? "pending" : "no"}>
          {status}
        </span>
        </span><ChevronDown size={14} aria-hidden="true" />
      </button>
      {user ? (menuOpen ? (
        <div className={styles.menu} role="menu">
          <div><strong>{primaryLabel}</strong><span>{status}</span></div>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={fontMode === "high-legibility"}
            onClick={() => setFontMode(fontMode === "high-legibility" ? "standard" : "high-legibility")}
          >
            <Accessibility size={15} aria-hidden="true" />
            <span className={styles.menuLabel}>High-legibility font</span>
            {fontMode === "high-legibility" ? <Check size={15} aria-hidden="true" /> : null}
          </button>
          <button type="button" role="menuitem" onClick={onLogoutClick}><LogOut size={15} aria-hidden="true" />{tr("Sign out")}</button>
        </div>
      ) : null) : (
        <button type="button" className={styles.action} onClick={onLoginClick} disabled={!authReady}>
          {requiresEmailVerification ? tr("Continue") : tr("Sign in")}
        </button>
      )}
    </div>
  );
}
