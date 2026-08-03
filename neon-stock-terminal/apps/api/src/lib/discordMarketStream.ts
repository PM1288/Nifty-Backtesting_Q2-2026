import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getAnalyticsDashboard, getAnalyticsQuality } from "../routes/analytics";
import { getAnalyticsFiiFlow } from "../routes/analyticsFiiFlow";
import { getAnalyticsMarketState } from "../routes/analyticsMarketState";
import { getAnalyticsOptionsStructure, getAnalyticsOptionsStructureForSymbol } from "../routes/analyticsOptionsStructure";
import { getOverview } from "../routes/overview";
import {
  getDiscordMarketStreamCooldownMinutes,
  getDiscordMarketStreamIntervalSeconds,
  getDiscordMarketStreamTargetThreadId,
  getDiscordMarketStreamWebhookUrl,
  isDiscordMarketStreamEnabled,
  isDiscordMarketStreamSchedulerEnabled,
  isDiscordMarketStreamShadowMode,
  useDiscordMarketStreamWait
} from "./runtimeConfig";

export type DiscordStreamTarget = "test" | "prod";
export type DiscordStreamMessageKind = "close_summary" | "ops_alert";
export type DiscordDispatchStatus = "preview" | "delivered" | "suppressed" | "failed";

type DiscordAllowedMentions = {
  parse: string[];
};

type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
};

export type DiscordWebhookPayload = {
  content?: string;
  embeds?: DiscordEmbed[];
  allowed_mentions: DiscordAllowedMentions;
  thread_id?: string;
};

type DiscordBoardDigest = {
  sessionReference: string | null;
  marketBias: string;
  marketHeadline: string;
  keyConclusions: string[];
  riskFlags: string[];
  nextAlerts: string[];
  dataQuality: string[];
  machineFacts: string[];
  rootRouteTakeaway: string;
};

export type DiscordPreviewResult = {
  message_kind: DiscordStreamMessageKind;
  target: DiscordStreamTarget;
  session_reference: string | null;
  trust_score: number | null;
  quality_summary: string;
  dedupe_key: string;
  payload: DiscordWebhookPayload;
};

export type DiscordDispatchRecord = {
  id: string;
  message_kind: string;
  target: string;
  session_reference: string | null;
  status: string;
  suppression_reason: string | null;
  trust_score: number | null;
  discord_status: number | null;
  created_at: string;
  sent_at: string | null;
};

export type DiscordDispatchResult = DiscordPreviewResult & {
  status: DiscordDispatchStatus;
  dispatch_id: string;
  sent_at: string | null;
  suppression_reason: string | null;
  discord_status: number | null;
  response_preview: string | null;
};

type ParsedMeta = {
  asOf: string | null;
  mode: string | null;
  marketStatus: string | null;
  sessionReference: string | null;
  freshness: string | null;
  confidenceScore: number | null;
  overallBias: string | null;
};

type DispatchOptions = {
  target: DiscordStreamTarget;
  force?: boolean;
  reason?: string | null;
  messageKind?: DiscordStreamMessageKind;
};

type AnyRecord = Record<string, unknown>;

type DiscordWebhookResponse = {
  status: number;
  body: string | null;
};

const DISCORD_CONTENT_LIMIT = 1_900;
const DISCORD_FIELD_VALUE_LIMIT = 900;
const DISCORD_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_RECENT_LIMIT = 20;
const MAX_RECENT_LIMIT = 100;
const STREAM_TRUST_FLOOR = 55;

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerRunning = false;
let lastSchedulerRunAt: string | null = null;
let lastSchedulerStatus: DiscordDispatchStatus | "idle" = "idle";
let lastSchedulerReason: string | null = null;

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function trimToLength(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function titleCaseLabel(value: string | null | undefined): string {
  return compactText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "NA";
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatInteger(value: number | null | undefined): string {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "NA";
  return Math.round(numeric).toLocaleString("en-IN");
}

function formatPrice(value: number | null | undefined, digits = 2): string {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "NA";
  return numeric.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatPct(value: number | null | undefined, digits = 2, signed = false): string {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "NA";
  const prefix = signed && numeric > 0 ? "+" : "";
  return `${prefix}${numeric.toFixed(digits)}%`;
}

function machineValue(value: unknown): string {
  if (value == null) return "NA";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NA";
  }
  const normalized = compactText(typeof value === "string" ? value : String(value));
  return normalized || "NA";
}

function sentimentEmoji(value: string | null | undefined): string {
  const normalized = compactText(value).toLowerCase();
  if (!normalized || normalized === "na") return "⚪";
  if (/(bull|support|confirm|continuation|risk-on|positive)/.test(normalized)) return "🟢";
  if (/(bear|contrarian|warning|risk-off|negative|stretched|failed)/.test(normalized)) return "🔴";
  if (/(mixed|neutral|indecisive|noisy|balanced)/.test(normalized)) return "🟡";
  return "🟠";
}

function stableMachineFact(line: string): string {
  if (!line.startsWith("META|")) return line;
  return line.replace(/as_of=[^|]+/, "as_of=stable");
}

function buildStableDispatchHash(
  boardBrief: DiscordBoardDigest,
  target: DiscordStreamTarget,
  messageKind: DiscordStreamMessageKind
): string {
  const stablePayload = {
    messageKind,
    target,
    sessionReference: boardBrief.sessionReference ?? "unknown",
    marketBias: compactText(boardBrief.marketBias),
    marketHeadline: compactText(boardBrief.marketHeadline),
    keyConclusions: safeArray<string>(boardBrief.keyConclusions).map((line) => compactText(line)),
    riskFlags: safeArray<string>(boardBrief.riskFlags).map((line) => compactText(line)),
    nextAlerts: safeArray<string>(boardBrief.nextAlerts).map((line) => compactText(line)),
    dataQuality: safeArray<string>(boardBrief.dataQuality).map((line) => compactText(line)),
    rootRouteTakeaway: compactText(boardBrief.rootRouteTakeaway),
    machineFacts: safeArray<string>(boardBrief.machineFacts).map((line) => stableMachineFact(line))
  };
  return crypto.createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex");
}

function pickEarliestExpiryRow<T extends { expiry?: string | null }>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function pickLatestExpiryRow<T extends { expiry?: string | null }>(rows: T[]): T | null {
  return rows.length ? rows[rows.length - 1] : null;
}

function extractWallStrike(wall: unknown): number | null {
  if (!wall || typeof wall !== "object") return null;
  const record = wall as AnyRecord;
  return toFiniteNumber(record.strike ?? record.wallStrike ?? record.level ?? null);
}

function deriveMarketBias({
  niftyChangePct,
  breadthUpPct,
  weightedParticipationPct
}: {
  niftyChangePct: number | null;
  breadthUpPct: number | null;
  weightedParticipationPct: number | null;
}) {
  if (
    niftyChangePct != null &&
    breadthUpPct != null &&
    weightedParticipationPct != null &&
    niftyChangePct >= 0.4 &&
    breadthUpPct >= 55 &&
    weightedParticipationPct >= 50
  ) {
    return "bullish";
  }

  if (
    niftyChangePct != null &&
    breadthUpPct != null &&
    weightedParticipationPct != null &&
    niftyChangePct <= -0.4 &&
    breadthUpPct <= 45 &&
    weightedParticipationPct <= 50
  ) {
    return "bearish";
  }

  return "mixed";
}

function parseMachineMeta(lines: string[]): ParsedMeta {
  const metaLine = lines.find((line) => line.startsWith("META|"));
  if (!metaLine) {
    return {
      asOf: null,
      mode: null,
      marketStatus: null,
      sessionReference: null,
      freshness: null,
      confidenceScore: null,
      overallBias: null
    };
  }

  const fields = new Map<string, string>();
  for (const part of metaLine.split("|").slice(1)) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    fields.set(part.slice(0, index), part.slice(index + 1));
  }

  const confidenceRaw = fields.get("confidence_score");
  const confidenceScore = confidenceRaw ? Number(confidenceRaw) : NaN;

  return {
    asOf: fields.get("as_of") ?? null,
    mode: fields.get("mode") ?? null,
    marketStatus: fields.get("market_status") ?? null,
    sessionReference: fields.get("session_reference") ?? null,
    freshness: fields.get("freshness") ?? null,
    confidenceScore: Number.isFinite(confidenceScore) ? confidenceScore : null,
    overallBias: fields.get("overall_bias") ?? null
  };
}

function buildCompactFacts(lines: string[]): string {
  const filtered = lines.filter((line) =>
    /^META\||^INDEX\|name=NIFTY50|^INDEX\|name=BANKNIFTY|^OPTION\|name=NIFTY|^OPTION\|name=BANKNIFTY|^FII\||^QUALITY\|/.test(line)
  );
  return trimToLength(filtered.join("\n"), DISCORD_CONTENT_LIMIT - 64);
}

function buildEmbedFields(boardBrief: DiscordBoardDigest): DiscordEmbedField[] {
  const keyConclusions = safeArray<string>(boardBrief.keyConclusions).slice(0, 3).map((line, index) => `${index + 1}. ${line}`);
  const riskFlags = safeArray<string>(boardBrief.riskFlags).slice(0, 3).map((line, index) => `${index + 1}. ${line}`);
  const nextAlerts = safeArray<string>(boardBrief.nextAlerts).slice(0, 3).map((line, index) => `${index + 1}. ${line}`);
  const quality = safeArray<string>(boardBrief.dataQuality).slice(0, 3).map((line, index) => `${index + 1}. ${line}`);
  const biasLabel = `${sentimentEmoji(boardBrief.marketBias)} ${compactText(String(boardBrief.marketBias ?? "NA")) || "NA"}`;

  return [
    {
      name: "Bias",
      value: trimToLength(biasLabel, DISCORD_FIELD_VALUE_LIMIT),
      inline: false
    },
    {
      name: "Key Conclusions",
      value: trimToLength(keyConclusions.join("\n") || "NA", DISCORD_FIELD_VALUE_LIMIT),
      inline: false
    },
    {
      name: "Risk Flags",
      value: trimToLength(riskFlags.join("\n") || "NA", DISCORD_FIELD_VALUE_LIMIT),
      inline: false
    },
    {
      name: "Watch Next",
      value: trimToLength(nextAlerts.join("\n") || "NA", DISCORD_FIELD_VALUE_LIMIT),
      inline: false
    },
    {
      name: "Data Quality",
      value: trimToLength(quality.join("\n") || "NA", DISCORD_FIELD_VALUE_LIMIT),
      inline: false
    }
  ];
}

function buildDiscordPayload(boardBrief: DiscordBoardDigest, target: DiscordStreamTarget, messageKind: DiscordStreamMessageKind): DiscordPreviewResult {
  const machineFacts = safeArray<string>(boardBrief.machineFacts);
  const meta = parseMachineMeta(machineFacts);
  const sessionReference = String(boardBrief.sessionReference ?? meta.sessionReference ?? "unknown");
  const headline = compactText(String(boardBrief.marketHeadline ?? "Market dossier update"));
  const qualitySummary = compactText(String(meta.freshness ?? "unknown"));
  const biasEmoji = sentimentEmoji(boardBrief.marketBias);
  const biasLabel = compactText(String(boardBrief.marketBias ?? "NA")) || "NA";
  const compactFacts = buildCompactFacts(machineFacts);
  const threadId = getDiscordMarketStreamTargetThreadId(target);
  const contentHeader = [
    `${biasEmoji} **Nifty Market Dossier**`,
    `Session: ${sessionReference}`,
    `Sentiment: ${biasEmoji} ${titleCaseLabel(biasLabel)}`,
    headline
  ].join("\n");
  const contentParts = [contentHeader];
  if (compactFacts) {
    contentParts.push("```text\n" + compactFacts + "\n```");
  }
  const content = trimToLength(contentParts.join("\n\n"), DISCORD_CONTENT_LIMIT);
  const embeds: DiscordEmbed[] = [
    {
      title: `Market Dossier | ${sessionReference}`,
      description: trimToLength(
        `${biasEmoji} ${compactText(String(boardBrief.rootRouteTakeaway ?? boardBrief.marketHeadline ?? ""))}`,
        900
      ),
      color: messageKind === "ops_alert" ? 0xf59e0b : 0x2563eb,
      fields: buildEmbedFields(boardBrief),
      footer: {
        text: `Freshness: ${qualitySummary} | Target: ${target}`
      },
      timestamp: meta.asOf ?? undefined
    }
  ];

  const payload: DiscordWebhookPayload = {
    content,
    embeds,
    allowed_mentions: { parse: [] }
  };

  if (threadId) {
    payload.thread_id = threadId;
  }

  const contentHash = buildStableDispatchHash(boardBrief, target, messageKind);
  const dedupeKey = `${messageKind}:${target}:${sessionReference}:${contentHash}`;

  return {
    message_kind: messageKind,
    target,
    session_reference: sessionReference,
    trust_score: meta.confidenceScore,
    quality_summary: qualitySummary,
    dedupe_key: dedupeKey,
    payload
  };
}

async function buildDiscordBoardDigest(prisma: PrismaClient): Promise<DiscordBoardDigest> {
  const overview = await getOverview(prisma);
  const dashboard = await getAnalyticsDashboard(prisma);
  const marketState = await getAnalyticsMarketState(prisma);
  const niftyOptions = await getAnalyticsOptionsStructure(prisma);
  const bankNiftyOptions = await getAnalyticsOptionsStructureForSymbol(prisma, "BANKNIFTY");
  const fiiFlow = await getAnalyticsFiiFlow(prisma);
  const quality = await getAnalyticsQuality(prisma);

  const timestamp = compactText(
    String(
      (marketState as AnyRecord).asOf ??
        (dashboard as AnyRecord).asOf ??
        overview.asOf ??
        new Date().toISOString()
    )
  );
  const tradeDate =
    compactText(
      String(
        (marketState as AnyRecord).tradeDate ??
          (dashboard as AnyRecord).tradeDate ??
          timestamp.slice(0, 10)
      )
    ) || null;
  const mode = overview.market.isOpen ? "live" : "latest_completed";
  const marketStatus = overview.market.label;
  const marketSummary = (dashboard as AnyRecord).marketSummary as AnyRecord | undefined;
  const session = (marketState as AnyRecord).session as AnyRecord | null | undefined;
  const qualitySummary = (quality as AnyRecord).summary as AnyRecord | undefined;
  const qualityModules = safeArray<AnyRecord>((quality as AnyRecord).moduleStatus);

  const niftyQuote = overview.indices.nifty50;
  const bankNiftyQuote = overview.indices.bankNifty;
  const niftyChangePct =
    toFiniteNumber(niftyQuote.changePct) ??
    (toFiniteNumber(marketSummary?.niftyReturn) != null ? toFiniteNumber(marketSummary?.niftyReturn)! * 100 : null);
  const breadthUpPct =
    toFiniteNumber(session?.breadthUpPct) ??
    (toFiniteNumber(marketSummary?.positiveRatio) != null ? toFiniteNumber(marketSummary?.positiveRatio)! * 100 : null);
  const weightedParticipationPct = toFiniteNumber(session?.weightedParticipationPct);
  const top10ConcentrationPct = toFiniteNumber(session?.top10ConcentrationPct);
  const overallBias = deriveMarketBias({
    niftyChangePct,
    breadthUpPct,
    weightedParticipationPct
  });

  const niftyPcrRows = safeArray<AnyRecord>((niftyOptions as AnyRecord).pcrByExpiry);
  const niftyMaxPainRows = safeArray<AnyRecord>((niftyOptions as AnyRecord).maxPainDrift);
  const bnPcrRows = safeArray<AnyRecord>((bankNiftyOptions as AnyRecord).pcrByExpiry);
  const bnMaxPainRows = safeArray<AnyRecord>((bankNiftyOptions as AnyRecord).maxPainDrift);
  const niftyLatestSnapshot = ((niftyOptions as AnyRecord).latestSnapshot ?? null) as AnyRecord | null;
  const bankNiftyLatestSnapshot = ((bankNiftyOptions as AnyRecord).latestSnapshot ?? null) as AnyRecord | null;
  const niftyWeeklyPcr = toFiniteNumber(pickEarliestExpiryRow(niftyPcrRows)?.pcr);
  const niftyMonthlyPcr = toFiniteNumber(pickLatestExpiryRow(niftyPcrRows)?.pcr);
  const niftyWeeklyMaxPain = toFiniteNumber(pickEarliestExpiryRow(niftyMaxPainRows)?.maxPainStrike);
  const niftyMonthlyMaxPain = toFiniteNumber(pickLatestExpiryRow(niftyMaxPainRows)?.maxPainStrike);
  const bnWeeklyPcr = toFiniteNumber(pickEarliestExpiryRow(bnPcrRows)?.pcr);
  const bnMonthlyPcr = toFiniteNumber(pickLatestExpiryRow(bnPcrRows)?.pcr);
  const bnWeeklyMaxPain = toFiniteNumber(pickEarliestExpiryRow(bnMaxPainRows)?.maxPainStrike);
  const bnMonthlyMaxPain = toFiniteNumber(pickLatestExpiryRow(bnMaxPainRows)?.maxPainStrike);
  const niftySummary = (niftyOptions as AnyRecord).summary as AnyRecord | undefined;
  const bankSummary = (bankNiftyOptions as AnyRecord).summary as AnyRecord | undefined;
  const niftyCallWall = extractWallStrike((niftySummary?.nearestStructure as AnyRecord | undefined)?.callWall);
  const niftyPutWall = extractWallStrike((niftySummary?.nearestStructure as AnyRecord | undefined)?.putWall);
  const bnCallWall = extractWallStrike((bankSummary?.nearestStructure as AnyRecord | undefined)?.callWall);
  const bnPutWall = extractWallStrike((bankSummary?.nearestStructure as AnyRecord | undefined)?.putWall);
  const niftyAtmIv = toFiniteNumber((pickEarliestExpiryRow(safeArray<AnyRecord>((niftyOptions as AnyRecord).termStructure)) as AnyRecord | null)?.iv);
  const bnAtmIv = toFiniteNumber((pickEarliestExpiryRow(safeArray<AnyRecord>((bankNiftyOptions as AnyRecord).termStructure)) as AnyRecord | null)?.iv);

  const fiiParticipants = safeArray<AnyRecord>((fiiFlow as AnyRecord).participants);
  const fiiParticipant = fiiParticipants.find((row) => /fii/i.test(String(row.clientType ?? ""))) ?? null;
  const clientParticipant = fiiParticipants.find((row) => /client/i.test(String(row.clientType ?? ""))) ?? null;
  const propParticipant = fiiParticipants.find((row) => /prop|pro\b/i.test(String(row.clientType ?? ""))) ?? null;
  const fiiProducts = safeArray<AnyRecord>(((fiiFlow as AnyRecord).charts as AnyRecord | undefined)?.productValueByProduct);
  const indexFuturesFlow = fiiProducts.find((row) => /index futures/i.test(String(row.product ?? ""))) ?? null;
  const fiiLongPct =
    fiiParticipant && toFiniteNumber(fiiParticipant.oiLongContracts) != null && toFiniteNumber(fiiParticipant.oiShortContracts) != null
      ? (toFiniteNumber(fiiParticipant.oiLongContracts)! /
          Math.max(1, toFiniteNumber(fiiParticipant.oiLongContracts)! + toFiniteNumber(fiiParticipant.oiShortContracts)!)) *
        100
      : null;
  const clientLongPct =
    clientParticipant && toFiniteNumber(clientParticipant.oiLongContracts) != null && toFiniteNumber(clientParticipant.oiShortContracts) != null
      ? (toFiniteNumber(clientParticipant.oiLongContracts)! /
          Math.max(1, toFiniteNumber(clientParticipant.oiLongContracts)! + toFiniteNumber(clientParticipant.oiShortContracts)!)) *
        100
      : null;
  const propLongPct =
    propParticipant && toFiniteNumber(propParticipant.oiLongContracts) != null && toFiniteNumber(propParticipant.oiShortContracts) != null
      ? (toFiniteNumber(propParticipant.oiLongContracts)! /
          Math.max(1, toFiniteNumber(propParticipant.oiLongContracts)! + toFiniteNumber(propParticipant.oiShortContracts)!)) *
        100
      : null;
  const fiiReportDate = compactText(String((fiiFlow as AnyRecord).latestTradeDate ?? "NA"));
  const fiiLagDays = toFiniteNumber((fiiFlow as AnyRecord).reportLagDays);
  const fiiBackdrop =
    compactText(
      String(
        ((fiiFlow as AnyRecord).summary as AnyRecord | undefined)?.regimeLabel ??
          ((fiiFlow as AnyRecord).backdrop as AnyRecord | undefined)?.label ??
          "NA"
      )
    ) || "NA";
  const freshness = compactText(
    `${titleCaseLabel(String(qualitySummary?.verdict ?? "unknown"))} trust • ${formatInteger(
      toFiniteNumber(qualitySummary?.safeModuleCount)
    )} safe • ${formatInteger(toFiniteNumber(qualitySummary?.downgradedModuleCount))} downgraded • ${formatInteger(
      toFiniteNumber(qualitySummary?.hiddenModuleCount)
    )} hidden`
  );
  const confidenceScore = toFiniteNumber(qualitySummary?.trustScore);

  const marketHeadline = compactText(
    `NIFTY 50 ${formatPrice(niftyQuote.last)} (${formatPct(niftyChangePct, 2, true)}), breadth ${formatPct(
      breadthUpPct,
      1
    )}, weighted participation ${formatPct(weightedParticipationPct, 1)}, weekly PCR ${formatPrice(
      niftyWeeklyPcr,
      2
    )}, FII long ${formatPct(fiiLongPct, 1)}.`
  );

  const keyConclusions = [
    compactText(
      `Index context: NIFTY 50 is ${formatPrice(niftyQuote.last)} at ${formatPct(
        niftyChangePct,
        2,
        true
      )} while breadth is ${formatPct(breadthUpPct, 1)} and weighted participation is ${formatPct(
        weightedParticipationPct,
        1
      )}, so bias is being set by both price and internal participation.`
    ),
    compactText(
      `Options context: NIFTY weekly PCR is ${formatPrice(niftyWeeklyPcr, 2)}, weekly max pain is ${formatInteger(
        niftyWeeklyMaxPain
      )}, and the nearest walls sit near call ${formatInteger(niftyCallWall)} / put ${formatInteger(
        niftyPutWall
      )}, so structure ${compactText(String((niftySummary?.optionsVsSpot as AnyRecord | undefined)?.label ?? "NA"))}.`
    ),
    compactText(
      `Institutional context: latest official FII report is ${fiiReportDate} with lag ${formatInteger(
        fiiLagDays
      )} days, FII long at ${formatPct(fiiLongPct, 1)}, clients at ${formatPct(
        clientLongPct,
        1
      )}, and backdrop ${fiiBackdrop}.`
    )
  ];

  const riskFlags = [
    compactText(
      `Data quality: freshness is ${freshness}, so Discord should be read as a trust-gated summary and not a blind live alert stream.`
    ),
    compactText(
      `Options risk: PCR ${formatPrice(niftyWeeklyPcr, 2)} and max pain ${formatInteger(
        niftyWeeklyMaxPain
      )} are context only; if spot and walls diverge, treat it as structure tension rather than a direct trigger.`
    ),
    compactText(
      `Flow risk: FII data is latest completed official report from ${fiiReportDate}, not live intraday flow, and lag ${formatInteger(
        fiiLagDays
      )} days can make the backdrop stale relative to spot.`
    )
  ];

  const nextAlerts = [
    compactText(
      `Trigger a market alert if breadth moves from ${formatPct(breadthUpPct, 1)} toward a 60%+ profile together with weighted participation above 55%, because that would materially strengthen the current bias.`
    ),
    compactText(
      `Trigger an options alert if NIFTY spot ${formatPrice(niftyQuote.last)} decisively clears call wall ${formatInteger(
        niftyCallWall
      )} or loses put wall ${formatInteger(niftyPutWall)}, because that would show structure migration rather than pinning.`
    ),
    compactText(
      `Trigger a quality alert if trust score drops below ${formatInteger(
        confidenceScore
      )} or hidden module count rises, because stale-but-nonempty data is more dangerous than missing data.`
    )
  ];

  const dataQuality = qualityModules.slice(0, 4).map((row) =>
    compactText(
      `${titleCaseLabel(String(row.label ?? row.module ?? "module"))}: ${titleCaseLabel(String(row.status ?? "unknown"))} • trust ${formatInteger(
        toFiniteNumber(row.trustScore)
      )} • last seen ${compactText(String(row.lastSeenDate ?? "NA"))} • ${compactText(String(row.reason ?? row.staleNote ?? "no extra note"))}`
    )
  );

  const machineFacts = [
    `META|as_of=${machineValue(timestamp)}|mode=${machineValue(mode)}|market_status=${machineValue(
      marketStatus
    )}|session_reference=${machineValue(tradeDate)}|freshness=${machineValue(freshness)}|confidence_score=${machineValue(
      confidenceScore
    )}|overall_bias=${machineValue(overallBias)}`,
    `INDEX|name=NIFTY50|last=${machineValue(niftyQuote.last)}|chg_pct=${machineValue(
      niftyChangePct
    )}|daily_rsi14=${machineValue(niftyQuote.rsi)}|intraday_rsi14=NA|breadth_up_pct=${machineValue(
      breadthUpPct
    )}|weighted_participation_pct=${machineValue(weightedParticipationPct)}|top10_concentration_pct=${machineValue(
      top10ConcentrationPct
    )}`,
    `INDEX|name=BANKNIFTY|last=${machineValue(bankNiftyQuote.last)}|chg_pct=${machineValue(
      bankNiftyQuote.changePct
    )}|daily_rsi14=${machineValue(bankNiftyQuote.rsi)}|intraday_rsi14=NA|breadth_up_pct=NA|weighted_participation_pct=NA|top10_concentration_pct=NA`,
    `OPTION|name=NIFTY|spot=${machineValue(niftyLatestSnapshot?.spot ?? niftyQuote.last)}|weekly_max_pain=${machineValue(
      niftyWeeklyMaxPain
    )}|monthly_max_pain=${machineValue(niftyMonthlyMaxPain)}|weekly_pcr=${machineValue(
      niftyWeeklyPcr
    )}|monthly_pcr=${machineValue(niftyMonthlyPcr)}|call_wall=${machineValue(niftyCallWall)}|put_wall=${machineValue(
      niftyPutWall
    )}|atm_iv=${machineValue(niftyAtmIv)}|options_bias=${machineValue(
      compactText(String((niftySummary?.optionsVsSpot as AnyRecord | undefined)?.label ?? "NA"))
    )}`,
    `OPTION|name=BANKNIFTY|spot=${machineValue(bankNiftyLatestSnapshot?.spot ?? bankNiftyQuote.last)}|weekly_max_pain=${machineValue(
      bnWeeklyMaxPain
    )}|monthly_max_pain=${machineValue(bnMonthlyMaxPain)}|weekly_pcr=${machineValue(
      bnWeeklyPcr
    )}|monthly_pcr=${machineValue(bnMonthlyPcr)}|call_wall=${machineValue(bnCallWall)}|put_wall=${machineValue(
      bnPutWall
    )}|atm_iv=${machineValue(bnAtmIv)}|options_bias=${machineValue(
      compactText(String((bankSummary?.optionsVsSpot as AnyRecord | undefined)?.label ?? "NA"))
    )}`,
    `FII|report_date=${machineValue(fiiReportDate)}|lag_days=${machineValue(
      fiiLagDays
    )}|fii_long_pct=${machineValue(fiiLongPct)}|client_long_pct=${machineValue(
      clientLongPct
    )}|prop_long_pct=${machineValue(propLongPct)}|buy_value_cr=${machineValue(
      toFiniteNumber(indexFuturesFlow?.buyValueCr)
    )}|sell_value_cr=${machineValue(toFiniteNumber(indexFuturesFlow?.sellValueCr))}|oi_value_cr=${machineValue(
      toFiniteNumber(indexFuturesFlow?.openInterestValueCr)
    )}|bias=${machineValue(fiiBackdrop)}`,
    ...qualityModules.slice(0, 4).map(
      (row) =>
        `QUALITY|module=${machineValue(String(row.label ?? row.module ?? "module"))}|status=${machineValue(
          String(row.status ?? "unknown")
        )}|last_seen=${machineValue(String(row.lastSeenDate ?? "NA"))}|expected_trade_date=${machineValue(
          String(row.expectedTradeDate ?? "NA")
        )}|coverage=${machineValue(
          row.expectedCount != null || row.actualCount != null ? `${machineValue(row.actualCount)}/${machineValue(row.expectedCount)}` : "NA"
        )}|trust=${machineValue(toFiniteNumber(row.trustScore))}`
    )
  ];

  return {
    sessionReference: tradeDate,
    marketBias: overallBias,
    marketHeadline,
    keyConclusions,
    riskFlags,
    nextAlerts,
    dataQuality,
    machineFacts,
    rootRouteTakeaway: compactText(
      `Bias ${overallBias}: NIFTY ${formatPct(niftyChangePct, 2, true)}, breadth ${formatPct(
        breadthUpPct,
        1
      )}, options ${compactText(String((niftySummary?.optionsVsSpot as AnyRecord | undefined)?.label ?? "NA"))}, FII backdrop ${fiiBackdrop}, trust ${formatInteger(
        confidenceScore
      )}.`
    )
  };
}

function parseRetryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric * 1_000;
  }
  const retryDate = Date.parse(raw);
  if (!Number.isNaN(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }
  return null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function postDiscordWebhook(
  url: string,
  payload: DiscordWebhookPayload,
  waitForResponse: boolean
): Promise<DiscordWebhookResponse> {
  const requestUrl = waitForResponse ? `${url}${url.includes("?") ? "&" : "?"}wait=true` : url;
  let attempt = 0;

  while (attempt < 2) {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS)
    });

    if (response.status !== 429) {
      const body = await response.text().catch(() => "");
      return { status: response.status, body: body || null };
    }

    const retryAfterMs = parseRetryAfterMs(response) ?? 1_000;
    await sleep(Math.min(retryAfterMs, 15_000));
    attempt += 1;
  }

  return { status: 429, body: "Discord rate limit persisted after retry." };
}

async function getRecentDispatchRows(prisma: PrismaClient, limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, MAX_RECENT_LIMIT));
  return (await prisma.$queryRawUnsafe(
    `
      select
        id,
        message_kind,
        target,
        session_reference,
        status,
        suppression_reason,
        trust_score,
        discord_status,
        created_at,
        sent_at
      from audit.discord_stream_dispatch_log
      order by created_at desc
      limit $1
    `,
    safeLimit
  )) as DiscordDispatchRecord[];
}

async function findRecentDeliveredDedupe(prisma: PrismaClient, dedupeKey: string, cooldownMinutes: number) {
  const rows = (await prisma.$queryRawUnsafe(
    `
      select id
      from audit.discord_stream_dispatch_log
      where dedupe_key = $1
        and status = 'delivered'
        and created_at >= now() - ($2::int * interval '1 minute')
      order by created_at desc
      limit 1
    `,
    dedupeKey,
    cooldownMinutes
  )) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

async function findDeliveredDedupe(prisma: PrismaClient, dedupeKey: string) {
  const rows = (await prisma.$queryRawUnsafe(
    `
      select id
      from audit.discord_stream_dispatch_log
      where dedupe_key = $1
        and status = 'delivered'
      order by created_at desc
      limit 1
    `,
    dedupeKey
  )) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

async function insertDispatchRow(
  prisma: PrismaClient,
  row: {
    id: string;
    preview: DiscordPreviewResult;
    status: DiscordDispatchStatus;
    suppressionReason?: string | null;
    webhookName?: string | null;
    discordStatus?: number | null;
    responseJson?: unknown;
    sentAt?: string | null;
  }
) {
  await prisma.$executeRawUnsafe(
    `
      insert into audit.discord_stream_dispatch_log (
        id,
        message_kind,
        target,
        session_reference,
        dedupe_key,
        content_hash,
        trust_score,
        status,
        suppression_reason,
        webhook_name,
        payload_json,
        response_json,
        discord_status,
        sent_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14::timestamptz
      )
    `,
    row.id,
    row.preview.message_kind,
    row.preview.target,
    row.preview.session_reference,
    row.preview.dedupe_key,
    crypto.createHash("sha256").update(JSON.stringify(row.preview.payload)).digest("hex"),
    row.preview.trust_score,
    row.status,
    row.suppressionReason ?? null,
    row.webhookName ?? null,
    JSON.stringify(row.preview.payload),
    JSON.stringify(row.responseJson ?? {}),
    row.discordStatus ?? null,
    row.sentAt ?? null
  );
}

export function getDiscordMarketStreamSchedulerState() {
  return {
    enabled: isDiscordMarketStreamEnabled() && isDiscordMarketStreamSchedulerEnabled(),
    running: schedulerRunning,
    interval_seconds: getDiscordMarketStreamIntervalSeconds(),
    cooldown_minutes: getDiscordMarketStreamCooldownMinutes(),
    shadow_mode: isDiscordMarketStreamShadowMode(),
    use_wait: useDiscordMarketStreamWait(),
    last_run_at: lastSchedulerRunAt,
    last_status: lastSchedulerStatus,
    last_reason: lastSchedulerReason
  };
}

export async function buildDiscordMarketStreamPreview(
  prisma: PrismaClient,
  options: Pick<DispatchOptions, "target" | "messageKind"> = { target: "test", messageKind: "close_summary" }
): Promise<DiscordPreviewResult> {
  const boardBrief = await buildDiscordBoardDigest(prisma);
  return buildDiscordPayload(boardBrief, options.target ?? "test", options.messageKind ?? "close_summary");
}

export async function dispatchDiscordMarketStream(
  prisma: PrismaClient,
  options: DispatchOptions
): Promise<DiscordDispatchResult> {
  const target = options.target;
  const preview = await buildDiscordMarketStreamPreview(prisma, {
    target,
    messageKind: options.messageKind ?? "close_summary"
  });
  const dispatchId = crypto.randomUUID();
  const cooldownMinutes = getDiscordMarketStreamCooldownMinutes();
  const configuredWebhook = getDiscordMarketStreamWebhookUrl(target);
  const shouldActuallySend = configuredWebhook && isDiscordMarketStreamEnabled() && !isDiscordMarketStreamShadowMode();

  if ((preview.trust_score ?? 0) < STREAM_TRUST_FLOOR && !options.force) {
    const suppressionReason = `trust score ${preview.trust_score ?? "NA"} below floor ${STREAM_TRUST_FLOOR}`;
    await insertDispatchRow(prisma, {
      id: dispatchId,
      preview,
      status: "suppressed",
      suppressionReason,
      webhookName: target
    });
    return {
      ...preview,
      status: "suppressed",
      dispatch_id: dispatchId,
      sent_at: null,
      suppression_reason: suppressionReason,
      discord_status: null,
      response_preview: null
    };
  }

  if (!options.force) {
    const deliveredId = await findDeliveredDedupe(prisma, preview.dedupe_key);
    if (deliveredId) {
      const suppressionReason = `identical session digest already delivered ${deliveredId}`;
      await insertDispatchRow(prisma, {
        id: dispatchId,
        preview,
        status: "suppressed",
        suppressionReason,
        webhookName: target
      });
      return {
        ...preview,
        status: "suppressed",
        dispatch_id: dispatchId,
        sent_at: null,
        suppression_reason: suppressionReason,
        discord_status: null,
        response_preview: null
      };
    }

    const recentId = await findRecentDeliveredDedupe(prisma, preview.dedupe_key, cooldownMinutes);
    if (recentId) {
      const suppressionReason = `cooldown active; recent delivery ${recentId}`;
      await insertDispatchRow(prisma, {
        id: dispatchId,
        preview,
        status: "suppressed",
        suppressionReason,
        webhookName: target
      });
      return {
        ...preview,
        status: "suppressed",
        dispatch_id: dispatchId,
        sent_at: null,
        suppression_reason: suppressionReason,
        discord_status: null,
        response_preview: null
      };
    }
  }

  if (!configuredWebhook) {
    const suppressionReason = `webhook ${target} is not configured`;
    await insertDispatchRow(prisma, {
      id: dispatchId,
      preview,
      status: "suppressed",
      suppressionReason,
      webhookName: target
    });
    return {
      ...preview,
      status: "suppressed",
      dispatch_id: dispatchId,
      sent_at: null,
      suppression_reason: suppressionReason,
      discord_status: null,
      response_preview: null
    };
  }

  if (!shouldActuallySend) {
    const suppressionReason = isDiscordMarketStreamShadowMode()
      ? "shadow mode enabled; payload recorded without sending"
      : "discord stream disabled";
    await insertDispatchRow(prisma, {
      id: dispatchId,
      preview,
      status: "suppressed",
      suppressionReason,
      webhookName: target
    });
    return {
      ...preview,
      status: "suppressed",
      dispatch_id: dispatchId,
      sent_at: null,
      suppression_reason: suppressionReason,
      discord_status: null,
      response_preview: null
    };
  }

  const response = await postDiscordWebhook(configuredWebhook, preview.payload, useDiscordMarketStreamWait());
  const status: DiscordDispatchStatus = response.status >= 200 && response.status < 300 ? "delivered" : "failed";
  const sentAt = status === "delivered" ? new Date().toISOString() : null;

  await insertDispatchRow(prisma, {
    id: dispatchId,
    preview,
    status,
    webhookName: target,
    discordStatus: response.status,
    responseJson: response.body ? { body: response.body } : {},
    sentAt,
    suppressionReason: status === "failed" ? trimToLength(response.body ?? "discord delivery failed", 400) : null
  });

  return {
    ...preview,
    status,
    dispatch_id: dispatchId,
    sent_at: sentAt,
    suppression_reason: status === "failed" ? trimToLength(response.body ?? "discord delivery failed", 400) : null,
    discord_status: response.status,
    response_preview: response.body ? trimToLength(response.body, 500) : null
  };
}

export async function listRecentDiscordDispatches(prisma: PrismaClient, limit = DEFAULT_RECENT_LIMIT) {
  return getRecentDispatchRows(prisma, limit);
}

export async function getDiscordMarketStreamHealth(prisma: PrismaClient) {
  const recent = await getRecentDispatchRows(prisma, 5);
  return {
    status: "ok",
    configured: {
      test_webhook: Boolean(getDiscordMarketStreamWebhookUrl("test")),
      prod_webhook: Boolean(getDiscordMarketStreamWebhookUrl("prod"))
    },
    scheduler: getDiscordMarketStreamSchedulerState(),
    recent
  };
}

export async function runDiscordMarketStreamSchedulerTick(prisma: PrismaClient) {
  if (schedulerRunning) return;
  schedulerRunning = true;
  lastSchedulerRunAt = new Date().toISOString();

  try {
    const target: DiscordStreamTarget =
      isDiscordMarketStreamShadowMode() || !getDiscordMarketStreamWebhookUrl("prod") ? "test" : "prod";
    const result = await dispatchDiscordMarketStream(prisma, {
      target,
      messageKind: "close_summary"
    });
    lastSchedulerStatus = result.status;
    lastSchedulerReason = result.suppression_reason ?? null;
  } catch (error) {
    lastSchedulerStatus = "failed";
    lastSchedulerReason = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        event: "discord_market_stream_scheduler_failed",
        error: lastSchedulerReason
      })
    );
  } finally {
    schedulerRunning = false;
  }
}

export function startDiscordMarketStreamScheduler(prisma: PrismaClient) {
  if (!isDiscordMarketStreamEnabled() || !isDiscordMarketStreamSchedulerEnabled()) return;
  if (schedulerTimer) return;

  const intervalMs = Math.max(60, getDiscordMarketStreamIntervalSeconds()) * 1_000;

  schedulerTimer = setInterval(() => {
    void runDiscordMarketStreamSchedulerTick(prisma);
  }, intervalMs);
}

export function stopDiscordMarketStreamScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerRunning = false;
}
