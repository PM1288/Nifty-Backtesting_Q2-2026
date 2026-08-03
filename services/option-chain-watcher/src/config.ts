export interface AppConfig {
  pollEveryMs: number;
  symbol: string;
  strikesAround: number;
  keepRaw: boolean;
  userAgent: string;
  referer: string;
  riskFreeRate: number;
  dividendYield: number;
  cleanupMinDays: number;
  cleanupEnabled: boolean;
  cleanupWindowStartHourIst: number;
  cleanupWindowEndHourIst: number;
  healthPort: number;
  pollJitterMsMax: number;
  runMigrationsOnStart: boolean;
  screenshotEnabled: boolean;
  screenshotTtlMs: number;
  screenshotUrl: string;
}

function envInt(name: string, dflt: number): number {
  const v = process.env[name];
  if (!v) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function envFloat(name: string, dflt: number): number {
  const v = process.env[name];
  if (!v) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function envBool(name: string, dflt: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return dflt;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function envStr(name: string, dflt: string): string {
  return process.env[name] ? String(process.env[name]) : dflt;
}

export function loadConfig(): AppConfig {
  return {
    pollEveryMs: envInt('NSE_OC_POLL_EVERY_MS', 120_000),
    symbol: envStr('NSE_OC_SYMBOL', 'NIFTY'),
    strikesAround: envInt('NSE_OC_STRIKES_AROUND', 6),
    keepRaw: envBool('NSE_OC_KEEP_RAW', false),
    userAgent: envStr(
      'NSE_USER_AGENT',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    ),
    referer: envStr(
      'NSE_REFERER',
      'https://www.nseindia.com/option-chain',
    ),
    // Greeks inputs
    riskFreeRate: envFloat('NSE_OC_RISK_FREE_RATE', 0.06),
    dividendYield: envFloat('NSE_OC_DIVIDEND_YIELD', 0.0),
    cleanupMinDays: envInt('NSE_OC_CLEANUP_MIN_DAYS', 14),
    cleanupEnabled: envBool('NSE_OC_CLEANUP_ENABLED', true),
    cleanupWindowStartHourIst: envInt('NSE_OC_CLEANUP_WINDOW_START_IST_HOUR', 6),
    cleanupWindowEndHourIst: envInt('NSE_OC_CLEANUP_WINDOW_END_IST_HOUR', 12),
    healthPort: envInt('NSE_OC_HEALTH_PORT', 18182),
    pollJitterMsMax: envInt('NSE_OC_POLL_JITTER_MS_MAX', 0),
    runMigrationsOnStart: envBool('NSE_OC_RUN_MIGRATIONS_ON_START', false),
    screenshotEnabled: envBool('NSE_OC_SCREENSHOT_ENABLED', false),
    screenshotTtlMs: envInt('NSE_OC_SCREENSHOT_TTL_MS', 300_000),
    screenshotUrl: envStr('NSE_OC_SCREENSHOT_URL', 'https://www.nseindia.com/option-chain'),
  };
}
