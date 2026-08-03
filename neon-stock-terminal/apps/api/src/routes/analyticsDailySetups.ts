import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";

type MarketContextRow = {
  trade_date: Date | string;
  market_regime: string | null;
  breakout_count: number | bigint | null;
  breakdown_count: number | bigint | null;
  accumulation_count: number | bigint | null;
  distribution_count: number | bigint | null;
  positive_ratio: number | null;
  avg_daily_return: number | null;
};

type CurrentSetupRow = {
  trade_date: Date | string;
  market_regime: string | null;
  symbol: string;
  security_name: string | null;
  close_price: number | null;
  daily_return: number | null;
  volume_rel_20: number | null;
  delivery_rel_20: number | null;
  distance_from_52w_high_pct: number | null;
  breakout_20d_flag: boolean | null;
  breakdown_20d_flag: boolean | null;
  high_volume_flag: boolean | null;
  high_delivery_flag: boolean | null;
  has_announcement: boolean | null;
  has_board_meeting: boolean | null;
  has_corporate_action: boolean | null;
  composite_trend_score: number | null;
  composite_reversal_score: number | null;
  composite_anomaly_score: number | null;
  composite_risk_score: number | null;
  analysis_type: string | null;
  signal_name: string | null;
  signal_direction: string | null;
  signal_strength: number | null;
  rationale: string | null;
  sample_size: number | bigint | null;
  hit_rate_1d: number | null;
  hit_rate_3d: number | null;
  hit_rate_5d: number | null;
  hit_rate_10d: number | null;
  avg_fwd_return_1d: number | null;
  avg_fwd_return_3d: number | null;
  avg_fwd_return_5d: number | null;
  avg_fwd_return_10d: number | null;
};

type CountHistoryRow = {
  trade_date: Date | string;
  market_regime: string | null;
  breakout_count: number | bigint | null;
  breakdown_count: number | bigint | null;
};

type BucketRow = {
  bucket_label: string;
  bucket_order: number | bigint;
  sample_size: number | bigint;
  hit_rate_5d: number | null;
  avg_forward_return_1d: number | null;
  avg_forward_return_3d: number | null;
  avg_forward_return_5d: number | null;
  avg_forward_return_10d: number | null;
  median_forward_return_5d: number | null;
};

type SignalHitRateRow = {
  analysis_type: string;
  signal_name: string;
  signal_direction: string;
  sample_size: number | bigint;
  hit_rate_1d: number | null;
  hit_rate_3d: number | null;
  hit_rate_5d: number | null;
  hit_rate_10d: number | null;
  avg_fwd_return_1d: number | null;
  avg_fwd_return_3d: number | null;
  avg_fwd_return_5d: number | null;
  avg_fwd_return_10d: number | null;
};

type RegimePerformanceRow = {
  analysis_type: string;
  signal_name: string;
  signal_direction: string;
  market_regime: string;
  sample_size: number | bigint;
  avg_1d: number | null;
  avg_3d: number | null;
  avg_5d: number | null;
  avg_10d: number | null;
};

type RankedSetupRow = {
  symbol: string;
  securityName: string | null;
  closePrice: number | null;
  dailyReturn: number | null;
  volumeRel20: number | null;
  deliveryRel20: number | null;
  distanceFrom52wHighPct: number | null;
  analysisType: string | null;
  signalName: string | null;
  signalDirection: string | null;
  signalStrength: number | null;
  rationale: string | null;
  sampleSize: number;
  marketRegime: string;
  hitRate1d: number | null;
  hitRate3d: number | null;
  hitRate5d: number | null;
  hitRate10d: number | null;
  avgForwardReturn1d: number | null;
  avgForwardReturn3d: number | null;
  avgForwardReturn5d: number | null;
  avgForwardReturn10d: number | null;
  breakout20d: boolean;
  breakdown20d: boolean;
  highVolume: boolean;
  highDelivery: boolean;
  hasAnnouncement: boolean;
  hasBoardMeeting: boolean;
  hasCorporateAction: boolean;
  compositeTrendScore: number | null;
  compositeReversalScore: number | null;
  compositeRiskScore: number | null;
  setupStyle: "breakout continuation" | "pullback entry" | "relative-strength hold" | "mean-reversion only" | "avoid";
  qualityLabel: "constructive" | "mixed" | "deceptive";
  rankingScore: number;
  reasons: string[];
  cautionFlags: string[];
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

function titleCase(input: string | null | undefined) {
  const normalized = (input ?? "").replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, (token) => token.toUpperCase());
}

function scoreCurrentSetup(row: CurrentSetupRow) {
  const sampleSize = toNumber(row.sample_size);
  const sampleBonus = clamp(Math.log10(sampleSize + 1) * 8, 0, 20);
  const strengthBonus = clamp(toNumber(row.signal_strength) / 4, 0, 25);
  const volumeBonus = clamp(toNumber(row.volume_rel_20), 0, 5) * 3;
  const deliveryBonus = clamp(toNumber(row.delivery_rel_20), 0, 1.8) * 6;
  const expectancyBonus =
    toNumber(row.avg_fwd_return_1d) * 150 +
    toNumber(row.avg_fwd_return_3d) * 220 +
    toNumber(row.avg_fwd_return_5d) * 320 +
    toNumber(row.avg_fwd_return_10d) * 180;
  const breakoutBonus = row.breakout_20d_flag ? 8 : row.breakdown_20d_flag ? -6 : 0;
  const trendBonus = toNumber(row.composite_trend_score) * 2.2;
  const reversalPenalty = toNumber(row.composite_reversal_score) * 1.7;
  const riskPenalty = (toNumber(row.composite_risk_score) + toNumber(row.composite_anomaly_score)) * 1.4;
  const eventPenalty = row.has_announcement || row.has_board_meeting || row.has_corporate_action ? 6 : 0;
  const cautionPenalty =
    row.signal_direction === "caution" ? 10 : row.signal_direction === "bearish" ? 8 : 0;
  const spikePenalty =
    row.signal_name === "speculative_rise" || row.signal_name === "price_volume_anomaly" ? 12 : 0;
  const proximityBonus = row.distance_from_52w_high_pct != null
    ? row.distance_from_52w_high_pct <= 5
      ? 7
      : row.distance_from_52w_high_pct <= 10
        ? 3
        : -2
    : 0;
  return clamp(
    sampleBonus +
      strengthBonus +
      volumeBonus +
      deliveryBonus +
      expectancyBonus +
      breakoutBonus +
      trendBonus +
      proximityBonus -
      reversalPenalty -
      riskPenalty -
      eventPenalty -
      cautionPenalty -
      spikePenalty,
    -100,
    100
  );
}

function buildReasons(row: CurrentSetupRow) {
  const reasons: string[] = [];
  const cautionFlags: string[] = [];

  if (row.breakout_20d_flag) reasons.push("20-day breakout is active");
  if (row.breakdown_20d_flag) reasons.push("20-day breakdown is active");
  if (toNumber(row.volume_rel_20) >= 1.5) reasons.push("volume is meaningfully above the 20-day baseline");
  if (toNumber(row.delivery_rel_20) >= 1.05) reasons.push("delivery is confirming the move");
  if (row.distance_from_52w_high_pct != null && row.distance_from_52w_high_pct <= 8) {
    reasons.push("price is still close to the 52-week high");
  }
  if (toNumber(row.avg_fwd_return_5d) > 0 && toNumber(row.sample_size) >= 100) {
    reasons.push("historical 5-day expectancy is positive with a usable sample");
  }
  if (row.signal_direction === "caution") cautionFlags.push("signal direction is caution, so signal presence is not the same as signal quality");
  if (row.has_announcement) cautionFlags.push("announcement-day moves can be news spikes rather than durable setups");
  if (row.has_board_meeting) cautionFlags.push("board-meeting timing can create headline distortion");
  if (row.has_corporate_action) cautionFlags.push("corporate-action dates can distort raw price behavior");
  if (toNumber(row.volume_rel_20) < 1) cautionFlags.push("volume is not clearly confirming the move");
  if (toNumber(row.delivery_rel_20) < 0.85) cautionFlags.push("delivery is too weak for a conviction read");
  if (toNumber(row.avg_fwd_return_5d) < 0) cautionFlags.push("historical 5-day expectancy is negative");
  if (toNumber(row.sample_size) < 100) cautionFlags.push("sample size is small enough to be unstable");
  if (row.signal_name === "speculative_rise" || row.signal_name === "price_volume_anomaly") {
    cautionFlags.push("this signal family often marks a spike, not durable leadership");
  }

  return {
    reasons: reasons.slice(0, 4),
    cautionFlags: cautionFlags.slice(0, 4)
  };
}

function toSetupStyle(row: CurrentSetupRow): RankedSetupRow["setupStyle"] {
  if (row.signal_name === "speculative_rise" || row.signal_name === "price_volume_anomaly") return "mean-reversion only";
  if (row.breakout_20d_flag && toNumber(row.volume_rel_20) >= 1.25) return "breakout continuation";
  if (toNumber(row.delivery_rel_20) >= 1 && toNumber(row.avg_fwd_return_5d) >= -0.003) return "relative-strength hold";
  if (toNumber(row.composite_reversal_score) > toNumber(row.composite_trend_score)) return "mean-reversion only";
  if (toNumber(row.distance_from_52w_high_pct) <= 15) return "pullback entry";
  return "avoid";
}

function buildRankedSetups(rows: CurrentSetupRow[]): RankedSetupRow[] {
  return rows
    .map((row) => {
      const { reasons, cautionFlags } = buildReasons(row);
      const rankingScore = scoreCurrentSetup(row);
      const qualityLabel: RankedSetupRow["qualityLabel"] =
        rankingScore >= 28 && toNumber(row.sample_size) >= 100 && toNumber(row.avg_fwd_return_5d) > -0.003
          ? "constructive"
          : rankingScore <= 5 || cautionFlags.length >= 2
            ? "deceptive"
            : "mixed";
      return {
        symbol: row.symbol,
        securityName: row.security_name,
        closePrice: toNullableNumber(row.close_price),
        dailyReturn: toNullableNumber(row.daily_return),
        volumeRel20: toNullableNumber(row.volume_rel_20),
        deliveryRel20: toNullableNumber(row.delivery_rel_20),
        distanceFrom52wHighPct: toNullableNumber(row.distance_from_52w_high_pct),
        analysisType: row.analysis_type,
        signalName: row.signal_name,
        signalDirection: row.signal_direction,
        signalStrength: toNullableNumber(row.signal_strength),
        rationale: row.rationale,
        sampleSize: toNumber(row.sample_size),
        marketRegime: titleCase(row.market_regime),
        hitRate1d: toNullableNumber(row.hit_rate_1d),
        hitRate3d: toNullableNumber(row.hit_rate_3d),
        hitRate5d: toNullableNumber(row.hit_rate_5d),
        hitRate10d: toNullableNumber(row.hit_rate_10d),
        avgForwardReturn1d: toNullableNumber(row.avg_fwd_return_1d),
        avgForwardReturn3d: toNullableNumber(row.avg_fwd_return_3d),
        avgForwardReturn5d: toNullableNumber(row.avg_fwd_return_5d),
        avgForwardReturn10d: toNullableNumber(row.avg_fwd_return_10d),
        breakout20d: Boolean(row.breakout_20d_flag),
        breakdown20d: Boolean(row.breakdown_20d_flag),
        highVolume: Boolean(row.high_volume_flag),
        highDelivery: Boolean(row.high_delivery_flag),
        hasAnnouncement: Boolean(row.has_announcement),
        hasBoardMeeting: Boolean(row.has_board_meeting),
        hasCorporateAction: Boolean(row.has_corporate_action),
        compositeTrendScore: toNullableNumber(row.composite_trend_score),
        compositeReversalScore: toNullableNumber(row.composite_reversal_score),
        compositeRiskScore: toNullableNumber(row.composite_risk_score),
        setupStyle: toSetupStyle(row),
        qualityLabel,
        rankingScore,
        reasons,
        cautionFlags
      };
    })
    .sort((left, right) => right.rankingScore - left.rankingScore || left.symbol.localeCompare(right.symbol));
}

function topCurrentSetups(rows: RankedSetupRow[]) {
  return rows
    .filter((row) => row.qualityLabel !== "deceptive")
    .slice(0, 5);
}

function deceptiveSetups(rows: RankedSetupRow[]) {
  return rows
    .filter((row) => row.qualityLabel === "deceptive")
    .sort((left, right) => left.rankingScore - right.rankingScore || left.symbol.localeCompare(right.symbol))
    .slice(0, 5);
}

export async function getAnalyticsDailySetups(prisma: PrismaClient) {
  const [marketContext] = await prisma.$queryRaw<MarketContextRow[]>(Prisma.sql`
    SELECT
      trade_date,
      market_regime,
      breakout_count,
      breakdown_count,
      accumulation_count,
      distribution_count,
      positive_ratio,
      avg_daily_return
    FROM nse_app.market_summary_daily
    ORDER BY trade_date DESC
    LIMIT 1
  `);

  if (!marketContext) {
    return {
      asOf: new Date().toISOString(),
      tradeDate: null,
      marketContext: null,
      summary: null,
      currentSetups: [],
      bestCurrentSetups: [],
      deceptiveSetups: [],
      breakoutBreakdownHistory: [],
      volumeBuckets: [],
      deliveryBuckets: [],
      distanceBuckets: [],
      signalHitRates: [],
      regimePerformance: []
    };
  }

  const [
    currentRows,
    countHistory,
    volumeBuckets,
    deliveryBuckets,
    distanceBuckets,
    signalHitRates,
    regimePerformance
  ] = await Promise.all([
    prisma.$queryRaw<CurrentSetupRow[]>(Prisma.sql`
      WITH latest_trade AS (
        SELECT max(trade_date) AS trade_date
        FROM nse_app.security_daily_features
      ),
      latest_perf AS (
        SELECT *
        FROM nse_app.signal_performance_summary
        WHERE as_of_date = (SELECT max(as_of_date) FROM nse_app.signal_performance_summary)
      ),
      ranked_signals AS (
        SELECT
          s.trade_date,
          s.symbol,
          s.analysis_type,
          s.signal_name,
          s.signal_direction,
          s.signal_strength,
          s.rationale,
          row_number() OVER (
            PARTITION BY s.symbol
            ORDER BY coalesce(s.signal_strength, 0) DESC, s.analysis_type, s.signal_name
          ) AS rn
        FROM nse_app.stock_analysis_signals_daily s
        WHERE s.trade_date = (SELECT trade_date FROM latest_trade)
      ),
      selected_signals AS (
        SELECT *
        FROM ranked_signals
        WHERE rn = 1
      )
      SELECT
        d.trade_date,
        ctx.market_regime,
        d.symbol,
        d.security_name,
        d.close_price,
        d.daily_return,
        d.volume_rel_20,
        d.delivery_rel_20,
        CASE
          WHEN d.adjusted_52_week_high IS NOT NULL
            AND d.adjusted_52_week_high > 0
            AND d.close_price IS NOT NULL
          THEN greatest(0, ((d.adjusted_52_week_high - d.close_price) / d.adjusted_52_week_high) * 100)
          ELSE NULL
        END AS distance_from_52w_high_pct,
        d.breakout_20d_flag,
        d.breakdown_20d_flag,
        d.high_volume_flag,
        d.high_delivery_flag,
        d.has_announcement,
        d.has_board_meeting,
        d.has_corporate_action,
        d.composite_trend_score,
        d.composite_reversal_score,
        d.composite_anomaly_score,
        d.composite_risk_score,
        sig.analysis_type,
        sig.signal_name,
        sig.signal_direction,
        sig.signal_strength,
        sig.rationale,
        perf.sample_size,
        perf.hit_rate_1d,
        perf.hit_rate_3d,
        perf.hit_rate_5d,
        perf.hit_rate_10d,
        perf.avg_fwd_return_1d,
        perf.avg_fwd_return_3d,
        perf.avg_fwd_return_5d,
        perf.avg_fwd_return_10d
      FROM nse_app.security_daily_features d
      JOIN nse_app.market_summary_daily ctx
        ON ctx.trade_date = d.trade_date
      LEFT JOIN selected_signals sig
        ON sig.trade_date = d.trade_date
        AND sig.symbol = d.symbol
      LEFT JOIN latest_perf perf
        ON perf.analysis_type = sig.analysis_type
        AND perf.signal_name = sig.signal_name
        AND perf.signal_direction = sig.signal_direction
      WHERE d.trade_date = (SELECT trade_date FROM latest_trade)
        AND (
          sig.symbol IS NOT NULL
          OR d.breakout_20d_flag
          OR d.breakdown_20d_flag
          OR d.high_volume_flag
          OR d.high_delivery_flag
          OR d.has_announcement
          OR d.has_board_meeting
          OR d.has_corporate_action
        )
      ORDER BY coalesce(sig.signal_strength, 0) DESC, abs(coalesce(d.daily_return, 0)) DESC, d.symbol ASC
      LIMIT 180
    `),
    prisma.$queryRaw<CountHistoryRow[]>(Prisma.sql`
      SELECT
        trade_date,
        market_regime,
        breakout_count,
        breakdown_count
      FROM nse_app.market_summary_daily
      ORDER BY trade_date DESC
      LIMIT 60
    `),
    prisma.$queryRaw<BucketRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          CASE
            WHEN volume_rel_20 < 0.8 THEN '<0.8x'
            WHEN volume_rel_20 < 1.2 THEN '0.8-1.2x'
            WHEN volume_rel_20 < 2 THEN '1.2-2.0x'
            WHEN volume_rel_20 < 4 THEN '2.0-4.0x'
            ELSE '4.0x+'
          END AS bucket_label,
          CASE
            WHEN volume_rel_20 < 0.8 THEN 1
            WHEN volume_rel_20 < 1.2 THEN 2
            WHEN volume_rel_20 < 2 THEN 3
            WHEN volume_rel_20 < 4 THEN 4
            ELSE 5
          END AS bucket_order,
          fwd_return_1d,
          fwd_return_3d,
          fwd_return_5d,
          fwd_return_10d
        FROM nse_app.security_daily_features
        WHERE volume_rel_20 IS NOT NULL
          AND fwd_return_5d IS NOT NULL
      )
      SELECT
        bucket_label,
        bucket_order,
        count(*)::int AS sample_size,
        avg(CASE WHEN fwd_return_5d > 0 THEN 100.0 ELSE 0.0 END) AS hit_rate_5d,
        avg(fwd_return_1d) AS avg_forward_return_1d,
        avg(fwd_return_3d) AS avg_forward_return_3d,
        avg(fwd_return_5d) AS avg_forward_return_5d,
        avg(fwd_return_10d) AS avg_forward_return_10d,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY fwd_return_5d) AS median_forward_return_5d
      FROM bucketed
      GROUP BY bucket_label, bucket_order
      ORDER BY bucket_order ASC
    `),
    prisma.$queryRaw<BucketRow[]>(Prisma.sql`
      WITH bucketed AS (
        SELECT
          CASE
            WHEN delivery_rel_20 < 0.75 THEN '<0.75x'
            WHEN delivery_rel_20 < 1.0 THEN '0.75-1.0x'
            WHEN delivery_rel_20 < 1.25 THEN '1.0-1.25x'
            WHEN delivery_rel_20 < 1.5 THEN '1.25-1.5x'
            ELSE '1.5x+'
          END AS bucket_label,
          CASE
            WHEN delivery_rel_20 < 0.75 THEN 1
            WHEN delivery_rel_20 < 1.0 THEN 2
            WHEN delivery_rel_20 < 1.25 THEN 3
            WHEN delivery_rel_20 < 1.5 THEN 4
            ELSE 5
          END AS bucket_order,
          fwd_return_1d,
          fwd_return_3d,
          fwd_return_5d,
          fwd_return_10d
        FROM nse_app.security_daily_features
        WHERE delivery_rel_20 IS NOT NULL
          AND fwd_return_5d IS NOT NULL
      )
      SELECT
        bucket_label,
        bucket_order,
        count(*)::int AS sample_size,
        avg(CASE WHEN fwd_return_5d > 0 THEN 100.0 ELSE 0.0 END) AS hit_rate_5d,
        avg(fwd_return_1d) AS avg_forward_return_1d,
        avg(fwd_return_3d) AS avg_forward_return_3d,
        avg(fwd_return_5d) AS avg_forward_return_5d,
        avg(fwd_return_10d) AS avg_forward_return_10d,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY fwd_return_5d) AS median_forward_return_5d
      FROM bucketed
      GROUP BY bucket_label, bucket_order
      ORDER BY bucket_order ASC
    `),
    prisma.$queryRaw<BucketRow[]>(Prisma.sql`
      WITH distance_data AS (
        SELECT
          CASE
            WHEN ((adjusted_52_week_high - close_price) / adjusted_52_week_high) * 100 < 5 THEN '0-5%'
            WHEN ((adjusted_52_week_high - close_price) / adjusted_52_week_high) * 100 < 10 THEN '5-10%'
            WHEN ((adjusted_52_week_high - close_price) / adjusted_52_week_high) * 100 < 20 THEN '10-20%'
            WHEN ((adjusted_52_week_high - close_price) / adjusted_52_week_high) * 100 < 40 THEN '20-40%'
            ELSE '40%+'
          END AS bucket_label,
          CASE
            WHEN ((adjusted_52_week_high - close_price) / adjusted_52_week_high) * 100 < 5 THEN 1
            WHEN ((adjusted_52_week_high - close_price) / adjusted_52_week_high) * 100 < 10 THEN 2
            WHEN ((adjusted_52_week_high - close_price) / adjusted_52_week_high) * 100 < 20 THEN 3
            WHEN ((adjusted_52_week_high - close_price) / adjusted_52_week_high) * 100 < 40 THEN 4
            ELSE 5
          END AS bucket_order,
          fwd_return_1d,
          fwd_return_3d,
          fwd_return_5d,
          fwd_return_10d
        FROM nse_app.security_daily_features
        WHERE adjusted_52_week_high IS NOT NULL
          AND adjusted_52_week_high > 0
          AND close_price IS NOT NULL
          AND fwd_return_5d IS NOT NULL
      )
      SELECT
        bucket_label,
        bucket_order,
        count(*)::int AS sample_size,
        avg(CASE WHEN fwd_return_5d > 0 THEN 100.0 ELSE 0.0 END) AS hit_rate_5d,
        avg(fwd_return_1d) AS avg_forward_return_1d,
        avg(fwd_return_3d) AS avg_forward_return_3d,
        avg(fwd_return_5d) AS avg_forward_return_5d,
        avg(fwd_return_10d) AS avg_forward_return_10d,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY fwd_return_5d) AS median_forward_return_5d
      FROM distance_data
      GROUP BY bucket_label, bucket_order
      ORDER BY bucket_order ASC
    `),
    prisma.$queryRaw<SignalHitRateRow[]>(Prisma.sql`
      SELECT
        analysis_type,
        signal_name,
        signal_direction,
        sample_size,
        hit_rate_1d,
        hit_rate_3d,
        hit_rate_5d,
        hit_rate_10d,
        avg_fwd_return_1d,
        avg_fwd_return_3d,
        avg_fwd_return_5d,
        avg_fwd_return_10d
      FROM nse_app.signal_performance_summary
      WHERE as_of_date = (SELECT max(as_of_date) FROM nse_app.signal_performance_summary)
        AND sample_size >= 50
      ORDER BY sample_size DESC, avg_fwd_return_5d DESC NULLS LAST
      LIMIT 12
    `),
    prisma.$queryRaw<RegimePerformanceRow[]>(Prisma.sql`
      WITH base AS (
        SELECT
          s.analysis_type,
          s.signal_name,
          s.signal_direction,
          m.market_regime,
          count(*)::int AS sample_size,
          avg(s.fwd_return_1d) AS avg_1d,
          avg(s.fwd_return_3d) AS avg_3d,
          avg(s.fwd_return_5d) AS avg_5d,
          avg(s.fwd_return_10d) AS avg_10d
        FROM nse_app.stock_analysis_signals_daily s
        JOIN nse_app.market_summary_daily m
          ON m.trade_date = s.trade_date
        WHERE s.fwd_return_5d IS NOT NULL
          AND s.signal_name IN (
            'breakout_20d',
            'breakdown_20d',
            'accumulation',
            'distribution',
            'announcement_watch',
            'board_meeting_watch',
            'corporate_action_day',
            'speculative_rise',
            'price_volume_anomaly'
          )
        GROUP BY 1, 2, 3, 4
      )
      SELECT
        analysis_type,
        signal_name,
        signal_direction,
        market_regime,
        sample_size,
        avg_1d,
        avg_3d,
        avg_5d,
        avg_10d
      FROM base
      WHERE sample_size >= 50
      ORDER BY market_regime, avg_5d DESC NULLS LAST, sample_size DESC
      LIMIT 48
    `)
  ]);

  const rankedSetups = buildRankedSetups(currentRows);
  const bestSetups = topCurrentSetups(rankedSetups);
  const weakSetups = deceptiveSetups(rankedSetups);
  const signalQualityPositiveCount = signalHitRates.filter((row) => toNumber(row.avg_fwd_return_5d) > 0).length;
  const currentRegime = titleCase(marketContext.market_regime);

  return {
    asOf: new Date().toISOString(),
    tradeDate: toDateKey(marketContext.trade_date),
    marketContext: {
      tradeDate: toDateKey(marketContext.trade_date),
      marketRegime: currentRegime,
      breakoutCount: toNumber(marketContext.breakout_count),
      breakdownCount: toNumber(marketContext.breakdown_count),
      accumulationCount: toNumber(marketContext.accumulation_count),
      distributionCount: toNumber(marketContext.distribution_count),
      positiveRatio: toNullableNumber(marketContext.positive_ratio),
      avgDailyReturn: toNullableNumber(marketContext.avg_daily_return)
    },
    summary: {
      currentRegime,
      activeSetupCount: rankedSetups.length,
      constructiveCount: rankedSetups.filter((row) => row.qualityLabel === "constructive").length,
      deceptiveCount: rankedSetups.filter((row) => row.qualityLabel === "deceptive").length,
      positiveExpectancySignals: signalQualityPositiveCount,
      regimeMessage:
        currentRegime === "Risk On"
          ? "Signal presence is elevated, but most broad breakout setups still show weak 5-day expectancy in this regime."
          : currentRegime === "Risk Off"
            ? "Breakdown and caution signals dominate, and even bullish setups need tighter risk control."
            : "Setup quality is mixed, so sample size and confirmation matter more than signal count."
    },
    currentSetups: rankedSetups.slice(0, 24),
    bestCurrentSetups: bestSetups,
    deceptiveSetups: weakSetups,
    breakoutBreakdownHistory: countHistory
      .map((row) => ({
        tradeDate: toDateKey(row.trade_date),
        marketRegime: titleCase(row.market_regime),
        breakoutCount: toNumber(row.breakout_count),
        breakdownCount: toNumber(row.breakdown_count)
      }))
      .reverse(),
    volumeBuckets: volumeBuckets.map((row) => ({
      bucketLabel: row.bucket_label,
      bucketOrder: toNumber(row.bucket_order),
      sampleSize: toNumber(row.sample_size),
      hitRate5d: toNullableNumber(row.hit_rate_5d),
      avgForwardReturn1d: toNullableNumber(row.avg_forward_return_1d),
      avgForwardReturn3d: toNullableNumber(row.avg_forward_return_3d),
      avgForwardReturn5d: toNullableNumber(row.avg_forward_return_5d),
      avgForwardReturn10d: toNullableNumber(row.avg_forward_return_10d),
      medianForwardReturn5d: toNullableNumber(row.median_forward_return_5d)
    })),
    deliveryBuckets: deliveryBuckets.map((row) => ({
      bucketLabel: row.bucket_label,
      bucketOrder: toNumber(row.bucket_order),
      sampleSize: toNumber(row.sample_size),
      hitRate5d: toNullableNumber(row.hit_rate_5d),
      avgForwardReturn1d: toNullableNumber(row.avg_forward_return_1d),
      avgForwardReturn3d: toNullableNumber(row.avg_forward_return_3d),
      avgForwardReturn5d: toNullableNumber(row.avg_forward_return_5d),
      avgForwardReturn10d: toNullableNumber(row.avg_forward_return_10d),
      medianForwardReturn5d: toNullableNumber(row.median_forward_return_5d)
    })),
    distanceBuckets: distanceBuckets.map((row) => ({
      bucketLabel: row.bucket_label,
      bucketOrder: toNumber(row.bucket_order),
      sampleSize: toNumber(row.sample_size),
      hitRate5d: toNullableNumber(row.hit_rate_5d),
      avgForwardReturn1d: toNullableNumber(row.avg_forward_return_1d),
      avgForwardReturn3d: toNullableNumber(row.avg_forward_return_3d),
      avgForwardReturn5d: toNullableNumber(row.avg_forward_return_5d),
      avgForwardReturn10d: toNullableNumber(row.avg_forward_return_10d),
      medianForwardReturn5d: toNullableNumber(row.median_forward_return_5d)
    })),
    signalHitRates: signalHitRates.map((row) => ({
      analysisType: row.analysis_type,
      signalName: row.signal_name,
      signalDirection: row.signal_direction,
      sampleSize: toNumber(row.sample_size),
      hitRate1d: toNullableNumber(row.hit_rate_1d),
      hitRate3d: toNullableNumber(row.hit_rate_3d),
      hitRate5d: toNullableNumber(row.hit_rate_5d),
      hitRate10d: toNullableNumber(row.hit_rate_10d),
      avgForwardReturn1d: toNullableNumber(row.avg_fwd_return_1d),
      avgForwardReturn3d: toNullableNumber(row.avg_fwd_return_3d),
      avgForwardReturn5d: toNullableNumber(row.avg_fwd_return_5d),
      avgForwardReturn10d: toNullableNumber(row.avg_fwd_return_10d)
    })),
    regimePerformance: regimePerformance.map((row) => ({
      analysisType: row.analysis_type,
      signalName: row.signal_name,
      signalDirection: row.signal_direction,
      marketRegime: titleCase(row.market_regime),
      sampleSize: toNumber(row.sample_size),
      avgForwardReturn1d: toNullableNumber(row.avg_1d),
      avgForwardReturn3d: toNullableNumber(row.avg_3d),
      avgForwardReturn5d: toNullableNumber(row.avg_5d),
      avgForwardReturn10d: toNullableNumber(row.avg_10d)
    }))
  };
}

export function registerAnalyticsDailySetups(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/daily-setups", async (_req, res) => {
    try {
      const payload = await getAnalyticsDailySetups(prisma);
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=300");
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        error: {
          code: "ANALYTICS_DAILY_SETUPS_FAILED",
          message: error instanceof Error ? error.message : "Unable to build daily setups payload"
        }
      });
    }
  });
}
