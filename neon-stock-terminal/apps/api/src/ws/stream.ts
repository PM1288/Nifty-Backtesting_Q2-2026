import type http from "http";
import { latestRead } from "./latestRead";
import type { Duplex } from "stream";
import { Prisma, type PrismaClient } from "@prisma/client";
import { WebSocketServer, type WebSocket } from "ws";
import { marketDayKeyUtc, marketDayStartUtc } from "../lib/time";
import { toNumber } from "../lib/num";
import type { AuthenticatedUser } from "../auth/guard";

type LiveQuote = {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  timestamp: string;
  sequence?: number;
};

type StackUniverseRow = {
  symbol_token: string;
  tradingsymbol: string;
  symbol: string;
};

type StackStateRow = {
  symbol_token: string;
  last_price: number | null;
  last_close: number | null;
  net_change: number | null;
  percent_change: number | null;
  last_seen_ts: Date | string | null;
};

function isMissingRelationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("p2021") || msg.includes("42p01");
}

function toIso(ts: Date | string | null | undefined): string {
  if (!ts) return new Date().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

type UpgradeAuthenticator = (req: http.IncomingMessage, url: URL) => Promise<AuthenticatedUser | null>;

function getAuthErrorDetails(err: unknown): { status: number; code: string; message: string } {
  if (err && typeof err === "object") {
    const detail = err as Record<string, unknown>;
    const maybeStatus = Number(detail.status);
    const maybeCode = detail.code;
    const maybeMessage = detail.message;
    if (Number.isFinite(maybeStatus) && maybeStatus >= 400 && maybeStatus < 600) {
      return {
        status: maybeStatus,
        code: typeof maybeCode === "string" && maybeCode.trim().length > 0 ? maybeCode : "AUTH_FAILED",
        message:
          typeof maybeMessage === "string" && maybeMessage.trim().length > 0 ? maybeMessage : "Unauthorized"
      };
    }
  }
  return { status: 401, code: "AUTH_FAILED", message: "Unauthorized" };
}

function rejectUpgrade(socket: Duplex, status: number, code: string, message: string) {
  const body = JSON.stringify({ error: { code, message } });
  const reason = status === 503 ? "Service Unavailable" : "Unauthorized";
  socket.write(
    `HTTP/1.1 ${status} ${reason}\r\n` +
      "Content-Type: application/json\r\n" +
      "Connection: close\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n` +
      body
  );
  socket.destroy();
}

export function attachStreamServer(server: http.Server, prisma: PrismaClient, authenticateUpgrade?: UpgradeAuthenticator) {
  const readUniverse = latestRead(() => prisma.$queryRaw<StackUniverseRow[]>(Prisma.sql`
    SELECT iu.symbol_token, iu.tradingsymbol,
      UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) AS symbol
    FROM instrument_universe iu WHERE iu.exchange = 'NSE'
      AND iu.active_to IS NULL AND COALESCE(TRIM(iu.tradingsymbol), '') <> ''
  `), 60_000);
  const readStates = latestRead(() => prisma.$queryRaw<StackStateRow[]>(Prisma.sql`
    SELECT symbol_token, last_price, last_close, net_change, percent_change, last_seen_ts
    FROM instrument_state WHERE exchange = 'NSE'
  `), 500);
  const onConnection = async (ws: WebSocket, req: http.IncomingMessage) => {
    const url = new URL(req.url ?? "", "http://localhost");

    const symbolsParam = url.searchParams.get("symbols") ?? "";
    const symbols = [...new Set(symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean))];

    if (!symbols.length || symbols.length > 500) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ error: { code: "NO_SYMBOLS", message: "Provide between 1 and 500 symbols" } }));
      ws.close();
      return;
    }

    let timer: NodeJS.Timeout | null = null;
    let closed = false;
    let sequence = 0;

    ws.on("close", () => {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    });

    ws.on("error", () => ws.terminate());
    const sent = new Map<string, string>();
    function sendQuote(quote: LiveQuote) {
      if (closed || ws.readyState !== 1) return;
      // A stalled tab must not accumulate an unbounded outbound queue.
      if (ws.bufferedAmount > 256 * 1024) { ws.terminate(); return; }
      const signature = JSON.stringify(quote);
      if (sent.get(quote.symbol) === signature) return;
      sent.set(quote.symbol, signature);
      ws.send(JSON.stringify({ ...quote, sequence: ++sequence }));
    }
    function schedule(tick: () => Promise<void>) {
      if (closed) return;
      timer = setTimeout(() => {
        void tick().then(() => schedule(tick)).catch(() => {
          // Reconnect explicitly instead of silently remaining CONNECTED with no feed.
          if (!closed) ws.close(1013, "Market data temporarily unavailable");
        });
      }, 1000);
    }

    async function startTradingStackMode() {
      const rows = await readUniverse();

      const tokenBySymbol = new Map<string, string>();
      for (const row of rows) {
        tokenBySymbol.set(row.symbol, row.symbol_token);
        tokenBySymbol.set(row.tradingsymbol.toUpperCase(), row.symbol_token);
      }
      tokenBySymbol.set("NIFTY50", "99926000");
      tokenBySymbol.set("BANKNIFTY", "99926009");
      tokenBySymbol.set("NIFTYBANK", "99926009");
      tokenBySymbol.set("INDIAVIX", "99926017");
      tokenBySymbol.set("INDIA VIX", "99926017");

      const tracked: Array<{ symbol: string; token: string }> = [];
      for (const symbol of symbols) {
        const token = tokenBySymbol.get(symbol);
        if (!token) continue;
        tracked.push({ symbol, token });
      }

      if (!tracked.length) {
        if (ws.readyState === 1) ws.send(JSON.stringify({ error: { code: "UNKNOWN_SYMBOLS", message: "No symbols found" } }));
        ws.close();
        return;
      }

      const tokenToSymbols = new Map<string, string[]>();
      for (const t of tracked) {
        if (!tokenToSymbols.has(t.token)) tokenToSymbols.set(t.token, []);
        tokenToSymbols.get(t.token)!.push(t.symbol);
      }

      const tokens = [...tokenToSymbols.keys()];

      const tick = async () => {
        const stateRows = await readStates();

        const stateByToken = new Map(stateRows.map((r) => [r.symbol_token, r]));

        for (const token of tokens) {
          const row = stateByToken.get(token);
          if (!row || row.last_price == null || !row.last_seen_ts || !Number.isFinite(new Date(row.last_seen_ts).getTime())) continue;
          const outboundSymbols = tokenToSymbols.get(token) ?? [];
          const payloadBase = {
            price: toNumber(row.last_price),
            change: toNumber(row.net_change ?? 0),
            changePct: toNumber(row.percent_change ?? 0),
            timestamp: toIso(row.last_seen_ts)
          };
          for (const symbol of outboundSymbols) {
            sendQuote({ symbol, ...payloadBase });
          }
        }
      };

      await tick();
      schedule(tick);
    }

    async function startSeedFallbackMode() {
      const stocks = await prisma.stock.findMany({ where: { symbol: { in: symbols } } });
      const stockIds = stocks.map((s) => s.id);

      if (!stockIds.length) {
        if (ws.readyState === 1) ws.send(JSON.stringify({ error: { code: "UNKNOWN_SYMBOLS", message: "No symbols found" } }));
        ws.close();
        return;
      }

      const dayKey = marketDayKeyUtc();
      const dayStart = marketDayStartUtc();
      const dailyRows = await prisma.dailySnapshot.findMany({
        where: { stockId: { in: stockIds }, date: dayKey }
      });
      const dailyById = new Map(dailyRows.map((d) => [d.stockId, d]));

      if (dailyById.size < stockIds.length) {
        const latestDailyDates = await prisma.dailySnapshot.groupBy({
          by: ["stockId"],
          where: { stockId: { in: stockIds } },
          _max: { date: true }
        });
        const ors = latestDailyDates
          .filter((g) => g._max.date)
          .map((g) => ({ stockId: g.stockId, date: g._max.date! }));

        if (ors.length) {
          const latestRows = await prisma.dailySnapshot.findMany({ where: { OR: ors } });
          for (const row of latestRows) {
            if (!dailyById.has(row.stockId)) {
              dailyById.set(row.stockId, row);
            }
          }
        }
      }

      const prevCloseById = new Map([...dailyById.values()].map((d) => [d.stockId, toNumber(d.prevClose)]));

      const tick = async () => {
        const latestTs = await prisma.intradayBar.groupBy({
          by: ["stockId"],
          where: { stockId: { in: stockIds }, ts: { gte: dayStart } },
          _max: { ts: true }
        });

        const ors = latestTs.filter((x) => x._max.ts).map((x) => ({ stockId: x.stockId, ts: x._max.ts! }));
        const bars = ors.length ? await prisma.intradayBar.findMany({ where: { OR: ors } }) : [];
        const byId = new Map(bars.map((b) => [b.stockId, b]));

        for (const st of stocks) {
          const bar = byId.get(st.id);
          if (!bar) continue;
          const last = toNumber(bar.close);
          const prevClose = prevCloseById.get(st.id) ?? 0;
          const change = last - prevClose;
          const changePct = prevClose ? (change / prevClose) * 100 : 0;

          const payload: LiveQuote = {
            symbol: st.symbol,
            price: last,
            change,
            changePct,
            timestamp: toIso(bar.ts)
          };
          sendQuote(payload);
        }
      };

      await tick();
      schedule(tick);
    }

    try {
      await startTradingStackMode();
    } catch (err) {
      if (!isMissingRelationError(err)) {
        if (ws.readyState === 1) ws.send(JSON.stringify({ error: { code: "STREAM_FAILED", message: "Unable to start stream" } }));
        ws.close();
        return;
      }
      try {
        await startSeedFallbackMode();
      } catch {
        if (ws.readyState === 1) ws.send(JSON.stringify({ error: { code: "STREAM_FAILED", message: "Unable to start stream" } }));
        ws.close();
      }
    }
  };

  const streamPaths = new Set(["/v1/stream", "/api/n50/v1/stream", "/api/n50-stage/v1/stream"] as const);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) { ws.terminate(); continue; }
      alive.delete(ws);
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();
  server.on("close", () => {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  });

  wss.on("connection", (ws, req) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    void onConnection(ws, req);
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (!streamPaths.has(url.pathname as "/v1/stream" | "/api/n50/v1/stream" | "/api/n50-stage/v1/stream")) {
      return;
    }

    void (async () => {
      if (authenticateUpgrade) {
        try {
          await authenticateUpgrade(req, url);
        } catch (err) {
          const authErr = getAuthErrorDetails(err);
          rejectUpgrade(socket, authErr.status, authErr.code, authErr.message);
          return;
        }
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    })();
  });
}
