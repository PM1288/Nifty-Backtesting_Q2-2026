import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { User } from "firebase/auth";
import { useLocation } from "react-router-dom";
import {
  createFirebaseUserWithEmailAndPassword,
  deleteFirebaseUser,
  getCurrentFirebaseUser,
  getFirebaseDatabaseApi,
  isFirebaseAuthConfigured,
  reloadFirebaseUser,
  sendFirebaseEmailVerification,
  signInWithFirebaseEmailAndPassword,
  signOutFirebaseUser,
  subscribeToFirebaseAuthStateChanged,
  updateFirebaseUserProfile
} from "../lib/firebase";
import { clearAnalyticsUser, setAnalyticsUser, trackAnalyticsEvent } from "../lib/analytics";
import { getAttributionPayload, getLeadSource } from "../lib/attribution";
import type { IndianMobileProfile } from "../lib/mobile";
import { validateIndianMobileInput } from "../lib/mobile";
import {
  createDevServerSession,
  createServerSession,
  createSignupProfile,
  destroyServerSession,
  fetchSessionState
} from "../lib/session";
import type { SessionUser } from "../lib/types";

const HOME_GATE_DELAY_MS = 5 * 60 * 1000;
const DETAIL_GATE_DELAY_MS = 30 * 1000;
const RSI_SURFACE_GATE_DELAY_MS = 60 * 1000;
// Keep authentication available from the explicit account control, but never
// interrupt dashboard review with an unsolicited login modal by default.
const AUTO_AUTH_GATE_ENABLED = import.meta.env.VITE_AUTO_AUTH_GATE === "true";
const DISMISS_STORAGE_KEY = "nifty50trader.homeGateDismissed";
const ACTION_QUEUE_STORAGE_KEY = "nifty50trader.pendingActions";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type GateReason = "home-timeout" | "route-timeout" | "email-verification" | "manual" | null;

type UserAction = {
  type: string;
  createdAt: number;
  route: string;
  meta?: Record<string, unknown>;
};

type AuthGateContextValue = {
  user: SessionUser | null;
  authReady: boolean;
  gateVisible: boolean;
  gateReason: GateReason;
  authError: string | null;
  canDismissGate: boolean;
  requiresEmailVerification: boolean;
  verificationEmail: string | null;
  openAuthGate: () => void;
  dismissGate: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string, mobileInput: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
  trackAction: (type: string, route?: string, meta?: Record<string, unknown>) => Promise<void>;
};

const AuthGateContext = createContext<AuthGateContextValue | null>(null);

function sanitizeActionType(type: string) {
  const normalized = type
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 40);
  return normalized.length >= 3 ? normalized : "ACTION_EVENT";
}

function sanitizeRoute(route: string) {
  const normalized = route.trim().slice(0, 120);
  return normalized || "/";
}

function isEmailValid(email: string) {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

function gateDelayForPath(pathname: string): number {
  if (pathname === "/") return HOME_GATE_DELAY_MS;
  if (pathname.startsWith("/analytics/simulator")) return 12 * 60 * 60 * 1000;
  if (
    pathname === "/rsi-surface" ||
    pathname === "/will-surface" ||
    pathname === "/change-heatmap" ||
    pathname === "/heatmap/rsi" ||
    pathname === "/heatmap/will" ||
    pathname === "/heatmap/change"
  ) {
    return RSI_SURFACE_GATE_DELAY_MS;
  }
  return DETAIL_GATE_DELAY_MS;
}

function isUserVerifiedForAccess(nextUser: User | null | undefined) {
  if (!nextUser) return false;
  if (!nextUser.email) return true;
  return nextUser.emailVerified;
}

function createAuthCodeError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function readDismissedFlag() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1";
}

function readQueuedActions(): UserAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTION_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object") as UserAction[];
  } catch {
    return [];
  }
}

function writeQueuedActions(items: UserAction[]) {
  if (typeof window === "undefined") return;
  try {
    if (!items.length) {
      window.localStorage.removeItem(ACTION_QUEUE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ACTION_QUEUE_STORAGE_KEY, JSON.stringify(items.slice(-200)));
  } catch {
    // Ignore storage write failures.
  }
}

async function writeAction(uid: string, action: UserAction) {
  const { db, push, ref, set } = await getFirebaseDatabaseApi();
  const actionRef = push(ref(db, `userActions/${uid}`));
  await set(actionRef, action);
}

async function flushQueuedActions(uid: string) {
  const queued = readQueuedActions();
  if (!queued.length) return;
  const pending = [...queued];
  const failed: UserAction[] = [];
  for (const action of pending) {
    try {
      await writeAction(uid, action);
    } catch {
      failed.push(action);
    }
  }
  writeQueuedActions(failed);
}

async function ensureUserProfile(user: User, preferredName?: string, mobileProfile?: IndianMobileProfile) {
  const { db, get, ref, set } = await getFirebaseDatabaseApi();
  const profilePath = `profiles/${user.uid}`;
  const profileRef = ref(db, profilePath);
  const existing = await get(profileRef);
  const now = Date.now();
  const displayName = (preferredName?.trim() || user.displayName || user.email || "Trader").slice(0, 80);
  const photoURL = (user.photoURL ?? "").slice(0, 300);

  if (!existing.exists()) {
    await set(profileRef, {
      displayName,
      photoURL,
      mobile:
        mobileProfile == null
          ? null
          : {
              canonical: mobileProfile.canonical,
              national: mobileProfile.national,
              rawInput: mobileProfile.rawInput,
              verified: false,
              riskScore: mobileProfile.riskScore,
              riskFlags: mobileProfile.riskFlags,
              updatedAt: now
            },
      createdAt: now,
      updatedAt: now
    });
    return;
  }

  const updates: Promise<unknown>[] = [set(ref(db, `${profilePath}/updatedAt`), now)];
  if ((existing.child("displayName").val() ?? "") !== displayName) {
    updates.push(set(ref(db, `${profilePath}/displayName`), displayName));
  }
  if ((existing.child("photoURL").val() ?? "") !== photoURL) {
    updates.push(set(ref(db, `${profilePath}/photoURL`), photoURL));
  }
  if (mobileProfile) {
    const existingCanonical = String(existing.child("mobile/canonical").val() ?? "");
    if (existingCanonical !== mobileProfile.canonical) {
      updates.push(
        set(ref(db, `${profilePath}/mobile`), {
          canonical: mobileProfile.canonical,
          national: mobileProfile.national,
          rawInput: mobileProfile.rawInput,
          verified: false,
          riskScore: mobileProfile.riskScore,
          riskFlags: mobileProfile.riskFlags,
          updatedAt: now
        })
      );
    }
  }
  await Promise.all(updates);
}

async function syncSessionFromFirebase(nextUser: User | null): Promise<SessionUser | null> {
  const existing = await fetchSessionState().catch(() => null);
  if (existing?.authenticated && existing.user) {
    if (!nextUser || existing.user.uid === nextUser.uid) {
      return existing.user;
    }
  }

  if (!nextUser) return null;
  const idToken = await nextUser.getIdToken(true);
  const created = await createServerSession(idToken);
  return created.user;
}

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}`;
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [gateVisible, setGateVisible] = useState(false);
  const [gateReason, setGateReason] = useState<GateReason>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [homePromptDismissed, setHomePromptDismissed] = useState(readDismissedFlag);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const firebaseUserRef = useRef<User | null>(null);
  const sessionUserRef = useRef<SessionUser | null>(null);
  const routeStartRef = useRef<number>(Date.now());
  const prevRouteRef = useRef<string | null>(null);
  const authSyncSeqRef = useRef(0);

  const applyAuthenticatedUser = useCallback((nextUser: SessionUser) => {
    setUser(nextUser);
    sessionUserRef.current = nextUser;
    setVerificationEmail(null);
    setGateVisible(false);
    setGateReason(null);
    setAuthError(null);
  }, []);

  const markVerificationRequired = useCallback((email: string | null, message?: string) => {
    setUser(null);
    sessionUserRef.current = null;
    setVerificationEmail(email);
    setGateVisible(AUTO_AUTH_GATE_ENABLED);
    setGateReason(AUTO_AUTH_GATE_ENABLED ? "email-verification" : null);
    setAuthError(message ?? null);
  }, []);

  const trackAction = useCallback(
    async (type: string, route?: string, meta?: Record<string, unknown>) => {
      const action: UserAction = {
        type: sanitizeActionType(type),
        createdAt: Date.now(),
        route: sanitizeRoute(route ?? routeKey)
      };
      if (meta && Object.keys(meta).length) {
        action.meta = meta;
      }

      if (sessionUserRef.current?.uid) {
        try {
          await writeAction(sessionUserRef.current.uid, action);
        } catch {
          const queuedFallback = readQueuedActions();
          queuedFallback.push(action);
          writeQueuedActions(queuedFallback);
        }
        return;
      }

      const queued = readQueuedActions();
      queued.push(action);
      writeQueuedActions(queued);
    },
    [routeKey]
  );

  const finalizeAuthSuccess = useCallback(
    (nextUser: SessionUser, options: { isNewUser: boolean; preferredName?: string }) => {
      applyAuthenticatedUser(nextUser);

      const firebaseUser = firebaseUserRef.current;
      if (firebaseUser) {
        void ensureUserProfile(firebaseUser, options.preferredName).catch(() => {
          // Keep auth successful even if profile sync fails.
        });
      }
      void flushQueuedActions(nextUser.uid).catch(() => {
        // Keep auth successful even if queue flush fails.
      });

      if (options.isNewUser) {
        void trackAction("SIGNUP_SUCCESS", routeKey, { method: "password" });
        void trackAnalyticsEvent("sign_up", { method: "password" });
      } else {
        void trackAction("LOGIN_SUCCESS", routeKey, { method: "password" });
        void trackAnalyticsEvent("login", { method: "password" });
      }
    },
    [applyAuthenticatedUser, routeKey, trackAction]
  );

  useEffect(() => {
    if (!isFirebaseAuthConfigured()) {
      let active = true;

      void fetchSessionState()
        .then((existing) => {
          if (!active) return;
          if (existing.authenticated && existing.user) {
            setUser(existing.user);
            sessionUserRef.current = existing.user;
            void setAnalyticsUser(existing.user.uid, existing.user.email);
          } else {
            setUser(null);
            sessionUserRef.current = null;
            void clearAnalyticsUser();
          }
        })
        .catch(() => {
          if (!active) return;
          setUser(null);
          sessionUserRef.current = null;
          void clearAnalyticsUser();
        })
        .finally(() => {
          if (active) {
            setAuthReady(true);
          }
        });

      return () => {
        active = false;
      };
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;

    void subscribeToFirebaseAuthStateChanged(async (nextUser) => {
      const seq = authSyncSeqRef.current + 1;
      authSyncSeqRef.current = seq;
      firebaseUserRef.current = nextUser;

      if (nextUser && !isUserVerifiedForAccess(nextUser)) {
        markVerificationRequired(nextUser.email ?? null);
        setAuthReady(true);
        void clearAnalyticsUser();
        return;
      }

      try {
        const syncedUser = await syncSessionFromFirebase(nextUser);
        if (!active || authSyncSeqRef.current !== seq) return;

        if (syncedUser) {
          setUser(syncedUser);
          sessionUserRef.current = syncedUser;
          setVerificationEmail(null);
          setAuthError(null);
          void setAnalyticsUser(syncedUser.uid, syncedUser.email);
        } else {
          setUser(null);
          sessionUserRef.current = null;
          void clearAnalyticsUser();
        }
      } catch {
        if (!active || authSyncSeqRef.current !== seq) return;
        setUser(null);
        sessionUserRef.current = null;
        setAuthError("Unable to establish a secure server session. Please log in again.");
        setGateReason(null);
        setGateVisible(false);
        void clearAnalyticsUser();
      } finally {
        if (active && authSyncSeqRef.current === seq) {
          setAuthReady(true);
        }
      }
    }).then((unsub) => {
      if (!active) {
        unsub();
        return;
      }
      unsubscribe = unsub;
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [markVerificationRequired]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!AUTO_AUTH_GATE_ENABLED) return;

    const onAuthRequired = () => {
      if (sessionUserRef.current) return;
      setAuthError(null);
      setGateReason((prev) => (prev === "email-verification" ? prev : "manual"));
      setGateVisible(true);
    };

    window.addEventListener("n50:auth-required", onAuthRequired as EventListener);
    return () => {
      window.removeEventListener("n50:auth-required", onAuthRequired as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(DISMISS_STORAGE_KEY, homePromptDismissed ? "1" : "0");
  }, [homePromptDismissed]);

  useEffect(() => {
    if (!user?.uid) return;
    void flushQueuedActions(user.uid);
  }, [user?.uid]);

  useEffect(() => {
    const now = Date.now();
    const prevRoute = prevRouteRef.current;

    if (prevRoute) {
      const durationMs = Math.max(0, now - routeStartRef.current);
      void trackAction("PAGE_DWELL", prevRoute, { durationMs });
    }

    prevRouteRef.current = routeKey;
    routeStartRef.current = now;

    void trackAction("PAGE_VIEW", routeKey);
  }, [routeKey, trackAction]);

  useEffect(() => {
    if (!authReady && !user && !verificationEmail) return;
    if (user) {
      setGateVisible(false);
      setGateReason(null);
      return;
    }

    if (!AUTO_AUTH_GATE_ENABLED) {
      setGateVisible(false);
      setGateReason(null);
      return;
    }

    if (verificationEmail) {
      setGateVisible(true);
      setGateReason("email-verification");
      return;
    }

    const isHome = location.pathname === "/";
    if (isHome && homePromptDismissed) {
      setGateVisible(false);
      setGateReason(null);
      return;
    }

    const delay = gateDelayForPath(location.pathname);
    setGateVisible(false);
    setGateReason(null);

    const timer = window.setTimeout(() => {
      setGateReason(isHome ? "home-timeout" : "route-timeout");
      setGateVisible(true);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [authReady, homePromptDismissed, location.pathname, user, verificationEmail]);

  useEffect(() => {
    if (!gateVisible) return;
    void trackAction("AUTH_GATE_VIEW", routeKey, { reason: gateReason ?? "unknown" });
    void trackAnalyticsEvent("auth_gate_view", {
      page_path: routeKey,
      reason: gateReason ?? "unknown"
    });
  }, [gateReason, gateVisible, routeKey, trackAction]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail === "admin") {
        const localUser = await createDevServerSession(cleanEmail, password);
        finalizeAuthSuccess(localUser.user, { isNewUser: false });
        return;
      }
      if (!isEmailValid(cleanEmail)) {
        throw new Error("Enter a valid email address or the administrator username.");
      }

      if (!isFirebaseAuthConfigured()) {
        const localUser = await createDevServerSession(cleanEmail, password);
        finalizeAuthSuccess(localUser.user, { isNewUser: false });
        return;
      }

      const credential = await signInWithFirebaseEmailAndPassword(cleanEmail, password);
      firebaseUserRef.current = credential.user;

      if (!isUserVerifiedForAccess(credential.user)) {
        markVerificationRequired(credential.user.email ?? cleanEmail);
        throw createAuthCodeError(
          "auth/email-not-verified",
          "Email not verified. Check your inbox and verify your account."
        );
      }

      const syncedUser = await syncSessionFromFirebase(credential.user);
      if (!syncedUser) {
        throw createAuthCodeError("auth/session-create-failed", "Unable to create secure server session.");
      }

      finalizeAuthSuccess(syncedUser, { isNewUser: false });
    },
    [finalizeAuthSuccess, markVerificationRequired]
  );

  const signUp = useCallback(
    async (displayName: string, email: string, password: string, mobileInput: string) => {
      setAuthError(null);
      const cleanName = displayName.trim();
      const cleanEmail = email.trim().toLowerCase();
      const mobileProfile = validateIndianMobileInput(mobileInput);
      if (!isEmailValid(cleanEmail)) {
        throw new Error("Please enter a valid email address.");
      }
      if (cleanName.length < 2) {
        throw new Error("Display name must be at least 2 characters.");
      }
      const credential = await createFirebaseUserWithEmailAndPassword(cleanEmail, password);
      firebaseUserRef.current = credential.user;
      try {
        await updateFirebaseUserProfile(credential.user, { displayName: cleanName }).catch(() => {
          // Keep signup successful even if display name update fails.
        });
        const idToken = await credential.user.getIdToken(true);
        await createSignupProfile(idToken, {
          displayName: cleanName,
          mobile: mobileProfile,
          attribution: getAttributionPayload()
        });
        await ensureUserProfile(credential.user, cleanName, mobileProfile);
        await sendFirebaseEmailVerification(credential.user);
        markVerificationRequired(credential.user.email ?? cleanEmail);
        void trackAction("SIGNUP_PENDING_VERIFICATION", routeKey, {
          method: "password",
          mobile_risk_score: mobileProfile.riskScore
        });
        void trackAnalyticsEvent("sign_up", { method: "password", email_verification: "pending" });
        void trackAnalyticsEvent("generate_lead", { lead_source: getLeadSource() });
      } catch (error) {
        await deleteFirebaseUser(credential.user).catch(async () => {
          await signOutFirebaseUser().catch(() => {
            // Best effort cleanup.
          });
        });
        firebaseUserRef.current = null;
        throw error;
      }
    },
    [markVerificationRequired, routeKey, trackAction]
  );

  const resendVerificationEmail = useCallback(async () => {
    const currentUser = firebaseUserRef.current ?? (await getCurrentFirebaseUser());
    if (!currentUser || !currentUser.email) {
      throw new Error("Please log in again to resend the verification email.");
    }
    firebaseUserRef.current = currentUser;
    await sendFirebaseEmailVerification(currentUser);
    setVerificationEmail(currentUser.email);
    void trackAction("EMAIL_VERIFICATION_RESEND", routeKey);
    void trackAnalyticsEvent("email_verification_sent", { method: "password" });
  }, [routeKey, trackAction]);

  const refreshVerificationStatus = useCallback(async () => {
    const currentUser = firebaseUserRef.current ?? (await getCurrentFirebaseUser());
    if (!currentUser) {
      throw new Error("Please log in with your email and password.");
    }

    firebaseUserRef.current = currentUser;
    await reloadFirebaseUser(currentUser);
    if (!isUserVerifiedForAccess(currentUser)) {
      markVerificationRequired(currentUser.email ?? verificationEmail);
      return false;
    }

    const syncedUser = await syncSessionFromFirebase(currentUser);
    if (!syncedUser) {
      throw new Error("Unable to create secure server session.");
    }

    finalizeAuthSuccess(syncedUser, { isNewUser: false });
    void trackAction("EMAIL_VERIFICATION_CONFIRMED", routeKey);
    void trackAnalyticsEvent("email_verification_confirmed", { method: "password" });
    return true;
  }, [finalizeAuthSuccess, markVerificationRequired, routeKey, trackAction, verificationEmail]);

  const signOutUser = useCallback(async () => {
    void trackAction("LOGOUT", routeKey);
    void trackAnalyticsEvent("logout");
    setVerificationEmail(null);
    try {
      await destroyServerSession();
    } catch {
      // Continue local signout even if server session clear fails.
    }
    if (isFirebaseAuthConfigured()) {
      await signOutFirebaseUser();
    }
    firebaseUserRef.current = null;
    setUser(null);
    sessionUserRef.current = null;
    void clearAnalyticsUser();
  }, [routeKey, trackAction]);

  useEffect(() => {
    return () => {
      const prevRoute = prevRouteRef.current;
      if (!prevRoute) return;
      const durationMs = Math.max(0, Date.now() - routeStartRef.current);
      void trackAction("PAGE_DWELL", prevRoute, { durationMs, reason: "provider-unmount" });
    };
  }, [trackAction]);

  const dismissGate = useCallback(() => {
    if (gateReason === "email-verification") {
      return;
    }
    if (gateReason === "home-timeout") {
      setHomePromptDismissed(true);
    }
    setGateVisible(false);
    setGateReason(null);
    void trackAction("AUTH_GATE_DISMISS", routeKey, { reason: gateReason ?? "manual" });
    void trackAnalyticsEvent("auth_gate_dismiss", { page_path: routeKey });
  }, [gateReason, routeKey, trackAction]);

  const openAuthGate = useCallback(() => {
    setAuthError(null);
    if (verificationEmail) {
      setGateReason("email-verification");
    } else {
      setGateReason("manual");
    }
    setGateVisible(true);
    void trackAction("AUTH_GATE_OPEN_MANUAL", routeKey);
    void trackAnalyticsEvent("auth_gate_open_manual", { page_path: routeKey });
  }, [routeKey, trackAction, verificationEmail]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const value = useMemo<AuthGateContextValue>(
    () => ({
      user,
      authReady,
      gateVisible,
      gateReason,
      authError,
      canDismissGate: gateReason === "manual",
      requiresEmailVerification: Boolean(verificationEmail),
      verificationEmail,
      openAuthGate,
      dismissGate,
      signIn,
      signUp,
      resendVerificationEmail,
      refreshVerificationStatus,
      signOutUser,
      clearAuthError,
      trackAction
    }),
    [
      user,
      authReady,
      gateVisible,
      gateReason,
      authError,
      verificationEmail,
      openAuthGate,
      dismissGate,
      signIn,
      signUp,
      resendVerificationEmail,
      refreshVerificationStatus,
      signOutUser,
      clearAuthError,
      trackAction
    ]
  );

  return <AuthGateContext.Provider value={value}>{children}</AuthGateContext.Provider>;
}

export function useAuthGate() {
  const ctx = useContext(AuthGateContext);
  if (!ctx) {
    throw new Error("useAuthGate must be used inside AuthGateProvider");
  }
  return ctx;
}
