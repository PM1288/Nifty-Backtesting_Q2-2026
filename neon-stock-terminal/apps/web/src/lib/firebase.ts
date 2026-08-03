import type { FirebaseApp } from "firebase/app";
import type { Analytics } from "firebase/analytics";
import type { Auth, User } from "firebase/auth";
import type { Database } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || "",
  authDomain: "nifty50-2day.firebaseapp.com",
  databaseURL: "https://nifty50-2day-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nifty50-2day",
  storageBucket: "nifty50-2day.firebasestorage.app",
  messagingSenderId: "327237980774",
  appId: "1:327237980774:web:d58cd8f38fc30efdf193a7",
  measurementId: "G-K82ZDQ7XYN"
};

function isUsableFirebaseApiKey(apiKey: string) {
  const normalized = apiKey.trim();
  if (!normalized) return false;
  return normalized !== "EXAMPLE_ONLY_NOT_REAL";
}

export function isFirebaseAuthConfigured() {
  return isUsableFirebaseApiKey(firebaseConfig.apiKey);
}

type FirebaseDatabaseApi = {
  db: Database;
  get: typeof import("firebase/database").get;
  push: typeof import("firebase/database").push;
  ref: typeof import("firebase/database").ref;
  set: typeof import("firebase/database").set;
};

let appPromise: Promise<FirebaseApp> | null = null;
let authPromise: Promise<Auth> | null = null;
let databaseApiPromise: Promise<FirebaseDatabaseApi> | null = null;
let analyticsPromise: Promise<Analytics | null> | null = null;

function getEmailVerificationActionSettings() {
  if (typeof window === "undefined") return null;

  const configuredUrl = import.meta.env.VITE_FIREBASE_AUTH_CONTINUE_URL?.trim();
  const fallbackPath = import.meta.env.BASE_URL || "/";
  const fallbackUrl = new URL(fallbackPath, window.location.origin).toString();

  return {
    url: configuredUrl || fallbackUrl,
    handleCodeInApp: false
  };
}

async function getFirebaseApp() {
  if (!isFirebaseAuthConfigured()) {
    throw new Error("VITE_FIREBASE_API_KEY is required for Firebase auth flows.");
  }
  if (!appPromise) {
    appPromise = import("firebase/app").then((mod) =>
      mod.getApps().length ? mod.getApp() : mod.initializeApp(firebaseConfig)
    );
  }
  return appPromise;
}

export async function getFirebaseAuth() {
  if (!authPromise) {
    authPromise = (async () => {
      const app = await getFirebaseApp();
      const authMod = await import("firebase/auth");
      const auth = authMod.getAuth(app);
      if (typeof window !== "undefined") {
        auth.languageCode = navigator.language || "en";
        void authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(() => {
          // Best effort; auth still works with default persistence.
        });
      }
      return auth;
    })();
  }
  return authPromise;
}

export async function setFirebasePreferredLanguage(language: string) {
  const auth = await getFirebaseAuth();
  auth.languageCode = language || "en";
}

export async function getCurrentFirebaseUser() {
  const auth = await getFirebaseAuth();
  return auth.currentUser;
}

export async function subscribeToFirebaseAuthStateChanged(callback: (user: User | null) => void) {
  const auth = await getFirebaseAuth();
  const authMod = await import("firebase/auth");
  return authMod.onAuthStateChanged(auth, callback);
}

export async function signInWithFirebaseEmailAndPassword(email: string, password: string) {
  const auth = await getFirebaseAuth();
  const authMod = await import("firebase/auth");
  return authMod.signInWithEmailAndPassword(auth, email, password);
}

export async function createFirebaseUserWithEmailAndPassword(email: string, password: string) {
  const auth = await getFirebaseAuth();
  const authMod = await import("firebase/auth");
  return authMod.createUserWithEmailAndPassword(auth, email, password);
}

export async function updateFirebaseUserProfile(user: User, profile: { displayName?: string | null }) {
  const authMod = await import("firebase/auth");
  return authMod.updateProfile(user, profile);
}

export async function sendFirebaseEmailVerification(user: User) {
  const authMod = await import("firebase/auth");
  const actionCodeSettings = getEmailVerificationActionSettings();
  if (!actionCodeSettings) {
    return authMod.sendEmailVerification(user);
  }

  try {
    return await authMod.sendEmailVerification(user, actionCodeSettings);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";

    if (
      code === "auth/invalid-continue-uri" ||
      code === "auth/missing-continue-uri" ||
      code === "auth/unauthorized-continue-uri"
    ) {
      return authMod.sendEmailVerification(user);
    }

    throw error;
  }
}

export async function reloadFirebaseUser(user: User) {
  const authMod = await import("firebase/auth");
  return authMod.reload(user);
}

export async function signOutFirebaseUser() {
  const auth = await getFirebaseAuth();
  const authMod = await import("firebase/auth");
  return authMod.signOut(auth);
}

export async function getFirebaseDatabaseApi() {
  if (!databaseApiPromise) {
    databaseApiPromise = (async () => {
      const app = await getFirebaseApp();
      const dbMod = await import("firebase/database");
      return {
        db: dbMod.getDatabase(app),
        get: dbMod.get,
        push: dbMod.push,
        ref: dbMod.ref,
        set: dbMod.set
      };
    })();
  }
  return databaseApiPromise;
}

export async function deleteFirebaseUser(user: User) {
  const authMod = await import("firebase/auth");
  return authMod.deleteUser(user);
}

export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      const app = await getFirebaseApp();
      const analyticsMod = await import("firebase/analytics");
      const supported = await analyticsMod.isSupported().catch(() => false);
      return supported ? analyticsMod.getAnalytics(app) : null;
    })().catch(() => null);
  }

  return analyticsPromise;
}
