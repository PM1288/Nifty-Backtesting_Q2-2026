import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";

type LeadershipStateRow = {
  trade_date: Date | string;
  generated_at: Date | string | null;
  primary_state: string | null;
  change_pct: number | null;
  breadth_up_pct: number | null;
  breadth_above_vwap_pct: number | null;
  weighted_participation_pct: number | null;
  top10_concentration_pct: number | null;
};

type LeadershipStockRow = {
  trade_date: Date | string;
  minute_ts: Date | string | null;
  symbol: string;
  sector_name: string | null;
  universe_weight: number | null;
  security_name: string | null;
  last_price: number | null;
  absolute_return_pct: number | null;
  residual_return_60m_pct: number | null;
  residual_return_30m_pct: number | null;
  relative_strength_bps: number | null;
  above_vwap: boolean | null;
  time_above_vwap_pct: number | null;
  vwap_hold_quality_score: number | null;
  relative_strength_persistence_score: number | null;
  range_efficiency_pct: number | null;
  minute_volume_ratio: number | null;
  cum_volume_vs_profile: number | null;
  volume_curve_surprise: number | null;
  close_location_quality_pct: number | null;
  beta_20d: number | null;
  beta_60d: number | null;
  volume_ratio_day: number | null;
  continuation_score: number | null;
  weakness_score: number | null;
  mean_reversion_score: number | null;
  reversal_score: number | null;
  dominant_signal: string | null;
  direction: string | null;
  conclusion: string | null;
  residual_leadership_score: number | null;
  index_beta_follow_score: number | null;
  vwap_control_score: number | null;
  headline_spike_score: number | null;
  catch_up_score: number | null;
  volume_rel_20: number | null;
  delivery_rel_20: number | null;
  composite_trend_score: number | null;
  composite_reversal_score: number | null;
  composite_anomaly_score: number | null;
  composite_risk_score: number | null;
  has_announcement: boolean | null;
  max_bullish_signal: number | null;
  max_bearish_signal: number | null;
  trend_signal_strength: number | null;
  reversal_signal_strength: number | null;
  anomaly_signal_strength: number | null;
};

type LeaderCategory =
  | "true leader"
  | "orderly follower"
  | "catch-up candidate"
  | "reversal candidate"
  | "avoid / noisy";

type RankedLeadershipRow = {
  symbol: string;
  securityName: string | null;
  sectorName: string;
  universeWeight: number | null;
  lastPrice: number | null;
  absoluteReturnPct: number | null;
  residualReturn60mPct: number | null;
  relativeStrengthBps: number | null;
  aboveVwap: boolean;
  timeAboveVwapPct: number | null;
  vwapHoldQualityScore: number | null;
  rsPersistenceScore: number | null;
  minuteVolumeRatio: number | null;
  volumeRatioDay: number | null;
  volumeCurveSurprise: number | null;
  continuationScore: number | null;
  reversalScore: number | null;
  catchUpScore: number | null;
  betaFollowScore: number | null;
  headlineSpikeScore: number | null;
  compositeTrendScore: number | null;
  compositeRiskScore: number | null;
  hasAnnouncement: boolean;
  category: LeaderCategory;
  leadershipScore: number;
  categoryRank: number;
  convictionLabel: string;
  explanation: string;
  reasons: string[];
};

type SectorStrengthRow = {
  sectorName: string;
  stockCount: number;
  avgResidualReturn60mPct: number;
  avgLeadershipScore: number;
  avgContinuationScore: number;
  avgReversalScore: number;
  avgVwapHoldScore: number;
  trueLeaderCount: number;
  avoidCount: number;
  confirmation: string;
  contradiction: string;
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

function toNullableNumber(value: number | bigint | null | undefined): number | null {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentileRank(values: number[], value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || values.length === 0) return 50;
  const belowOrEqual = values.filter((candidate) => candidate <= value).length;
  return clamp((belowOrEqual / values.length) * 100, 0, 100);
}

function titleCase(input: string | null | undefined) {
  const normalized = (input ?? "").replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, (token) => token.toUpperCase());
}

function marketStateLabel(row: LeadershipStateRow | null | undefined) {
  const raw = (row?.primary_state ?? "balanced / indecisive").replace(/_/g, " ").trim().toLowerCase();
  return raw || "balanced / indecisive";
}

function continuationSupport(row: LeadershipStateRow | null | undefined) {
  const breadth = toNullableNumber(row?.breadth_up_pct) ?? 0;
  const weighted = toNullableNumber(row?.weighted_participation_pct) ?? 0;
  const concentration = toNullableNumber(row?.top10_concentration_pct) ?? 0;
  const state = marketStateLabel(row);
  if (state.includes("trend") && breadth >= 60 && weighted >= 60 && concentration <= 35) return "supports stock continuation";
  if (state.includes("chop") || state.includes("failed")) return "prefers selective continuation only";
  if (state.includes("late")) return "supports selective continuation if VWAP holds";
  return "requires stock-by-stock confirmation";
}

function buildExplanation(category: LeaderCategory, reasons: string[]) {
  switch (category) {
    case "true leader":
      return `True leader because ${reasons.slice(0, 2).join(", ")}.`;
    case "orderly follower":
      return `Orderly follower because ${reasons.slice(0, 2).join(", ")}.`;
    case "catch-up candidate":
      return `Catch-up candidate because ${reasons.slice(0, 2).join(", ")}.`;
    case "reversal candidate":
      return `Reversal candidate because ${reasons.slice(0, 2).join(", ")}.`;
    default:
      return `Avoid/noisy because ${reasons.slice(0, 2).join(", ")}.`;
  }
}

function convictionFromScore(score: number) {
  if (score >= 75) return "High";
  if (score >= 60) return "Constructive";
  if (score >= 45) return "Mixed";
  return "Low";
}

function summarizeReasons(row: LeadershipStockRow, metrics: {
  residualRank: number;
  vwapRank: number;
  persistenceRank: number;
  volumeRank: number;
  continuationRank: number;
  reversalRank: number;
  catchUpRank: number;
  betaRank: number;
  spikeRank: number;
  riskRank: number;
}): string[] {
  const reasons: string[] = [];
  if (metrics.residualRank >= 75) reasons.push("residual strength is top-quartile");
  if (metrics.vwapRank >= 70) reasons.push("VWAP hold quality is strong");
  if (metrics.persistenceRank >= 70) reasons.push("relative-strength persistence is sustained");
  if (metrics.volumeRank >= 65) reasons.push("volume structure is supportive");
  if (metrics.continuationRank >= 70) reasons.push("continuation score is strong");
  if (metrics.reversalRank >= 70) reasons.push("reversal score is elevated");
  if (metrics.catchUpRank >= 75) reasons.push("catch-up score is elevated");
  if (metrics.betaRank >= 70) reasons.push("index-beta follow is doing too much of the work");
  if (metrics.spikeRank >= 70) reasons.push("headline spike risk is elevated");
  if (metrics.riskRank >= 70) reasons.push("risk and anomaly context are elevated");
  if (row.has_announcement) reasons.push("daily context includes an announcement");
  if ((row.minute_volume_ratio ?? 0) < 0.9 && metrics.residualRank >= 60) reasons.push("move lacks convincing minute volume");
  return reasons.slice(0, 4);
}

function buildRankedRows(rows: LeadershipStockRow[]): RankedLeadershipRow[] {
  const residualValues = rows.map((row) => toNumber(row.residual_return_60m_pct));
  const vwapValues = rows.map((row) => toNumber(row.vwap_hold_quality_score));
  const persistenceValues = rows.map((row) => toNumber(row.relative_strength_persistence_score));
  const volumeValues = rows.map((row) => toNumber(row.volume_curve_surprise));
  const continuationValues = rows.map((row) => toNumber(row.continuation_score));
  const reversalValues = rows.map((row) => toNumber(row.reversal_score));
  const catchUpValues = rows.map((row) => toNumber(row.catch_up_score));
  const betaValues = rows.map((row) => toNumber(row.index_beta_follow_score));
  const spikeValues = rows.map((row) => toNumber(row.headline_spike_score));
  const riskValues = rows.map((row) => toNumber(row.composite_risk_score) + toNumber(row.composite_anomaly_score));

  const ranked = rows.map((row) => {
    const residualRank = percentileRank(residualValues, row.residual_return_60m_pct);
    const vwapRank = percentileRank(vwapValues, row.vwap_hold_quality_score);
    const persistenceRank = percentileRank(persistenceValues, row.relative_strength_persistence_score);
    const volumeRank = percentileRank(volumeValues, row.volume_curve_surprise);
    const continuationRank = percentileRank(continuationValues, row.continuation_score);
    const reversalRank = percentileRank(reversalValues, row.reversal_score);
    const catchUpRank = percentileRank(catchUpValues, row.catch_up_score);
    const betaRank = percentileRank(betaValues, row.index_beta_follow_score);
    const spikeRank = percentileRank(spikeValues, row.headline_spike_score);
    const riskRank = percentileRank(riskValues, toNumber(row.composite_risk_score) + toNumber(row.composite_anomaly_score));

    const leadershipScore = clamp(
      residualRank * 0.28 +
        vwapRank * 0.18 +
        persistenceRank * 0.18 +
        continuationRank * 0.12 +
        volumeRank * 0.1 +
        percentileRank(rows.map((candidate) => toNumber(candidate.close_location_quality_pct)), row.close_location_quality_pct) * 0.08 -
        betaRank * 0.14 -
        spikeRank * 0.1 -
        riskRank * 0.08,
      0,
      100
    );

    const reasons = summarizeReasons(row, {
      residualRank,
      vwapRank,
      persistenceRank,
      volumeRank,
      continuationRank,
      reversalRank,
      catchUpRank,
      betaRank,
      spikeRank,
      riskRank
    });

    let category: LeaderCategory = "orderly follower";
    if (
      residualRank >= 72 &&
      vwapRank >= 60 &&
      persistenceRank >= 60 &&
      betaRank <= 60 &&
      spikeRank <= 65 &&
      leadershipScore >= 62
    ) {
      category = "true leader";
    } else if (
      (spikeRank >= 75 && persistenceRank <= 55) ||
      (betaRank >= 75 && residualRank <= 55) ||
      (riskRank >= 75 && leadershipScore <= 50) ||
      ((row.minute_volume_ratio ?? 0) < 0.85 && residualRank >= 60)
    ) {
      category = "avoid / noisy";
    } else if (catchUpRank >= 75 && vwapRank >= 50 && betaRank <= 70) {
      category = "catch-up candidate";
    } else if (reversalRank >= 75 && continuationRank <= 55) {
      category = "reversal candidate";
    } else {
      category = "orderly follower";
    }

    return {
      symbol: row.symbol,
      securityName: row.security_name,
      sectorName: titleCase(row.sector_name),
      universeWeight: toNullableNumber(row.universe_weight),
      lastPrice: toNullableNumber(row.last_price),
      absoluteReturnPct: toNullableNumber(row.absolute_return_pct),
      residualReturn60mPct: toNullableNumber(row.residual_return_60m_pct),
      relativeStrengthBps: toNullableNumber(row.relative_strength_bps),
      aboveVwap: Boolean(row.above_vwap),
      timeAboveVwapPct: toNullableNumber(row.time_above_vwap_pct),
      vwapHoldQualityScore: toNullableNumber(row.vwap_hold_quality_score),
      rsPersistenceScore: toNullableNumber(row.relative_strength_persistence_score),
      minuteVolumeRatio: toNullableNumber(row.minute_volume_ratio),
      volumeRatioDay: toNullableNumber(row.volume_ratio_day),
      volumeCurveSurprise: toNullableNumber(row.volume_curve_surprise),
      continuationScore: toNullableNumber(row.continuation_score),
      reversalScore: toNullableNumber(row.reversal_score),
      catchUpScore: toNullableNumber(row.catch_up_score),
      betaFollowScore: toNullableNumber(row.index_beta_follow_score),
      headlineSpikeScore: toNullableNumber(row.headline_spike_score),
      compositeTrendScore: toNullableNumber(row.composite_trend_score),
      compositeRiskScore: toNullableNumber(row.composite_risk_score),
      hasAnnouncement: Boolean(row.has_announcement),
      category,
      leadershipScore,
      categoryRank: 0,
      convictionLabel: convictionFromScore(leadershipScore),
      explanation: buildExplanation(category, reasons),
      reasons
    };
  });

  const counters = new Map<LeaderCategory, number>();
  return ranked
    .sort((left, right) => right.leadershipScore - left.leadershipScore || left.symbol.localeCompare(right.symbol))
    .map((row) => {
      const nextRank = (counters.get(row.category) ?? 0) + 1;
      counters.set(row.category, nextRank);
      return { ...row, categoryRank: nextRank };
    });
}

function byCategory(rows: RankedLeadershipRow[], category: LeaderCategory, limit = 5) {
  return rows.filter((row) => row.category === category).slice(0, limit);
}

function buildSectorStrength(rows: RankedLeadershipRow[]): SectorStrengthRow[] {
  const grouped = new Map<string, RankedLeadershipRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.sectorName) ?? [];
    bucket.push(row);
    grouped.set(row.sectorName, bucket);
  }

  return [...grouped.entries()]
    .map(([sectorName, sectorRows]) => {
      const stockCount = sectorRows.length;
      const trueLeaderCount = sectorRows.filter((row) => row.category === "true leader").length;
      const avoidCount = sectorRows.filter((row) => row.category === "avoid / noisy").length;
      const avg = (selector: (row: RankedLeadershipRow) => number | null | undefined) =>
        sectorRows.reduce((sum, row) => sum + toNumber(selector(row)), 0) / Math.max(stockCount, 1);

      return {
        sectorName,
        stockCount,
        avgResidualReturn60mPct: avg((row) => row.residualReturn60mPct),
        avgLeadershipScore: avg((row) => row.leadershipScore),
        avgContinuationScore: avg((row) => row.continuationScore),
        avgReversalScore: avg((row) => row.reversalScore),
        avgVwapHoldScore: avg((row) => row.vwapHoldQualityScore),
        trueLeaderCount,
        avoidCount,
        confirmation: trueLeaderCount > avoidCount ? "sector participation confirms leadership" : "sector breadth is thin",
        contradiction:
          avg((row) => row.betaFollowScore) > 55
            ? "sector move may still be beta-heavy"
            : "sector beta-follow is not the main issue"
      };
    })
    .sort((left, right) => right.avgLeadershipScore - left.avgLeadershipScore || left.sectorName.localeCompare(right.sectorName));
}

export async function getAnalyticsLeadership(prisma: PrismaClient) {
  const [stateRow] = await prisma.$queryRaw<LeadershipStateRow[]>(Prisma.sql`
    SELECT
      trade_date,
      generated_at,
      primary_state,
      change_pct,
      breadth_up_pct,
      breadth_above_vwap_pct,
      weighted_participation_pct,
      top10_concentration_pct
    FROM nse_intraday.vw_latest_market_summary
    WHERE index_code = 'NIFTY 50'
    ORDER BY trade_date DESC
    LIMIT 1
  `);

  if (!stateRow) {
    return {
      asOf: new Date().toISOString(),
      tradeDate: null,
      marketState: null,
      coverage: { stockCount: 0, sectorCount: 0, asOf: null },
      summary: null,
      topLeaders: [],
      falseLeaders: [],
      catchUpCandidates: [],
      reversalCandidates: [],
      rankingBoard: [],
      sectorStrength: []
    };
  }

  const stockRows = await prisma.$queryRaw<LeadershipStockRow[]>(Prisma.sql`
    WITH latest_feature AS (
      SELECT *
      FROM (
        SELECT
          trade_date,
          minute_ts,
          symbol,
          sector_name,
          universe_weight,
          last_price,
          change_pct_from_prev_close AS absolute_return_pct,
          residual_return_60m_pct,
          residual_return_30m_pct,
          above_vwap,
          time_above_vwap_pct,
          vwap_hold_quality_score,
          relative_strength_persistence_score,
          range_efficiency_pct,
          minute_volume_ratio,
          cum_volume_vs_profile,
          volume_curve_surprise,
          close_location_quality_pct,
          beta_20d,
          beta_60d,
          row_number() OVER (PARTITION BY symbol ORDER BY minute_ts DESC) AS rn
        FROM nse_intraday.security_minute_feature
        WHERE trade_date = ${stateRow.trade_date}
      ) ranked
      WHERE rn = 1
    ),
    latest_live AS (
      SELECT *
      FROM (
        SELECT
          trade_date,
          as_of_ts,
          symbol,
          relative_strength_bps,
          volume_ratio_day,
          continuation_score,
          weakness_score,
          mean_reversion_score,
          reversal_score,
          dominant_signal,
          direction,
          conclusion,
          residual_leadership_score,
          index_beta_follow_score,
          vwap_control_score,
          headline_spike_score,
          catch_up_score,
          row_number() OVER (PARTITION BY symbol ORDER BY as_of_ts DESC) AS rn
        FROM nse_intraday.stock_intraday_live
        WHERE trade_date = ${stateRow.trade_date}
      ) ranked
      WHERE rn = 1
    ),
    latest_daily AS (
      SELECT *
      FROM (
        SELECT
          symbol,
          security_name,
          close_price,
          daily_return,
          volume_rel_20,
          delivery_rel_20,
          composite_trend_score,
          composite_reversal_score,
          composite_anomaly_score,
          composite_risk_score,
          has_announcement,
          row_number() OVER (PARTITION BY symbol ORDER BY trade_date DESC) AS rn
        FROM nse_app.security_daily_features
      ) ranked
      WHERE rn = 1
    ),
    latest_signals AS (
      SELECT
        symbol,
        max(CASE WHEN signal_direction = 'bullish' THEN signal_strength END) AS max_bullish_signal,
        max(CASE WHEN signal_direction = 'bearish' THEN signal_strength END) AS max_bearish_signal,
        max(CASE WHEN lower(analysis_type) LIKE '%trend%' THEN signal_strength END) AS trend_signal_strength,
        max(CASE WHEN lower(analysis_type) LIKE '%reversal%' THEN signal_strength END) AS reversal_signal_strength,
        max(CASE WHEN lower(analysis_type) LIKE '%anomaly%' THEN signal_strength END) AS anomaly_signal_strength
      FROM nse_app.stock_analysis_signals_daily
      GROUP BY symbol
    )
    SELECT
      feature.trade_date,
      feature.minute_ts,
      feature.symbol,
      feature.sector_name,
      feature.universe_weight,
      daily.security_name,
      feature.last_price,
      feature.absolute_return_pct,
      feature.residual_return_60m_pct,
      feature.residual_return_30m_pct,
      live.relative_strength_bps,
      feature.above_vwap,
      feature.time_above_vwap_pct,
      feature.vwap_hold_quality_score,
      feature.relative_strength_persistence_score,
      feature.range_efficiency_pct,
      feature.minute_volume_ratio,
      feature.cum_volume_vs_profile,
      feature.volume_curve_surprise,
      feature.close_location_quality_pct,
      feature.beta_20d,
      feature.beta_60d,
      live.volume_ratio_day,
      live.continuation_score,
      live.weakness_score,
      live.mean_reversion_score,
      live.reversal_score,
      live.dominant_signal,
      live.direction,
      live.conclusion,
      live.residual_leadership_score,
      live.index_beta_follow_score,
      live.vwap_control_score,
      live.headline_spike_score,
      live.catch_up_score,
      daily.volume_rel_20,
      daily.delivery_rel_20,
      daily.composite_trend_score,
      daily.composite_reversal_score,
      daily.composite_anomaly_score,
      daily.composite_risk_score,
      daily.has_announcement,
      signals.max_bullish_signal,
      signals.max_bearish_signal,
      signals.trend_signal_strength,
      signals.reversal_signal_strength,
      signals.anomaly_signal_strength
    FROM latest_feature feature
    LEFT JOIN latest_live live ON live.symbol = feature.symbol
    LEFT JOIN latest_daily daily ON daily.symbol = feature.symbol
    LEFT JOIN latest_signals signals ON signals.symbol = feature.symbol
    ORDER BY feature.symbol ASC
  `);

  const rankedRows = buildRankedRows(stockRows);
  const sectorStrength = buildSectorStrength(rankedRows);
  const dominantState = marketStateLabel(stateRow);
  const continuationBias = continuationSupport(stateRow);

  return {
    asOf: new Date().toISOString(),
    tradeDate: toDateKey(stateRow.trade_date),
    marketState: {
      generatedAt: toIso(stateRow.generated_at),
      dominantState,
      continuationBias,
      indexChangePct: toNullableNumber(stateRow.change_pct),
      breadthUpPct: toNullableNumber(stateRow.breadth_up_pct),
      breadthAboveVwapPct: toNullableNumber(stateRow.breadth_above_vwap_pct),
      weightedParticipationPct: toNullableNumber(stateRow.weighted_participation_pct),
      top10ConcentrationPct: toNullableNumber(stateRow.top10_concentration_pct)
    },
    coverage: {
      stockCount: rankedRows.length,
      sectorCount: sectorStrength.length,
      asOf: rankedRows[0] ? toIso(stockRows[0]?.minute_ts) : null
    },
    summary: {
      dominantState,
      continuationBias,
      trueLeaderCount: rankedRows.filter((row) => row.category === "true leader").length,
      followerCount: rankedRows.filter((row) => row.category === "orderly follower").length,
      catchUpCount: rankedRows.filter((row) => row.category === "catch-up candidate").length,
      reversalCount: rankedRows.filter((row) => row.category === "reversal candidate").length,
      avoidCount: rankedRows.filter((row) => row.category === "avoid / noisy").length,
      strongestSector: sectorStrength[0]?.sectorName ?? null,
      weakestSector: sectorStrength[sectorStrength.length - 1]?.sectorName ?? null,
      leadershipVsBeta: "leaders are rewarded only when residual strength beats beta-follow pressure",
      marketSupportNote: `${titleCase(dominantState)} currently ${continuationBias}.`
    },
    topLeaders: byCategory(rankedRows, "true leader"),
    falseLeaders: byCategory(rankedRows, "avoid / noisy"),
    catchUpCandidates: byCategory(rankedRows, "catch-up candidate"),
    reversalCandidates: byCategory(rankedRows, "reversal candidate"),
    allRows: rankedRows,
    rankingBoard: rankedRows.slice(0, 24),
    sectorStrength
  };
}

export function registerAnalyticsLeadership(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/leadership", async (_req, res) => {
    try {
      const payload = await getAnalyticsLeadership(prisma);
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=300");
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        error: {
          code: "ANALYTICS_LEADERSHIP_FAILED",
          message: error instanceof Error ? error.message : "Unable to build stock leadership payload"
        }
      });
    }
  });
}
