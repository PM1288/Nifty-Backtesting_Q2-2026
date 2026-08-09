import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerAnalyticsEventContext } from "./analyticsEventContext";

const futureBoardDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const futureCorporateActionDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
  registerAnalyticsEventContext(app, prisma);
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

test("analytics event context route returns a catalyst teaching payload", async () =>
  withServer(
    [
      [
        { symbol: "RELIANCE", sector_name: "Energy" },
        { symbol: "INFY", sector_name: "Information Technology" }
      ],
      [
        {
          trade_date: "2026-04-02",
          symbol: "RELIANCE",
          security_name: "Reliance Industries",
          daily_return: 0.021,
          volume_rel_20: 1.6,
          delivery_rel_20: 1.2,
          fwd_return_1d: 0.012,
          fwd_return_3d: 0.025,
          fwd_return_5d: 0.031,
          has_announcement: true,
          has_board_meeting: false,
          has_corporate_action: true
        },
        {
          trade_date: "2026-04-02",
          symbol: "INFY",
          security_name: "Infosys",
          daily_return: -0.004,
          volume_rel_20: 1.1,
          delivery_rel_20: 0.9,
          fwd_return_1d: -0.002,
          fwd_return_3d: 0.006,
          fwd_return_5d: 0.011,
          has_announcement: false,
          has_board_meeting: true,
          has_corporate_action: false
        }
      ],
      [
        {
          symbol: "INFY",
          company_name: "Infosys",
          purpose: "Board Meeting",
          details: "Quarterly results",
          event_date: futureBoardDate,
          broadcast_datetime: "2026-04-04T12:00:00.000Z",
          attachment: null
        }
      ],
      [
        {
          symbol: "INFY",
          company_name: "Infosys",
          board_meeting_date: futureBoardDate,
          reporting_quarter: "Q4 FY26"
        }
      ],
      [
        {
          symbol: "RELIANCE",
          security_name: "Reliance Industries",
          purpose: "Dividend",
          ex_date: futureCorporateActionDate,
          report_date: "2026-04-03",
          record_date: "2026-04-12"
        }
      ],
      [
        {
          symbol: "RELIANCE",
          event_type: "announcement",
          report_date: "2026-04-03",
          headline: "Capex update"
        }
      ],
      [
        {
          sector_name: "Energy",
          bulk_value_cr: 24.5,
          block_value_cr: 58.2
        },
        {
          sector_name: "Information Technology",
          bulk_value_cr: 12.2,
          block_value_cr: 0
        }
      ],
      [
        {
          deal_type: "block",
          trade_date: "2026-04-03",
          symbol: "RELIANCE",
          security_name: "Reliance Industries",
          side: "buy",
          client_name: "Big Fund",
          trade_value_cr: 58.2
        }
      ],
      [
        {
          trade_date: "2026-04-01",
          event_count: 3,
          avg_forward_return_1d: 0.003,
          avg_forward_return_3d: 0.008,
          avg_forward_return_5d: 0.012
        },
        {
          trade_date: "2026-04-02",
          event_count: 5,
          avg_forward_return_1d: -0.002,
          avg_forward_return_3d: 0.004,
          avg_forward_return_5d: 0.01
        }
      ],
      [
        {
          trade_date: "2026-04-02",
          client_type: "FII",
          total_long_contracts: 5100000,
          total_short_contracts: 4300000
        },
        {
          trade_date: "2026-04-02",
          client_type: "Client",
          total_long_contracts: 6400000,
          total_short_contracts: 3700000
        }
      ]
    ],
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/v1/analytics/event-context`);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        latestTradeDate: string | null;
        summary: { upcomingCount: number; recentCount: number; institutionalBackdrop: string };
        upcomingCatalysts: unknown[];
        recentCatalysts: unknown[];
        sectorClusters: unknown[];
        dataQualityFlags: string[];
        charts: {
          eventCalendarHeatmap: unknown[];
          boardMeetingSchedule: unknown[];
          corporateActionTimeline: unknown[];
          blockBulkDealValueBySector: unknown[];
          eventDensityVsForwardReturn: unknown[];
          institutionalContextOverlayBySector: unknown[];
        };
      };

      assert.equal(calls.count, 10);
      assert.equal(payload.latestTradeDate, "2026-04-02");
      assert.ok(payload.summary.upcomingCount >= 1);
      assert.ok(payload.summary.recentCount >= 1);
      assert.ok(["supportive", "contrarian", "stretched", "neutral"].includes(payload.summary.institutionalBackdrop));
      assert.ok(payload.upcomingCatalysts.length >= 1);
      assert.ok(payload.recentCatalysts.length >= 1);
      assert.ok(payload.sectorClusters.length >= 1);
      assert.ok(payload.dataQualityFlags.length >= 1);
      assert.equal(payload.charts.eventCalendarHeatmap.length, 3);
      assert.ok(payload.charts.boardMeetingSchedule.length >= 1);
      assert.ok(payload.charts.corporateActionTimeline.length >= 1);
      assert.ok(payload.charts.blockBulkDealValueBySector.length >= 1);
      assert.equal(payload.charts.eventDensityVsForwardReturn.length, 2);
      assert.ok(payload.charts.institutionalContextOverlayBySector.length >= 1);
    }
  ));

test("analytics event context route returns empty but structured payload", async () =>
  withServer([[], [], [], [], [], [], [], [], [], []], async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/v1/analytics/event-context`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      latestTradeDate: string | null;
      summary: { upcomingCount: number; recentCount: number; institutionalBackdrop: string };
      upcomingCatalysts: unknown[];
      recentCatalysts: unknown[];
      sectorClusters: unknown[];
      charts: { eventCalendarHeatmap: unknown[] };
    };

    assert.equal(calls.count, 10);
    assert.equal(payload.latestTradeDate, null);
    assert.equal(payload.summary.upcomingCount, 0);
    assert.equal(payload.summary.recentCount, 0);
    assert.equal(payload.summary.institutionalBackdrop, "neutral");
    assert.deepEqual(payload.upcomingCatalysts, []);
    assert.deepEqual(payload.recentCatalysts, []);
    assert.deepEqual(payload.sectorClusters, []);
    assert.deepEqual(payload.charts.eventCalendarHeatmap, []);
  }));
