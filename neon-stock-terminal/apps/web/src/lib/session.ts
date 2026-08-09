import type { SessionState, SessionUser } from "./types";
import type { IndianMobileProfile } from "./mobile";
import type { AttributionPayload } from "./attribution";

const FALLBACK_API_BASE = "";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? FALLBACK_API_BASE;

let csrfToken: string | null = null;

function setCsrfToken(nextToken: string | null | undefined) {
  csrfToken = typeof nextToken === "string" && nextToken.trim().length > 0 ? nextToken.trim() : null;
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    throw new Error(`API ${res.status}: Empty response`);
  }
  return JSON.parse(text) as T;
}

function dispatchSessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("n50:session-changed"));
}

export function getSessionCsrfToken() {
  return csrfToken;
}

export async function fetchSessionState(): Promise<SessionState> {
  const res = await fetch(`${API_BASE_URL}/auth/session`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" }
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: Unable to fetch session.`);
  }

  const payload = (await parseJson<SessionState>(res)) ?? { authenticated: false, user: null, csrfToken: null };
  setCsrfToken(payload.csrfToken ?? null);
  return payload;
}

export async function createServerSession(idToken: string): Promise<{ user: SessionUser; csrfToken: string | null }> {
  const res = await fetch(`${API_BASE_URL}/auth/session/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ idToken })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  const payload = await parseJson<{ authenticated: boolean; user: SessionUser; csrfToken: string | null }>(res);
  setCsrfToken(payload.csrfToken ?? null);
  dispatchSessionChanged();
  return {
    user: payload.user,
    csrfToken
  };
}

export async function createDevServerSession(
  identifier: string,
  password: string
): Promise<{ user: SessionUser; csrfToken: string | null }> {
  const res = await fetch(`${API_BASE_URL}/auth/session/dev-login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ identifier, password })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  const payload = await parseJson<{ authenticated: boolean; user: SessionUser; csrfToken: string | null }>(res);
  setCsrfToken(payload.csrfToken ?? null);
  dispatchSessionChanged();
  return {
    user: payload.user,
    csrfToken
  };
}

export async function refreshCsrfToken(): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/auth/csrf`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!res.ok) return null;

  const payload = await parseJson<{ csrfToken?: string | null }>(res);
  setCsrfToken(payload.csrfToken ?? null);
  return csrfToken;
}

export async function destroyServerSession() {
  const doLogout = async () => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
    return fetch(`${API_BASE_URL}/auth/session/logout`, {
      method: "POST",
      credentials: "include",
      headers,
      body: "{}"
    });
  };

  let res = await doLogout();
  if (res.status === 403) {
    await refreshCsrfToken().catch(() => null);
    res = await doLogout();
  }

  setCsrfToken(null);
  dispatchSessionChanged();

  if (!res.ok && res.status !== 401) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
}

export async function createSignupProfile(
  idToken: string,
  payload: {
    displayName: string;
    mobile: IndianMobileProfile;
    attribution: AttributionPayload;
  }
) {
  const res = await fetch(`${API_BASE_URL}/auth/profile/signup`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      idToken,
      displayName: payload.displayName,
      mobileCanonical: payload.mobile.canonical,
      mobileNational: payload.mobile.national,
      mobileRawInput: payload.mobile.rawInput,
      mobileRiskScore: payload.mobile.riskScore,
      mobileRiskFlags: payload.mobile.riskFlags,
      attribution: payload.attribution
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return parseJson<{ ok: true }>(res);
}
