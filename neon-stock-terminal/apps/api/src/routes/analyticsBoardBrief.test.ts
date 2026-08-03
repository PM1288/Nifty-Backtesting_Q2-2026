import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalyticsBoardBriefPayload } from "./analytics";

test("analytics board brief composes a learner-safe root summary", () => {
  const payload = buildAnalyticsBoardBriefPayload(
    {
      overview: {
        asOf: "2026-04-05T09:30:00.000Z",
        market: { label: "Closed" },
        indices: {
          nifty50: { last: 22500, changePct: 0.006, rsi: 58.9 },
          bankNifty: { last: 48500, changePct: 0.004, rsi: 57.1 },
          indiaVix: { last: 14.2, changePct: -0.012, rsi: 49.5 }
        },
        sectors: [
          {
            sector: "Financials",
            stocks: [
              { symbol: "HDFCBANK", sector: "Financials", last: 1688, changePct: 0.012, rsi: 61.2, volume: 100000 },
              { symbol: "ICICIBANK", sector: "Financials", last: 1192, changePct: 0.009, rsi: 59.8, volume: 90000 }
            ]
          },
          {
            sector: "Energy",
            stocks: [
              { symbol: "RELIANCE", sector: "Energy", last: 2940, changePct: -0.004, rsi: 52.4, volume: 85000 }
            ]
          }
        ]
      },
      dashboard: {
        asOf: "2026-04-05T09:30:00.000Z",
        tradeDate: "2026-04-03",
        marketSummary: {
          tradeDate: "2026-04-03",
          marketRegime: "high_volatility_chop",
          securitiesCount: 100,
          advancers: 58,
          decliners: 42,
          unchanged: 0,
          positiveRatio: 0.58,
          avgDailyReturn: 0.004,
          medianDailyReturn: 0.002,
          totalTurnoverLacs: 0,
          avgVolumeRel20: 1.2,
          avgDeliveryRel20: 1.1,
          breakoutCount: 14,
          breakdownCount: 7,
          accumulationCount: 5,
          distributionCount: 3,
          eventCount: 12,
          anomalyCount: 2,
          riskCount: 4,
          niftyClose: 22500,
          niftyReturn: 0.006
        },
        regimeHistory: [
          {
            tradeDate: "2026-04-02",
            marketRegime: "mixed",
            positiveRatio: 0.49,
            avgDailyReturn: 0.001,
            breakoutCount: 9,
            breakdownCount: 9,
            eventCount: 10,
            anomalyCount: 3
          },
          {
            tradeDate: "2026-04-03",
            marketRegime: "high_volatility_chop",
            positiveRatio: 0.58,
            avgDailyReturn: 0.004,
            breakoutCount: 14,
            breakdownCount: 7,
            eventCount: 12,
            anomalyCount: 2
          }
        ],
        watchlist: [],
        signalGroups: [],
        signalPerformance: []
      },
      marketState: {
        tradeDate: "2026-04-03",
        asOf: "2026-04-05T09:30:00.000Z",
        session: { primaryState: "high-volatility-chop" },
        verdict: { dominantState: "high-volatility-chop" }
      },
      leadership: {
        asOf: "2026-04-05T09:30:00.000Z",
        tradeDate: "2026-04-03",
        summary: {
          continuationBias: "selective continuation",
          trueLeaderCount: 8,
          avoidCount: 3,
          marketSupportNote: "Leadership is better than beta."
        }
      },
      dailySetups: {
        asOf: "2026-04-05T09:30:00.000Z",
        tradeDate: "2026-04-03",
        summary: {
          currentRegime: "mixed",
          activeSetupCount: 12,
          constructiveCount: 7,
          deceptiveCount: 3,
          positiveExpectancySignals: 5,
          regimeMessage: "Works better in steady regimes."
        }
      },
      optionsStructure: {
        asOf: "2026-04-05T09:30:00.000Z",
        latestSnapshot: { spot: 22510 },
        pcrByExpiry: [
          { expiryDate: "2026-04-09", pcr: 1.12 },
          { expiryDate: "2026-04-30", pcr: 0.98 }
        ],
        termStructure: [{ iv: 13.4 }],
        maxPainDrift: [
          { maxPainStrike: 22400 },
          { maxPainStrike: 22300 }
        ],
        summary: {
          optionsVsSpot: "Options structure confirms the spot repair only partially.",
          dataQualityFlags: ["PCR lagged by one session."],
          nearestStructure: { callWall: 22600, putWall: 22300 }
        }
      },
      bankNiftyOptions: {
        asOf: "2026-04-05T09:30:00.000Z",
        latestSnapshot: { spot: 48520 },
        pcrByExpiry: [
          { expiryDate: "2026-04-09", pcr: 0.94 },
          { expiryDate: "2026-04-30", pcr: 0.89 }
        ],
        termStructure: [{ iv: 16.8 }],
        maxPainDrift: [
          { maxPainStrike: 48400 },
          { maxPainStrike: 48200 }
        ],
        summary: {
          optionsVsSpot: "BANKNIFTY options are more neutral than spot.",
          dataQualityFlags: [],
          nearestStructure: { callWall: 48800, putWall: 48200 }
        }
      },
      fiiFlow: {
        asOf: "2026-04-05T09:30:00.000Z",
        backdrop: "contrarian",
        summary: {
          backdrop: "contrarian",
          reportLagNote: "Official participant report is one session behind.",
          regimeLabel: "contrarian",
          text: "Flows are context only.",
          nextSessionBias: "mixed",
          sizingNote: "Use smaller size."
        }
      },
      strategyEvaluation: {
        generatedAt: "2026-04-05T09:30:00.000Z",
        asOfDate: "2026-04-03",
        latestAsofTs: "2026-04-05T09:30:00.000Z",
        indexCode: "NIFTY",
        horizon: "5d",
        summary: {
          currentRegime: "mixed",
          currentDirection: "up",
          regimeScore: 0.4,
          signalCount: 9,
          avgFinalScore: 0.52,
          avgHistoricalEdge: 0.11,
          avgRegimeFit: 0.47,
          avgRiskPenalty: 0.2,
          avgAnomalyPenalty: 0.12,
          modelBias: "constructive but selective",
          confidenceLabel: "moderate",
          concentrationRisk: "medium",
          topSector: "Financials",
          topSignalFamily: "breakout",
          actionCounts: { buyNow: 2, pullback: 3, watchOnly: 3, avoid: 1, anomalyReview: 0 },
          regimeDependence: "Works best in cleaner breadth regimes.",
          costNote: "Edge compresses after costs.",
          takeaway: "Use selective follow-through."
        }
      },
      quality: {
        asOf: "2026-04-05T09:30:00.000Z",
        expectedTradeDate: "2026-04-03",
        summary: {
          trustScore: 63,
          verdict: "mixed",
          safeModuleCount: 4,
          downgradedModuleCount: 2,
          hiddenModuleCount: 1,
          synopsis: "Some modules need downgrade tags.",
          schemaBoundaryRisk: "Boundary is controlled."
        },
        moduleStatus: [
          {
            moduleKey: "market-state",
            label: "Market State",
            route: "/analytics/market-state",
            status: "safe",
            trustScore: 80,
            lastSeenDate: "2026-04-03",
            expectedTradeDate: "2026-04-03",
            expectedCount: 100,
            actualCount: 100,
            coverageRatio: 1,
            reason: "Current and broad enough to trust.",
            staleNote: "100/100 symbols.",
            safeToTrust: true,
            visible: true,
            dependencies: []
          },
          {
            moduleKey: "participant-flow",
            label: "FII / Participant Flow",
            route: "/institutional/flow",
            status: "downgraded",
            trustScore: 55,
            lastSeenDate: "2026-04-02",
            expectedTradeDate: "2026-04-03",
            expectedCount: null,
            actualCount: null,
            coverageRatio: null,
            reason: "Official participant reports are lagged.",
            staleNote: "One session behind.",
            safeToTrust: false,
            visible: true,
            dependencies: []
          },
          {
            moduleKey: "event-context",
            label: "Event / Institutional Context",
            route: "/catalysts/context",
            status: "hidden",
            trustScore: 30,
            lastSeenDate: "2026-04-01",
            expectedTradeDate: "2026-04-03",
            expectedCount: null,
            actualCount: null,
            coverageRatio: null,
            reason: "Catalyst layer is stale.",
            staleNote: "Recent rows are sparse.",
            safeToTrust: false,
            visible: false,
            dependencies: []
          }
        ],
        safeModules: ["Market State", "Stock Leadership", "Daily Setups", "Strategy Evaluation"],
        downgradedModules: ["FII / Participant Flow", "Options Structure"],
        hiddenModules: ["Event / Institutional Context"],
        schemaBoundary: {
          cutoverDate: "2024-07-08",
          latestPreDate: "2024-07-05",
          earliestPostDate: "2024-07-08",
          latestPostDate: "2026-04-03",
          overlapDates: [],
          riskLabel: "low",
          message: "Aligned."
        },
        routeDependencies: [],
        charts: {
          freshnessBySource: [],
          coverageByModule: [],
          missingBarHeatmap: [],
          failedJobsTimeline: [],
          expectedVsSeenInstruments: [],
          missingDateLedger: []
        },
        diagnostics: {
          latestJobRuns: [],
          latestQualityChecks: [],
          pipelineAudit: []
        }
      }
    } as unknown as Parameters<typeof buildAnalyticsBoardBriefPayload>[0],
    new Date("2026-04-05T09:30:00.000Z")
  );

  assert.equal(payload.sessionReference.label, "Latest completed session");
  assert.equal(payload.keyConclusions.length, 5);
  assert.equal(payload.riskFlags.length, 5);
  assert.equal(payload.nextAlerts.length, 5);
  assert.equal(payload.watchNext.length, 5);
  assert.ok(payload.decoratedHeader.length >= 4);
  assert.equal(payload.fullStockSnapshot.rows.length, 3);
  assert.ok(payload.machineFacts.some((line) => line.startsWith("STOCK|symbol=HDFCBANK")));
  assert.ok(payload.machineFacts.some((line) => line.startsWith("OPTION|name=BANKNIFTY")));
  assert.ok(payload.marketBias.length > 20);
  assert.ok(payload.changedVsPriorSession.includes("prior session"));
  assert.ok(payload.moduleAlignment.confirming.length >= 1);
  assert.ok(payload.moduleAlignment.contradicting.length >= 1);
  assert.ok(payload.llm_brief.includes("Latest completed session"));
});
