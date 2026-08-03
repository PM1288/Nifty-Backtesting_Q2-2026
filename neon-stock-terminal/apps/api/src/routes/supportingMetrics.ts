import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { serveSnapshotRoute } from "../lib/dashboardSnapshots";

type GatewayQuote = {
  code: string;
  label: string;
  value: number | null;
  change_value: number | null;
  change_pct: number | null;
  currency: string;
  unit: string;
  as_of: string | null;
  source: string;
  delayed: boolean;
  provider_symbol: string | null;
  quality: string;
  notes: string[];
  meta: Record<string, unknown>;
};

type GatewayQuotesResponse = {
  ok: boolean;
  generated_at: string;
  items: GatewayQuote[];
  errors: Array<{ code: string; error: string }>;
};

type GatewayHealthResponse = {
  ok: boolean;
  generated_at: string;
  service: string;
  version: string;
  fred_key_configured: boolean;
  cache_entries: number;
};

type GatewayCatalogResponse = {
  generated_at: string;
  supported_codes: Record<string, string>;
  default_codes: string[];
};

type SupportingMetricsQuote = {
  code: string;
  label: string;
  value: number | null;
  changeValue: number | null;
  changePct: number | null;
  currency: string;
  unit: string;
  asOf: string | null;
  source: string;
  delayed: boolean;
  providerSymbol: string | null;
  quality: string;
  notes: string[];
  meta: Record<string, unknown>;
  description: string | null;
};

const SUPPORTING_METRICS_API_BASE_URL = (
  process.env.SUPPORTING_METRICS_API_BASE_URL ?? "http://market-data-gateway:8000"
).replace(/\/$/, "");
const SUPPORTING_METRICS_TIMEOUT_MS = Number(process.env.SUPPORTING_METRICS_TIMEOUT_MS ?? 15_000);

function resolveGatewayUrl(pathname: string) {
  return `${SUPPORTING_METRICS_API_BASE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function fetchGatewayJson<T>(pathname: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPPORTING_METRICS_TIMEOUT_MS);

  try {
    const res = await fetch(resolveGatewayUrl(pathname), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 240);
      throw new Error(`Gateway ${res.status} on ${pathname}: ${detail}`);
    }

    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gateway timeout on ${pathname}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function toGatewayError(scope: string, error: unknown) {
  return {
    scope,
    message: error instanceof Error ? error.message : String(error)
  };
}

function normalizeQuote(
  item: GatewayQuote,
  supportedDescriptions: Record<string, string>
): SupportingMetricsQuote {
  return {
    code: item.code,
    label: item.label,
    value: typeof item.value === "number" ? item.value : null,
    changeValue: typeof item.change_value === "number" ? item.change_value : null,
    changePct: typeof item.change_pct === "number" ? item.change_pct : null,
    currency: item.currency,
    unit: item.unit,
    asOf: item.as_of ?? null,
    source: item.source,
    delayed: Boolean(item.delayed),
    providerSymbol: item.provider_symbol ?? null,
    quality: item.quality,
    notes: Array.isArray(item.notes)
      ? item.notes.filter((note) => typeof note === "string" && note.trim().length > 0)
      : [],
    meta: item.meta && typeof item.meta === "object" ? item.meta : {},
    description: supportedDescriptions[item.code] ?? null
  };
}

function countByPredicate(
  items: SupportingMetricsQuote[],
  predicate: (item: SupportingMetricsQuote) => boolean
) {
  return items.reduce((total, item) => total + (predicate(item) ? 1 : 0), 0);
}

export async function getSupportingMetricsSnapshot() {
  const [healthResult, catalogResult, primaryResult, indicesResult] = await Promise.allSettled([
    fetchGatewayJson<GatewayHealthResponse>("/health"),
    fetchGatewayJson<GatewayCatalogResponse>("/catalog"),
    fetchGatewayJson<GatewayQuotesResponse>("/quotes"),
    fetchGatewayJson<GatewayQuotesResponse>("/global-indices")
  ]);

  const errors: Array<{ scope: string; message: string }> = [];

  const catalog =
    catalogResult.status === "fulfilled"
      ? catalogResult.value
      : {
          generated_at: new Date().toISOString(),
          supported_codes: {},
          default_codes: []
        };
  if (catalogResult.status === "rejected") {
    errors.push(toGatewayError("catalog", catalogResult.reason));
  }

  const health =
    healthResult.status === "fulfilled"
      ? healthResult.value
      : {
          ok: false,
          generated_at: new Date().toISOString(),
          service: "market-data-gateway",
          version: "unknown",
          fred_key_configured: false,
          cache_entries: 0
        };
  if (healthResult.status === "rejected") {
    errors.push(toGatewayError("health", healthResult.reason));
  }

  const primaryGatewayResponse =
    primaryResult.status === "fulfilled"
      ? primaryResult.value
      : {
          ok: false,
          generated_at: new Date().toISOString(),
          items: [],
          errors: []
        };
  if (primaryResult.status === "rejected") {
    errors.push(toGatewayError("primary_metrics", primaryResult.reason));
  } else {
    errors.push(...primaryGatewayResponse.errors.map((item) => ({ scope: item.code, message: item.error })));
  }

  const globalIndicesGatewayResponse =
    indicesResult.status === "fulfilled"
      ? indicesResult.value
      : {
          ok: false,
          generated_at: new Date().toISOString(),
          items: [],
          errors: []
        };
  if (indicesResult.status === "rejected") {
    errors.push(toGatewayError("global_indices", indicesResult.reason));
  } else {
    errors.push(...globalIndicesGatewayResponse.errors.map((item) => ({ scope: item.code, message: item.error })));
  }

  const primaryMetrics = primaryGatewayResponse.items.map((item) =>
    normalizeQuote(item, catalog.supported_codes)
  );
  const globalIndices = globalIndicesGatewayResponse.items.map((item) =>
    normalizeQuote(item, catalog.supported_codes)
  );
  const allItems = [...primaryMetrics, ...globalIndices];

  return {
    asOf: new Date().toISOString(),
    gateway: {
      ok: health.ok && errors.length === 0,
      generatedAt: health.generated_at,
      service: health.service,
      version: health.version,
      fredKeyConfigured: health.fred_key_configured,
      cacheEntries: health.cache_entries
    },
    summary: {
      primaryCount: primaryMetrics.length,
      globalIndexCount: globalIndices.length,
      delayedCount: countByPredicate(allItems, (item) => item.delayed),
      officialCount: countByPredicate(allItems, (item) => /official/i.test(item.quality)),
      approximateCount: countByPredicate(allItems, (item) => /approx/i.test(item.quality)),
      errorCount: errors.length
    },
    defaultCodes: catalog.default_codes,
    supportedDescriptions: catalog.supported_codes,
    primaryMetrics,
    globalIndices,
    errors
  };
}

export function registerSupportingMetrics(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/supporting-metrics", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "analytics-supporting-metrics",
      cacheControl: "private, max-age=90, stale-while-revalidate=180",
      freshnessMs: 90_000,
      build: getSupportingMetricsSnapshot
    })
  );
}
