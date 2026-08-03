import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";

type LatestSessionRow = {
  trade_date: Date | string;
  index_code: string;
  as_of_ts: Date | string | null;
  index_name: string | null;
  last_price: number | null;
  prev_close: number | null;
  change_pct: number | null;
  gap_pct: number | null;
  session_range_pct: number | null;
  close_location_pct: number | null;
  open_range_15_pct: number | null;
  breadth_up_pct: number | null;
  breadth_above_vwap_pct: number | null;
  breadth_above_or_high_pct: number | null;
  breadth_below_or_low_pct: number | null;
  dispersion_pct: number | null;
  weighted_participation_pct: number | null;
  top10_concentration_pct: number | null;
  participation_label: string | null;
  primary_state: string | null;
  secondary_states_json: unknown;
  confidence_score: number | null;
  gap_filled: boolean | null;
  failed_open: boolean | null;
  late_day_reversal: boolean | null;
  high_volatility_chop: boolean | null;
  narrow_leadership: boolean | null;
  broad_participation: boolean | null;
  narrative: string | null;
  generated_at: Date | string | null;
};

type MinuteFeatureRow = {
  minute_no: number | null;
  minute_ts: Date | string | null;
  minute_ist: string | null;
  last_price: number | null;
  change_pct_from_prev_close: number | null;
  breadth_up_pct: number | null;
  breadth_above_vwap_pct: number | null;
  weighted_participation_pct: number | null;
  top10_concentration_pct: number | null;
};

type StateHistoryRow = {
  primary_state: string;
  session_count: bigint | number | null;
  avg_session_change_pct: number | null;
  avg_gap_pct: number | null;
  avg_breadth_up_pct: number | null;
  avg_breadth_above_vwap_pct: number | null;
  avg_top10_concentration_pct: number | null;
  avg_next_day_change_pct: number | null;
  next_day_followthrough_pct: number | null;
};

type AnalogRow = {
  trade_date: Date | string;
  primary_state: string | null;
  change_pct: number | null;
  gap_pct: number | null;
  close_location_pct: number | null;
  breadth_up_pct: number | null;
  breadth_above_vwap_pct: number | null;
  weighted_participation_pct: number | null;
  top10_concentration_pct: number | null;
  next_day_change_pct: number | null;
  similarity_score: number | null;
};

type OfficialContextRow = {
  index_code: string;
  trade_date: Date | string;
  close_px: number | null;
  prev_close: number | null;
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

function toNumber(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toNullableNumber(value: bigint | number | null | undefined): number | null {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function minuteStateFromRow(row: MinuteFeatureRow): string {
  const changePct = toNullableNumber(row.change_pct_from_prev_close) ?? 0;
  const breadthUp = toNullableNumber(row.breadth_up_pct) ?? 0;
  const breadthAboveVwap = toNullableNumber(row.breadth_above_vwap_pct);
  const weightedParticipation = toNullableNumber(row.weighted_participation_pct) ?? 0;
  const concentration = toNullableNumber(row.top10_concentration_pct) ?? 0;
  const minuteNo = Math.trunc(toNullableNumber(row.minute_no) ?? 0);

  if (weightedParticipation >= 60 && breadthUp >= 60 && Math.abs(changePct) >= 0.5) return "Broad trend";
  if (concentration >= 35 && breadthUp < 55) return "Narrow leadership";
  if (minuteNo >= 165 && changePct > 0.35 && breadthUp >= 50) return "Late reversal";
  if (breadthAboveVwap != null && breadthAboveVwap >= 55 && weightedParticipation < 55 && changePct > -0.2) return "Gap fill";
  if (Math.abs(changePct) >= 1 && breadthUp >= 30 && breadthUp <= 70) return "High-vol chop";
  if (breadthUp >= 45 && breadthUp <= 55 && Math.abs(changePct) <= 0.2) return "Balanced";
  return "Balanced";
}

function mapDominantState(row: LatestSessionRow): string {
  if (row.high_volatility_chop) return "high-volatility chop";
  if (row.late_day_reversal) return "late-day reversal";
  if (row.failed_open) return "failed open";
  if (row.gap_filled) return "gap-fill day";
  if (row.narrow_leadership) return "narrow leadership day";
  if (row.broad_participation && Math.abs(toNullableNumber(row.change_pct) ?? 0) >= 0.7) return "broad trend day";
  return "balanced / indecisive";
}

function preferredPlaybook(state: string): string {
  switch (state) {
    case "broad trend day":
      return "trend continuation";
    case "narrow leadership day":
      return "selective stock picking";
    case "failed open":
    case "gap-fill day":
    case "high-volatility chop":
      return "fade setups";
    case "late-day reversal":
      return "selective stock picking";
    default:
      return "no-trade / reduced conviction";
  }
}

function normalizeStateLabel(value: string | null | undefined): string {
  const raw = (value ?? "balanced / indecisive").replace(/_/g, " ").trim().toLowerCase();
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function getAnalyticsMarketState(prisma: PrismaClient) {
  const [latestSession] = await prisma.$queryRaw<LatestSessionRow[]>(Prisma.sql`
    SELECT
      trade_date,
      index_code,
      as_of_ts,
      index_name,
      last_price,
      prev_close,
      change_pct,
      gap_pct,
      session_range_pct,
      close_location_pct,
      open_range_15_pct,
      breadth_up_pct,
      breadth_above_vwap_pct,
      breadth_above_or_high_pct,
      breadth_below_or_low_pct,
      dispersion_pct,
      weighted_participation_pct,
      top10_concentration_pct,
      participation_label,
      primary_state,
      secondary_states_json,
      confidence_score,
      gap_filled,
      failed_open,
      late_day_reversal,
      high_volatility_chop,
      narrow_leadership,
      broad_participation,
      narrative,
      generated_at
    FROM nse_intraday.vw_latest_market_summary
    WHERE index_code = 'NIFTY 50'
    ORDER BY trade_date DESC
    LIMIT 1
  `);

  if (!latestSession) {
    return {
      asOf: new Date().toISOString(),
      tradeDate: null,
      session: null,
      officialContext: null,
      minuteSeries: [],
      stateStats: [],
      exactStateStats: null,
      analogs: [],
      verdict: null
    };
  }

  const [minuteRows, stateHistoryRows, analogRows, officialRows] = await Promise.all([
    prisma.$queryRaw<MinuteFeatureRow[]>(Prisma.sql`
      SELECT
        minute_no,
        minute_ts,
        to_char(minute_ts AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS minute_ist,
        last_price,
        change_pct_from_prev_close,
        breadth_up_pct,
        breadth_above_vwap_pct,
        weighted_participation_pct,
        top10_concentration_pct
      FROM nse_intraday.market_minute_feature
      WHERE index_code = ${latestSession.index_code}
        AND trade_date = ${latestSession.trade_date}
      ORDER BY minute_no ASC
    `),
    prisma.$queryRaw<StateHistoryRow[]>(Prisma.sql`
      SELECT
        primary_state,
        session_count,
        avg_session_change_pct,
        avg_gap_pct,
        avg_breadth_up_pct,
        avg_breadth_above_vwap_pct,
        avg_top10_concentration_pct,
        avg_next_day_change_pct,
        next_day_followthrough_pct
      FROM nse_intraday.vw_market_state_history_stats
      WHERE index_code = ${latestSession.index_code}
      ORDER BY session_count DESC, primary_state ASC
    `),
    prisma.$queryRaw<AnalogRow[]>(Prisma.sql`
      WITH latest AS (
        SELECT *
        FROM nse_intraday.market_session_summary
        WHERE index_code = ${latestSession.index_code}
          AND trade_date = ${latestSession.trade_date}
        LIMIT 1
      ),
      scored AS (
        SELECT
          s.trade_date,
          s.primary_state,
          s.change_pct,
          s.gap_pct,
          s.close_location_pct,
          s.breadth_up_pct,
          s.breadth_above_vwap_pct,
          s.weighted_participation_pct,
          s.top10_concentration_pct,
          lead(s.change_pct) OVER (PARTITION BY s.index_code ORDER BY s.trade_date) AS next_day_change_pct,
          (
            CASE WHEN s.primary_state = latest.primary_state THEN 4 ELSE 0 END +
            CASE WHEN s.gap_filled = latest.gap_filled THEN 2 ELSE 0 END +
            CASE WHEN s.failed_open = latest.failed_open THEN 2 ELSE 0 END +
            CASE WHEN s.high_volatility_chop = latest.high_volatility_chop THEN 2 ELSE 0 END +
            CASE WHEN s.narrow_leadership = latest.narrow_leadership THEN 1 ELSE 0 END +
            CASE WHEN s.broad_participation = latest.broad_participation THEN 1 ELSE 0 END
          )::int AS similarity_score
        FROM nse_intraday.market_session_summary s
        CROSS JOIN latest
        WHERE s.index_code = latest.index_code
          AND s.trade_date < latest.trade_date
      )
      SELECT
        trade_date,
        primary_state,
        change_pct,
        gap_pct,
        close_location_pct,
        breadth_up_pct,
        breadth_above_vwap_pct,
        weighted_participation_pct,
        top10_concentration_pct,
        next_day_change_pct,
        similarity_score
      FROM scored
      WHERE similarity_score > 0
      ORDER BY similarity_score DESC, trade_date DESC
      LIMIT 6
    `),
    prisma.$queryRaw<OfficialContextRow[]>(Prisma.sql`
      WITH price_base AS (
        SELECT
          index_code,
          trade_date,
          close_px,
          lag(close_px) OVER (PARTITION BY index_code ORDER BY trade_date) AS prev_close
        FROM integration.v_index_daily_history
        WHERE index_code IN ('NIFTY 50', 'INDIA VIX')
      ),
      ranked AS (
        SELECT
          index_code,
          trade_date,
          close_px,
          prev_close,
          row_number() OVER (PARTITION BY index_code ORDER BY trade_date DESC) AS row_no
        FROM price_base
        WHERE trade_date <= ${latestSession.trade_date}
      )
      SELECT
        index_code,
        trade_date,
        close_px,
        prev_close
      FROM ranked
      WHERE row_no = 1
      ORDER BY index_code ASC
    `)
  ]);

  const dominantState = mapDominantState(latestSession);
  const exactStateStats =
    stateHistoryRows.find((row) => row.primary_state === latestSession.primary_state) ?? null;

  const officialContext = {
    nifty50: officialRows.find((row) => row.index_code === "NIFTY 50") ?? null,
    indiaVix: officialRows.find((row) => row.index_code === "INDIA VIX") ?? null
  };

  return {
    asOf: new Date().toISOString(),
    tradeDate: toDateKey(latestSession.trade_date),
    session: {
      tradeDate: toDateKey(latestSession.trade_date),
      asOf: toIso(latestSession.as_of_ts),
      generatedAt: toIso(latestSession.generated_at),
      indexCode: latestSession.index_code,
      indexName: latestSession.index_name,
      lastPrice: toNullableNumber(latestSession.last_price),
      prevClose: toNullableNumber(latestSession.prev_close),
      changePct: toNullableNumber(latestSession.change_pct),
      gapPct: toNullableNumber(latestSession.gap_pct),
      sessionRangePct: toNullableNumber(latestSession.session_range_pct),
      closeLocationPct: toNullableNumber(latestSession.close_location_pct),
      openRange15Pct: toNullableNumber(latestSession.open_range_15_pct),
      breadthUpPct: toNullableNumber(latestSession.breadth_up_pct),
      breadthAboveVwapPct: toNullableNumber(latestSession.breadth_above_vwap_pct),
      breadthAboveOrHighPct: toNullableNumber(latestSession.breadth_above_or_high_pct),
      breadthBelowOrLowPct: toNullableNumber(latestSession.breadth_below_or_low_pct),
      dispersionPct: toNullableNumber(latestSession.dispersion_pct),
      weightedParticipationPct: toNullableNumber(latestSession.weighted_participation_pct),
      top10ConcentrationPct: toNullableNumber(latestSession.top10_concentration_pct),
      participationLabel: latestSession.participation_label,
      primaryState: latestSession.primary_state,
      secondaryStates: Array.isArray(latestSession.secondary_states_json) ? latestSession.secondary_states_json : [],
      confidenceScore: toNullableNumber(latestSession.confidence_score),
      gapFilled: Boolean(latestSession.gap_filled),
      failedOpen: Boolean(latestSession.failed_open),
      lateDayReversal: Boolean(latestSession.late_day_reversal),
      highVolatilityChop: Boolean(latestSession.high_volatility_chop),
      narrowLeadership: Boolean(latestSession.narrow_leadership),
      broadParticipation: Boolean(latestSession.broad_participation),
      narrative: latestSession.narrative
    },
    officialContext: {
      nifty50: officialContext.nifty50
        ? {
            tradeDate: toDateKey(officialContext.nifty50.trade_date),
            close: toNullableNumber(officialContext.nifty50.close_px),
            changePct:
              officialContext.nifty50.prev_close && officialContext.nifty50.close_px
                ? ((officialContext.nifty50.close_px - officialContext.nifty50.prev_close) / officialContext.nifty50.prev_close) * 100
                : null
          }
        : null,
      indiaVix: officialContext.indiaVix
        ? {
            tradeDate: toDateKey(officialContext.indiaVix.trade_date),
            close: toNullableNumber(officialContext.indiaVix.close_px),
            changePct:
              officialContext.indiaVix.prev_close && officialContext.indiaVix.close_px
                ? ((officialContext.indiaVix.close_px - officialContext.indiaVix.prev_close) / officialContext.indiaVix.prev_close) * 100
                : null
          }
        : null
    },
    minuteSeries: minuteRows.map((row) => ({
      minuteNo: Math.trunc(toNullableNumber(row.minute_no) ?? 0),
      minuteTs: toIso(row.minute_ts),
      minuteLabel: row.minute_ist ?? "",
      lastPrice: toNullableNumber(row.last_price),
      changePct: toNullableNumber(row.change_pct_from_prev_close),
      breadthUpPct: toNullableNumber(row.breadth_up_pct),
      breadthAboveVwapPct: toNullableNumber(row.breadth_above_vwap_pct),
      weightedParticipationPct: toNullableNumber(row.weighted_participation_pct),
      top10ConcentrationPct: toNullableNumber(row.top10_concentration_pct),
      sessionState: minuteStateFromRow(row)
    })),
    stateStats: stateHistoryRows.map((row) => ({
      primaryState: row.primary_state,
      label: normalizeStateLabel(row.primary_state),
      sessionCount: toNumber(row.session_count),
      avgSessionChangePct: toNullableNumber(row.avg_session_change_pct),
      avgGapPct: toNullableNumber(row.avg_gap_pct),
      avgBreadthUpPct: toNullableNumber(row.avg_breadth_up_pct),
      avgBreadthAboveVwapPct: toNullableNumber(row.avg_breadth_above_vwap_pct),
      avgTop10ConcentrationPct: toNullableNumber(row.avg_top10_concentration_pct),
      avgNextDayChangePct: toNullableNumber(row.avg_next_day_change_pct),
      nextDayFollowthroughPct: toNullableNumber(row.next_day_followthrough_pct)
    })),
    exactStateStats: exactStateStats
      ? {
          primaryState: exactStateStats.primary_state,
          label: normalizeStateLabel(exactStateStats.primary_state),
          sessionCount: toNumber(exactStateStats.session_count),
          avgSessionChangePct: toNullableNumber(exactStateStats.avg_session_change_pct),
          avgGapPct: toNullableNumber(exactStateStats.avg_gap_pct),
          avgBreadthUpPct: toNullableNumber(exactStateStats.avg_breadth_up_pct),
          avgBreadthAboveVwapPct: toNullableNumber(exactStateStats.avg_breadth_above_vwap_pct),
          avgTop10ConcentrationPct: toNullableNumber(exactStateStats.avg_top10_concentration_pct),
          avgNextDayChangePct: toNullableNumber(exactStateStats.avg_next_day_change_pct),
          nextDayFollowthroughPct: toNullableNumber(exactStateStats.next_day_followthrough_pct)
        }
      : null,
    analogs: analogRows.map((row) => ({
      tradeDate: toDateKey(row.trade_date),
      primaryState: row.primary_state,
      label: normalizeStateLabel(row.primary_state),
      changePct: toNullableNumber(row.change_pct),
      gapPct: toNullableNumber(row.gap_pct),
      closeLocationPct: toNullableNumber(row.close_location_pct),
      breadthUpPct: toNullableNumber(row.breadth_up_pct),
      breadthAboveVwapPct: toNullableNumber(row.breadth_above_vwap_pct),
      weightedParticipationPct: toNullableNumber(row.weighted_participation_pct),
      top10ConcentrationPct: toNullableNumber(row.top10_concentration_pct),
      nextDayChangePct: toNullableNumber(row.next_day_change_pct),
      similarityScore: toNullableNumber(row.similarity_score)
    })),
    verdict: {
      dominantState,
      preferredEnvironment: preferredPlaybook(dominantState)
    }
  };
}

export function registerAnalyticsMarketState(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/market-state", async (_req, res) => {
    try {
      const payload = await getAnalyticsMarketState(prisma);
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=300");
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        error: {
          code: "ANALYTICS_MARKET_STATE_FAILED",
          message: error instanceof Error ? error.message : "Unable to build market state payload"
        }
      });
    }
  });
}
