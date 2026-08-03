import { useMemo } from "react";
import { useAuthGate } from "../../auth/AuthGateProvider";
import { useI18n } from "../../i18n/LocaleProvider";
import { trackAnalyticsEvent } from "../../lib/analytics";
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
    await signOutUser();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.labels}>
        <span className={styles.primary}>{primaryLabel}</span>
        <span className={styles.secondary} data-auth={user ? "yes" : requiresEmailVerification ? "pending" : "no"}>
          {status}
        </span>
      </div>
      {user ? (
        <button type="button" className={styles.action} onClick={onLogoutClick}>
          {tr("Sign out")}
        </button>
      ) : (
        <button type="button" className={styles.action} onClick={onLoginClick} disabled={!authReady}>
          {requiresEmailVerification ? tr("Continue") : tr("Sign in")}
        </button>
      )}
    </div>
  );
}
