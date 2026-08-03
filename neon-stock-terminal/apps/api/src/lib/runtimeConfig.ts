function firstNonEmpty(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? "").trim() === "production";
}

export function isAuthRequired(): boolean {
  return process.env.AUTH_REQUIRED === "1";
}

export function isDevLocalAuthEnabled(): boolean {
  return process.env.DEV_LOCAL_AUTH_ENABLED === "1";
}

export function getFirebaseWebApiKey(): string | null {
  return firstNonEmpty(process.env.FIREBASE_WEB_API_KEY, process.env.FIREBASE_API_KEY);
}

export function getDevLocalAuthEmail(): string | null {
  return firstNonEmpty(process.env.DEV_LOCAL_AUTH_EMAIL);
}

export function getDevLocalAuthPassword(): string | null {
  return firstNonEmpty(process.env.DEV_LOCAL_AUTH_PASSWORD);
}

export function getDevLocalAuthDisplayName(): string | null {
  return firstNonEmpty(process.env.DEV_LOCAL_AUTH_DISPLAY_NAME);
}

export function getFeedbackSigningSecret(): string | null {
  return firstNonEmpty(process.env.FEEDBACK_SIGNING_SECRET);
}

export function getSnapshotRefreshToken(): string | null {
  return firstNonEmpty(process.env.SNAPSHOT_REFRESH_TOKEN);
}

export function getSessionRedisUrl(): string | null {
  return firstNonEmpty(process.env.SESSION_REDIS_URL, process.env.REDIS_URL);
}

export function getRateLimitRedisUrl(): string | null {
  return firstNonEmpty(process.env.RATE_LIMIT_REDIS_URL, process.env.REDIS_URL);
}

export function requirePersistentSessionStore(): boolean {
  return isProductionEnv() && isAuthRequired();
}

export function allowDevelopmentInMemorySessionStore(): boolean {
  return !isProductionEnv() && process.env.DEV_ALLOW_IN_MEMORY_SESSION_STORE === "1";
}

export function requireSharedRateLimitStore(): boolean {
  return isProductionEnv();
}

export function allowDevelopmentInMemoryRateLimitStore(): boolean {
  return !isProductionEnv() && process.env.DEV_ALLOW_IN_MEMORY_RATE_LIMIT_STORE === "1";
}

export function allowApiRuntimeDdl(): boolean {
  return process.env.N50_API_ALLOW_RUNTIME_DDL === "1";
}

export function allowApiRuntimePerformanceDdl(): boolean {
  return process.env.N50_API_ALLOW_RUNTIME_PERF_DDL === "1";
}

export function getDisclosuresApiBaseUrl(): string {
  return firstNonEmpty(process.env.NIFTY100_DISCLOSURES_API_BASE_URL, "http://nifty100-disclosures-api:8000")!;
}

export function getDisclosuresTimeoutMs(): number {
  const raw = firstNonEmpty(process.env.NIFTY100_DISCLOSURES_TIMEOUT_MS);
  if (!raw) return 600_000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600_000;
}

export function getFiiReportsApiBaseUrl(): string {
  return firstNonEmpty(process.env.NSE_FII_REPORTS_API_BASE_URL, "http://nse-fii-reports-api:8000")!;
}

export function getFiiReportsTimeoutMs(): number {
  const raw = firstNonEmpty(process.env.NSE_FII_REPORTS_TIMEOUT_MS);
  if (!raw) return 600_000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600_000;
}

export function isDiscordMarketStreamEnabled(): boolean {
  return process.env.N50_DISCORD_STREAM_ENABLED === "1";
}

export function isDiscordMarketStreamSchedulerEnabled(): boolean {
  return process.env.N50_DISCORD_STREAM_SCHEDULER_ENABLED === "1";
}

export function isDiscordMarketStreamShadowMode(): boolean {
  return process.env.N50_DISCORD_STREAM_SHADOW_MODE === "1";
}

export function useDiscordMarketStreamWait(): boolean {
  return process.env.N50_DISCORD_STREAM_USE_WAIT !== "0";
}

export function getDiscordMarketStreamIntervalSeconds(): number {
  const raw = firstNonEmpty(process.env.N50_DISCORD_STREAM_INTERVAL_SECONDS);
  if (!raw) return 1800;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1800;
}

export function getDiscordMarketStreamCooldownMinutes(): number {
  const raw = firstNonEmpty(process.env.N50_DISCORD_STREAM_COOLDOWN_MINUTES);
  if (!raw) return 180;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180;
}

export function getDiscordMarketStreamWebhookUrl(target: "test" | "prod"): string | null {
  return target === "prod"
    ? firstNonEmpty(process.env.N50_DISCORD_WEBHOOK_URL_PROD)
    : firstNonEmpty(process.env.N50_DISCORD_WEBHOOK_URL_TEST);
}

export function getDiscordMarketStreamTargetThreadId(target: "test" | "prod"): string | null {
  return target === "prod"
    ? firstNonEmpty(process.env.N50_DISCORD_THREAD_ID_PROD, process.env.N50_DISCORD_THREAD_ID_MARKET)
    : firstNonEmpty(process.env.N50_DISCORD_THREAD_ID_TEST, process.env.N50_DISCORD_THREAD_ID_MARKET);
}

export function getPublicBoardBriefSlug(): string | null {
  return firstNonEmpty(process.env.N50_PUBLIC_BOARD_BRIEF_SLUG);
}

export function getPublicMacroBriefSlug(): string | null {
  return firstNonEmpty(process.env.N50_PUBLIC_MACRO_BRIEF_SLUG, "paragmore-4x9k2m7q1v8r6t3d");
}

export function validateApiRuntimeEnv(): void {
  const missing: string[] = [];

  if (isAuthRequired() && !getFirebaseWebApiKey() && !isDevLocalAuthEnabled()) {
    missing.push("FIREBASE_WEB_API_KEY (or FIREBASE_API_KEY) when AUTH_REQUIRED=1");
  }

  if (isDevLocalAuthEnabled() && !getDevLocalAuthEmail()) {
    missing.push("DEV_LOCAL_AUTH_EMAIL when DEV_LOCAL_AUTH_ENABLED=1");
  }

  if (isDevLocalAuthEnabled() && !getDevLocalAuthPassword()) {
    missing.push("DEV_LOCAL_AUTH_PASSWORD when DEV_LOCAL_AUTH_ENABLED=1");
  }

  if (requirePersistentSessionStore() && !getSessionRedisUrl()) {
    missing.push("SESSION_REDIS_URL (or REDIS_URL) when AUTH_REQUIRED=1 in production");
  }

  if (requireSharedRateLimitStore() && !getRateLimitRedisUrl()) {
    missing.push("RATE_LIMIT_REDIS_URL (or REDIS_URL) in production");
  }

  if (isProductionEnv() && !getFeedbackSigningSecret()) {
    missing.push("FEEDBACK_SIGNING_SECRET in production");
  }

  if (isProductionEnv() && !getSnapshotRefreshToken()) {
    missing.push("SNAPSHOT_REFRESH_TOKEN in production");
  }

  if (missing.length === 0) return;

  throw new Error(
    `Missing required runtime configuration: ${missing.join("; ")}. See docs/security/secrets-and-config.md`
  );
}
