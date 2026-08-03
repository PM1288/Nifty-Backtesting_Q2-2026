import test from "node:test";
import assert from "node:assert/strict";
import {
  allowApiRuntimePerformanceDdl,
  allowDevelopmentInMemoryRateLimitStore,
  allowDevelopmentInMemorySessionStore,
  getDevLocalAuthDisplayName,
  getDevLocalAuthEmail,
  getDevLocalAuthPassword,
  getDisclosuresApiBaseUrl,
  getDisclosuresTimeoutMs,
  isDiscordMarketStreamSchedulerEnabled,
  getFiiReportsApiBaseUrl,
  getFiiReportsTimeoutMs,
  getPublicBoardBriefSlug,
  getPublicMacroBriefSlug,
  isDevLocalAuthEnabled,
  requirePersistentSessionStore,
  requireSharedRateLimitStore
} from "./runtimeConfig";

function withEnv(
  patch: Record<string, string | undefined>,
  run: () => void | Promise<void>
): Promise<void> | void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  try {
    const result = run();
    if (result && typeof (result as Promise<void>).finally === "function") {
      return (result as Promise<void>).finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test("requirePersistentSessionStore only enables in production auth mode", () =>
  withEnv({ NODE_ENV: "production", AUTH_REQUIRED: "1" }, () => {
    assert.equal(requirePersistentSessionStore(), true);
  }));

test("requirePersistentSessionStore stays off outside production", () =>
  withEnv({ NODE_ENV: "development", AUTH_REQUIRED: "1" }, () => {
    assert.equal(requirePersistentSessionStore(), false);
  }));

test("development in-memory session fallback needs explicit flag", () =>
  withEnv({ NODE_ENV: "development", DEV_ALLOW_IN_MEMORY_SESSION_STORE: "1" }, () => {
    assert.equal(allowDevelopmentInMemorySessionStore(), true);
  }));

test("production never enables development session fallback flags", () =>
  withEnv({ NODE_ENV: "production", DEV_ALLOW_IN_MEMORY_SESSION_STORE: "1" }, () => {
    assert.equal(allowDevelopmentInMemorySessionStore(), false);
  }));

test("shared rate limit store is required in production", () =>
  withEnv({ NODE_ENV: "production" }, () => {
    assert.equal(requireSharedRateLimitStore(), true);
  }));

test("development in-memory rate limit fallback needs explicit flag", () =>
  withEnv({ NODE_ENV: "development", DEV_ALLOW_IN_MEMORY_RATE_LIMIT_STORE: "1" }, () => {
    assert.equal(allowDevelopmentInMemoryRateLimitStore(), true);
  }));

test("runtime performance DDL stays off by default", () =>
  withEnv({ N50_API_ALLOW_RUNTIME_PERF_DDL: undefined }, () => {
    assert.equal(allowApiRuntimePerformanceDdl(), false);
  }));

test("runtime performance DDL requires explicit opt-in", () =>
  withEnv({ N50_API_ALLOW_RUNTIME_PERF_DDL: "1" }, () => {
    assert.equal(allowApiRuntimePerformanceDdl(), true);
  }));

test("dev local auth reads its environment contract", () =>
  withEnv(
    {
      DEV_LOCAL_AUTH_ENABLED: "1",
      DEV_LOCAL_AUTH_EMAIL: "admin@nifty50.local",
      DEV_LOCAL_AUTH_PASSWORD: "Admin@12345",
      DEV_LOCAL_AUTH_DISPLAY_NAME: "ESNG Admin"
    },
    () => {
      assert.equal(isDevLocalAuthEnabled(), true);
      assert.equal(getDevLocalAuthEmail(), "admin@nifty50.local");
      assert.equal(getDevLocalAuthPassword(), "Admin@12345");
      assert.equal(getDevLocalAuthDisplayName(), "ESNG Admin");
    }
  ));

test("disclosures API base URL falls back to the internal service", () =>
  withEnv({ NIFTY100_DISCLOSURES_API_BASE_URL: undefined }, () => {
    assert.equal(getDisclosuresApiBaseUrl(), "http://nifty100-disclosures-api:8000");
  }));

test("disclosures timeout accepts explicit positive values", () =>
  withEnv({ NIFTY100_DISCLOSURES_TIMEOUT_MS: "12345" }, () => {
    assert.equal(getDisclosuresTimeoutMs(), 12345);
  }));

test("disclosures timeout falls back on invalid values", () =>
  withEnv({ NIFTY100_DISCLOSURES_TIMEOUT_MS: "invalid" }, () => {
    assert.equal(getDisclosuresTimeoutMs(), 600000);
  }));

test("FII reports API base URL falls back to the internal service", () =>
  withEnv({ NSE_FII_REPORTS_API_BASE_URL: undefined }, () => {
    assert.equal(getFiiReportsApiBaseUrl(), "http://nse-fii-reports-api:8000");
  }));

test("FII reports timeout accepts explicit positive values", () =>
  withEnv({ NSE_FII_REPORTS_TIMEOUT_MS: "45678" }, () => {
    assert.equal(getFiiReportsTimeoutMs(), 45678);
  }));

test("FII reports timeout falls back on invalid values", () =>
  withEnv({ NSE_FII_REPORTS_TIMEOUT_MS: "invalid" }, () => {
    assert.equal(getFiiReportsTimeoutMs(), 600000);
  }));

test("discord stream scheduler is disabled by default", () =>
  withEnv({ N50_DISCORD_STREAM_SCHEDULER_ENABLED: undefined }, () => {
    assert.equal(isDiscordMarketStreamSchedulerEnabled(), false);
  }));

test("discord stream scheduler requires explicit opt-in", () =>
  withEnv({ N50_DISCORD_STREAM_SCHEDULER_ENABLED: "1" }, () => {
    assert.equal(isDiscordMarketStreamSchedulerEnabled(), true);
  }));

test("public board brief slug reads from runtime environment", () =>
  withEnv({ N50_PUBLIC_BOARD_BRIEF_SLUG: "paragmore-secret-slug" }, () => {
    assert.equal(getPublicBoardBriefSlug(), "paragmore-secret-slug");
  }));

test("public macro brief slug falls back to the default random slug", () =>
  withEnv({ N50_PUBLIC_MACRO_BRIEF_SLUG: undefined }, () => {
    assert.equal(getPublicMacroBriefSlug(), "paragmore-4x9k2m7q1v8r6t3d");
  }));

test("public macro brief slug reads from runtime environment", () =>
  withEnv({ N50_PUBLIC_MACRO_BRIEF_SLUG: "paragmore-custom-macro-slug" }, () => {
    assert.equal(getPublicMacroBriefSlug(), "paragmore-custom-macro-slug");
  }));
