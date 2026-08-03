import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { loadPublishedBacktestingCompare } from "../lib/backtestingPublished";

type CurrentRecommendationRow = {
  trade_date: Date | string;
  index_code: string;
  horizon: string;
  symbol: string;
  asof_ts: Date | string;
  signal_family: string;
  signal_quality: number | null;
  regime_fit: number | null;
  historical_edge: number | null;
  risk_penalty: number | null;
  anomaly_penalty: number | null;
  final_score: number | null;
  action: string;
  direction: string;
  explanation: Prisma.JsonValue | null;
  sector_name: string | null;
};

type RegimeRow = {
  trade_date: Date | string;
  regime: string | null;
  direction: string | null;
  score: number | null;
};

type ActionOutcomeRow = {
  action: string;
  direction: string;
  sample_count: number | bigint;
  avg_ret_15m_pct: number | null;
  avg_ret_30m_pct: number | null;
  avg_ret_60m_pct: number | null;
  avg_ret_close_pct: number | null;
  win_rate_30m_pct: number | null;
};

type FamilyOutcomeRow = {
  signal_family: string;
  sample_count: number | bigint;
  hit_rate_pct: number | null;
  avg_ret_15m_pct: number | null;
  avg_ret_30m_pct: number | null;
  avg_ret_60m_pct: number | null;
  avg_ret_close_pct: number | null;
};

type ScorecardRow = {
  horizon: string;
  regime: string;
  signal_family: string;
  sample_count: number | bigint;
  win_rate: number | null;
  avg_return_pct: number | null;
  p50_return_pct: number | null;
};

type SectorMapRow = {
  symbol: string;
  sector_name: string | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDateKey(value: Date | string | null | undefined): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function toNumber(value: number | bigint | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function titleCase(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, (token) => token.toUpperCase());
}

function confidenceLabel(score: number) {
  if (score >= 75) return "High";
  if (score >= 60) return "Constructive";
  if (score >= 45) return "Mixed";
  return "Fragile";
}

function actionLabel(action: string) {
  return titleCase(action).replace(/\bNow\b/g, "Now");
}

function directionLabel(direction: string) {
  const normalized = direction.trim().toLowerCase();
  if (normalized === "long") return "Long";
  if (normalized === "short") return "Short";
  if (normalized === "neutral") return "Neutral";
  return titleCase(direction);
}

function buildSetupReason(row: CurrentRecommendationRow, expectancy: { avgReturnPct: number | null; winRatePct: number | null; sampleCount: number }) {
  const reasons: string[] = [];
  if (toNumber(row.signal_quality) >= 60) reasons.push("signal quality is strong");
  if (toNumber(row.regime_fit) >= 60) reasons.push("regime fit is supportive");
  if (toNumber(row.historical_edge) >= 55) reasons.push("historical edge is constructive");
  if (toNumber(row.risk_penalty) >= 20) reasons.push("risk penalty is elevated");
  if (toNumber(row.anomaly_penalty) >= 20) reasons.push("anomaly penalty is elevated");
  if (expectancy.sampleCount < 25) reasons.push("sample size is still small");
  if ((expectancy.avgReturnPct ?? 0) > 0) reasons.push("historical expectancy is positive");
  if ((expectancy.winRatePct ?? 0) >= 55) reasons.push("historical hit-rate is healthy");
  return reasons.slice(0, 4);
}

function deriveDrawdown(points: Array<{ date: string; strategyValue: number; benchmarkValue: number | null }>) {
  let peak = 0;
  return points.map((point) => {
    peak = Math.max(peak, point.strategyValue);
    const drawdownPct = peak > 0 ? round(((point.strategyValue / peak) - 1) * 100, 2) ?? 0 : 0;
    return {
      date: point.date,
      drawdownPct
    };
  });
}

export async function getAnalyticsStrategyEvaluation(prisma: PrismaClient) {
  const indexCode = "NIFTY 50";
  const horizon = "30m";

  const currentRows = await prisma.$queryRaw<CurrentRecommendationRow[]>(Prisma.sql`
      WITH sector_map AS (
        SELECT
          UPPER(TRIM(symbol)) AS symbol,
          COALESCE(NULLIF(TRIM(sector), ''), 'Unknown') AS sector_name
        FROM public.index_constituents
      ),
      latest_trade AS (
        SELECT MAX(trade_date) AS trade_date
        FROM nse_reco.recommendation_snapshot
        WHERE index_code = ${indexCode}
          AND horizon = ${horizon}
      )
      SELECT
        r.trade_date,
        r.index_code,
        r.horizon,
        r.symbol,
        r.asof_ts,
        r.signal_family,
        r.signal_quality,
        r.regime_fit,
        r.historical_edge,
        r.risk_penalty,
        r.anomaly_penalty,
        r.final_score,
        r.action,
        r.direction,
        r.explanation,
        sector_map.sector_name
      FROM nse_reco.recommendation_snapshot r
      JOIN latest_trade latest
        ON latest.trade_date = r.trade_date
      LEFT JOIN sector_map
        ON sector_map.symbol = UPPER(r.symbol)
      WHERE r.index_code = ${indexCode}
        AND r.horizon = ${horizon}
      ORDER BY r.final_score DESC NULLS LAST, r.symbol ASC
    `);

  const actionOutcomes = await prisma.$queryRaw<ActionOutcomeRow[]>(Prisma.sql`
      WITH classified AS (
        SELECT
          action,
          CASE
            WHEN action ILIKE '%short%' OR action ILIKE '%sell%' THEN 'short'
            WHEN action ILIKE '%long%' OR action ILIKE '%buy%' THEN 'long'
            ELSE 'neutral'
          END AS direction,
          ret_fwd_15m_pct,
          ret_fwd_30m_pct,
          ret_fwd_60m_pct,
          ret_to_close_pct
        FROM nse_reco.v_reco_outcomes
        WHERE index_code = ${indexCode}
          AND horizon = ${horizon}
      )
      SELECT
        action,
        direction,
        COUNT(*) AS sample_count,
        AVG(ret_fwd_15m_pct) AS avg_ret_15m_pct,
        AVG(ret_fwd_30m_pct) AS avg_ret_30m_pct,
        AVG(ret_fwd_60m_pct) AS avg_ret_60m_pct,
        AVG(ret_to_close_pct) AS avg_ret_close_pct,
        AVG(CASE WHEN ret_fwd_30m_pct > 0 THEN 100.0 ELSE 0.0 END) AS win_rate_30m_pct
      FROM classified
      GROUP BY action, direction
      ORDER BY AVG(ret_fwd_30m_pct) DESC NULLS LAST, COUNT(*) DESC
    `);

  const familyOutcomes = await prisma.$queryRaw<FamilyOutcomeRow[]>(Prisma.sql`
      SELECT
        signal_family,
        COUNT(*) AS sample_count,
        AVG(CASE WHEN ret_fwd_30m_pct > 0 THEN 100.0 ELSE 0.0 END) AS hit_rate_pct,
        AVG(ret_fwd_15m_pct) AS avg_ret_15m_pct,
        AVG(ret_fwd_30m_pct) AS avg_ret_30m_pct,
        AVG(ret_fwd_60m_pct) AS avg_ret_60m_pct,
        AVG(ret_to_close_pct) AS avg_ret_close_pct
      FROM nse_reco.v_reco_outcomes
      WHERE index_code = ${indexCode}
        AND horizon = ${horizon}
      GROUP BY signal_family
      ORDER BY AVG(ret_fwd_30m_pct) DESC NULLS LAST, COUNT(*) DESC
    `);

  const scorecards = await prisma.$queryRaw<ScorecardRow[]>(Prisma.sql`
      SELECT horizon, regime, signal_family, sample_count, win_rate, avg_return_pct, p50_return_pct
      FROM nse_reco.bucket_scorecard
      WHERE horizon = ${horizon}
      ORDER BY sample_count DESC, avg_return_pct DESC NULLS LAST
    `);

  const sectorMapRows = await prisma.$queryRaw<SectorMapRow[]>(Prisma.sql`
      SELECT
        UPPER(TRIM(symbol)) AS symbol,
        COALESCE(NULLIF(TRIM(sector), ''), 'Unknown') AS sector_name
      FROM public.index_constituents
    `);

  const publishedCompare = await loadPublishedBacktestingCompare(prisma);

  const latestTradeDate = currentRows[0] ? toDateKey(currentRows[0].trade_date) : null;
  const latestAsofTs = currentRows.reduce<string | null>((latest, row) => {
    const next = toIso(row.asof_ts);
    if (!next) return latest;
    if (!latest || next > latest) return next;
    return latest;
  }, null);

  const regimeRows = latestTradeDate
    ? await prisma.$queryRaw<RegimeRow[]>(Prisma.sql`
        SELECT trade_date, regime, direction, score
        FROM nse_reco.market_regime_snapshot
        WHERE trade_date = CAST(${latestTradeDate} AS date)
          AND index_code = ${indexCode}
        LIMIT 1
      `)
    : [];

  const regime = regimeRows[0] ?? null;
  const currentRegime = regime?.regime ? titleCase(regime.regime) : "Unknown";
  const currentDirection = regime?.direction ? titleCase(regime.direction) : "Unknown";

  const sectorMap = new Map(sectorMapRows.map((row) => [row.symbol.toUpperCase(), row.sector_name?.trim() || "Unknown"]));
  const regimeScorecards = scorecards.filter((row) => row.regime.toLowerCase() === (regime?.regime ?? "").toLowerCase());
  const scorecardByFamily = new Map(
    regimeScorecards.map((row) => [
      row.signal_family.toLowerCase(),
      {
        sampleCount: toNumber(row.sample_count),
        winRatePct: round(toNumber(row.win_rate) * 100, 1),
        avgReturnPct: round(toNumber(row.avg_return_pct), 2),
        medianReturnPct: round(toNumber(row.p50_return_pct), 2)
      }
    ])
  );

  const currentSetups = currentRows.slice(0, 5).map((row) => {
    const expectancy = scorecardByFamily.get(row.signal_family.toLowerCase()) ?? {
      sampleCount: 0,
      winRatePct: null,
      avgReturnPct: null,
      medianReturnPct: null
    };
    const confidenceScore = clamp(
      toNumber(row.final_score) * 0.55 +
        toNumber(row.historical_edge) * 0.2 +
        toNumber(row.regime_fit) * 0.15 -
        toNumber(row.risk_penalty) * 0.2 -
        toNumber(row.anomaly_penalty) * 0.2,
      0,
      100
    );

    return {
      symbol: row.symbol,
      sectorName: row.sector_name?.trim() || "Unknown",
      action: row.action,
      direction: row.direction,
      signalFamily: row.signal_family,
      finalScore: round(toNumber(row.final_score), 1),
      confidenceScore: round(confidenceScore, 1),
      confidenceLabel: confidenceLabel(confidenceScore),
      signalQuality: round(toNumber(row.signal_quality), 1),
      regimeFit: round(toNumber(row.regime_fit), 1),
      historicalEdge: round(toNumber(row.historical_edge), 1),
      riskPenalty: round(toNumber(row.risk_penalty), 1),
      anomalyPenalty: round(toNumber(row.anomaly_penalty), 1),
      expectancy,
      reason: buildSetupReason(row, expectancy).join(", ")
    };
  });

  const cautionSetups = currentRows
    .slice()
    .sort((left, right) => (
      toNumber(right.risk_penalty) +
      toNumber(right.anomaly_penalty) -
      (toNumber(left.risk_penalty) + toNumber(left.anomaly_penalty))
    ))
    .filter((row) => row.action === "avoid_despite_strength" || row.action === "anomaly_review_required" || toNumber(row.risk_penalty) + toNumber(row.anomaly_penalty) >= 25)
    .slice(0, 5)
    .map((row) => ({
      symbol: row.symbol,
      sectorName: row.sector_name?.trim() || "Unknown",
      action: row.action,
      direction: row.direction,
      signalFamily: row.signal_family,
      finalScore: round(toNumber(row.final_score), 1),
      riskPenalty: round(toNumber(row.risk_penalty), 1),
      anomalyPenalty: round(toNumber(row.anomaly_penalty), 1),
      reason: buildSetupReason(row, scorecardByFamily.get(row.signal_family.toLowerCase()) ?? {
        sampleCount: 0,
        winRatePct: null,
        avgReturnPct: null,
        medianReturnPct: null
      }).join(", ")
    }));

  const avgFinalScore = currentRows.length
    ? currentRows.reduce((sum, row) => sum + toNumber(row.final_score), 0) / currentRows.length
    : 0;
  const avgHistoricalEdge = currentRows.length
    ? currentRows.reduce((sum, row) => sum + toNumber(row.historical_edge), 0) / currentRows.length
    : 0;
  const avgRegimeFit = currentRows.length
    ? currentRows.reduce((sum, row) => sum + toNumber(row.regime_fit), 0) / currentRows.length
    : 0;
  const avgRiskPenalty = currentRows.length
    ? currentRows.reduce((sum, row) => sum + toNumber(row.risk_penalty), 0) / currentRows.length
    : 0;
  const avgAnomalyPenalty = currentRows.length
    ? currentRows.reduce((sum, row) => sum + toNumber(row.anomaly_penalty), 0) / currentRows.length
    : 0;

  const totalScore = currentRows.reduce((sum, row) => sum + Math.max(0, toNumber(row.final_score)), 0);
  const topFiveScoreShare = totalScore > 0
    ? currentRows.slice(0, 5).reduce((sum, row) => sum + Math.max(0, toNumber(row.final_score)), 0) / totalScore
    : 0;

  const sectorCounts = new Map<string, number>();
  const familyCounts = new Map<string, number>();
  const actionCounts = {
    buyNow: 0,
    pullback: 0,
    watchOnly: 0,
    avoid: 0,
    anomalyReview: 0
  };
  for (const row of currentRows) {
    const sectorName = row.sector_name?.trim() || "Unknown";
    sectorCounts.set(sectorName, (sectorCounts.get(sectorName) ?? 0) + 1);
    familyCounts.set(row.signal_family, (familyCounts.get(row.signal_family) ?? 0) + 1);
    if (row.action === "buy_now") actionCounts.buyNow += 1;
    else if (row.action === "wait_for_pullback") actionCounts.pullback += 1;
    else if (row.action === "watch_only") actionCounts.watchOnly += 1;
    else if (row.action === "avoid_despite_strength") actionCounts.avoid += 1;
    else if (row.action === "anomaly_review_required") actionCounts.anomalyReview += 1;
  }

  const topSectorEntry = [...sectorCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const topFamilyEntry = [...familyCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const concentrationRisk =
    topFiveScoreShare >= 0.45
      ? "High concentration risk: the top five names carry an unusually large share of current score."
      : topFiveScoreShare >= 0.3
        ? "Moderate concentration risk: the current book still leans on a few names."
        : "Low concentration risk: current score is dispersed across the list rather than concentrated in a few names.";

  const modelBias =
    actionCounts.buyNow > actionCounts.avoid + actionCounts.anomalyReview
      ? "Constructive, but only where score quality survives the penalty layer."
      : actionCounts.avoid + actionCounts.anomalyReview > actionCounts.buyNow
        ? "Cautious, with penalties doing meaningful work against raw score strength."
        : "Balanced, with no dominant action bucket forcing conviction.";

  const referenceCandidates = (publishedCompare?.rows ?? []).filter((row) => row.capitalMode !== "no_capital_limit");
  const referenceRow = (referenceCandidates.length ? referenceCandidates : (publishedCompare?.rows ?? []))
    .slice()
    .sort((left, right) => (
      (right.excessOverFd ?? right.totalReturnPct) - (left.excessOverFd ?? left.totalReturnPct)
    ))[0] ?? null;
  const referenceCurve = referenceRow
    ? publishedCompare?.equityCurves.find((curve) => curve.strategyId === referenceRow.strategyId && curve.capitalMode === referenceRow.capitalMode)
    : null;
  const referenceRegimes = referenceRow
    ? publishedCompare?.regimeCompare.find((row) => row.strategyId === referenceRow.strategyId && row.capitalMode === referenceRow.capitalMode)
    : null;
  const referenceStocks = referenceRow
    ? (publishedCompare?.stockSuitability ?? []).filter((row) => row.strategyId === referenceRow.strategyId && row.capitalMode === referenceRow.capitalMode)
    : [];

  const sectorContribution = [...referenceStocks.reduce((map, row) => {
    const sectorName = sectorMap.get(row.symbol.toUpperCase()) ?? "Unknown";
    const bucket = map.get(sectorName) ?? {
      sectorName,
      stockCount: 0,
      totalNetPnl: 0,
      avgReturnPctSum: 0,
      signalCount: 0
    };
    bucket.stockCount += 1;
    bucket.totalNetPnl += toNumber(row.totalNetPnl);
    bucket.avgReturnPctSum += toNumber(row.avgReturnPct);
    bucket.signalCount += toNumber(row.signalCount);
    map.set(sectorName, bucket);
    return map;
  }, new Map<string, { sectorName: string; stockCount: number; totalNetPnl: number; avgReturnPctSum: number; signalCount: number }>()).values()]
    .map((row) => ({
      sectorName: row.sectorName,
      stockCount: row.stockCount,
      totalNetPnl: round(row.totalNetPnl, 2),
      avgReturnPct: row.stockCount ? round(row.avgReturnPctSum / row.stockCount, 2) : 0,
      signalCount: row.signalCount
    }))
    .sort((left, right) => (right.totalNetPnl ?? 0) - (left.totalNetPnl ?? 0))
    .slice(0, 8);

  const diagnostics = {
    currentSampleSize: currentRows.length,
    historicalActionSamples: actionOutcomes.reduce((sum, row) => sum + toNumber(row.sample_count), 0),
    historicalFamilySamples: familyOutcomes.reduce((sum, row) => sum + toNumber(row.sample_count), 0),
    regimeScorecardCount: regimeScorecards.length
  };

  const averageCharges = publishedCompare?.rows?.length
    ? (publishedCompare.rows.reduce((sum, row) => sum + toNumber(row.totalCharges), 0) / publishedCompare.rows.length)
    : 0;

  return {
    generatedAt: publishedCompare?.generatedAt ?? latestAsofTs ?? new Date().toISOString(),
    asOfDate: latestTradeDate,
    latestAsofTs,
    indexCode,
    horizon,
    summary: currentRows.length
      ? {
          currentRegime,
          currentDirection,
          regimeScore: round(toNumber(regime?.score), 1),
          signalCount: currentRows.length,
          avgFinalScore: round(avgFinalScore, 1),
          avgHistoricalEdge: round(avgHistoricalEdge, 1),
          avgRegimeFit: round(avgRegimeFit, 1),
          avgRiskPenalty: round(avgRiskPenalty, 1),
          avgAnomalyPenalty: round(avgAnomalyPenalty, 1),
          modelBias,
          confidenceLabel: confidenceLabel(clamp(avgFinalScore - avgRiskPenalty - avgAnomalyPenalty * 0.5, 0, 100)),
          concentrationRisk,
          topSector: topSectorEntry ? `${topSectorEntry[0]} (${topSectorEntry[1]} names)` : "Unknown",
          topSignalFamily: topFamilyEntry ? `${titleCase(topFamilyEntry[0])} (${topFamilyEntry[1]} names)` : "Unknown",
          actionCounts,
          regimeDependence:
            regimeScorecards.length >= 3
              ? `Current regime has ${regimeScorecards.length} signal-family scorecards, so regime fit is measurable rather than assumed.`
              : "Regime context is thin, so current setup quality is more sample-sensitive than usual.",
          costNote: referenceRow
            ? `${referenceRow.displayName} paid about ₹${Math.round(referenceRow.totalCharges).toLocaleString("en-IN")} in charges, so edge is cost-sensitive and capital-mode dependent.`
            : `Average published strategy charges are about ₹${Math.round(averageCharges).toLocaleString("en-IN")}, so gross edge should not be treated as net edge.`,
          takeaway:
            "High score does not mean high certainty: the useful read is score quality plus regime fit, minus penalties, then checked against realized expectancy."
        }
      : null,
    currentSetups,
    cautionSetups,
    referenceStrategy: referenceRow
      ? {
          strategyId: referenceRow.strategyId,
          displayName: referenceRow.displayName,
          archetype: referenceRow.archetype,
          capitalMode: referenceRow.capitalMode,
          totalReturnPct: round(referenceRow.totalReturnPct, 2),
          excessOverFd: round(referenceRow.excessOverFd ?? 0, 2),
          maxDrawdownPct: round(referenceRow.maxDrawdownPct, 2),
          winRatePct: round(referenceRow.winRatePct, 1),
          totalCharges: round(referenceRow.totalCharges, 2)
        }
      : null,
    diagnostics,
    charts: {
      scoreDecomposition: currentRows.slice(0, 8).map((row) => ({
        symbol: row.symbol,
        action: row.action,
        direction: row.direction,
        finalScore: round(toNumber(row.final_score), 1),
        signalQuality: round(toNumber(row.signal_quality), 1),
        regimeFit: round(toNumber(row.regime_fit), 1),
        historicalEdge: round(toNumber(row.historical_edge), 1),
        riskPenalty: round(toNumber(row.risk_penalty), 1),
        anomalyPenalty: round(toNumber(row.anomaly_penalty), 1)
      })),
      forwardReturnByActionDirection: actionOutcomes.map((row) => ({
        label: `${actionLabel(row.action)} • ${directionLabel(row.direction)}`,
        action: row.action,
        direction: row.direction,
        sampleCount: toNumber(row.sample_count),
        avgRet15mPct: round(toNumber(row.avg_ret_15m_pct), 2),
        avgRet30mPct: round(toNumber(row.avg_ret_30m_pct), 2),
        avgRet60mPct: round(toNumber(row.avg_ret_60m_pct), 2),
        avgRetClosePct: round(toNumber(row.avg_ret_close_pct), 2),
        winRate30mPct: round(toNumber(row.win_rate_30m_pct), 1)
      })),
      hitRateBySignalFamily: familyOutcomes.map((row) => ({
        signalFamily: titleCase(row.signal_family),
        sampleCount: toNumber(row.sample_count),
        hitRatePct: round(toNumber(row.hit_rate_pct), 1),
        avgRet15mPct: round(toNumber(row.avg_ret_15m_pct), 2),
        avgRet30mPct: round(toNumber(row.avg_ret_30m_pct), 2),
        avgRet60mPct: round(toNumber(row.avg_ret_60m_pct), 2),
        avgRetClosePct: round(toNumber(row.avg_ret_close_pct), 2),
        regimeAvgReturnPct: scorecardByFamily.get(row.signal_family.toLowerCase())?.avgReturnPct ?? null,
        regimeWinRatePct: scorecardByFamily.get(row.signal_family.toLowerCase())?.winRatePct ?? null,
        regimeSampleCount: scorecardByFamily.get(row.signal_family.toLowerCase())?.sampleCount ?? 0
      })),
      equityCurveVsBenchmark: referenceCurve?.points ?? [],
      drawdownCurve: referenceCurve ? deriveDrawdown(referenceCurve.points) : [],
      performanceByRegime: (referenceRegimes?.regimes ?? []).map((row) => ({
        regime: row.regime,
        tradeCount: toNumber(row.tradeCount),
        winRatePct: round(toNumber(row.winRatePct), 1),
        avgReturnPct: round(toNumber(row.avgReturnPct), 2),
        maxDrawdownContributionPct: round(toNumber(row.maxDrawdownContributionPct), 2),
        avgHoldDays: round(toNumber(row.avgHoldDays), 1),
        totalCharges: round(toNumber(row.totalCharges), 2)
      })),
      sectorContribution
    }
  };
}

export function registerAnalyticsStrategyEvaluation(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/strategy-evaluation", async (_req, res) => {
    try {
      const payload = await getAnalyticsStrategyEvaluation(prisma);
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=300");
      return res.json(payload);
    } catch (error) {
      console.error("strategy evaluation route failed", error);
      return res.status(500).json({
        error: {
          code: "strategy_evaluation_unavailable",
          message: "Strategy evaluation data is unavailable right now."
        }
      });
    }
  });
}
