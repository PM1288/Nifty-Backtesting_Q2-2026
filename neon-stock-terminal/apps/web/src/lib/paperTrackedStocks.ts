export type AiProviderName = "CLAUDE" | "QWEN" | "DEEPSEEK";

export interface AiTrackedProviderResult {
  provider: AiProviderName;
  model: string;
  status: "PENDING" | "PROCESSING" | "RETRY" | "SUCCEEDED" | "DEAD" | string;
  verdict: string | null;
  confidence: number | null;
  newsSignal: string | null;
  summary: string | null;
  keyDriver: string | null;
  keyRisk: string | null;
  entryView: string | null;
  invalidation: string | null;
  evidence: Array<{ date?: string; publisher?: string; headline?: string; url?: string }>;
  completedAt: string | null;
  durationMs: number | null;
  errorClass: string | null;
  deliveryStatus: string | null;
}

export interface AiTrackedStock {
  evaluationId: string;
  tradeDate: string;
  symbol: string;
  companyName: string | null;
  exchange: string;
  direction: string | null;
  strategyStatus: string | null;
  ofactor: number | null;
  xfactor: number | null;
  referencePrice: number | null;
  sourceDataThrough: string | null;
  historySessionCount: number;
  evaluationStatus: string;
  discoveredAt: string;
  completedAt: string | null;
  sources: Array<{
    strategy?: string;
    runId?: string;
    candidateId?: string;
    slot?: string;
    trigger?: string;
    observedAt?: string;
  }>;
  providers: Partial<Record<AiProviderName, AiTrackedProviderResult>>;
  inputSnapshot: {
    history_30d?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

export interface AiTrackedStocksPayload {
  asOf: string;
  requestedDate: string;
  effectiveDate: string | null;
  usedLatestSession: boolean;
  count: number;
  stocks: AiTrackedStock[];
}

export const AI_PROVIDER_ORDER: AiProviderName[] = ["CLAUDE", "QWEN", "DEEPSEEK"];

export function filterTrackedStocks(stocks: AiTrackedStock[], search: string) {
  const term = search.trim().toUpperCase();
  if (!term) return stocks;
  return stocks.filter((stock) =>
    [stock.symbol, stock.companyName, stock.direction, stock.strategyStatus]
      .some((value) => String(value ?? "").toUpperCase().includes(term))
    || stock.sources.some((source) => String(source.strategy ?? "").toUpperCase().includes(term))
    || AI_PROVIDER_ORDER.some((provider) => {
      const result = stock.providers[provider];
      return [result?.verdict, result?.newsSignal, result?.summary, result?.keyDriver, result?.keyRisk]
        .some((value) => String(value ?? "").toUpperCase().includes(term));
    })
  );
}

const csvCell = (value: unknown) => {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

export function trackedStocksCsv(stocks: AiTrackedStock[]) {
  const header = [
    "trade_date", "symbol", "company_name", "sources", "direction", "strategy_status",
    "ofactor", "xfactor", "reference_price", "history_sessions", "source_data_through",
    ...AI_PROVIDER_ORDER.flatMap((provider) => [
      `${provider.toLowerCase()}_status`, `${provider.toLowerCase()}_verdict`,
      `${provider.toLowerCase()}_confidence`, `${provider.toLowerCase()}_news_signal`,
      `${provider.toLowerCase()}_summary`, `${provider.toLowerCase()}_key_risk`,
      `${provider.toLowerCase()}_delivery_status`,
    ]),
  ];
  const rows = stocks.map((stock) => [
    stock.tradeDate,
    stock.symbol,
    stock.companyName,
    stock.sources.map((source) => source.strategy).filter(Boolean).join("+"),
    stock.direction,
    stock.strategyStatus,
    stock.ofactor,
    stock.xfactor,
    stock.referencePrice,
    stock.historySessionCount,
    stock.sourceDataThrough,
    ...AI_PROVIDER_ORDER.flatMap((provider) => {
      const result = stock.providers[provider];
      return [result?.status, result?.verdict, result?.confidence, result?.newsSignal,
        result?.summary, result?.keyRisk, result?.deliveryStatus];
    }),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
