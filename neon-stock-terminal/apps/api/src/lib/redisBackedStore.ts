import { createClient, type RedisClientType } from "redis";
import { ServiceDependencyError } from "./serviceDependencyError";

export type RedisStoreMode = "redis" | "memory" | "fail_closed";
export type RedisStoreStatus = "idle" | "ready" | "degraded" | "failed";

export type RedisBackedStoreHealth = {
  name: string;
  mode: RedisStoreMode;
  status: RedisStoreStatus;
  ready: boolean;
  redisConfigured: boolean;
  usingRedis: boolean;
  usingMemoryFallback: boolean;
  lastError: string | null;
};

type RedisClientFactory = (url: string) => RedisClientType;

type RedisBackedStoreOptions = {
  name: string;
  redisUrl: string | null;
  allowMemoryFallback: boolean;
  unavailableCode: string;
  unavailableMessage: string;
  logContext?: Record<string, unknown>;
  clientFactory?: RedisClientFactory;
};

function nowIso() {
  return new Date().toISOString();
}

export function resolveRedisStoreMode({
  redisUrl,
  allowMemoryFallback
}: {
  redisUrl: string | null;
  allowMemoryFallback: boolean;
}): RedisStoreMode {
  if (redisUrl) return "redis";
  return allowMemoryFallback ? "memory" : "fail_closed";
}

function defaultClientFactory(url: string): RedisClientType {
  return createClient({
    url,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: false
    }
  });
}

export class RedisBackedStoreDependency {
  private readonly opts: RedisBackedStoreOptions;
  private readonly clientFactory: RedisClientFactory;
  private readonly mode: RedisStoreMode;
  private redisClient: RedisClientType | null = null;
  private redisConnectPromise: Promise<void> | null = null;
  private health: RedisBackedStoreHealth;

  constructor(opts: RedisBackedStoreOptions) {
    this.opts = opts;
    this.clientFactory = opts.clientFactory ?? defaultClientFactory;
    this.mode = resolveRedisStoreMode({
      redisUrl: opts.redisUrl,
      allowMemoryFallback: opts.allowMemoryFallback
    });
    this.health = {
      name: opts.name,
      mode: this.mode,
      status: this.mode === "memory" ? "degraded" : this.mode === "fail_closed" ? "failed" : "idle",
      ready: this.mode === "memory",
      redisConfigured: !!opts.redisUrl,
      usingRedis: false,
      usingMemoryFallback: this.mode === "memory",
      lastError: this.mode === "fail_closed" ? opts.unavailableMessage : null
    };
    this.logSelection();
  }

  getMode(): RedisStoreMode {
    return this.mode;
  }

  getHealth(): RedisBackedStoreHealth {
    return { ...this.health };
  }

  async ensureReady(): Promise<void> {
    await this.getRedisClient();
  }

  async getRedisClient(): Promise<RedisClientType | null> {
    if (this.mode === "memory") {
      this.health.ready = true;
      this.health.status = "degraded";
      this.health.usingMemoryFallback = true;
      this.health.usingRedis = false;
      return null;
    }

    if (this.mode === "fail_closed" || !this.opts.redisUrl) {
      this.failClosed(this.opts.unavailableMessage);
    }

    if (this.redisClient?.isOpen) {
      this.health.ready = true;
      this.health.status = "ready";
      this.health.usingRedis = true;
      this.health.usingMemoryFallback = false;
      this.health.lastError = null;
      return this.redisClient;
    }

    if (!this.redisClient) {
      this.redisClient = this.clientFactory(this.opts.redisUrl);
      this.redisClient.on("error", (err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.health.lastError = message;
        this.health.ready = false;
        this.health.status = this.mode === "memory" ? "degraded" : "failed";
        this.health.usingRedis = false;
        this.log("redis_error", { error: message });
      });
      this.redisClient.on("end", () => {
        this.health.ready = false;
        this.health.status = this.mode === "memory" ? "degraded" : "failed";
        this.health.usingRedis = false;
        this.log("redis_connection_closed");
      });
    }

    if (!this.redisConnectPromise) {
      this.redisConnectPromise = this.redisClient
        .connect()
        .then(() => {
          this.health.ready = true;
          this.health.status = "ready";
          this.health.usingRedis = true;
          this.health.usingMemoryFallback = false;
          this.health.lastError = null;
          this.log("redis_connected");
        })
        .catch(async (err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.health.lastError = message;

          if (this.opts.allowMemoryFallback) {
            this.health.ready = true;
            this.health.status = "degraded";
            this.health.usingRedis = false;
            this.health.usingMemoryFallback = true;
            this.log("memory_fallback_enabled", { error: message });
            await this.redisClient?.quit().catch(() => undefined);
            this.redisClient = null;
            return;
          }

          await this.redisClient?.quit().catch(() => undefined);
          this.redisClient = null;
          this.failClosed(`${this.opts.unavailableMessage} ${message}`.trim());
        })
        .finally(() => {
          this.redisConnectPromise = null;
        });
    }

    await this.redisConnectPromise;
    if (this.health.usingMemoryFallback) {
      return null;
    }
    if (!this.redisClient?.isOpen) {
      this.failClosed(this.opts.unavailableMessage);
    }
    return this.redisClient;
  }

  private failClosed(message: string): never {
    this.health.ready = false;
    this.health.status = "failed";
    this.health.usingRedis = false;
    this.health.usingMemoryFallback = false;
    this.health.lastError = message;
    this.log("fail_closed", { error: message });
    throw new ServiceDependencyError(this.opts.unavailableCode, this.opts.name, message);
  }

  private logSelection() {
    this.log("store_selected", {
      mode: this.mode,
      redisConfigured: !!this.opts.redisUrl,
      allowMemoryFallback: this.opts.allowMemoryFallback
    });
  }

  private log(event: string, extra?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        ts: nowIso(),
        level: event === "fail_closed" ? "error" : event.includes("error") ? "warn" : "info",
        event: `${this.opts.name}_${event}`,
        store: this.opts.name,
        ...this.opts.logContext,
        ...extra
      })
    );
  }
}
