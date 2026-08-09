import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import { useLocation } from "react-router-dom";
import { useI18n } from "../../i18n/LocaleProvider";
import { useAuthGate } from "../../auth/AuthGateProvider";
import { trackAnalyticsEvent } from "../../lib/analytics";
import styles from "./AuthGateModal.module.css";

type Mode = "signup" | "login";
type ErrorContext = "auth" | "verification";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_RESEND_COOLDOWN_MS = 60_000;
const VERIFICATION_RESEND_STORAGE_KEY = "n50.auth.verification.cooldownUntil";

function readVerificationCooldownUntil() {
  if (typeof window === "undefined") return 0;
  const raw = window.sessionStorage.getItem(VERIFICATION_RESEND_STORAGE_KEY);
  const parsed = Number(raw ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeVerificationCooldownUntil(timestamp: number) {
  if (typeof window === "undefined") return;
  if (!timestamp || timestamp <= Date.now()) {
    window.sessionStorage.removeItem(VERIFICATION_RESEND_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(VERIFICATION_RESEND_STORAGE_KEY, String(timestamp));
}

function getAuthErrorMessage(error: unknown, mode: Mode, tr: (value: string) => string, context: ErrorContext = "auth") {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : tr("Authentication failed. Please try again.");
  }

  switch (error.code) {
    case "auth/email-already-in-use":
      return tr("This email is already registered. Please log in instead.");
    case "auth/invalid-email":
      return tr("Please enter a valid email address.");
    case "auth/weak-password":
      return tr("Password is too weak. Use at least 6 characters.");
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return mode === "login" ? tr("Invalid email or password.") : tr("Unable to create account with these details.");
    case "auth/too-many-requests":
      return context === "verification"
        ? tr("Too many verification email attempts. Wait a minute, then resend once.")
        : tr("Too many attempts. Please wait a minute and try again.");
    case "auth/unauthorized-domain":
      return tr("Sign-in is not available from this address right now. Please try again from the main site.");
    case "auth/operation-not-allowed":
      return tr("Sign-in is temporarily unavailable. Please try again shortly.");
    case "auth/network-request-failed":
      return tr("Network error. Check connectivity and try again.");
    case "auth/email-not-verified":
      return tr("Email not verified. Check inbox and verify your account.");
    case "auth/invalid-continue-uri":
    case "auth/missing-continue-uri":
    case "auth/unauthorized-continue-uri":
      return tr("Verification email could not be sent right now. Please try again in a moment.");
    default:
      return tr("Authentication failed. Please try again.");
  }
}

function getAuthErrorCode(error: unknown) {
  if (error instanceof FirebaseError) return error.code;
  if (error instanceof Error) return error.name || "Error";
  return "unknown";
}

function isEmailValid(email: string) {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

export function AuthGateModal() {
  const { tr } = useI18n();
  const location = useLocation();
  const {
    gateVisible,
    gateReason,
    canDismissGate,
    authError,
    clearAuthError,
    dismissGate,
    signIn,
    signUp,
    requiresEmailVerification,
    verificationEmail,
    resendVerificationEmail,
    refreshVerificationStatus,
    trackAction
  } = useAuthGate();
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number>(() => readVerificationCooldownUntil());
  const [cooldownTick, setCooldownTick] = useState<number>(Date.now());

  const resendCooldownSeconds = Math.max(0, Math.ceil((resendAvailableAt - cooldownTick) / 1000));
  const resendOnCooldown = resendCooldownSeconds > 0;

  useEffect(() => {
    if (!gateVisible) return;
    if (gateReason === "route-timeout") {
      setMode("signup");
    } else {
      setMode("login");
    }
    setNotice(null);
    setError(authError ?? null);
  }, [authError, gateReason, gateVisible]);

  useEffect(() => {
    if (!resendOnCooldown) {
      writeVerificationCooldownUntil(0);
      return;
    }

    writeVerificationCooldownUntil(resendAvailableAt);
    const timer = window.setInterval(() => {
      setCooldownTick(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendAvailableAt, resendOnCooldown]);

  const heading = useMemo(() => {
    if (gateReason === "email-verification") return tr("Verify Your Email");
    if (gateReason === "route-timeout") return tr("Sign Up To Continue");
    return tr("Continue With Your Account");
  }, [gateReason, tr]);

  const detail = useMemo(() => {
    if (gateReason === "email-verification") {
      return tr("Use your inbox link first, then click I Have Verified to unlock the full dashboard.");
    }
    if (gateReason === "route-timeout") {
      if (
        location.pathname === "/rsi-surface" ||
        location.pathname === "/will-surface" ||
        location.pathname === "/change-heatmap"
      ) {
        return tr("Indicator surface stays open for 1 minute for guests. Create your account to continue.");
      }
      return tr("Detailed pages stay open for 30 seconds for guests. Create your account to continue.");
    }
    if (gateReason === "manual") {
      return tr("Log in or sign up to sync your profile, track usage, and unlock extended features.");
    }
    return tr("You have used the free guest window. Log in or sign up to keep using the dashboard.");
  }, [gateReason, location.pathname, tr]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    clearAuthError();
    setError(null);
    setNotice(null);
    setPending(true);
    const route = `${location.pathname}${location.search}`;
    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === "signup" && !isEmailValid(cleanEmail)) {
        throw new Error(tr("Please enter a valid email address."));
      }
      if (mode === "login" && cleanEmail !== "admin" && !isEmailValid(cleanEmail)) {
        throw new Error(tr("Enter a valid email address or the administrator username."));
      }
      if (mode === "signup") {
        if (name.trim().length < 2) {
          throw new Error(tr("Enter a valid display name."));
        }
        if (mobile.trim().length < 10) {
          throw new Error(tr("Enter a valid India mobile number."));
        }
        await signUp(name, cleanEmail, password, mobile);
        const nextCooldown = Date.now() + VERIFICATION_RESEND_COOLDOWN_MS;
        setResendAvailableAt(nextCooldown);
        setCooldownTick(Date.now());
        setNotice(tr("Verification email sent to {{email}}. Check spam or promotions if it does not arrive soon.").replace("{{email}}", cleanEmail));
        void trackAction("SIGNUP_FORM_SUBMIT", route, { mode });
      } else {
        await signIn(cleanEmail, password);
        void trackAction("LOGIN_FORM_SUBMIT", route, { mode });
      }
      setPassword("");
    } catch (err) {
      await trackAction("AUTH_ERROR", route, { mode, method: "password", code: getAuthErrorCode(err) });
      setError(getAuthErrorMessage(err, mode, tr));
    } finally {
      setPending(false);
    }
  };

  const onResend = async () => {
    if (verifyPending) return;
    if (resendOnCooldown) {
      setError(tr("Wait {{seconds}}s before resending the verification email.").replace("{{seconds}}", String(resendCooldownSeconds)));
      return;
    }
    setVerifyPending(true);
    setError(null);
    setNotice(null);
    const route = `${location.pathname}${location.search}`;
    try {
      await resendVerificationEmail();
      const nextCooldown = Date.now() + VERIFICATION_RESEND_COOLDOWN_MS;
      setResendAvailableAt(nextCooldown);
      setCooldownTick(Date.now());
      setNotice(tr("Verification email resent to {{email}}. Check spam or promotions if it does not arrive soon.").replace("{{email}}", verificationEmail ?? tr("your email")));
      await trackAction("EMAIL_VERIFICATION_RESEND_CLICK", route);
    } catch (err) {
      await trackAction("AUTH_ERROR", route, { mode, method: "verification", code: getAuthErrorCode(err) });
      setError(getAuthErrorMessage(err, mode, tr, "verification"));
    } finally {
      setVerifyPending(false);
    }
  };

  const onVerified = async () => {
    if (verifyPending) return;
    setVerifyPending(true);
    setError(null);
    setNotice(null);
    const route = `${location.pathname}${location.search}`;
    try {
      const verified = await refreshVerificationStatus();
      if (!verified) {
        setError(tr("Email is still not verified. Verify from inbox, then try again."));
      } else {
        setNotice(tr("Email verified. Access granted."));
      }
      await trackAction("EMAIL_VERIFICATION_CHECK_CLICK", route, { verified });
    } catch (err) {
      await trackAction("AUTH_ERROR", route, { mode, method: "verification", code: getAuthErrorCode(err) });
      setError(getAuthErrorMessage(err, mode, tr, "verification"));
    } finally {
      setVerifyPending(false);
    }
  };

  if (!gateVisible) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="auth-gate-title" data-clarity-mask="true">
      <div className={styles.modal} data-clarity-mask="true">
        <h2 id="auth-gate-title" className={styles.title}>
          {heading}
        </h2>
        <p className={styles.copy}>{detail}</p>

        {requiresEmailVerification ? (
          <div className={styles.verifyBox}>
            <div className={styles.verifyTitle}>{tr("Verification Required")}</div>
            <div className={styles.verifyText}>
              {verificationEmail
                ? tr("Check {{email}} and click the verification link.").replace("{{email}}", verificationEmail)
                : tr("Check your inbox and click the verification link.")}
            </div>
            <div className={styles.verifyHint}>
              {tr("We already sent one verification email. Wait about a minute before sending another.")}
            </div>
            <div className={styles.verifyActions}>
              <button type="button" className={styles.ghost} onClick={onResend} disabled={verifyPending || resendOnCooldown}>
                {verifyPending ? tr("Please wait...") : resendOnCooldown ? `${tr("Resend in")} ${resendCooldownSeconds}s` : tr("Resend Email")}
              </button>
              <button type="button" className={styles.primary} onClick={onVerified} disabled={verifyPending}>
                {verifyPending ? tr("Checking...") : tr("I Have Verified")}
              </button>
            </div>
          </div>
        ) : null}

        {requiresEmailVerification ? null : (
          <>
            <div className={styles.switchRow}>
              <button
                type="button"
                className={styles.switchButton}
                data-active={mode === "signup" ? "true" : "false"}
                onClick={() => {
                  void trackAnalyticsEvent("auth_cta_click", {
                    cta_location: "auth_gate_switch",
                    target_mode: "signup",
                    page_path: location.pathname
                  });
                  setMode("signup");
                }}
              >
                {tr("Sign Up")}
              </button>
              <button
                type="button"
                className={styles.switchButton}
                data-active={mode === "login" ? "true" : "false"}
                onClick={() => {
                  void trackAnalyticsEvent("auth_cta_click", {
                    cta_location: "auth_gate_switch",
                    target_mode: "login",
                    page_path: location.pathname
                  });
                  setMode("login");
                }}
              >
                {tr("Log In")}
              </button>
            </div>

            <form className={styles.form} onSubmit={onSubmit} data-clarity-mask="true">
              {mode === "signup" ? (
                <>
                  <label className={styles.field}>
                    <span>{tr("Display Name")}</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={tr("Nifty 50 Trader")}
                      autoComplete="name"
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{tr("Mobile Number")}</span>
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(event) => setMobile(event.target.value)}
                      placeholder={tr("+91 98765 43210")}
                      autoComplete="tel-national"
                      inputMode="numeric"
                      required
                    />
                    <small className={styles.fieldHint}>
                      {tr("India mobile number required for signup.")}
                    </small>
                  </label>
                </>
              ) : null}

              <label className={styles.field}>
                <span>{mode === "login" ? tr("Email or admin username") : tr("Email")}</span>
                <input
                  type={mode === "login" ? "text" : "email"}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={mode === "login" ? tr("you@example.com or admin") : tr("you@example.com")}
                  autoComplete={mode === "login" ? "username" : "email"}
                  required
                />
              </label>

              <label className={styles.field}>
                <span>{tr("Password")}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
              </label>

              {notice ? <div className={styles.notice}>{notice}</div> : null}
              {error ? <div className={styles.error}>{error}</div> : null}

              <div className={styles.actionRow}>
                <button type="submit" className={styles.primary} disabled={pending || verifyPending}>
                  {pending ? tr("Please wait...") : mode === "signup" ? tr("Create Account") : tr("Log In")}
                </button>
                {canDismissGate ? (
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={dismissGate}
                    disabled={pending || verifyPending}
                  >
                    {tr("Not now")}
                  </button>
                ) : null}
              </div>
            </form>
          </>
        )}

        {requiresEmailVerification && notice ? <div className={styles.notice}>{notice}</div> : null}
        {requiresEmailVerification && error ? <div className={styles.error}>{error}</div> : null}
      </div>
    </div>
  );
}
