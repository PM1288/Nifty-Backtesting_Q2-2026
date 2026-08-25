import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";

type ParticipantOiRow = {
  trade_date: Date | string;
  client_type: string;
  total_long_contracts: bigint | number | Prisma.Decimal | null;
  total_short_contracts: bigint | number | Prisma.Decimal | null;
  loaded_at: Date | string | null;
};

type ParticipantVolumeRow = {
  trade_date: Date | string;
  client_type: string;
  total_long_contracts: bigint | number | Prisma.Decimal | null;
  total_short_contracts: bigint | number | Prisma.Decimal | null;
  loaded_at: Date | string | null;
};

type DerivativesStatRow = {
  trade_date: Date | string;
  fii_derivatives: string;
  buy_value_in_cr: number | Prisma.Decimal | null;
  sell_value_in_cr: number | Prisma.Decimal | null;
  open_contracts_value_in_cr: number | Prisma.Decimal | null;
  loaded_at: Date | string | null;
};

type NiftyDailyRow = {
  trade_date: Date | string;
  close_price: number | Prisma.Decimal | null;
  prev_close: number | Prisma.Decimal | null;
  loaded_at: Date | string | null;
};

type CashFlowRow = {
  market_date: Date | string;
  participant_type: string;
  buy_value: number | Prisma.Decimal | null;
  sell_value: number | Prisma.Decimal | null;
  net_value: number | Prisma.Decimal | null;
  exchange_scope: string | null;
  source_dataset: string | null;
};

type InstitutionalSourceStatusRow = {
  source_id: string;
  source_label: string;
  latest_market_date: Date | string | null;
  latest_refresh_at: Date | string | null;
  row_count: bigint | number | Prisma.Decimal | null;
  cadence: string;
};

type ParticipantSnapshot = {
  clientType: string;
  oiLongContracts: number;
  oiShortContracts: number;
  oiNetContracts: number;
  oiNetPct: number | null;
  oiPercentile: number | null;
  dayOverDayOiChangeContracts: number | null;
  dayOverDayOiChangePctPoints: number | null;
  volumeBuyContracts: number;
  volumeSellContracts: number;
  volumeNetContracts: number;
  volumeNetPct: number | null;
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

function toNumber(value: number | bigint | Prisma.Decimal | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toNullableNumber(value: number | bigint | Prisma.Decimal | null | undefined): number | null {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number | null | undefined, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentRatio(longValue: number, shortValue: number) {
  const total = longValue + shortValue;
  if (!Number.isFinite(total) || total === 0) return null;
  return (longValue - shortValue) / total;
}

function shareOfTotal(value: number, total: number) {
  if (!Number.isFinite(total) || total === 0) return null;
  return value / total;
}

function differenceInCalendarDays(left: string | null, right: string | null) {
  if (!left || !right) return null;
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((a - b) / 86_400_000);
}

function average(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!filtered.length) return null;
  return filtered.reduce((total, value) => total + value, 0) / filtered.length;
}

function sampleStdDev(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length < 2) return null;
  const mean = average(filtered);
  if (mean == null) return null;
  const variance =
    filtered.reduce((total, value) => total + (value - mean) ** 2, 0) /
    (filtered.length - 1);
  return Math.sqrt(variance);
}

function percentileRank(values: number[], target: number) {
  if (!values.length) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = sorted.findIndex((value) => value >= target);
  const resolvedIndex = index === -1 ? sorted.length - 1 : index;
  if (sorted.length === 1) return 0.5;
  return resolvedIndex / (sorted.length - 1);
}

function bucketLabel(percentile: number | null) {
  if (percentile == null) return "unknown";
  if (percentile >= 0.8) return "stretched long";
  if (percentile >= 0.6) return "constructive long";
  if (percentile >= 0.4) return "neutral";
  if (percentile >= 0.2) return "contrarian warning";
  return "stretched short";
}

function sameDirectionRate(pairs: Array<{ signal: number | null; next: number | null }>) {
  const filtered = pairs.filter(
    (pair): pair is { signal: number; next: number } =>
      typeof pair.signal === "number" &&
      Number.isFinite(pair.signal) &&
      typeof pair.next === "number" &&
      Number.isFinite(pair.next)
  );
  if (!filtered.length) return null;
  const matches = filtered.filter((pair) => {
    if (pair.signal === 0 || pair.next === 0) return false;
    return Math.sign(pair.signal) === Math.sign(pair.next);
  }).length;
  return matches / filtered.length;
}

export async function getAnalyticsFiiFlow(prisma: PrismaClient) {
  const [oiRows, volumeRows, statRows, niftyRows, cashFlowRows, sourceStatusRows] = await Promise.all([
    prisma.$queryRaw<ParticipantOiRow[]>(Prisma.sql`
      WITH ranked AS (
        SELECT
          trade_date,
          client_type,
          total_long_contracts,
          total_short_contracts,
          loaded_at,
          row_number() OVER (
            PARTITION BY trade_date, client_type
            ORDER BY loaded_at DESC NULLS LAST
          ) AS rn
        FROM market_data.nse_fii_participant_open_interest
      )
      SELECT trade_date, client_type, total_long_contracts, total_short_contracts, loaded_at
      FROM ranked
      WHERE rn = 1
      ORDER BY trade_date ASC, client_type ASC
    `),
    prisma.$queryRaw<ParticipantVolumeRow[]>(Prisma.sql`
      WITH ranked AS (
        SELECT
          trade_date,
          client_type,
          total_long_contracts,
          total_short_contracts,
          loaded_at,
          row_number() OVER (
            PARTITION BY trade_date, client_type
            ORDER BY loaded_at DESC NULLS LAST
          ) AS rn
        FROM market_data.nse_fii_participant_volume
      )
      SELECT trade_date, client_type, total_long_contracts, total_short_contracts, loaded_at
      FROM ranked
      WHERE rn = 1
      ORDER BY trade_date ASC, client_type ASC
    `),
    prisma.$queryRaw<DerivativesStatRow[]>(Prisma.sql`
      WITH ranked AS (
        SELECT
          trade_date,
          fii_derivatives,
          buy_value_in_cr,
          sell_value_in_cr,
          open_contracts_value_in_cr,
          loaded_at,
          row_number() OVER (
            PARTITION BY trade_date, fii_derivatives
            ORDER BY loaded_at DESC NULLS LAST
          ) AS rn
        FROM market_data.nse_fii_derivatives_stats
      )
      SELECT trade_date, fii_derivatives, buy_value_in_cr, sell_value_in_cr, open_contracts_value_in_cr, loaded_at
      FROM ranked
      WHERE rn = 1
      ORDER BY trade_date ASC, fii_derivatives ASC
    `),
    prisma.$queryRaw<NiftyDailyRow[]>(Prisma.sql`
      WITH ranked AS (
        SELECT
          trade_date,
          close_price,
          prev_close,
          loaded_at,
          row_number() OVER (
            PARTITION BY trade_date
            ORDER BY loaded_at DESC NULLS LAST
          ) AS rn
        FROM nse.fact_market_activity_index
        WHERE index_name = 'Nifty 50'
      )
      SELECT trade_date, close_price, prev_close, loaded_at
      FROM ranked
      WHERE rn = 1
      ORDER BY trade_date ASC
    `),
    prisma.$queryRaw<CashFlowRow[]>(Prisma.sql`
      SELECT market_date, participant_type, buy_value, sell_value, net_value, exchange_scope, source_dataset
      FROM institutional_flow.normalized_nse_fii_dii
      WHERE source_dataset = 'nse_fii_dii_nse_only'
      ORDER BY market_date ASC, participant_type ASC
    `),
    prisma.$queryRaw<InstitutionalSourceStatusRow[]>(Prisma.sql`
      SELECT 'cash_fii_dii' AS source_id, 'NSE cash FII/DII' AS source_label,
        max(market_date) AS latest_market_date,
        (SELECT max(normalized_at) FROM institutional_flow.ingestion_registry
          WHERE dataset_name = 'nse_fii_dii_nse_only' AND status = 'normalized') AS latest_refresh_at,
        count(*) AS row_count, 'DAILY' AS cadence
      FROM institutional_flow.normalized_nse_fii_dii
      WHERE source_dataset = 'nse_fii_dii_nse_only'
      UNION ALL
      SELECT 'participant_oi', 'NSE participant derivatives OI', max(market_date), NULL,
        count(*), 'DAILY'
      FROM institutional_flow.normalized_nse_derivatives_participants
      UNION ALL
      SELECT 'nsdl_daily', 'NSDL FPI daily trends', max(market_date), NULL,
        count(*), 'DAILY'
      FROM institutional_flow.normalized_nsdl_daily_trends
      UNION ALL
      SELECT 'nsdl_sector', 'NSDL FPI sector exposure', max(market_date), NULL,
        count(*), 'FORTNIGHTLY'
      FROM institutional_flow.normalized_nsdl_fortnightly_sector
      UNION ALL
      SELECT 'legacy_participant_detail', 'Detailed participant report used below', max(trade_date), max(loaded_at),
        count(*), 'DAILY'
      FROM market_data.nse_fii_participant_open_interest
    `)
  ]);

  const cashByDate = new Map<string, { fii: number | null; dii: number | null }>();
  for (const row of cashFlowRows) {
    const tradeDate = toDateKey(row.market_date);
    if (!tradeDate) continue;
    const bucket = cashByDate.get(tradeDate) ?? { fii: null, dii: null };
    const participant = row.participant_type.toUpperCase();
    const netValue = toNullableNumber(row.net_value);
    if (participant.includes("FII") || participant.includes("FPI")) bucket.fii = netValue;
    if (participant.includes("DII")) bucket.dii = netValue;
    cashByDate.set(tradeDate, bucket);
  }
  let cumulativeFii = 0;
  let cumulativeDii = 0;
  const cashFlowTrend = Array.from(cashByDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tradeDate, values]) => {
      if (values.fii != null) cumulativeFii += values.fii;
      if (values.dii != null) cumulativeDii += values.dii;
      return {
        tradeDate,
        fiiNetCr: round(values.fii, 2),
        diiNetCr: round(values.dii, 2),
        combinedNetCr: round((values.fii ?? 0) + (values.dii ?? 0), 2),
        cumulativeFiiCr: round(cumulativeFii, 2),
        cumulativeDiiCr: round(cumulativeDii, 2)
      };
    });
  const cashDates = new Set(cashFlowTrend.map((row) => row.tradeDate));
  const recentExpectedDates = niftyRows
    .map((row) => toDateKey(row.trade_date))
    .filter((value): value is string => !!value)
    .slice(-20);
  const missingCashDates = recentExpectedDates.filter((tradeDate) => !cashDates.has(tradeDate));
  const latestCashTradeDate = cashFlowTrend.at(-1)?.tradeDate ?? null;
  const cashCoveragePct = recentExpectedDates.length
    ? round(((recentExpectedDates.length - missingCashDates.length) / recentExpectedDates.length) * 100, 1)
    : null;
  const sourceStatus = sourceStatusRows.map((row) => {
    const latestMarketDate = toDateKey(row.latest_market_date);
    const lagDays = latestMarketDate
      ? differenceInCalendarDays(new Date().toISOString().slice(0, 10), latestMarketDate)
      : null;
    const cadence = row.cadence === "FORTNIGHTLY" ? "FORTNIGHTLY" : "DAILY";
    const freshness = latestMarketDate == null
      ? "MISSING"
      : lagDays != null && lagDays <= (cadence === "FORTNIGHTLY" ? 18 : 2)
        ? "CURRENT"
        : lagDays != null && lagDays <= (cadence === "FORTNIGHTLY" ? 35 : 5)
          ? "DELAYED"
          : "STALE";
    return {
      sourceId: row.source_id,
      label: row.source_label,
      cadence,
      latestMarketDate,
      latestRefreshAt: toIso(row.latest_refresh_at),
      rowCount: toNumber(row.row_count),
      lagDays,
      freshness
    };
  });

  const filteredOiRows = oiRows.filter((row) => row.client_type !== "TOTAL");
  if (!filteredOiRows.length) {
    return {
      asOf: new Date().toISOString(),
      latestTradeDate: null,
      reportLagDays: null,
      latestCashTradeDate,
      contextLayer: "Daily institutional context only. This is not a live entry trigger.",
      backdrop: "neutral",
      marketContext: null,
      summary: null,
      participants: [],
      divergences: [],
      percentileBuckets: [],
      cashCoverage: {
        expectedRecentSessions: recentExpectedDates.length,
        availableRecentSessions: recentExpectedDates.length - missingCashDates.length,
        coveragePct: cashCoveragePct,
        missingTradeDates: missingCashDates
      },
      sourceStatus,
      charts: {
        clientLongShortMatrix: [],
        fiiVsClientSpread: [],
        productValueByProduct: [],
        positioningPercentile: [],
        regimeOverlay: [],
        dayOverDayPositioningChange: [],
        cashFlowTrend
      }
    };
  }

  const participantOrder = ["FII", "Client", "DII", "Pro"];
  const dateKeys = Array.from(new Set(filteredOiRows.map((row) => toDateKey(row.trade_date)).filter(Boolean))) as string[];
  const latestTradeDate = dateKeys.at(-1) ?? null;
  const latestLoadedAt = filteredOiRows
    .filter((row) => toDateKey(row.trade_date) === latestTradeDate)
    .map((row) => toIso(row.loaded_at))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  const oiByDate = new Map<string, Map<string, ParticipantOiRow>>();
  for (const row of filteredOiRows) {
    const tradeDate = toDateKey(row.trade_date);
    if (!tradeDate) continue;
    const bucket = oiByDate.get(tradeDate) ?? new Map<string, ParticipantOiRow>();
    bucket.set(row.client_type, row);
    oiByDate.set(tradeDate, bucket);
  }

  const volumeByDate = new Map<string, Map<string, ParticipantVolumeRow>>();
  for (const row of volumeRows.filter((item) => item.client_type !== "TOTAL")) {
    const tradeDate = toDateKey(row.trade_date);
    if (!tradeDate) continue;
    const bucket = volumeByDate.get(tradeDate) ?? new Map<string, ParticipantVolumeRow>();
    bucket.set(row.client_type, row);
    volumeByDate.set(tradeDate, bucket);
  }

  const statsByDate = new Map<string, DerivativesStatRow[]>();
  for (const row of statRows) {
    const tradeDate = toDateKey(row.trade_date);
    if (!tradeDate) continue;
    const bucket = statsByDate.get(tradeDate) ?? [];
    bucket.push(row);
    statsByDate.set(tradeDate, bucket);
  }

  const niftyByDate = new Map<
    string,
    {
      closePrice: number | null;
      prevClose: number | null;
      dailyReturnPct: number | null;
      nextSessionReturnPct: number | null;
    }
  >();
  const niftyTimeline = niftyRows
    .map((row) => ({
      tradeDate: toDateKey(row.trade_date),
      closePrice: toNullableNumber(row.close_price),
      prevClose: toNullableNumber(row.prev_close)
    }))
    .filter((row): row is { tradeDate: string; closePrice: number | null; prevClose: number | null } => !!row.tradeDate);

  for (let index = 0; index < niftyTimeline.length; index += 1) {
    const current = niftyTimeline[index];
    const next = niftyTimeline[index + 1] ?? null;
    const dailyReturnPct =
      current.closePrice != null && current.prevClose != null && current.prevClose !== 0
        ? ((current.closePrice - current.prevClose) / current.prevClose) * 100
        : null;
    const nextSessionReturnPct =
      current.closePrice != null &&
      next?.closePrice != null &&
      current.closePrice !== 0
        ? ((next.closePrice - current.closePrice) / current.closePrice) * 100
        : null;
    niftyByDate.set(current.tradeDate, {
      closePrice: current.closePrice,
      prevClose: current.prevClose,
      dailyReturnPct: round(dailyReturnPct, 4),
      nextSessionReturnPct: round(nextSessionReturnPct, 4)
    });
  }

  const fiiSeries = dateKeys
    .map((tradeDate) => {
      const fiiRow = oiByDate.get(tradeDate)?.get("FII");
      if (!fiiRow) return null;
      const longValue = toNumber(fiiRow.total_long_contracts);
      const shortValue = toNumber(fiiRow.total_short_contracts);
      return {
        tradeDate,
        netContracts: longValue - shortValue,
        netPct: percentRatio(longValue, shortValue)
      };
    })
    .filter((row): row is { tradeDate: string; netContracts: number; netPct: number | null } => !!row);

  const fiiNetPctValues = fiiSeries
    .map((row) => row.netPct)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const percentileLookup = new Map<string, number | null>();
  for (const row of fiiSeries) {
    percentileLookup.set(row.tradeDate, row.netPct == null ? null : percentileRank(fiiNetPctValues, row.netPct));
  }

  const latestParticipants: ParticipantSnapshot[] = participantOrder
    .map((clientType) => {
      const currentOi = latestTradeDate ? oiByDate.get(latestTradeDate)?.get(clientType) ?? null : null;
      const previousTradeDate = latestTradeDate
        ? dateKeys
            .slice(0, -1)
            .filter((tradeDate) => oiByDate.get(tradeDate)?.has(clientType))
            .at(-1) ?? null
        : null;
      const previousOi = previousTradeDate ? oiByDate.get(previousTradeDate)?.get(clientType) ?? null : null;
      const currentVolume = latestTradeDate ? volumeByDate.get(latestTradeDate)?.get(clientType) ?? null : null;

      if (!currentOi) return null;

      const oiLongContracts = toNumber(currentOi.total_long_contracts);
      const oiShortContracts = toNumber(currentOi.total_short_contracts);
      const oiNetContracts = oiLongContracts - oiShortContracts;
      const oiNetPct = percentRatio(oiLongContracts, oiShortContracts);
      const volumeBuyContracts = toNumber(currentVolume?.total_long_contracts);
      const volumeSellContracts = toNumber(currentVolume?.total_short_contracts);
      const volumeNetContracts = volumeBuyContracts - volumeSellContracts;
      const volumeNetPct = percentRatio(volumeBuyContracts, volumeSellContracts);

      const previousNetContracts = previousOi
        ? toNumber(previousOi.total_long_contracts) - toNumber(previousOi.total_short_contracts)
        : null;
      const previousNetPct = previousOi
        ? percentRatio(toNumber(previousOi.total_long_contracts), toNumber(previousOi.total_short_contracts))
        : null;

      return {
        clientType,
        oiLongContracts,
        oiShortContracts,
        oiNetContracts,
        oiNetPct: round(oiNetPct, 6),
        oiPercentile: clientType === "FII" && latestTradeDate ? percentileLookup.get(latestTradeDate) ?? null : null,
        dayOverDayOiChangeContracts:
          previousNetContracts == null ? null : oiNetContracts - previousNetContracts,
        dayOverDayOiChangePctPoints:
          previousNetPct == null || oiNetPct == null ? null : round((oiNetPct - previousNetPct) * 100, 4),
        volumeBuyContracts,
        volumeSellContracts,
        volumeNetContracts,
        volumeNetPct: round(volumeNetPct, 6)
      } satisfies ParticipantSnapshot;
    })
    .filter((row): row is ParticipantSnapshot => !!row);

  const participantMap = new Map(latestParticipants.map((row) => [row.clientType, row] as const));
  const latestFii = participantMap.get("FII") ?? null;
  const latestClient = participantMap.get("Client") ?? null;
  const latestNifty = latestTradeDate ? niftyByDate.get(latestTradeDate) ?? null : null;
  const latestStats = latestTradeDate ? statsByDate.get(latestTradeDate) ?? [] : [];

  const latestFiiPercentile = latestTradeDate ? percentileLookup.get(latestTradeDate) ?? null : null;
  const backdrop =
    latestFiiPercentile == null
      ? "neutral"
      : latestFiiPercentile >= 0.8 || latestFiiPercentile <= 0.2
        ? "stretched"
        : latestFiiPercentile >= 0.4 && latestFiiPercentile <= 0.6
          ? "neutral"
          : latestFiiPercentile < 0.4 && (latestClient?.oiNetPct ?? 0) > (latestFii?.oiNetPct ?? 0)
            ? "contrarian"
            : "supportive";

  const participantPairs = [
    ["FII", "Client"],
    ["FII", "DII"],
    ["Client", "DII"],
    ["Client", "Pro"]
  ] as const;

  const divergences = participantPairs
    .map(([left, right]) => {
      const leftRow = participantMap.get(left);
      const rightRow = participantMap.get(right);
      if (!leftRow || !rightRow || leftRow.oiNetPct == null || rightRow.oiNetPct == null) return null;
      const spreadPctPoints = (leftRow.oiNetPct - rightRow.oiNetPct) * 100;
      return {
        title: `${left} vs ${right}`,
        spreadPctPoints: round(spreadPctPoints, 2) ?? 0,
        detail: `${left} sits at ${round(leftRow.oiNetPct * 100, 2)}% net while ${right} sits at ${round(
          rightRow.oiNetPct * 100,
          2
        )}% net, a spread of ${round(spreadPctPoints, 2)} percentage points.`
      };
    })
    .filter((row): row is { title: string; spreadPctPoints: number; detail: string } => !!row)
    .sort((left, right) => Math.abs(right.spreadPctPoints) - Math.abs(left.spreadPctPoints))
    .slice(0, 4);

  const productValueByProduct = latestStats.map((row) => {
    const buyValueCr = toNullableNumber(row.buy_value_in_cr);
    const sellValueCr = toNullableNumber(row.sell_value_in_cr);
    const openInterestValueCr = toNullableNumber(row.open_contracts_value_in_cr);
    return {
      product: row.fii_derivatives,
      buyValueCr,
      sellValueCr,
      openInterestValueCr,
      netValueCr:
        buyValueCr != null && sellValueCr != null ? round(buyValueCr - sellValueCr, 2) : null
    };
  });

  const clientLongShortMatrix = latestParticipants.map((row) => ({
    clientType: row.clientType,
    longSharePct: round((shareOfTotal(row.oiLongContracts, row.oiLongContracts + row.oiShortContracts) ?? 0) * 100, 2),
    shortSharePct: round((shareOfTotal(row.oiShortContracts, row.oiLongContracts + row.oiShortContracts) ?? 0) * 100, 2),
    netPct: row.oiNetPct == null ? null : round(row.oiNetPct * 100, 2)
  }));

  const fiiVsClientSpread = dateKeys
    .map((tradeDate) => {
      const fiiRow = oiByDate.get(tradeDate)?.get("FII");
      const clientRow = oiByDate.get(tradeDate)?.get("Client");
      if (!fiiRow || !clientRow) return null;
      const fiiNetPct = percentRatio(toNumber(fiiRow.total_long_contracts), toNumber(fiiRow.total_short_contracts));
      const clientNetPct = percentRatio(
        toNumber(clientRow.total_long_contracts),
        toNumber(clientRow.total_short_contracts)
      );
      return {
        tradeDate,
        fiiNetPct: round(fiiNetPct, 6),
        clientNetPct: round(clientNetPct, 6),
        spreadPct: fiiNetPct == null || clientNetPct == null ? null : round(fiiNetPct - clientNetPct, 6),
        nextSessionReturnPct: niftyByDate.get(tradeDate)?.nextSessionReturnPct ?? null
      };
    })
    .filter(Boolean);

  const positioningPercentile = fiiSeries.map((row) => ({
    tradeDate: row.tradeDate,
    fiiNetPct: row.netPct == null ? null : round(row.netPct, 6),
    percentile: percentileLookup.get(row.tradeDate) ?? null,
    nextSessionReturnPct: niftyByDate.get(row.tradeDate)?.nextSessionReturnPct ?? null
  }));

  const regimeOverlay = fiiSeries.map((row) => ({
    tradeDate: row.tradeDate,
    fiiNetPct: row.netPct == null ? null : round(row.netPct, 6),
    percentile: percentileLookup.get(row.tradeDate) ?? null,
    regimeBucket: bucketLabel(percentileLookup.get(row.tradeDate) ?? null),
    niftyReturnPct: niftyByDate.get(row.tradeDate)?.dailyReturnPct ?? null,
    nextSessionReturnPct: niftyByDate.get(row.tradeDate)?.nextSessionReturnPct ?? null
  }));

  const dayOverDayPositioningChange = dateKeys.flatMap((tradeDate, index) => {
    if (index === 0) return [];
    const previousTradeDate = dateKeys[index - 1];
    return participantOrder
      .map((clientType) => {
        const currentRow = oiByDate.get(tradeDate)?.get(clientType);
        const previousRow = oiByDate.get(previousTradeDate)?.get(clientType);
        if (!currentRow || !previousRow) return null;
        const currentPct = percentRatio(
          toNumber(currentRow.total_long_contracts),
          toNumber(currentRow.total_short_contracts)
        );
        const previousPct = percentRatio(
          toNumber(previousRow.total_long_contracts),
          toNumber(previousRow.total_short_contracts)
        );
        return {
          tradeDate,
          clientType,
          oiNetPct: currentPct == null ? null : round(currentPct, 6),
          dayChangePctPoints:
            currentPct == null || previousPct == null ? null : round((currentPct - previousPct) * 100, 4)
        };
      })
      .filter((row): row is { tradeDate: string; clientType: string; oiNetPct: number | null; dayChangePctPoints: number | null } => !!row);
  });

  const bucketRanges = [
    { min: 0, max: 0.2, label: "0-20th percentile" },
    { min: 0.2, max: 0.4, label: "20-40th percentile" },
    { min: 0.4, max: 0.6, label: "40-60th percentile" },
    { min: 0.6, max: 0.8, label: "60-80th percentile" },
    { min: 0.8, max: 1.01, label: "80-100th percentile" }
  ];

  const percentileBuckets = bucketRanges.map((bucket) => {
    const matches = positioningPercentile.filter((row) => {
      if (row.percentile == null) return false;
      return row.percentile >= bucket.min && row.percentile < bucket.max;
    });
    return {
      label: bucket.label,
      sampleSize: matches.length,
      avgNextSessionReturnPct: round(average(matches.map((row) => row.nextSessionReturnPct)), 4),
      hitRatePositivePct: round(
        shareOfTotal(
          matches.filter((row) => (row.nextSessionReturnPct ?? 0) > 0).length,
          matches.length
        ) != null
          ? (shareOfTotal(
              matches.filter((row) => (row.nextSessionReturnPct ?? 0) > 0).length,
              matches.length
            ) as number) * 100
          : null,
        2
      )
    };
  });

  const predictivePairs = positioningPercentile.map((row) => ({
    signal: row.fiiNetPct,
    next: row.nextSessionReturnPct
  }));
  const sameDirectionPct = sameDirectionRate(predictivePairs);
  const nextSessionStdDev = sampleStdDev(positioningPercentile.map((row) => row.nextSessionReturnPct));
  const fiiNetPctMean = average(fiiSeries.map((row) => row.netPct));

  const regimeLabel =
    latestFii == null
      ? "No participant regime"
      : latestFiiPercentile == null
        ? "Insufficient regime history"
        : `${bucketLabel(latestFiiPercentile)} institutional backdrop`;

  const biggestProductShift = productValueByProduct
    .slice()
    .sort((left, right) => Math.abs(right.netValueCr ?? 0) - Math.abs(left.netValueCr ?? 0))[0] ?? null;

  const summary = latestFii
    ? {
        regimeLabel,
        backdrop,
        text:
          backdrop === "stretched"
            ? `FII positioning is in an extreme percentile bucket, so the flow backdrop is stretched and better used as a warning than as an entry trigger.`
            : backdrop === "supportive"
              ? `FII positioning is constructive, but it still needs price and broader participant alignment before it can be treated as supportive rather than merely descriptive.`
              : backdrop === "contrarian"
                ? `Clients are leaning harder than FIIs while DIIs remain on the other side, so the backdrop reads as a contrarian warning rather than clean confirmation.`
                : `FII positioning is mildly net long but only around the middle-lower part of the observed range, so the backdrop is neutral and better used for sizing context than direction calls.`,
        nextSessionBias:
          sameDirectionPct == null
            ? "There is not enough clean overlap between positioning and next-session return to promote this into a timing signal."
            : `Across the stored sample, same-direction follow-through is ${round(sameDirectionPct * 100, 1)}%, which is too unstable to treat participant flows as a standalone next-session trigger.`,
        sizingNote:
          nextSessionStdDev == null
            ? "Use normal sizing discipline; the dataset is too short to justify percentile-based sizing changes."
            : `Next-session return volatility across the observed sample is about ${round(nextSessionStdDev, 2)} percentage points, so any size adjustment should be modest and context-led, not flow-led.`,
        reportLagNote: latestTradeDate
          ? `Latest official participant context is for ${latestTradeDate}, which is ${differenceInCalendarDays(
              new Date().toISOString().slice(0, 10),
              latestTradeDate
            )} calendar days behind today. This is a daily context layer, not a live feed.`
          : "Participant flow is a daily context layer and should not be treated as live."
      }
    : null;

  return {
    asOf: latestLoadedAt ?? new Date().toISOString(),
    latestTradeDate,
    reportLagDays: latestTradeDate
      ? differenceInCalendarDays(new Date().toISOString().slice(0, 10), latestTradeDate)
      : null,
    latestCashTradeDate,
    contextLayer: "Daily institutional context only. This is not a live entry trigger.",
    backdrop,
    marketContext: latestTradeDate
      ? {
          tradeDate: latestTradeDate,
          niftyClose: latestNifty?.closePrice ?? null,
          niftyReturnPct: latestNifty?.dailyReturnPct ?? null,
          nextSessionReturnPct: latestNifty?.nextSessionReturnPct ?? null
        }
      : null,
    summary,
    participants: latestParticipants,
    divergences: [
      ...divergences,
      ...(biggestProductShift
        ? [
            {
              title: "Largest product imbalance",
              spreadPctPoints: biggestProductShift.netValueCr ?? 0,
              detail: `${biggestProductShift.product} shows the largest latest-session FII value imbalance at ${round(
                biggestProductShift.netValueCr,
                2
              )} crore net, which is descriptive of pressure but still not a standalone timing trigger.`
            }
          ]
        : [])
    ].slice(0, 5),
    percentileBuckets,
    cashCoverage: {
      expectedRecentSessions: recentExpectedDates.length,
      availableRecentSessions: recentExpectedDates.length - missingCashDates.length,
      coveragePct: cashCoveragePct,
      missingTradeDates: missingCashDates
    },
    sourceStatus,
    diagnostics: {
      sampleSize: positioningPercentile.length,
      averageFiiNetPct: round(fiiNetPctMean, 4),
      sameDirectionPct: round(sameDirectionPct == null ? null : sameDirectionPct * 100, 2),
      nextSessionStdDev: round(nextSessionStdDev, 4)
    },
    charts: {
      clientLongShortMatrix,
      fiiVsClientSpread,
      productValueByProduct,
      positioningPercentile,
      regimeOverlay,
      dayOverDayPositioningChange,
      cashFlowTrend
    }
  };
}

export function registerAnalyticsFiiFlow(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/fii-flow", async (_req, res) => {
    try {
      const payload = await getAnalyticsFiiFlow(prisma);
      res.json(payload);
    } catch (error) {
      console.error("[analytics-fii-flow] failed", error);
      res.status(500).json({ error: "analytics_fii_flow_failed" });
    }
  });
}
