import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerAnalyticsEvents } from "./analyticsEvents";

async function withServer(
  queryResults: unknown[],
  run: (baseUrl: string, calls: { count: number }) => Promise<void>
) {
  const calls = { count: 0 };
  const prisma = {
    async $queryRaw() {
      const next = queryResults[calls.count];
      calls.count += 1;
      return next;
    }
  } as any;

  const app = express();
  registerAnalyticsEvents(app, prisma);
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test("analytics events route returns latest run summary and rows", async () =>
  withServer(
    [
      [
        {
          run_id: "run_456",
          created_at: "2026-04-04T10:00:00.000Z",
          row_count: 3,
          combined_file: "/app/data/runs/run_456/combined/nse_event_calendar.csv"
        }
      ],
      [
        {
          run_id: "run_456",
          symbol: "INFY",
          company_name: "Infosys",
          purpose: "Board Meeting",
          details: "Quarterly results",
          event_date: "2026-04-07",
          attachment: null,
          broadcast_datetime: "2026-04-04T09:45:00.000Z",
          source: "nse"
        },
        {
          run_id: "run_456",
          symbol: "RELIANCE",
          company_name: "Reliance Industries",
          purpose: "Analyst Call",
          details: "Investor discussion",
          event_date: "2026-04-08",
          attachment: "https://example.test/file.pdf",
          broadcast_datetime: "2026-04-04T10:30:00.000Z",
          source: "nse"
        }
      ],
      [
        { event_date: "2026-04-07", event_count: 1 },
        { event_date: "2026-04-08", event_count: 1 }
      ],
      [
        { symbol: "INFY", event_count: 1 },
        { symbol: "RELIANCE", event_count: 1 }
      ]
    ],
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/v1/analytics/events`);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        latestRunId: string;
        summary: {
          totalEvents: number;
          uniqueSymbols: number;
          attachmentCount: number;
          loadedRowCount: number;
          dateRange: { start: string | null; end: string | null };
          busiestDay: { date: string | null; count: number };
        };
        symbols: string[];
        topSymbols: Array<{ symbol: string; count: number }>;
        heatmap: Array<{ date: string; count: number }>;
        events: Array<{ symbol: string; eventDate: string | null; attachment: string | null }>;
      };

      assert.equal(calls.count, 4);
      assert.equal(payload.latestRunId, "run_456");
      assert.equal(payload.summary.totalEvents, 2);
      assert.equal(payload.summary.uniqueSymbols, 2);
      assert.equal(payload.summary.attachmentCount, 1);
      assert.equal(payload.summary.loadedRowCount, 3);
      assert.deepEqual(payload.summary.dateRange, { start: "2026-04-07", end: "2026-04-08" });
      assert.deepEqual(payload.summary.busiestDay, { date: "2026-04-07", count: 1 });
      assert.deepEqual(payload.symbols, ["INFY", "RELIANCE"]);
      assert.deepEqual(payload.topSymbols, [
        { symbol: "INFY", count: 1 },
        { symbol: "RELIANCE", count: 1 }
      ]);
      assert.equal(payload.heatmap.length, 2);
      assert.equal(payload.events[0]?.symbol, "INFY");
      assert.equal(payload.events[1]?.attachment, "https://example.test/file.pdf");
    }
  ));

test("analytics events route returns empty payload when nothing is loaded yet", async () =>
  withServer([[]], async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/v1/analytics/events`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      latestRunId: string | null;
      summary: { totalEvents: number; uniqueSymbols: number };
      heatmap: unknown[];
      events: unknown[];
    };

    assert.equal(calls.count, 1);
    assert.equal(payload.latestRunId, null);
    assert.equal(payload.summary.totalEvents, 0);
    assert.equal(payload.summary.uniqueSymbols, 0);
    assert.deepEqual(payload.heatmap, []);
    assert.deepEqual(payload.events, []);
  }));
