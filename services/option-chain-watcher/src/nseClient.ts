import { APIRequestContext, request } from 'playwright';
import { DateTime } from 'luxon';
import { Logger } from './logger';

interface ContractInfoResponse {
  expiryDates?: string[];
  strikePrice?: string[];
}

function parseExpiryRaw(exp: string): DateTime {
  // NSE commonly uses dd-MMM-yyyy (e.g. 10-Feb-2026)
  return DateTime.fromFormat(exp.trim(), 'dd-MMM-yyyy', { zone: 'Asia/Kolkata' });
}

export function pickCurrentExpiry(expiries: string[]): string {
  const now = DateTime.now().setZone('Asia/Kolkata').startOf('day');
  const parsed = expiries
    .map(raw => ({ raw, dt: parseExpiryRaw(raw) }))
    .filter(x => x.dt.isValid)
    .sort((a, b) => a.dt.toMillis() - b.dt.toMillis());
  if (!parsed.length) throw new Error('Invalid contract-info: no parseable expiryDates');
  const upcoming = parsed.find(x => x.dt >= now);
  return (upcoming ?? parsed[0]).raw;
}

export function pickExpiryRoles(expiries: string[]): { W0: string; M0: string; alsoNearestWeekly: boolean } {
  const now = DateTime.now().setZone('Asia/Kolkata').startOf('day');
  const parsed = expiries
    .map(raw => ({ raw, dt: parseExpiryRaw(raw) }))
    .filter(x => x.dt.isValid && x.dt >= now)
    .sort((a, b) => a.dt.toMillis() - b.dt.toMillis());
  if (!parsed.length) throw new Error('Invalid contract-info: no future expiryDates');
  const weekly = parsed[0];
  const frontMonth = parsed.filter(item => item.dt.year === weekly.dt.year && item.dt.month === weekly.dt.month);
  const monthly = frontMonth[frontMonth.length - 1] ?? weekly;
  return { W0: weekly.raw, M0: monthly.raw, alsoNearestWeekly: weekly.raw === monthly.raw };
}

export class NseOptionChainClient {
  private api: APIRequestContext | null = null;
  private warmed = false;

  constructor(
    private readonly logger: Logger,
    private readonly opts: { userAgent: string; referer: string },
  ) {}

  private readonly baseURL = 'https://www.nseindia.com';

  private async ensureContext(): Promise<APIRequestContext> {
    if (this.api) return this.api;

    this.api = await request.newContext({
      baseURL: this.baseURL,
      extraHTTPHeaders: {
        'User-Agent': this.opts.userAgent,
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: this.opts.referer,
        Connection: 'keep-alive',
        DNT: '1',
      },
    });

    return this.api;
  }

  private async warmup(): Promise<void> {
    const ctx = await this.ensureContext();
    const res = await ctx.get('/option-chain', { timeout: 30_000 });
    if (!res.ok()) {
      const body = await res.text().catch(() => '');
      throw new Error(`Warmup failed: ${res.status()} ${res.statusText()} :: ${body.slice(0, 200)}`);
    }
    this.warmed = true;
  }

  async fetchExpiryDates(symbol: string): Promise<string[]> {
    const ctx = await this.ensureContext();
    const url = `/api/option-chain-contract-info?symbol=${encodeURIComponent(symbol)}`;
    const res = await ctx.get(url, { timeout: 30_000 });
    if (!res.ok()) {
      const body = await res.text().catch(() => '');
      throw new Error(`Contract-info failed: ${res.status()} ${res.statusText()} :: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as ContractInfoResponse;
    const expiryDates = Array.isArray(json?.expiryDates) ? json.expiryDates : [];
    if (!expiryDates.length) throw new Error('Contract-info missing expiryDates');

    return expiryDates;
  }

  async fetchOptionChainV3(
    symbol: string,
    type: 'Indices' | 'Equity' = 'Indices',
    requestedExpiryRaw?: string,
  ): Promise<{ json: unknown; fetchMs: number; status: number; expiryRaw: string }> {
    const ctx = await this.ensureContext();
    const t0 = Date.now();

    if (!this.warmed) await this.warmup();

    const expiryRaw = requestedExpiryRaw ?? pickCurrentExpiry(await this.fetchExpiryDates(symbol));

    const url = `/api/option-chain-v3?type=${encodeURIComponent(type)}&symbol=${encodeURIComponent(
      symbol,
    )}&expiry=${encodeURIComponent(expiryRaw)}`;

    let res = await ctx.get(url, { timeout: 30_000 });

    // If cookies expire / WAF blocks, retry once after re-warm.
    if (res.status() === 401 || res.status() === 403) {
      this.logger.warn('NSE API rejected request, re-warming cookies and retrying once', { status: res.status() });
      this.warmed = false;
      await this.warmup();
      res = await ctx.get(url, { timeout: 30_000 });
    }

    const fetchMs = Date.now() - t0;
    const status = res.status();

    const text = await res.text().catch(() => '');
    if (!res.ok()) {
      throw new Error(`Option-chain-v3 failed: ${status} ${res.statusText()} :: ${text.slice(0, 200)}`);
    }

    const trimmed = text.trim();
    if (trimmed === '{}' || trimmed === '') {
      // This usually means missing params or a transient block.
      throw new Error(`Option-chain-v3 returned empty JSON for ${symbol} expiry=${expiryRaw}`);
    }

    const json = JSON.parse(text);
    return { json, fetchMs, status, expiryRaw };
  }

  async dispose(): Promise<void> {
    if (this.api) {
      await this.api.dispose();
      this.api = null;
    }
  }
}
