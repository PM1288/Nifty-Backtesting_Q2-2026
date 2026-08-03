import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";

type SectorRow = {
  symbol: string;
  sector_name: string | null;
};

type FeatureRow = {
  trade_date: Date | string;
  symbol: string;
  security_name: string | null;
  daily_return: number | null;
  volume_rel_20: number | null;
  delivery_rel_20: number | null;
  fwd_return_1d: number | null;
  fwd_return_3d: number | null;
  fwd_return_5d: number | null;
  has_announcement: boolean | null;
  has_board_meeting: boolean | null;
  has_corporate_action: boolean | null;
};

type EventCalendarRow = {
  symbol: string;
  company_name: string | null;
  purpose: string | null;
  details: string | null;
  event_date: Date | string | null;
  broadcast_datetime: Date | string | null;
  attachment: string | null;
};

type FinancialRow = {
  symbol: string;
  company_name: string | null;
  board_meeting_date: Date | string | null;
  reporting_quarter: string | null;
};

type CorporateActionRow = {
  symbol: string;
  security_name: string | null;
  purpose: string | null;
  ex_date: Date | string | null;
  report_date: Date | string | null;
  record_date: Date | string | null;
};

type TextEventRow = {
  symbol: string | null;
  event_type: string;
  report_date: Date | string;
  headline: string | null;
};

type SectorDealRow = {
  sector_name: string | null;
  bulk_value_cr: number | null;
  block_value_cr: number | null;
};

type DealCatalystRow = {
  deal_type: "bulk" | "block";
  trade_date: Date | string;
  symbol: string;
  security_name: string | null;
  side: string | null;
  client_name: string | null;
  trade_value_cr: number | null;
};

type EventDensityRow = {
  trade_date: Date | string;
  event_count: number | bigint;
  avg_forward_return_1d: number | null;
  avg_forward_return_3d: number | null;
  avg_forward_return_5d: number | null;
};

type ParticipantRow = {
  trade_date: Date | string;
  client_type: string;
  total_long_contracts: number | bigint | null;
  total_short_contracts: number | bigint | null;
};

type CatalystItem = {
  id: string;
  symbol: string;
  securityName: string | null;
  sectorName: string;
  catalystType: string;
  timingType: string;
  eventDate: string | null;
  reportDate: string | null;
  headline: string;
  detail: string;
  tradeabilityImpact: string;
  priceContext: string;
  informative: boolean;
  confidence: "high" | "medium" | "low";
  score: number;
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

function titleCase(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, (token) => token.toUpperCase());
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function backdropFromParticipants(rows: ParticipantRow[]) {
  const latestDate = rows.reduce<string | null>((current, row) => {
    const next = toDateKey(row.trade_date);
    if (!next) return current;
    if (!current || next > current) return next;
    return current;
  }, null);
  if (!latestDate) return "neutral";
  const latestRows = rows.filter((row) => toDateKey(row.trade_date) === latestDate);
  const fii = latestRows.find((row) => row.client_type === "FII");
  const client = latestRows.find((row) => row.client_type === "Client");
  const fiiNet = toNumber(fii?.total_long_contracts) - toNumber(fii?.total_short_contracts);
  const clientNet = toNumber(client?.total_long_contracts) - toNumber(client?.total_short_contracts);
  const fiiBase = toNumber(fii?.total_long_contracts) + toNumber(fii?.total_short_contracts);
  if (fiiBase <= 0) return "neutral";
  const fiiPct = fiiNet / fiiBase;
  const spreadPct = client
    ? fiiPct - clientNet / Math.max(1, toNumber(client.total_long_contracts) + toNumber(client.total_short_contracts))
    : fiiPct;
  if (fiiPct >= 0.08) return "supportive";
  if (fiiPct <= -0.08) return "contrarian";
  if (Math.abs(spreadPct) >= 0.16) return "stretched";
  return "neutral";
}

function confidenceFromScore(score: number): CatalystItem["confidence"] {
  if (score >= 28) return "high";
  if (score >= 16) return "medium";
  return "low";
}

function buildPriceContext(feature: FeatureRow | undefined) {
  if (!feature) return "No daily feature snapshot is available yet for this name.";
  const dailyReturn = toNullableNumber(feature.daily_return);
  const volumeRel20 = toNullableNumber(feature.volume_rel_20);
  const deliveryRel20 = toNullableNumber(feature.delivery_rel_20);
  if (dailyReturn == null) return "Daily return is missing, so event follow-through should be treated cautiously.";
  const pieces = [`daily return ${round(dailyReturn * 100, 2)}%`];
  if (volumeRel20 != null) pieces.push(`volume ${round(volumeRel20, 2)}x vs 20-day`);
  if (deliveryRel20 != null) pieces.push(`delivery ${round(deliveryRel20, 2)}x vs 20-day`);
  return pieces.join(" • ");
}

function tradeabilityImpact(type: string, informative: boolean, feature: FeatureRow | undefined, tradeValueCr?: number | null) {
  if (type === "block deal" || type === "bulk deal") {
    if (!informative) return "Large print but low information value until price and follow-through confirm it.";
    if ((tradeValueCr ?? 0) >= 100) return "Potential watchlist catalyst because the deal is large enough to alter attention and liquidity.";
    return "Watchlist-worthy only if the deal aligns with volume and post-event price persistence.";
  }
  if (type === "corporate action") {
    return "Useful for event-risk planning, but separate ex-date mechanics from genuine directional information.";
  }
  if (type === "board meeting" || type === "financial result") {
    return feature?.has_board_meeting ? "Elevated tradeability around the event window, but treat the date as risk context rather than automatic edge." : "Best used for preparation and post-event follow-through tracking.";
  }
  return informative
    ? "Good watchlist catalyst because it changes the information set and already has some supporting price context."
    : "Headline catalyst only; wait for price and participation to prove it matters.";
}

function buildCatalystScore(type: string, feature: FeatureRow | undefined, informative: boolean, tradeValueCr?: number | null) {
  const featureBoost =
    clamp(toNumber(feature?.volume_rel_20), 0, 4) * 3 +
    clamp(toNumber(feature?.delivery_rel_20), 0, 2) * 4 +
    clamp(Math.abs(toNumber(feature?.daily_return)) * 100, 0, 6) * 1.2;
  const eventBase =
    type === "financial result" ? 24 :
    type === "board meeting" ? 22 :
    type === "corporate action" ? 20 :
    type === "block deal" ? 18 :
    type === "bulk deal" ? 16 :
    14;
  const informationBoost = informative ? 7 : -3;
  const dealBoost = tradeValueCr != null ? clamp(tradeValueCr / 40, 0, 10) : 0;
  return Math.round(eventBase + featureBoost + informationBoost + dealBoost);
}

function dedupeCatalysts(items: CatalystItem[]) {
  const seen = new Set<string>();
  const deduped: CatalystItem[] = [];
  for (const item of items.sort((left, right) => right.score - left.score || (left.eventDate ?? "").localeCompare(right.eventDate ?? ""))) {
    const key = `${item.symbol}|${item.catalystType}|${item.eventDate ?? item.reportDate ?? ""}|${item.headline}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

export async function getAnalyticsEventContext(prisma: PrismaClient) {
  const [
    sectorRows,
    featureRows,
    eventCalendarRows,
    financialRows,
    corporateRows,
    textEventRows,
    sectorDealRows,
    dealCatalystRows,
    eventDensityRows,
    participantRows
  ] = await Promise.all([
    prisma.$queryRaw<SectorRow[]>(Prisma.sql`
      SELECT DISTINCT ON (UPPER(TRIM(symbol)))
        UPPER(TRIM(symbol)) AS symbol,
        NULLIF(TRIM(sector), '') AS sector_name
      FROM public.index_constituents
      WHERE NULLIF(TRIM(symbol), '') IS NOT NULL
      ORDER BY UPPER(TRIM(symbol)), updated_at DESC
    `),
    prisma.$queryRaw<FeatureRow[]>(Prisma.sql`
      SELECT
        trade_date,
        symbol,
        security_name,
        daily_return,
        volume_rel_20,
        delivery_rel_20,
        fwd_return_1d,
        fwd_return_3d,
        fwd_return_5d,
        has_announcement,
        has_board_meeting,
        has_corporate_action
      FROM nse_app.security_daily_features
      WHERE trade_date = (SELECT MAX(trade_date) FROM nse_app.security_daily_features)
    `),
    prisma.$queryRaw<EventCalendarRow[]>(Prisma.sql`
      SELECT
        symbol,
        company_name,
        purpose,
        details,
        event_date,
        broadcast_datetime,
        attachment
      FROM market_data.nse_event_calendar
      WHERE event_date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE + INTERVAL '30 days'
      ORDER BY event_date ASC, symbol ASC
      LIMIT 600
    `),
    prisma.$queryRaw<FinancialRow[]>(Prisma.sql`
      SELECT DISTINCT
        symbol,
        company_name,
        board_meeting_date,
        reporting_quarter
      FROM market_data.nse_financial_results
      WHERE board_meeting_date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE + INTERVAL '30 days'
      ORDER BY board_meeting_date ASC, symbol ASC
      LIMIT 400
    `),
    prisma.$queryRaw<CorporateActionRow[]>(Prisma.sql`
      SELECT
        symbol,
        security_name,
        purpose,
        ex_date,
        report_date,
        record_date
      FROM nse.fact_corporate_actions
      WHERE report_date BETWEEN CURRENT_DATE - INTERVAL '21 days' AND CURRENT_DATE + INTERVAL '30 days'
         OR ex_date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE + INTERVAL '30 days'
      ORDER BY COALESCE(ex_date, report_date) ASC, symbol ASC
      LIMIT 400
    `),
    prisma.$queryRaw<TextEventRow[]>(Prisma.sql`
      SELECT
        symbol,
        event_type,
        report_date,
        headline
      FROM nse.fact_text_events
      WHERE report_date BETWEEN CURRENT_DATE - INTERVAL '21 days' AND CURRENT_DATE + INTERVAL '14 days'
      ORDER BY report_date DESC
      LIMIT 400
    `),
    prisma.$queryRaw<SectorDealRow[]>(Prisma.sql`
      WITH sector_map AS (
        SELECT DISTINCT ON (UPPER(TRIM(symbol)))
          UPPER(TRIM(symbol)) AS symbol,
          COALESCE(NULLIF(TRIM(sector), ''), 'Unknown') AS sector_name
        FROM public.index_constituents
        WHERE NULLIF(TRIM(symbol), '') IS NOT NULL
        ORDER BY UPPER(TRIM(symbol)), updated_at DESC
      ),
      deals AS (
        SELECT 'bulk'::text AS deal_type, trade_date, UPPER(TRIM(symbol)) AS symbol, quantity_traded, trade_price
        FROM nse.fact_bulk_deals
        WHERE trade_date BETWEEN CURRENT_DATE - INTERVAL '21 days' AND CURRENT_DATE
        UNION ALL
        SELECT 'block'::text AS deal_type, trade_date, UPPER(TRIM(symbol)) AS symbol, quantity_traded, trade_price
        FROM nse.fact_block_deals
        WHERE trade_date BETWEEN CURRENT_DATE - INTERVAL '21 days' AND CURRENT_DATE
      )
      SELECT
        sector_map.sector_name,
        SUM(CASE WHEN deals.deal_type = 'bulk' THEN (COALESCE(deals.quantity_traded, 0)::numeric * COALESCE(deals.trade_price, 0)::numeric) / 10000000.0 ELSE 0 END) AS bulk_value_cr,
        SUM(CASE WHEN deals.deal_type = 'block' THEN (COALESCE(deals.quantity_traded, 0)::numeric * COALESCE(deals.trade_price, 0)::numeric) / 10000000.0 ELSE 0 END) AS block_value_cr
      FROM deals
      LEFT JOIN sector_map ON sector_map.symbol = deals.symbol
      GROUP BY sector_map.sector_name
      HAVING SUM((COALESCE(deals.quantity_traded, 0)::numeric * COALESCE(deals.trade_price, 0)::numeric) / 10000000.0) > 0
      ORDER BY (COALESCE(SUM((COALESCE(deals.quantity_traded, 0)::numeric * COALESCE(deals.trade_price, 0)::numeric) / 10000000.0), 0)) DESC
      LIMIT 18
    `),
    prisma.$queryRaw<DealCatalystRow[]>(Prisma.sql`
      WITH deals AS (
        SELECT
          'bulk'::text AS deal_type,
          trade_date,
          symbol,
          security_name,
          side,
          client_name,
          (COALESCE(quantity_traded, 0)::numeric * COALESCE(trade_price, 0)::numeric) / 10000000.0 AS trade_value_cr
        FROM nse.fact_bulk_deals
        WHERE trade_date BETWEEN CURRENT_DATE - INTERVAL '10 days' AND CURRENT_DATE
        UNION ALL
        SELECT
          'block'::text AS deal_type,
          trade_date,
          symbol,
          security_name,
          side,
          client_name,
          (COALESCE(quantity_traded, 0)::numeric * COALESCE(trade_price, 0)::numeric) / 10000000.0 AS trade_value_cr
        FROM nse.fact_block_deals
        WHERE trade_date BETWEEN CURRENT_DATE - INTERVAL '10 days' AND CURRENT_DATE
      )
      SELECT *
      FROM deals
      ORDER BY trade_value_cr DESC NULLS LAST, trade_date DESC
      LIMIT 40
    `),
    prisma.$queryRaw<EventDensityRow[]>(Prisma.sql`
      SELECT
        trade_date,
        (
          SUM(CASE WHEN has_announcement THEN 1 ELSE 0 END) +
          SUM(CASE WHEN has_board_meeting THEN 1 ELSE 0 END) +
          SUM(CASE WHEN has_corporate_action THEN 1 ELSE 0 END)
        )::int AS event_count,
        AVG(fwd_return_1d) AS avg_forward_return_1d,
        AVG(fwd_return_3d) AS avg_forward_return_3d,
        AVG(fwd_return_5d) AS avg_forward_return_5d
      FROM nse_app.security_daily_features
      WHERE trade_date >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY trade_date
      ORDER BY trade_date ASC
    `),
    prisma.$queryRaw<ParticipantRow[]>(Prisma.sql`
      SELECT
        trade_date,
        client_type,
        total_long_contracts,
        total_short_contracts
      FROM market_data.nse_fii_participant_open_interest
      WHERE trade_date >= CURRENT_DATE - INTERVAL '45 days'
      ORDER BY trade_date ASC, client_type ASC
    `)
  ]);

  const sectorMap = new Map(sectorRows.map((row) => [row.symbol.toUpperCase(), row.sector_name?.trim() || "Unknown"]));
  const featureMap = new Map(featureRows.map((row) => [row.symbol.toUpperCase(), row]));
  const backdrop = backdropFromParticipants(participantRows);
  const latestTradeDate = featureRows.reduce<string | null>((current, row) => {
    const next = toDateKey(row.trade_date);
    return next && (!current || next > current) ? next : current;
  }, null);

  const catalystItems: CatalystItem[] = [];

  for (const row of eventCalendarRows) {
    const symbol = row.symbol.toUpperCase();
    const feature = featureMap.get(symbol);
    const eventDate = toDateKey(row.event_date);
    const reportDate = toDateKey(row.broadcast_datetime);
    const informative = Boolean(feature?.has_announcement || feature?.has_board_meeting || toNumber(feature?.volume_rel_20) >= 1.15);
    const catalystType = row.purpose?.toLowerCase().includes("board") ? "board meeting" : "event calendar";
    const score = buildCatalystScore(catalystType, feature, informative);
    catalystItems.push({
      id: `calendar:${symbol}:${eventDate ?? reportDate ?? "na"}:${row.purpose ?? "event"}`,
      symbol,
      securityName: row.company_name,
      sectorName: sectorMap.get(symbol) ?? "Unknown",
      catalystType,
      timingType: "schedule date",
      eventDate,
      reportDate,
      headline: row.purpose?.trim() || "Scheduled event",
      detail: row.details?.trim() || "NSE schedule row without extra detail.",
      tradeabilityImpact: tradeabilityImpact(catalystType, informative, feature),
      priceContext: buildPriceContext(feature),
      informative,
      confidence: confidenceFromScore(score),
      score
    });
  }

  for (const row of financialRows) {
    const symbol = row.symbol.toUpperCase();
    const feature = featureMap.get(symbol);
    const eventDate = toDateKey(row.board_meeting_date);
    const informative = true;
    const score = buildCatalystScore("financial result", feature, informative);
    catalystItems.push({
      id: `financial:${symbol}:${eventDate ?? "na"}:${row.reporting_quarter ?? "result"}`,
      symbol,
      securityName: row.company_name,
      sectorName: sectorMap.get(symbol) ?? "Unknown",
      catalystType: "financial result",
      timingType: "board meeting date",
      eventDate,
      reportDate: null,
      headline: row.reporting_quarter ? `Result schedule • ${row.reporting_quarter}` : "Financial result schedule",
      detail: "Board meeting date is a risk window, not the same thing as the final announcement timestamp.",
      tradeabilityImpact: tradeabilityImpact("financial result", informative, feature),
      priceContext: buildPriceContext(feature),
      informative,
      confidence: confidenceFromScore(score),
      score
    });
  }

  for (const row of corporateRows) {
    const symbol = row.symbol.toUpperCase();
    const feature = featureMap.get(symbol);
    const exDate = toDateKey(row.ex_date);
    const reportDate = toDateKey(row.report_date);
    const recordDate = toDateKey(row.record_date);
    const timingType =
      exDate ? "ex-date" : recordDate ? "record date" : reportDate ? "announcement date" : "date not tagged";
    const primaryDate = exDate ?? recordDate ?? reportDate;
    const informative = Boolean(feature?.has_corporate_action);
    const score = buildCatalystScore("corporate action", feature, informative);
    catalystItems.push({
      id: `corp:${symbol}:${primaryDate ?? "na"}:${row.purpose ?? "action"}`,
      symbol,
      securityName: row.security_name,
      sectorName: sectorMap.get(symbol) ?? "Unknown",
      catalystType: "corporate action",
      timingType,
      eventDate: primaryDate,
      reportDate,
      headline: row.purpose?.trim() || "Corporate action",
      detail: `Keep announcement date, ex-date, and record date separate. Current row uses ${timingType}.`,
      tradeabilityImpact: tradeabilityImpact("corporate action", informative, feature),
      priceContext: buildPriceContext(feature),
      informative,
      confidence: confidenceFromScore(score),
      score
    });
  }

  for (const row of textEventRows) {
    const symbol = row.symbol?.toUpperCase();
    if (!symbol) continue;
    const feature = featureMap.get(symbol);
    const reportDate = toDateKey(row.report_date);
    const informative =
      Boolean(feature?.has_announcement) ||
      /order|acquisition|stake|merger|allotment|guidance|rating|approval/i.test(row.headline ?? row.event_type);
    const score = buildCatalystScore("announcement", feature, informative);
    catalystItems.push({
      id: `text:${symbol}:${reportDate ?? "na"}:${row.event_type}:${row.headline ?? ""}`,
      symbol,
      securityName: feature?.security_name ?? null,
      sectorName: sectorMap.get(symbol) ?? "Unknown",
      catalystType: "announcement",
      timingType: "announcement date",
      eventDate: reportDate,
      reportDate,
      headline: row.headline?.trim() || titleCase(row.event_type),
      detail: `Event type: ${titleCase(row.event_type)}. Treat text events as catalyst context, not automatic causation.`,
      tradeabilityImpact: tradeabilityImpact("announcement", informative, feature),
      priceContext: buildPriceContext(feature),
      informative,
      confidence: confidenceFromScore(score),
      score
    });
  }

  for (const row of dealCatalystRows) {
    const symbol = row.symbol.toUpperCase();
    const feature = featureMap.get(symbol);
    const tradeValueCr = toNullableNumber(row.trade_value_cr);
    const informative =
      (tradeValueCr ?? 0) >= 35 &&
      (toNumber(feature?.volume_rel_20) >= 1.2 || Math.abs(toNumber(feature?.daily_return)) >= 0.02);
    const catalystType = row.deal_type === "block" ? "block deal" : "bulk deal";
    const score = buildCatalystScore(catalystType, feature, informative, tradeValueCr);
    catalystItems.push({
      id: `deal:${row.deal_type}:${symbol}:${toDateKey(row.trade_date) ?? "na"}:${row.client_name ?? ""}:${tradeValueCr ?? 0}`,
      symbol,
      securityName: row.security_name,
      sectorName: sectorMap.get(symbol) ?? "Unknown",
      catalystType,
      timingType: "trade date",
      eventDate: toDateKey(row.trade_date),
      reportDate: toDateKey(row.trade_date),
      headline: `${titleCase(row.deal_type)} deal${row.side ? ` • ${titleCase(row.side)}` : ""}`,
      detail: `${row.client_name ?? "Unnamed client"} printed ${round(tradeValueCr, 2) ?? 0} crore. Large prints are not automatically informative unless follow-through confirms them.`,
      tradeabilityImpact: tradeabilityImpact(catalystType, informative, feature, tradeValueCr),
      priceContext: buildPriceContext(feature),
      informative,
      confidence: confidenceFromScore(score),
      score
    });
  }

  const dedupedCatalysts = dedupeCatalysts(catalystItems);
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcomingCatalysts = dedupedCatalysts
    .filter((item) => (item.eventDate ?? item.reportDate ?? "") >= todayKey)
    .slice(0, 20);
  const recentCatalysts = dedupedCatalysts
    .filter((item) => (item.eventDate ?? item.reportDate ?? "") < todayKey)
    .slice(0, 20);

  const sectorClusterMap = new Map<
    string,
    {
      sectorName: string;
      eventCount: number;
      uniqueSymbols: Set<string>;
      upcomingCount: number;
      recentCount: number;
      dealValueCr: number;
    }
  >();

  for (const item of dedupedCatalysts) {
    const bucket = sectorClusterMap.get(item.sectorName) ?? {
      sectorName: item.sectorName,
      eventCount: 0,
      uniqueSymbols: new Set<string>(),
      upcomingCount: 0,
      recentCount: 0,
      dealValueCr: 0
    };
    bucket.eventCount += 1;
    bucket.uniqueSymbols.add(item.symbol);
    if ((item.eventDate ?? item.reportDate ?? "") >= todayKey) {
      bucket.upcomingCount += 1;
    } else {
      bucket.recentCount += 1;
    }
    if (item.catalystType === "bulk deal" || item.catalystType === "block deal") {
      const valueMatch = item.detail.match(/([0-9]+(?:\.[0-9]+)?) crore/);
      bucket.dealValueCr += valueMatch ? Number(valueMatch[1]) : 0;
    }
    sectorClusterMap.set(item.sectorName, bucket);
  }

  const sectorClusters = [...sectorClusterMap.values()]
    .map((bucket) => ({
      sectorName: bucket.sectorName,
      eventCount: bucket.eventCount,
      uniqueSymbols: bucket.uniqueSymbols.size,
      upcomingCount: bucket.upcomingCount,
      recentCount: bucket.recentCount,
      dealValueCr: round(bucket.dealValueCr, 2) ?? 0,
      overlayLabel:
        backdrop === "supportive"
          ? "Institutional backdrop is supportive, so clustered catalysts deserve extra watchlist weight."
          : backdrop === "contrarian"
            ? "Institutional backdrop is contrarian, so clustered catalysts should be treated more defensively."
            : backdrop === "stretched"
              ? "Institutional backdrop is stretched, so sector clusters can amplify risk rather than confirm trend."
              : "Institutional backdrop is neutral, so sector clusters are useful for preparation rather than conviction.",
      confirmsFlow: backdrop === "supportive"
    }))
    .sort((left, right) => right.eventCount - left.eventCount || right.dealValueCr - left.dealValueCr)
    .slice(0, 12);

  const latestEventDate = dedupedCatalysts.reduce<string | null>((current, item) => {
    const next = item.eventDate ?? item.reportDate;
    return next && (!current || next > current) ? next : current;
  }, null);

  const eventCalendarHeatmap = new Map<string, number>();
  for (const item of dedupedCatalysts) {
    const key = item.eventDate ?? item.reportDate;
    if (!key) continue;
    eventCalendarHeatmap.set(key, (eventCalendarHeatmap.get(key) ?? 0) + 1);
  }

  const boardMeetingScheduleMap = new Map<string, { date: string; eventType: string; count: number; symbols: Set<string> }>();
  for (const item of dedupedCatalysts) {
    if (item.catalystType !== "board meeting" && item.catalystType !== "financial result" && item.catalystType !== "event calendar") continue;
    const date = item.eventDate ?? item.reportDate;
    if (!date) continue;
    const key = `${date}:${item.catalystType}`;
    const existing = boardMeetingScheduleMap.get(key) ?? {
      date,
      eventType: item.catalystType,
      count: 0,
      symbols: new Set<string>()
    };
    existing.count += 1;
    existing.symbols.add(item.symbol);
    boardMeetingScheduleMap.set(key, existing);
  }

  const corporateActionTimeline = dedupedCatalysts
    .filter((item) => item.catalystType === "corporate action")
    .slice(0, 24)
    .map((item) => ({
      date: item.eventDate,
      symbol: item.symbol,
      sectorName: item.sectorName,
      purpose: item.headline,
      timingType: item.timingType
    }));

  return {
    asOf: new Date().toISOString(),
    latestTradeDate,
    latestEventDate,
    summary: {
      upcomingCount: upcomingCatalysts.length,
      recentCount: recentCatalysts.length,
      latestFeatureTradeDate: latestTradeDate,
      latestEventDate,
      institutionalBackdrop: backdrop,
      clusteredSectorCount: sectorClusters.filter((item) => item.uniqueSymbols >= 2).length,
      informativeDealSectorCount: sectorClusters.filter((item) => item.dealValueCr >= 35).length,
      trustRule: "Trust price more than event timing when the event and the tape conflict, unless the event changed the information set and volume confirms it.",
      contextRule: "Use this page to build watchlists and risk plans, not to infer causation from timing alone."
    },
    upcomingCatalysts,
    recentCatalysts,
    sectorClusters,
    dataQualityFlags: [
      "Board meeting date, announcement date, ex-date, and record date are stored separately and should not be treated as the same timestamp.",
      "Bulk and block deal rows are value-weighted, but large prints can still be mechanically large rather than informationally important.",
      "Daily participant data is a context overlay with report lag, not a live trigger.",
      "Event-density history is useful for context, but causation should still be proven with price and follow-through."
    ],
    charts: {
      eventCalendarHeatmap: [...eventCalendarHeatmap.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      boardMeetingSchedule: [...boardMeetingScheduleMap.values()]
        .map((row) => ({
          date: row.date,
          eventType: row.eventType,
          label: `${titleCase(row.eventType)} • ${row.count}`,
          count: row.count,
          symbols: [...row.symbols].sort((left, right) => left.localeCompare(right))
        }))
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(0, 24),
      corporateActionTimeline,
      blockBulkDealValueBySector: sectorDealRows.map((row) => ({
        sectorName: row.sector_name?.trim() || "Unknown",
        bulkValueCr: round(toNullableNumber(row.bulk_value_cr), 2) ?? 0,
        blockValueCr: round(toNullableNumber(row.block_value_cr), 2) ?? 0,
        totalValueCr: round(toNumber(row.bulk_value_cr) + toNumber(row.block_value_cr), 2) ?? 0,
        informativeScore: round(clamp((toNumber(row.bulk_value_cr) + toNumber(row.block_value_cr)) / 75, 0, 10), 2) ?? 0
      })),
      eventDensityVsForwardReturn: eventDensityRows.map((row) => ({
        tradeDate: toDateKey(row.trade_date) ?? "",
        eventCount: toNumber(row.event_count),
        avgForwardReturn1d: round(toNullableNumber(row.avg_forward_return_1d), 4),
        avgForwardReturn3d: round(toNullableNumber(row.avg_forward_return_3d), 4),
        avgForwardReturn5d: round(toNullableNumber(row.avg_forward_return_5d), 4)
      })),
      institutionalContextOverlayBySector: sectorClusters
    }
  };
}

export function registerAnalyticsEventContext(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/event-context", async (_req, res) => {
    try {
      const payload = await getAnalyticsEventContext(prisma);
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=300");
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        error: {
          code: "ANALYTICS_EVENT_CONTEXT_FAILED",
          message: error instanceof Error ? error.message : "Unable to build event context payload"
        }
      });
    }
  });
}
