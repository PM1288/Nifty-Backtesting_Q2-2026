import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";

type LatestSnapshotRow = {
  id: bigint | number;
  captured_at: Date | string;
  symbol: string;
  expiry_date: Date | string | null;
  underlying_value: number | null;
  atm_strike: number | null;
};

type OptionLegRow = {
  strike: number | null;
  option_type: string;
  last_price: number | null;
  implied_volatility: number | null;
  total_traded_volume: bigint | number | null;
  open_interest: bigint | number | null;
  change_in_oi: bigint | number | null;
  delta: number | null;
  gamma: number | null;
};

type PcrLatestRow = {
  expiry: Date | string;
  ts: Date | string;
  pcr: number | null;
  ce_oi: bigint | number | null;
  pe_oi: bigint | number | null;
};

type MaxPainSummaryRow = {
  expiry: Date | string;
  updated_at: Date | string;
  max_pain_strike: number | null;
  spot_price: number | null;
};

type WallMigrationRow = {
  captured_at: Date | string;
  expiry_date: Date | string | null;
  underlying_value: number | null;
  option_type: string;
  strike: number | null;
  open_interest: bigint | number | null;
  change_in_oi: bigint | number | null;
};

type TermStructureRow = {
  expiry: Date | string;
  ts: Date | string;
  strike: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
};

type PcrNoiseRow = {
  ts: Date | string;
  pcr: number | null;
};

type EquilibriumCurrentRow = {
  expiry: Date | string;
  strike: number | null;
  ref_price: number | null;
  ce_norm: number | null;
  pe_norm: number | null;
  updated_at: Date | string;
};

type EquilibriumMeanRow = {
  ts: Date | string;
  expiry: Date | string;
  ce_mean_norm: number | null;
  pe_mean_norm: number | null;
  ce_count: number | null;
  pe_count: number | null;
  lookback_minutes: number | null;
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

function round(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function humanizeState(raw: string) {
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function differenceInDays(left: string | null, right: string | null) {
  if (!left || !right) return null;
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((a - b) / 86_400_000);
}

function normalizeOptionUnderlying(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  if (normalized === "NIFTY50") {
    return { symbol: "NIFTY", underlying: "NIFTY50" };
  }
  if (normalized === "BANKNIFTY") {
    return { symbol: "BANKNIFTY", underlying: "BANKNIFTY" };
  }
  return { symbol: normalized, underlying: normalized };
}

export async function getAnalyticsOptionsStructureForSymbol(prisma: PrismaClient, requestedSymbol = "NIFTY") {
  const { symbol, underlying } = normalizeOptionUnderlying(requestedSymbol);
  const [latestSnapshot] = await prisma.$queryRaw<LatestSnapshotRow[]>(Prisma.sql`
    SELECT
      id,
      captured_at,
      symbol,
      expiry_date,
      underlying_value,
      atm_strike
    FROM public.option_chain_snapshots
    WHERE symbol = ${symbol}
    ORDER BY captured_at DESC
    LIMIT 1
  `);

  if (!latestSnapshot) {
    return {
      asOf: new Date().toISOString(),
      symbol,
      underlying,
      latestSnapshot: null,
      summary: null,
      nearestCallWalls: [],
      nearestPutWalls: [],
      strikeLadder: [],
      pcrByExpiry: [],
      maxPainDrift: [],
      termStructure: [],
      wallMigration: [],
      gammaDeltaConcentration: [],
      equilibrium: {
        current: null,
        meanSeries: []
      }
    };
  }

  const latestSnapshotId = BigInt(toNumber(latestSnapshot.id));
  const spot = toNullableNumber(latestSnapshot.underlying_value);
  const atmStrike = toNullableNumber(latestSnapshot.atm_strike);
  const snapshotCapturedAt = toIso(latestSnapshot.captured_at);
  const currentExpiry = toDateKey(latestSnapshot.expiry_date);

  const [
    latestLegRows,
    pcrRows,
    pcrNoiseRows,
    maxPainRows,
    wallMigrationRows,
    termStructureRows,
    equilibriumCurrentRows,
    equilibriumMeanRows
  ] = await Promise.all([
    prisma.$queryRaw<OptionLegRow[]>(Prisma.sql`
      SELECT
        strike,
        option_type,
        last_price,
        implied_volatility,
        total_traded_volume,
        open_interest,
        change_in_oi,
        delta,
        gamma
      FROM public.option_chain_legs
      WHERE snapshot_id = ${latestSnapshotId}
      ORDER BY strike ASC, option_type ASC
    `),
    prisma.$queryRaw<PcrLatestRow[]>(Prisma.sql`
      WITH ranked AS (
        SELECT
          expiry,
          ts,
          pcr,
          ce_oi,
          pe_oi,
          row_number() OVER (PARTITION BY expiry ORDER BY ts DESC) AS rn
        FROM public.pcr_snapshots
        WHERE underlying = ${underlying}
      )
      SELECT expiry, ts, pcr, ce_oi, pe_oi
      FROM ranked
      WHERE rn = 1
      ORDER BY expiry ASC
      LIMIT 8
    `),
    currentExpiry
      ? prisma.$queryRaw<PcrNoiseRow[]>(Prisma.sql`
          SELECT ts, pcr
          FROM public.pcr_snapshots
          WHERE underlying = ${underlying}
            AND expiry = ${currentExpiry}::date
          ORDER BY ts DESC
          LIMIT 20
        `)
      : Promise.resolve([] as PcrNoiseRow[]),
    prisma.$queryRaw<MaxPainSummaryRow[]>(Prisma.sql`
      SELECT
        expiry,
        updated_at,
        max_pain_strike,
        spot_price
      FROM public.max_pain_summary
      WHERE underlying = ${underlying}
      ORDER BY updated_at DESC
      LIMIT 8
    `),
    prisma.$queryRaw<WallMigrationRow[]>(Prisma.sql`
      WITH recent_snapshots AS (
        SELECT id, captured_at, expiry_date, underlying_value
        FROM public.option_chain_snapshots
        WHERE symbol = ${symbol}
        ORDER BY captured_at DESC
        LIMIT 12
      ),
      ranked AS (
        SELECT
          s.captured_at,
          s.expiry_date,
          s.underlying_value,
          l.option_type,
          l.strike,
          l.open_interest,
          l.change_in_oi,
          row_number() OVER (
            PARTITION BY s.id, l.option_type
            ORDER BY l.open_interest DESC NULLS LAST, abs(l.change_in_oi) DESC NULLS LAST, l.strike ASC
          ) AS rn
        FROM recent_snapshots s
        JOIN public.option_chain_legs l
          ON l.snapshot_id = s.id
      )
      SELECT
        captured_at,
        expiry_date,
        underlying_value,
        option_type,
        strike,
        open_interest,
        change_in_oi
      FROM ranked
      WHERE rn = 1
      ORDER BY captured_at ASC, option_type ASC
    `),
    prisma.$queryRaw<TermStructureRow[]>(Prisma.sql`
      WITH current_spot AS (
        SELECT underlying_value AS spot
        FROM public.option_chain_snapshots
        WHERE symbol = ${symbol}
        ORDER BY captured_at DESC
        LIMIT 1
      ),
      latest_per_expiry AS (
        SELECT expiry, max(ts) AS ts
        FROM public.option_greeks
        WHERE underlying = ${underlying}
        GROUP BY expiry
      ),
      ranked AS (
        SELECT
          g.expiry,
          g.ts,
          g.strike,
          g.iv,
          g.delta,
          g.gamma,
          row_number() OVER (
            PARTITION BY g.expiry
            ORDER BY abs(g.strike - s.spot), abs(abs(coalesce(g.delta, 0)) - 0.5), g.ts DESC
          ) AS rn
        FROM public.option_greeks g
        JOIN latest_per_expiry lp
          ON lp.expiry = g.expiry
         AND lp.ts = g.ts
        CROSS JOIN current_spot s
        WHERE g.underlying = ${underlying}
      )
      SELECT expiry, ts, strike, iv, delta, gamma
      FROM ranked
      WHERE rn = 1
      ORDER BY expiry ASC
      LIMIT 8
    `),
    prisma.$queryRaw<EquilibriumCurrentRow[]>(Prisma.sql`
      SELECT
        expiry,
        strike,
        ref_price,
        ce_norm,
        pe_norm,
        updated_at
      FROM public.equilibrium_current_snapshot
      WHERE underlying = ${underlying}
      ORDER BY updated_at DESC
      LIMIT 1
    `),
    prisma.$queryRaw<EquilibriumMeanRow[]>(Prisma.sql`
      SELECT
        ts,
        expiry,
        ce_mean_norm,
        pe_mean_norm,
        ce_count,
        pe_count,
        lookback_minutes
      FROM public.equilibrium_mean_series
      WHERE underlying = ${underlying}
      ORDER BY ts DESC
      LIMIT 20
    `)
  ]);

  const grouped = new Map<number, {
    strike: number;
    callOi: number | null;
    putOi: number | null;
    callChangeOi: number | null;
    putChangeOi: number | null;
    callIv: number | null;
    putIv: number | null;
    callVolume: number | null;
    putVolume: number | null;
    gammaExposure: number;
    deltaExposure: number;
  }>();

  for (const row of latestLegRows) {
    const strike = toNullableNumber(row.strike);
    if (strike == null) continue;
    const current = grouped.get(strike) ?? {
      strike,
      callOi: null,
      putOi: null,
      callChangeOi: null,
      putChangeOi: null,
      callIv: null,
      putIv: null,
      callVolume: null,
      putVolume: null,
      gammaExposure: 0,
      deltaExposure: 0
    };
    const oi = toNullableNumber(row.open_interest);
    const delta = toNullableNumber(row.delta) ?? 0;
    const gamma = toNullableNumber(row.gamma) ?? 0;
    const exposureBase = oi ?? 0;
    current.gammaExposure += Math.abs(gamma) * exposureBase;
    current.deltaExposure += Math.abs(delta) * exposureBase;
    if (row.option_type === "CE") {
      current.callOi = oi;
      current.callChangeOi = toNullableNumber(row.change_in_oi);
      current.callIv = toNullableNumber(row.implied_volatility);
      current.callVolume = toNullableNumber(row.total_traded_volume);
    } else if (row.option_type === "PE") {
      current.putOi = oi;
      current.putChangeOi = toNullableNumber(row.change_in_oi);
      current.putIv = toNullableNumber(row.implied_volatility);
      current.putVolume = toNullableNumber(row.total_traded_volume);
    }
    grouped.set(strike, current);
  }

  const strikeLadder = Array.from(grouped.values())
    .sort((left, right) => left.strike - right.strike)
    .filter((row) => (atmStrike == null ? true : Math.abs(row.strike - atmStrike) <= 600))
    .map((row) => ({
      strike: row.strike,
      distanceFromSpot: spot == null ? null : round(row.strike - spot, 2),
      callOi: row.callOi,
      putOi: row.putOi,
      callChangeOi: row.callChangeOi,
      putChangeOi: row.putChangeOi,
      callIv: row.callIv,
      putIv: row.putIv,
      callVolume: row.callVolume,
      putVolume: row.putVolume,
      gammaExposure: round(row.gammaExposure, 2),
      deltaExposure: round(row.deltaExposure, 2)
    }));

  const callWalls = strikeLadder
    .filter((row) => spot == null || row.strike >= spot - 50)
    .sort((left, right) => {
      const distanceDiff = Math.abs((left.distanceFromSpot ?? 0)) - Math.abs((right.distanceFromSpot ?? 0));
      if (distanceDiff !== 0) return distanceDiff;
      return (right.callOi ?? 0) - (left.callOi ?? 0);
    })
    .slice(0, 5)
    .map((row) => ({
      strike: row.strike,
      distanceFromSpot: row.distanceFromSpot,
      openInterest: row.callOi,
      changeInOi: row.callChangeOi,
      side: "call" as const
    }));

  const putWalls = strikeLadder
    .filter((row) => spot == null || row.strike <= spot + 50)
    .sort((left, right) => {
      const distanceDiff = Math.abs((left.distanceFromSpot ?? 0)) - Math.abs((right.distanceFromSpot ?? 0));
      if (distanceDiff !== 0) return distanceDiff;
      return (right.putOi ?? 0) - (left.putOi ?? 0);
    })
    .slice(0, 5)
    .map((row) => ({
      strike: row.strike,
      distanceFromSpot: row.distanceFromSpot,
      openInterest: row.putOi,
      changeInOi: row.putChangeOi,
      side: "put" as const
    }));

  const primaryCallWall = callWalls[0] ?? null;
  const primaryPutWall = putWalls[0] ?? null;
  const latestMaxPain = maxPainRows[0] ?? null;
  const latestEquilibrium = equilibriumCurrentRows[0] ?? null;
  const pcrValues = pcrNoiseRows.map((row) => toNullableNumber(row.pcr)).filter((value): value is number => value != null);
  const pcrNoiseRange =
    pcrValues.length > 1 ? Math.max(...pcrValues) - Math.min(...pcrValues) : null;
  const maxPainStalenessDays = differenceInDays(snapshotCapturedAt, toIso(latestMaxPain?.updated_at));
  const equilibriumStalenessDays = differenceInDays(snapshotCapturedAt, toIso(latestEquilibrium?.updated_at));
  const currentAtmRow = strikeLadder.find((row) => row.strike === atmStrike) ?? null;
  const currentSkew = currentAtmRow && currentAtmRow.putIv != null && currentAtmRow.callIv != null
    ? round(currentAtmRow.putIv - currentAtmRow.callIv, 2)
    : null;

  let spotState = "fighting structure";
  if (
    spot != null &&
    primaryCallWall?.strike != null &&
    primaryPutWall?.strike != null &&
    spot <= primaryCallWall.strike &&
    spot >= primaryPutWall.strike &&
    primaryCallWall.strike - primaryPutWall.strike <= 150
  ) {
    spotState = "pinned between nearby walls";
  } else if (spot != null && primaryCallWall?.strike != null && spot > primaryCallWall.strike + 25) {
    spotState = "breaking above call structure";
  } else if (spot != null && primaryPutWall?.strike != null && spot < primaryPutWall.strike - 25) {
    spotState = "breaking below put structure";
  }

  const optionsVsSpot =
    spotState === "breaking above call structure"
      ? "options structure supports upside continuation only if the next higher call wall starts migrating upward"
      : spotState === "breaking below put structure"
        ? "options structure supports downside continuation only if put support keeps stepping lower"
        : "options structure is mixed and currently leans against a clean breakout";

  const wallMigrationMap = new Map<string, {
    capturedAt: string | null;
    expiryDate: string | null;
    spot: number | null;
    callWallStrike: number | null;
    callWallOi: number | null;
    putWallStrike: number | null;
    putWallOi: number | null;
  }>();

  for (const row of wallMigrationRows) {
    const key = toIso(row.captured_at) ?? "";
    const current = wallMigrationMap.get(key) ?? {
      capturedAt: toIso(row.captured_at),
      expiryDate: toDateKey(row.expiry_date),
      spot: toNullableNumber(row.underlying_value),
      callWallStrike: null,
      callWallOi: null,
      putWallStrike: null,
      putWallOi: null
    };
    if (row.option_type === "CE") {
      current.callWallStrike = toNullableNumber(row.strike);
      current.callWallOi = toNullableNumber(row.open_interest);
    }
    if (row.option_type === "PE") {
      current.putWallStrike = toNullableNumber(row.strike);
      current.putWallOi = toNullableNumber(row.open_interest);
    }
    wallMigrationMap.set(key, current);
  }

  const wallMigration = Array.from(wallMigrationMap.values()).sort((left, right) => {
    return (Date.parse(left.capturedAt ?? "") || 0) - (Date.parse(right.capturedAt ?? "") || 0);
  });

  const gammaDeltaConcentration = strikeLadder
    .map((row) => ({
      strike: row.strike,
      gammaExposure: row.gammaExposure,
      deltaExposure: row.deltaExposure
    }))
    .sort((left, right) => left.strike - right.strike);

  const pcrByExpiry = pcrRows.map((row) => ({
    expiry: toDateKey(row.expiry),
    capturedAt: toIso(row.ts),
    pcr: round(toNullableNumber(row.pcr), 3),
    ceOi: toNullableNumber(row.ce_oi),
    peOi: toNullableNumber(row.pe_oi)
  }));

  const maxPainDrift = maxPainRows
    .map((row) => {
      const rowSpot = toNullableNumber(row.spot_price);
      const maxPainStrike = toNullableNumber(row.max_pain_strike);
      return {
        expiry: toDateKey(row.expiry),
        updatedAt: toIso(row.updated_at),
        maxPainStrike,
        spotPrice: rowSpot,
        distanceFromSpot: rowSpot != null && maxPainStrike != null ? round(maxPainStrike - rowSpot, 2) : null,
        staleDays: differenceInDays(snapshotCapturedAt, toIso(row.updated_at))
      };
    })
    .sort((left, right) => (Date.parse(left.updatedAt ?? "") || 0) - (Date.parse(right.updatedAt ?? "") || 0));

  const termStructure = termStructureRows.map((row) => ({
    expiry: toDateKey(row.expiry),
    capturedAt: toIso(row.ts),
    referenceStrike: toNullableNumber(row.strike),
    atmIv: round(toNullableNumber(row.iv), 2),
    delta: round(toNullableNumber(row.delta), 4),
    gamma: round(toNullableNumber(row.gamma), 6),
    currentExpirySkew: currentExpiry && toDateKey(row.expiry) === currentExpiry ? currentSkew : null
  }));

  const equilibrium = {
    current: latestEquilibrium
      ? {
          expiry: toDateKey(latestEquilibrium.expiry),
          strike: toNullableNumber(latestEquilibrium.strike),
          refPrice: toNullableNumber(latestEquilibrium.ref_price),
          ceNorm: round(toNullableNumber(latestEquilibrium.ce_norm), 2),
          peNorm: round(toNullableNumber(latestEquilibrium.pe_norm), 2),
          updatedAt: toIso(latestEquilibrium.updated_at),
          staleDays: equilibriumStalenessDays
        }
      : null,
    meanSeries: equilibriumMeanRows
      .map((row) => ({
        ts: toIso(row.ts),
        expiry: toDateKey(row.expiry),
        ceMeanNorm: round(toNullableNumber(row.ce_mean_norm), 2),
        peMeanNorm: round(toNullableNumber(row.pe_mean_norm), 2),
        ceCount: toNullableNumber(row.ce_count),
        peCount: toNullableNumber(row.pe_count),
        lookbackMinutes: toNullableNumber(row.lookback_minutes)
      }))
      .sort((left, right) => (Date.parse(left.ts ?? "") || 0) - (Date.parse(right.ts ?? "") || 0))
  };

  const structureSummaryParts = [
    primaryPutWall?.strike != null ? `put support is clustered near ${primaryPutWall.strike}` : null,
    primaryCallWall?.strike != null ? `call supply is stacked near ${primaryCallWall.strike}` : null,
    spot != null ? `spot is ${round(spot, 2)}` : null
  ].filter(Boolean);

  const pcrContext =
    pcrNoiseRange != null && pcrNoiseRange >= 1
      ? `PCR is noisy for the front expiry, with a recent range of ${round(pcrNoiseRange, 2)}. Treat it as background context only.`
      : "PCR is stable enough to describe positioning, but it still should not be used as a standalone signal.";

  const maxPainContext =
    maxPainStalenessDays != null && maxPainStalenessDays > 7
      ? `Max pain is stale by ${maxPainStalenessDays} days, so it is useful only as a reference anchor and not as a live trading signal.`
      : "Max pain is close enough to current structure to serve as a reference anchor, not a prediction.";

  const equilibriumContext =
    equilibrium.current && equilibrium.current.staleDays != null && equilibrium.current.staleDays <= 7
      ? `Equilibrium still shows call/put balance around ${equilibrium.current.strike}, which can confirm pinning if spot remains nearby.`
      : "Equilibrium data is older than the live chain and should be used only as a secondary cross-check.";

  return {
    asOf: new Date().toISOString(),
    symbol: latestSnapshot.symbol,
    underlying,
    latestSnapshot: {
      capturedAt: snapshotCapturedAt,
      expiryDate: currentExpiry,
      spot: round(spot, 2),
      atmStrike: round(atmStrike, 2)
    },
    summary: {
      structureSummary: humanizeState(structureSummaryParts.join(", ") || "mixed structure"),
      nearestStructure: {
        callWall: primaryCallWall?.strike ?? null,
        putWall: primaryPutWall?.strike ?? null
      },
      spotState,
      optionsVsSpot,
      pcrContext,
      maxPainContext,
      equilibriumContext,
      dataQualityFlags: [
        pcrNoiseRange != null && pcrNoiseRange >= 1 ? "front-expiry PCR is unstable" : null,
        maxPainStalenessDays != null && maxPainStalenessDays > 7 ? "max pain is stale versus the current chain" : null,
        currentSkew == null ? "current expiry skew could not be fully measured from persisted greeks history" : null
      ].filter((value): value is string => Boolean(value))
    },
    nearestCallWalls: callWalls,
    nearestPutWalls: putWalls,
    strikeLadder,
    pcrByExpiry,
    maxPainDrift,
    termStructure,
    wallMigration,
    gammaDeltaConcentration,
    equilibrium
  };
}

export async function getAnalyticsOptionsStructure(prisma: PrismaClient) {
  return getAnalyticsOptionsStructureForSymbol(prisma, "NIFTY");
}

export function registerAnalyticsOptionsStructure(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/options-structure", async (_req, res) => {
    try {
      const payload = await getAnalyticsOptionsStructure(prisma);
      res.setHeader("Cache-Control", "private, max-age=120, stale-while-revalidate=120");
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        error: {
          code: "ANALYTICS_OPTIONS_STRUCTURE_FAILED",
          message: error instanceof Error ? error.message : "Unable to build options structure payload"
        }
      });
    }
  });
}
