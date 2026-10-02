// Run with the API's tsx against a disposable Redis, never the production cache.
import assert from "node:assert/strict";
import net from "node:net";
import { execFileSync } from "node:child_process";
import type { PrismaClient } from "../../neon-stock-terminal/node_modules/@prisma/client";
import { getStoredSnapshot } from "../../neon-stock-terminal/apps/api/src/lib/dashboardSnapshots";

const name = `n50-cache-check-${process.pid}`;
let started = false;
async function main() {
  const probe = net.createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  // Keep the same port across restarts. No credentials or production volumes.
  execFileSync("docker", ["run", "-d", "--name", name, "-p", `127.0.0.1:${port}:6379`, "redis:7-alpine"], { stdio: "pipe" });
  started = true;
  const binding = execFileSync("docker", ["port", name, "6379"], { encoding: "utf8" }).trim();
  process.env.REDIS_URL = `redis://${binding}`;
  const prisma = { $queryRawUnsafe: async (sql: string) => sql.includes("to_regclass") ? [{ present: true }] : [{
    snapshot_date: "2026-10-01", generated_at: "2026-10-01T10:00:00Z", etag: '"test"',
    payload_json: { price: 100 }, build_ms: 1, meta: {}
  }] } as unknown as PrismaClient;
  await new Promise(r => setTimeout(r, 500));
  const read = () => getStoredSnapshot(prisma, "isolated-recovery-check", "2026-10-01");
  assert.equal((await read()).source, "db");
  assert.equal((await read()).source, "redis");
  execFileSync("docker", ["stop", "-t", "1", name], { stdio: "pipe" });
  assert.equal((await read()).source, "db");
  execFileSync("docker", ["start", name], { stdio: "pipe" });
  await new Promise(r => setTimeout(r, 5500));
  await read();
  const recovered = await read();
  assert.equal(recovered.source, "redis");
  assert.equal(recovered.record?.generatedAt, "2026-10-01T10:00:00.000Z");
  console.log("PASS: Redis hit, outage DB fallback, reconnection, original snapshot timestamp");
}
main().then(() => finish(0), error => { console.error(error); finish(1); });
function finish(code: number) {
  if (started) execFileSync("docker", ["rm", "-f", name], { stdio: "pipe" });
  process.exit(code);
}
