export const CRYPTO_PAIRS = [
  { symbol: "BTCUSDT", coin: "BTC", name: "Bitcoin" },
  { symbol: "ETHUSDT", coin: "ETH", name: "Ethereum" },
  { symbol: "SOLUSDT", coin: "SOL", name: "Solana" },
  { symbol: "XRPUSDT", coin: "XRP", name: "XRP" },
  { symbol: "ADAUSDT", coin: "ADA", name: "Cardano" },
  { symbol: "DOGEUSDT", coin: "DOGE", name: "Dogecoin" },
] as const;
export const CRYPTO_INTERVAL_MS = 300_000;
export type CryptoCandle = {
  openTime: number; closeTime: number; open: number; high: number; low: number; close: number;
  volumeCoin: number; volumeUsdt: number; tradeCount: number;
};

/** Reject malformed data and forming bars; never substitute 24h ticker volume. */
export function parseCryptoCandles(payload: unknown, boundary: number): CryptoCandle[] {
  if (!Array.isArray(payload)) throw new Error("Invalid Binance candle response");
  const result = new Map<number, CryptoCandle>();
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 9) throw new Error("Invalid Binance candle");
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    if (indices.some(i => row[i] == null || row[i] === "" || !Number.isFinite(Number(row[i])))) throw new Error("Missing Binance candle field");
    const [openTime, open, high, low, close, volumeCoin, closeTime, volumeUsdt, tradeCount] = indices.map(i => Number(row[i]));
    if (!Number.isSafeInteger(openTime) || openTime < 0 || openTime % CRYPTO_INTERVAL_MS !== 0
      || closeTime !== openTime + CRYPTO_INTERVAL_MS - 1 || low <= 0 || high < low
      || open < low || open > high || close < low || close > high
      || volumeCoin < 0 || volumeUsdt < 0 || !Number.isSafeInteger(tradeCount) || tradeCount < 0) throw new Error("Invalid Binance candle values");
    if (closeTime >= boundary) continue;
    result.set(openTime, { openTime, closeTime, open, high, low, close, volumeCoin, volumeUsdt, tradeCount });
  }
  return [...result.values()].sort((a, b) => a.openTime - b.openTime);
}

type Cached = { bars: CryptoCandle[]; fetchedAt: number; boundary: number };
export function createCryptoMarket(fetcher: typeof fetch = fetch, clock = Date.now) {
  const cache = new Map<string, Cached>();
  const pending = new Map<string, Promise<Cached>>();
  let blockedUntil = 0;
  async function load(symbol: string, boundary: number): Promise<Cached> {
    const cached = cache.get(symbol);
    if (cached?.boundary === boundary) return cached;
    const inflight = pending.get(symbol);
    if (inflight) return inflight;
    if (clock() < blockedUntil) throw new Error("Binance cooling down");
    const task = (async () => {
      const query = new URLSearchParams({ symbol, interval: "5m", limit: "1000", endTime: String(boundary - 1) });
      const response = await fetcher(`https://data-api.binance.vision/api/v3/klines?${query}`, { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) {
        const retry = Number(response.headers.get("Retry-After"));
        blockedUntil = clock() + (response.status === 418 || response.status === 429 ? Math.max(60, Number.isFinite(retry) ? retry : 60) : 30) * 1000;
        throw new Error("Binance unavailable");
      }
      const bars = parseCryptoCandles(await response.json(), boundary);
      if (!bars.length || bars.at(-1)!.openTime !== boundary - CRYPTO_INTERVAL_MS) throw new Error("Binance latest completed candle unavailable");
      const value = { bars, fetchedAt: clock(), boundary };
      cache.set(symbol, value);
      return value;
    })();
    pending.set(symbol, task);
    try { return await task; } finally { pending.delete(symbol); }
  }
  return async function snapshot() {
    // Small settlement buffer after each UTC five-minute boundary.
    const boundary = Math.floor((clock() - 3000) / CRYPTO_INTERVAL_MS) * CRYPTO_INTERVAL_MS;
    const markets = await Promise.all(CRYPTO_PAIRS.map(async pair => {
      let value: Cached | undefined;
      let error: string | null = null;
      try { value = await load(pair.symbol, boundary); }
      catch { value = cache.get(pair.symbol); error = "Binance data could not be refreshed. Retry shortly."; }
      const bars = value?.bars ?? [];
      const missingIntervals = bars.slice(1).reduce((n, bar, i) => n + Math.max(0, (bar.openTime - bars[i].openTime) / CRYPTO_INTERVAL_MS - 1), 0);
      const state = !bars.length ? "UNAVAILABLE" : error || value!.boundary < boundary ? "STALE" : missingIntervals ? "PARTIAL" : "READY";
      return { ...pair, state, error, missingIntervals, fetchedAt: value ? new Date(value.fetchedAt).toISOString() : null, bars };
    }));
    return { source: "Binance Spot", interval: "5m", priceUnit: "USDT", timezone: "UTC", generatedAt: new Date(clock()).toISOString(), nextRefreshAt: boundary + CRYPTO_INTERVAL_MS + 3000, markets };
  };
}
