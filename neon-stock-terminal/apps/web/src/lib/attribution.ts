type AttributionTouch = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  id: string | null;
  sourcePlatform: string | null;
  referrer: string | null;
  capturedAt: string;
};

type StoredAttribution = {
  version: 1;
  expiresAt: number;
  firstTouch: AttributionTouch | null;
  lastTouch: AttributionTouch | null;
};

export type AttributionSnapshot = {
  firstTouch: AttributionTouch | null;
  lastTouch: AttributionTouch | null;
};

export type AttributionPayload = {
  firstTouchSource: string | null;
  firstTouchMedium: string | null;
  firstTouchCampaign: string | null;
  firstTouchContent: string | null;
  firstTouchTerm: string | null;
  firstTouchId: string | null;
  firstTouchSourcePlatform: string | null;
  firstTouchReferrer: string | null;
  lastTouchSource: string | null;
  lastTouchMedium: string | null;
  lastTouchCampaign: string | null;
  lastTouchContent: string | null;
  lastTouchTerm: string | null;
  lastTouchId: string | null;
  lastTouchSourcePlatform: string | null;
  lastTouchReferrer: string | null;
};

const ATTRIBUTION_STORAGE_KEY = "n50.analytics.attribution.v1";
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const TRACKED_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_source_platform"
] as const;

function normalizeToken(value: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed.slice(0, 160) : null;
}

function normalizeReferrer(value: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.slice(0, 600) : null;
}

function safeReadStoredAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed || parsed.version !== 1 || !Number.isFinite(parsed.expiresAt)) {
      window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteStoredAttribution(payload: StoredAttribution) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}

function buildTouchFromWindow(): AttributionTouch {
  const searchParams = new URLSearchParams(window.location.search);
  const referrer = normalizeReferrer(document.referrer || null);
  let referrerUrl: URL | null = null;
  if (referrer) {
    try {
      referrerUrl = new URL(referrer);
    } catch {
      referrerUrl = null;
    }
  }
  const externalReferrer =
    referrerUrl && referrerUrl.origin !== window.location.origin ? referrerUrl.hostname.toLowerCase() : null;

  const source = normalizeToken(searchParams.get("utm_source")) ?? externalReferrer ?? "direct";
  const medium = normalizeToken(searchParams.get("utm_medium")) ?? (externalReferrer ? "referral" : "(none)");

  return {
    source,
    medium,
    campaign: normalizeToken(searchParams.get("utm_campaign")),
    content: normalizeToken(searchParams.get("utm_content")),
    term: normalizeToken(searchParams.get("utm_term")),
    id: normalizeToken(searchParams.get("utm_id")),
    sourcePlatform: normalizeToken(searchParams.get("utm_source_platform")),
    referrer,
    capturedAt: new Date().toISOString()
  };
}

function shouldCaptureTouch(existing: StoredAttribution | null) {
  if (typeof window === "undefined") return false;
  const searchParams = new URLSearchParams(window.location.search);
  const hasUtm = TRACKED_UTM_KEYS.some((key) => searchParams.has(key));
  if (hasUtm) return true;

  if (!existing?.firstTouch) return true;

  let referrer: URL | null = null;
  if (document.referrer) {
    try {
      referrer = new URL(document.referrer, window.location.origin);
    } catch {
      referrer = null;
    }
  }
  return Boolean(referrer && referrer.origin !== window.location.origin);
}

export function captureAttribution(): AttributionSnapshot {
  const existing = safeReadStoredAttribution();
  if (typeof window === "undefined") {
    return {
      firstTouch: existing?.firstTouch ?? null,
      lastTouch: existing?.lastTouch ?? null
    };
  }

  if (!shouldCaptureTouch(existing)) {
    return {
      firstTouch: existing?.firstTouch ?? null,
      lastTouch: existing?.lastTouch ?? null
    };
  }

  const touch = buildTouchFromWindow();
  const next: StoredAttribution = {
    version: 1,
    expiresAt: Date.now() + ATTRIBUTION_TTL_MS,
    firstTouch: existing?.firstTouch ?? touch,
    lastTouch: touch
  };
  safeWriteStoredAttribution(next);
  return {
    firstTouch: next.firstTouch,
    lastTouch: next.lastTouch
  };
}

export function getAttributionSnapshot(): AttributionSnapshot {
  const stored = safeReadStoredAttribution();
  return {
    firstTouch: stored?.firstTouch ?? null,
    lastTouch: stored?.lastTouch ?? null
  };
}

export function getAnalyticsAttributionParams() {
  const snapshot = getAttributionSnapshot();
  return {
    traffic_source: snapshot.lastTouch?.source ?? undefined,
    traffic_medium: snapshot.lastTouch?.medium ?? undefined,
    traffic_campaign: snapshot.lastTouch?.campaign ?? undefined,
    traffic_source_platform: snapshot.lastTouch?.sourcePlatform ?? undefined
  };
}

export function getLeadSource() {
  return getAttributionSnapshot().lastTouch?.source ?? "direct";
}

export function getAttributionPayload(): AttributionPayload {
  const snapshot = getAttributionSnapshot();
  return {
    firstTouchSource: snapshot.firstTouch?.source ?? null,
    firstTouchMedium: snapshot.firstTouch?.medium ?? null,
    firstTouchCampaign: snapshot.firstTouch?.campaign ?? null,
    firstTouchContent: snapshot.firstTouch?.content ?? null,
    firstTouchTerm: snapshot.firstTouch?.term ?? null,
    firstTouchId: snapshot.firstTouch?.id ?? null,
    firstTouchSourcePlatform: snapshot.firstTouch?.sourcePlatform ?? null,
    firstTouchReferrer: snapshot.firstTouch?.referrer ?? null,
    lastTouchSource: snapshot.lastTouch?.source ?? null,
    lastTouchMedium: snapshot.lastTouch?.medium ?? null,
    lastTouchCampaign: snapshot.lastTouch?.campaign ?? null,
    lastTouchContent: snapshot.lastTouch?.content ?? null,
    lastTouchTerm: snapshot.lastTouch?.term ?? null,
    lastTouchId: snapshot.lastTouch?.id ?? null,
    lastTouchSourcePlatform: snapshot.lastTouch?.sourcePlatform ?? null,
    lastTouchReferrer: snapshot.lastTouch?.referrer ?? null
  };
}
