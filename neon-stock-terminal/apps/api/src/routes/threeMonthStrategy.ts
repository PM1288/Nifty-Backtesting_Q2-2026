import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

export type ThreeMonthMode = "completed" | "forming";
export type ThreeMonthDirection = "BULL" | "BEAR";
export type ThreeMonthGateState = "PASS" | "FAIL" | "UNAVAILABLE" | "SKIPPED";
export type ThreeMonthGate = {
  id: string;
  label: string;
  left: number | null;
  operator: ">" | "<";
  right: number | null;
  state: ThreeMonthGateState;
  timeframe: "MONTH" | "WEEK" | "DAY" | "1H" | "15M" | "HISTORY";
  forming: boolean;
};

type DailyRow = {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  session_date: Date | string | null;
  observed_at: Date | string | null;
  current_month_open: number | string | null;
  current_month_close: number | string | null;
  previous_month_open: number | string | null;
  previous_month_close: number | string | null;
  two_months_ago_open: number | string | null;
  two_months_ago_close: number | string | null;
  three_months_ago_open: number | string | null;
  three_months_ago_close: number | string | null;
  current_week_open: number | string | null;
  current_week_close: number | string | null;
  previous_week_open: number | string | null;
  today_open: number | string | null;
  today_close: number | string | null;
  previous_day_open: number | string | null;
};

type IntradayRow = {
  symbol: string;
  timeframe: "1H" | "15M";
  bucket_start: Date | string;
  bucket_index: number | bigint | string;
  open: number | string | null;
  close: number | string | null;
  observed_minutes: number | bigint | string;
  complete: boolean;
};

type Candle = { open: number | null; close: number | null; startedAt: string | null; complete: boolean; index: number };

const numberOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const isoOrNull = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function gate(id: string, label: string, timeframe: ThreeMonthGate["timeframe"], left: number | null, operator: ">" | "<", right: number | null, forming: boolean, skipped = false): ThreeMonthGate {
  const state: ThreeMonthGateState = skipped ? "SKIPPED" : left == null || right == null ? "UNAVAILABLE" : operator === ">" ? left > right ? "PASS" : "FAIL" : left < right ? "PASS" : "FAIL";
  return { id, label, timeframe, left, operator, right, state, forming };
}

export function buildThreeMonthEvaluation(
  row: DailyRow,
  intraday: { hourCurrent?: Candle; hourPrevious?: Candle; fifteenCurrent?: Candle; fifteenPrevious?: Candle } = {},
  mode: ThreeMonthMode = "completed",
  direction: ThreeMonthDirection = "BULL",
) {
  const bullish = direction === "BULL";
  const operator: ">" | "<" = bullish ? ">" : "<";
  const historyOperator: ">" | "<" = bullish ? "<" : ">";
  const suffix = bullish ? "GT" : "LT";
  const comparison = bullish ? ">" : "<";
  const value = (key: keyof DailyRow) => numberOrNull(row[key]);
  const monthlyClose = value("current_month_close");
  const weeklyClose = value("current_week_close");
  const dailyClose = value("today_close");
  const higher = [
    gate(`M0_CLOSE_${suffix}_OPEN`, `Current month close ${comparison} current month open`, "MONTH", monthlyClose, operator, value("current_month_open"), true),
    gate(`M0_CLOSE_${suffix}_M1_OPEN`, `Current month close ${comparison} previous month open`, "MONTH", monthlyClose, operator, value("previous_month_open"), true),
    gate(`W0_CLOSE_${suffix}_OPEN`, `Current week close ${comparison} current week open`, "WEEK", weeklyClose, operator, value("current_week_open"), true),
    gate(`W0_CLOSE_${suffix}_W1_OPEN`, `Current week close ${comparison} previous week open`, "WEEK", weeklyClose, operator, value("previous_week_open"), true),
    gate(`D0_CLOSE_${suffix}_D1_OPEN`, `Current day close ${comparison} previous day open`, "DAY", dailyClose, operator, value("previous_day_open"), true),
    gate(`D0_CLOSE_${suffix}_OPEN`, `Current day close ${comparison} current day open`, "DAY", dailyClose, operator, value("today_open"), true),
  ];
  const weaknessMonths = [
    { id: bullish ? "M1_RED" : "M1_GREEN", label: `Previous month close ${bullish ? "<" : ">"} open`, left: value("previous_month_close"), right: value("previous_month_open") },
    { id: bullish ? "M2_RED" : "M2_GREEN", label: `Two months ago close ${bullish ? "<" : ">"} open`, left: value("two_months_ago_close"), right: value("two_months_ago_open") },
    { id: bullish ? "M3_RED" : "M3_GREEN", label: `Three months ago close ${bullish ? "<" : ">"} open`, left: value("three_months_ago_close"), right: value("three_months_ago_open") },
  ].map((item) => gate(item.id, item.label, "HISTORY", item.left, historyOperator, item.right, false));
  const weaknessState: ThreeMonthGateState = weaknessMonths.some((item) => item.state === "PASS")
    ? "PASS"
    : weaknessMonths.every((item) => item.state === "FAIL") ? "FAIL" : "UNAVAILABLE";
  const shouldInspectIntraday = higher.every((item) => item.state === "PASS") && weaknessState === "PASS";
  const intradayGates = [
    gate(`H0_CLOSE_${suffix}_OPEN`, `Current 1-hour close ${comparison} current 1-hour open`, "1H", intraday.hourCurrent?.close ?? null, operator, intraday.hourCurrent?.open ?? null, mode === "forming" && intraday.hourCurrent?.complete === false, !shouldInspectIntraday),
    gate(`H0_CLOSE_${suffix}_H1_OPEN`, `Current 1-hour close ${comparison} previous 1-hour open`, "1H", intraday.hourCurrent?.close ?? null, operator, intraday.hourPrevious?.open ?? null, mode === "forming" && intraday.hourCurrent?.complete === false, !shouldInspectIntraday),
    gate(`M15_CLOSE_${suffix}_OPEN`, `Current 15-minute close ${comparison} current 15-minute open`, "15M", intraday.fifteenCurrent?.close ?? null, operator, intraday.fifteenCurrent?.open ?? null, mode === "forming" && intraday.fifteenCurrent?.complete === false, !shouldInspectIntraday),
    gate(`M15_CLOSE_${suffix}_PREVIOUS_OPEN`, `Current 15-minute close ${comparison} previous 15-minute open`, "15M", intraday.fifteenCurrent?.close ?? null, operator, intraday.fifteenPrevious?.open ?? null, mode === "forming" && intraday.fifteenCurrent?.complete === false, !shouldInspectIntraday),
  ];
  const gates = [...higher, ...intradayGates];
  const hasFail = gates.some((item) => item.state === "FAIL") || weaknessState === "FAIL";
  const hasUnavailable = gates.some((item) => item.state === "UNAVAILABLE" || item.state === "SKIPPED") || weaknessState === "UNAVAILABLE";
  const qualification = !hasFail && !hasUnavailable && gates.every((item) => item.state === "PASS") && weaknessState === "PASS"
    ? "QUALIFIED" : hasFail ? "REJECTED" : "INCOMPLETE";
  const passedGateCount = gates.filter((item) => item.state === "PASS").length;
  const availableGateCount = gates.filter((item) => item.state === "PASS" || item.state === "FAIL").length;
  // The three prior-month comparisons are one OR condition, not three score points.
  // A PASS resolves the group even when another historical month is unavailable;
  // otherwise the group is only available once all three comparisons can fail.
  const historyGroupAvailable = weaknessState === "PASS" || weaknessState === "FAIL";
  return {
    direction,
    gates,
    weaknessMonths,
    weaknessState,
    qualification,
    passedGateCount,
    availableGateCount,
    scoredConditionCount: passedGateCount + (weaknessState === "PASS" ? 1 : 0),
    availableConditionCount: availableGateCount + (historyGroupAvailable ? 1 : 0),
    totalConditionCount: gates.length + 1,
  } as const;
}

function selectCandles(rows: IntradayRow[], mode: ThreeMonthMode) {
  const bySymbol = new Map<string, IntradayRow[]>();
  for (const row of rows) {
    const key = `${row.symbol}:${row.timeframe}`;
    const list = bySymbol.get(key) ?? [];
    list.push(row);
    bySymbol.set(key, list);
  }
  const selected = new Map<string, { current?: Candle; previous?: Candle }>();
  for (const [key, values] of bySymbol) {
    const eligible = values
      .filter((item) => mode === "forming" || item.complete)
      .sort((a, b) => Number(b.bucket_index) - Number(a.bucket_index));
    const currentRow = eligible[0];
    const previousRow = eligible.find((item) => Number(item.bucket_index) === Number(currentRow?.bucket_index) - 1);
    const candle = (item: IntradayRow | undefined): Candle | undefined => item ? {
      open: numberOrNull(item.open), close: numberOrNull(item.close), startedAt: isoOrNull(item.bucket_start), complete: Boolean(item.complete), index: Number(item.bucket_index),
    } : undefined;
    selected.set(key, { current: candle(currentRow), previous: candle(previousRow) });
  }
  return selected;
}

const DAILY_SQL = `
WITH session AS (
  SELECT MAX(b.trade_date) AS trade_date FROM public.bars_1d b WHERE b.exchange='NSE'
), token_map AS (
  SELECT DISTINCT ON (base_symbol) base_symbol,symbol_token FROM (
    SELECT UPPER(COALESCE(NULLIF(TRIM(underlying),''),REGEXP_REPLACE(TRIM(tradingsymbol),'-EQ$',''))) base_symbol,
      symbol_token,tradingsymbol,active_from
    FROM public.instrument_universe WHERE exchange='NSE' AND active_to IS NULL
  ) mapped ORDER BY base_symbol,CASE WHEN tradingsymbol LIKE '%-EQ' THEN 0 ELSE 1 END,active_from DESC NULLS LAST
), equity AS (
  SELECT UPPER(p.symbol) symbol,p.company_name,p.sector,tm.symbol_token
  FROM public.instrument_profiles p LEFT JOIN token_map tm ON tm.base_symbol=UPPER(p.symbol)
  WHERE p.is_nifty_500
), history_sources AS (
  SELECT e.symbol,b.trade_date,b.open::float8,b.close::float8,0 priority,
    (b.trade_date + TIME '15:30') AT TIME ZONE 'Asia/Kolkata' observed_at
  FROM public.bars_1d b JOIN equity e ON e.symbol_token=b.symbol_token CROSS JOIN session s
  WHERE b.exchange='NSE' AND b.trade_date >= date_trunc('month',s.trade_date)::date-INTERVAL '3 months'
  UNION ALL
  SELECT e.symbol,r.trade_date,r.open_price::float8 open,r.close_price::float8 close,1 priority,
    (r.trade_date + TIME '15:30') AT TIME ZONE 'Asia/Kolkata' observed_at
  FROM strategy_eval.stock_daily_regime r JOIN equity e ON r.yahoo_symbol=CASE WHEN e.symbol='LTM' THEN 'LTIM.NS' ELSE e.symbol||'.NS' END
  CROSS JOIN session s WHERE r.trade_date >= date_trunc('month',s.trade_date)::date-INTERVAL '3 months'
), live_session AS (
  SELECT e.symbol,s.trade_date,st.last_open::float8 open,COALESCE(st.last_price,st.last_close)::float8 close,-1 priority,st.last_seen_ts observed_at
  FROM equity e JOIN public.instrument_state st ON st.exchange='NSE' AND st.symbol_token=e.symbol_token CROSS JOIN session s
  WHERE (st.last_seen_ts AT TIME ZONE 'Asia/Kolkata')::date=s.trade_date
), canonical AS (
  SELECT DISTINCT ON (symbol,trade_date) symbol,trade_date,open,close,observed_at
  FROM (SELECT * FROM history_sources UNION ALL SELECT * FROM live_session) source
  WHERE open IS NOT NULL AND close IS NOT NULL
  ORDER BY symbol,trade_date,priority
)
SELECT e.symbol,e.company_name,e.sector,s.trade_date session_date,MAX(c.observed_at) observed_at,
  (ARRAY_AGG(c.open ORDER BY c.trade_date) FILTER (WHERE c.trade_date>=date_trunc('month',s.trade_date)::date))[1] current_month_open,
  (ARRAY_AGG(c.close ORDER BY c.trade_date DESC) FILTER (WHERE c.trade_date>=date_trunc('month',s.trade_date)::date))[1] current_month_close,
  (ARRAY_AGG(c.open ORDER BY c.trade_date) FILTER (WHERE c.trade_date>=date_trunc('month',s.trade_date)::date-INTERVAL '1 month' AND c.trade_date<date_trunc('month',s.trade_date)::date))[1] previous_month_open,
  (ARRAY_AGG(c.close ORDER BY c.trade_date DESC) FILTER (WHERE c.trade_date>=date_trunc('month',s.trade_date)::date-INTERVAL '1 month' AND c.trade_date<date_trunc('month',s.trade_date)::date))[1] previous_month_close,
  (ARRAY_AGG(c.open ORDER BY c.trade_date) FILTER (WHERE c.trade_date>=date_trunc('month',s.trade_date)::date-INTERVAL '2 months' AND c.trade_date<date_trunc('month',s.trade_date)::date-INTERVAL '1 month'))[1] two_months_ago_open,
  (ARRAY_AGG(c.close ORDER BY c.trade_date DESC) FILTER (WHERE c.trade_date>=date_trunc('month',s.trade_date)::date-INTERVAL '2 months' AND c.trade_date<date_trunc('month',s.trade_date)::date-INTERVAL '1 month'))[1] two_months_ago_close,
  (ARRAY_AGG(c.open ORDER BY c.trade_date) FILTER (WHERE c.trade_date>=date_trunc('month',s.trade_date)::date-INTERVAL '3 months' AND c.trade_date<date_trunc('month',s.trade_date)::date-INTERVAL '2 months'))[1] three_months_ago_open,
  (ARRAY_AGG(c.close ORDER BY c.trade_date DESC) FILTER (WHERE c.trade_date>=date_trunc('month',s.trade_date)::date-INTERVAL '3 months' AND c.trade_date<date_trunc('month',s.trade_date)::date-INTERVAL '2 months'))[1] three_months_ago_close,
  (ARRAY_AGG(c.open ORDER BY c.trade_date) FILTER (WHERE c.trade_date>=date_trunc('week',s.trade_date)::date))[1] current_week_open,
  (ARRAY_AGG(c.close ORDER BY c.trade_date DESC) FILTER (WHERE c.trade_date>=date_trunc('week',s.trade_date)::date))[1] current_week_close,
  (ARRAY_AGG(c.open ORDER BY c.trade_date) FILTER (WHERE c.trade_date>=date_trunc('week',s.trade_date)::date-INTERVAL '1 week' AND c.trade_date<date_trunc('week',s.trade_date)::date))[1] previous_week_open,
  (ARRAY_AGG(c.open ORDER BY c.trade_date DESC) FILTER (WHERE c.trade_date=s.trade_date))[1] today_open,
  (ARRAY_AGG(c.close ORDER BY c.trade_date DESC) FILTER (WHERE c.trade_date=s.trade_date))[1] today_close,
  (ARRAY_AGG(c.open ORDER BY c.trade_date DESC) FILTER (WHERE c.trade_date<s.trade_date))[1] previous_day_open
FROM equity e CROSS JOIN session s LEFT JOIN canonical c ON c.symbol=e.symbol
GROUP BY e.symbol,e.company_name,e.sector,s.trade_date ORDER BY e.symbol`;

const INTRADAY_SQL = `
WITH session AS (
  SELECT $2::date trade_date
), token_map AS (
  SELECT DISTINCT ON (base_symbol) base_symbol,symbol_token FROM (
    SELECT UPPER(COALESCE(NULLIF(TRIM(underlying),''),REGEXP_REPLACE(TRIM(tradingsymbol),'-EQ$',''))) base_symbol,
      symbol_token,tradingsymbol,active_from
    FROM public.instrument_universe WHERE exchange='NSE' AND active_to IS NULL
  ) mapped ORDER BY base_symbol,CASE WHEN tradingsymbol LIKE '%-EQ' THEN 0 ELSE 1 END,active_from DESC NULLS LAST
), equity AS (
  SELECT UPPER(p.symbol) symbol,tm.symbol_token FROM public.instrument_profiles p LEFT JOIN token_map tm ON tm.base_symbol=UPPER(p.symbol)
  WHERE p.is_nifty_500 AND UPPER(p.symbol)=ANY($1::text[])
), source AS (
  SELECT e.symbol,b.ts,b.open::float8 open,b.close::float8 close,(b.ts AT TIME ZONE 'Asia/Kolkata') local_ts,s.trade_date,
    FLOOR(EXTRACT(EPOCH FROM ((b.ts AT TIME ZONE 'Asia/Kolkata')-(s.trade_date+TIME '09:15')))/60)::int elapsed_minute
  FROM public.bars_1m b JOIN equity e ON e.symbol_token=b.symbol_token CROSS JOIN session s
  WHERE b.exchange='NSE'
    AND b.ts >= (s.trade_date+TIME '09:15') AT TIME ZONE 'Asia/Kolkata'
    AND b.ts <= (s.trade_date+TIME '15:30') AT TIME ZONE 'Asia/Kolkata'
    AND b.open IS NOT NULL AND b.close IS NOT NULL
), bucketed AS (
  SELECT symbol,'1H'::text timeframe,FLOOR(elapsed_minute/60)::int bucket_index,60 duration,ts,open,close,trade_date FROM source WHERE elapsed_minute>=0
  UNION ALL
  SELECT symbol,'15M',FLOOR(elapsed_minute/15)::int,15,ts,open,close,trade_date FROM source WHERE elapsed_minute>=0
)
SELECT symbol,timeframe,(trade_date+TIME '09:15'+bucket_index*duration*INTERVAL '1 minute') AT TIME ZONE 'Asia/Kolkata' bucket_start,
  bucket_index,(ARRAY_AGG(open ORDER BY ts))[1] open,(ARRAY_AGG(close ORDER BY ts DESC))[1] close,
  COUNT(DISTINCT date_trunc('minute',ts))::int observed_minutes,
  (COUNT(DISTINCT date_trunc('minute',ts))=duration AND MAX(ts)>=(trade_date+TIME '09:15'+(bucket_index*duration+duration-1)*INTERVAL '1 minute') AT TIME ZONE 'Asia/Kolkata') complete
FROM bucketed GROUP BY symbol,timeframe,trade_date,bucket_index,duration ORDER BY symbol,timeframe,bucket_index DESC`;

const cache = new Map<ThreeMonthMode, { expires: number; value: Promise<unknown> }>();

export async function getThreeMonthStrategy(prisma: Pick<PrismaClient, "$queryRawUnsafe">, mode: ThreeMonthMode = "completed") {
  const daily = await prisma.$queryRawUnsafe<DailyRow[]>(DAILY_SQL);
  const preliminary = daily.map((row) => ({ row, bull: buildThreeMonthEvaluation(row, {}, mode, "BULL"), bear: buildThreeMonthEvaluation(row, {}, mode, "BEAR") }));
  const eligibleSymbols = preliminary.filter(({ bull, bear }) => [bull, bear].some((evaluation) => evaluation.weaknessState === "PASS" && evaluation.gates.slice(0, 6).every((item) => item.state === "PASS"))).map(({ row }) => row.symbol);
  const sessionDate = isoOrNull(daily[0]?.session_date)?.slice(0, 10) ?? String(daily[0]?.session_date ?? "");
  const intradayRows = eligibleSymbols.length && sessionDate ? await prisma.$queryRawUnsafe<IntradayRow[]>(INTRADAY_SQL, eligibleSymbols, sessionDate) : [];
  const candles = selectCandles(intradayRows, mode);
  const rows = daily.map((row) => {
    const hour = candles.get(`${row.symbol}:1H`) ?? {};
    const fifteen = candles.get(`${row.symbol}:15M`) ?? {};
    const intraday = { hourCurrent: hour.current, hourPrevious: hour.previous, fifteenCurrent: fifteen.current, fifteenPrevious: fifteen.previous };
    const evaluation = buildThreeMonthEvaluation(row, intraday, mode, "BULL");
    const bear = buildThreeMonthEvaluation(row, intraday, mode, "BEAR");
    return {
      symbol: row.symbol, companyName: row.company_name, sector: row.sector, sessionDate: isoOrNull(row.session_date)?.slice(0, 10) ?? String(row.session_date ?? ""), observedAt: isoOrNull(row.observed_at),
      qualification: evaluation.qualification, passedGateCount: evaluation.passedGateCount, availableGateCount: evaluation.availableGateCount,
      scoredConditionCount: evaluation.scoredConditionCount, availableConditionCount: evaluation.availableConditionCount, totalConditionCount: evaluation.totalConditionCount,
      gates: evaluation.gates, weaknessMonths: evaluation.weaknessMonths, weaknessState: evaluation.weaknessState,
      bull: evaluation, bear,
      intraday: { hour: hour.current ?? null, previousHour: hour.previous ?? null, fifteen: fifteen.current ?? null, previousFifteen: fifteen.previous ?? null },
    };
  }).sort((a, b) => (a.qualification === "QUALIFIED" ? -1 : b.qualification === "QUALIFIED" ? 1 : 0) || b.scoredConditionCount - a.scoredConditionCount || a.symbol.localeCompare(b.symbol));
  return {
    generatedAt: new Date().toISOString(), strategyVersion: "three_month_recovery_v1", scope: "CURRENT_NIFTY_500", intradayMode: mode,
    sessionDate: rows[0]?.sessionDate || null,
    basis: "Current monthly/weekly/daily close is the latest retained session value. Intraday candles are session-anchored at 09:15 IST; completed mode requires every expected minute.",
    counts: { universe: rows.length, expectedUniverse: 500, membershipCoveragePct: Math.round(rows.length / 500 * 10_000) / 100, qualified: rows.filter((row) => row.qualification === "QUALIFIED").length, bullQualified: rows.filter((row) => row.bull.qualification === "QUALIFIED").length, bearQualified: rows.filter((row) => row.bear.qualification === "QUALIFIED").length, rejected: rows.filter((row) => row.qualification === "REJECTED").length, incomplete: rows.filter((row) => row.qualification === "INCOMPLETE").length, intradayEvaluated: eligibleSymbols.length },
    rows,
  };
}

export function registerThreeMonthStrategy(app: Express, prisma: PrismaClient) {
  app.get("/v1/strategy/three-month", async (req, res, next) => {
    try {
      const rawMode = String(req.query.intradayMode ?? "completed");
      if (rawMode !== "completed" && rawMode !== "forming") return res.status(400).json({ error: { code: "INVALID_INTRADAY_MODE", message: "intradayMode must be completed or forming." } });
      const mode = rawMode as ThreeMonthMode;
      const now = Date.now();
      let entry = cache.get(mode);
      if (!entry || entry.expires <= now) {
        entry = { expires: Number.POSITIVE_INFINITY, value: Promise.resolve(null) };
        entry.value = getThreeMonthStrategy(prisma, mode).then((payload) => { entry!.expires = Date.now() + 30_000; return payload; });
        cache.set(mode, entry);
      }
      const payload = await entry.value.catch((error) => { cache.delete(mode); throw error; });
      res.setHeader("Cache-Control", "private, no-cache");
      res.json(payload);
    } catch (error) { next(error); }
  });
}
