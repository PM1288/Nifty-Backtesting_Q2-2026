import type { Request, RequestHandler, Response } from "express";
import { RedisBackedStoreDependency, type RedisBackedStoreHealth } from "../lib/redisBackedStore";
import {
  allowDevelopmentInMemoryRateLimitStore,
  getRateLimitRedisUrl,
  requireSharedRateLimitStore
} from "../lib/runtimeConfig";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  name: string;
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
  code?: string;
  message?: string;
};

type RateLimitCounter = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT_PREFIX = "n50:rl:";

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

const rateLimitStore = new RedisBackedStoreDependency({
  name: "rate_limit_store",
  redisUrl: getRateLimitRedisUrl(),
  allowMemoryFallback: allowDevelopmentInMemoryRateLimitStore(),
  unavailableCode: "RATE_LIMIT_STORE_UNAVAILABLE",
  unavailableMessage: "Redis-backed rate limiting is unavailable.",
  logContext: {
    productionRequired: requireSharedRateLimitStore()
  }
});

function setRateHeaders(res: Response, limit: number, remaining: number, resetAt: number) {
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("X-RateLimit-Reset", String(Math.max(0, Math.ceil(resetAt / 1000))));
}

function defaultKeyGenerator(req: Request) {
  if (typeof req.ip === "string" && req.ip.length > 0) {
    return req.ip;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function nextMemoryCounter(buckets: Map<string, Bucket>, key: string, windowMs: number): RateLimitCounter {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + windowMs
    };
    buckets.set(key, next);
    return next;
  }

  bucket.count += 1;
  return bucket;
}

async function nextRedisCounter(
  redis: Awaited<ReturnType<typeof rateLimitStore.getRedisClient>>,
  limiterName: string,
  key: string,
  windowMs: number
): Promise<RateLimitCounter> {
  if (!redis) {
    throw new Error("Redis client is required for Redis counter increment.");
  }
  const redisKey = `${RATE_LIMIT_PREFIX}${limiterName}:${key}`;
  const result = (await redis.eval(RATE_LIMIT_SCRIPT, {
    keys: [redisKey],
    arguments: [String(windowMs)]
  })) as Array<number | string>;

  const count = Number(result[0] ?? 0);
  const ttlMs = Math.max(1, Number(result[1] ?? windowMs));
  return {
    count,
    resetAt: Date.now() + ttlMs
  };
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const keyGenerator = options.keyGenerator ?? defaultKeyGenerator;
  const code = options.code ?? "RATE_LIMITED";
  const message = options.message ?? "Too many requests. Please try again later.";
  const buckets = new Map<string, Bucket>();
  let lastSweepAt = 0;

  return (req, res, next) => {
    void (async () => {
      const key = keyGenerator(req);
      let counter: RateLimitCounter;
      const redis = await rateLimitStore.getRedisClient();

      if (!redis) {
        const now = Date.now();
        if (now - lastSweepAt >= options.windowMs) {
          for (const [bucketKey, bucket] of buckets) {
            if (bucket.resetAt <= now) {
              buckets.delete(bucketKey);
            }
          }
          lastSweepAt = now;
        }
        counter = nextMemoryCounter(buckets, key, options.windowMs);
      } else {
        counter = await nextRedisCounter(redis, options.name, key, options.windowMs);
      }

      const remaining = Math.max(0, options.max - counter.count);
      setRateHeaders(res, options.max, remaining, counter.resetAt);

      if (counter.count <= options.max) {
        next();
        return;
      }

      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((counter.resetAt - Date.now()) / 1000))));
      res.status(429).json({
        error: {
          code,
          message
        }
      });
    })().catch(next);
  };
}

export async function ensureRateLimitStoreReady(): Promise<void> {
  await rateLimitStore.ensureReady();
}

export function getRateLimitStoreHealth(): RedisBackedStoreHealth {
  return rateLimitStore.getHealth();
}

export const authLoginRateLimiter = createRateLimiter({
  name: "auth_login",
  windowMs: 5 * 60_000,
  max: 20,
  code: "AUTH_RATE_LIMITED",
  message: "Too many login attempts. Please wait and try again."
});

export const authSignupRateLimiter = createRateLimiter({
  name: "auth_signup",
  windowMs: 15 * 60_000,
  max: 10,
  code: "AUTH_SIGNUP_RATE_LIMITED",
  message: "Too many signup attempts. Please wait and try again."
});

export const feedbackChallengeRateLimiter = createRateLimiter({
  name: "feedback_challenge",
  windowMs: 10 * 60_000,
  max: 30,
  code: "FEEDBACK_CHALLENGE_RATE_LIMITED",
  message: "Please wait a moment before opening another feedback form."
});

export const feedbackSubmitBurstLimiter = createRateLimiter({
  name: "feedback_submit_burst",
  windowMs: 15 * 60_000,
  max: 3,
  code: "FEEDBACK_SUBMIT_RATE_LIMITED",
  message: "Too many feedback submissions from this connection. Please wait a little and try again."
});

export const feedbackSubmitDailyLimiter = createRateLimiter({
  name: "feedback_submit_daily",
  windowMs: 24 * 60 * 60_000,
  max: 12,
  code: "FEEDBACK_DAILY_LIMIT_REACHED",
  message: "Feedback submission limit reached for today. Please try again tomorrow."
});

export const internalRefreshRateLimiter = createRateLimiter({
  name: "internal_snapshot_refresh",
  windowMs: 5 * 60_000,
  max: 6,
  code: "SNAPSHOT_REFRESH_RATE_LIMITED",
  message: "Too many snapshot refresh requests. Please wait and try again."
});
