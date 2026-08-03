import test from "node:test";
import assert from "node:assert/strict";
import type { RedisClientType } from "redis";
import { RedisBackedStoreDependency, resolveRedisStoreMode } from "./redisBackedStore";
import { ServiceDependencyError } from "./serviceDependencyError";

function createFakeRedisClient({ connectError }: { connectError?: Error } = {}) {
  const handlers = new Map<string, (error?: unknown) => void>();

  const client = {
    isOpen: false,
    on(event: string, handler: (error?: unknown) => void) {
      handlers.set(event, handler);
      return this;
    },
    async connect() {
      if (connectError) {
        throw connectError;
      }
      this.isOpen = true;
    },
    async quit() {
      this.isOpen = false;
      return "OK";
    }
  };

  return client as unknown as RedisClientType;
}

test("resolveRedisStoreMode prefers redis when a URL exists", () => {
  assert.equal(resolveRedisStoreMode({ redisUrl: "redis://redis:6379/0", allowMemoryFallback: false }), "redis");
});

test("resolveRedisStoreMode allows explicit memory fallback in development paths", () => {
  assert.equal(resolveRedisStoreMode({ redisUrl: null, allowMemoryFallback: true }), "memory");
});

test("resolveRedisStoreMode fails closed without redis or fallback", () => {
  assert.equal(resolveRedisStoreMode({ redisUrl: null, allowMemoryFallback: false }), "fail_closed");
});

test("RedisBackedStoreDependency fails closed when redis connect fails and fallback is disabled", async () => {
  const dependency = new RedisBackedStoreDependency({
    name: "session_store",
    redisUrl: "redis://127.0.0.1:6399/0",
    allowMemoryFallback: false,
    unavailableCode: "SESSION_STORE_UNAVAILABLE",
    unavailableMessage: "Redis-backed session storage is unavailable.",
    clientFactory: () => createFakeRedisClient({ connectError: new Error("ECONNREFUSED test") })
  });

  await assert.rejects(
    dependency.ensureReady(),
    (error: unknown) =>
      error instanceof ServiceDependencyError &&
      error.code === "SESSION_STORE_UNAVAILABLE" &&
      error.message.includes("Redis-backed session storage is unavailable.")
  );

  const health = dependency.getHealth();
  assert.equal(health.ready, false);
  assert.equal(health.status, "failed");
});

test("RedisBackedStoreDependency falls back to memory only when explicitly allowed", async () => {
  const dependency = new RedisBackedStoreDependency({
    name: "rate_limit_store",
    redisUrl: "redis://127.0.0.1:6399/1",
    allowMemoryFallback: true,
    unavailableCode: "RATE_LIMIT_STORE_UNAVAILABLE",
    unavailableMessage: "Redis-backed rate limiting is unavailable.",
    clientFactory: () => createFakeRedisClient({ connectError: new Error("ECONNREFUSED test") })
  });

  await dependency.ensureReady();
  const redisClient = await dependency.getRedisClient();
  const health = dependency.getHealth();

  assert.equal(redisClient, null);
  assert.equal(health.ready, true);
  assert.equal(health.status, "degraded");
  assert.equal(health.usingMemoryFallback, true);
});
