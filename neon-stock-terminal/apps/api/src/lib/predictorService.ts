import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { getScalperProgression } from "../routes/overview";
import {
  MODEL_VERSION,
  features,
  samples,
  forecast,
  validate,
  validBar,
  positive,
  mwdEligibility,
  withinMorning,
  score,
  condition,
  type Bar,
} from "./predictorModels";

type Row = Record<string, any>;
const istDay = (value: number) =>
  new Date(value + 330 * 60000).toISOString().slice(0, 10);
export async function history(
  prisma: PrismaClient,
  token: string,
  before: string,
) {
  return prisma
    .$queryRawUnsafe<Bar[]>(
      `SELECT trade_date::text AS day,open::float8,high::float8,low::float8,close::float8
    FROM bars_1d WHERE exchange='NSE' AND symbol_token=$1 AND trade_date<$2::date
    AND created_at<=now() ORDER BY trade_date DESC LIMIT 850`,
      token,
      before,
    )
    .then((rows) => rows.reverse());
}
async function study(
  prisma: PrismaClient,
  symbol: string,
  day: string,
  bars: Bar[],
) {
  const existing = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT 1 FROM market_predictor.study WHERE session_date=$1::date AND symbol=$2 AND version=$3`,
    day,
    symbol,
    MODEL_VERSION,
  );
  if (existing.length) return;
  const all = samples(bars),
    rows = all.length >= 180 ? validate(all) : [];
  const payload = {
    mode: "RETROSPECTIVE_DAILY_OPEN",
    symbol,
    historyFrom: bars[0]?.day,
    historyThrough: bars.at(-1)?.day,
    usableSessions: all.length,
    excludedSessions: Math.max(0, bars.length - 21 - all.length),
    rows,
    limitation:
      "Chronological daily-open study of revised retained prices; not a historical OIIS/MWD-filtered trading backtest or live morning performance.",
    sourceHash: createHash("sha256").update(JSON.stringify(bars)).digest("hex"),
  };
  await prisma.$executeRawUnsafe(
    `INSERT INTO market_predictor.study(session_date,symbol,version,payload) VALUES($1::date,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,
    day,
    symbol,
    MODEL_VERSION,
    JSON.stringify(payload),
  );
}
async function evaluate(prisma: PrismaClient) {
  const pending = await prisma.$queryRawUnsafe<
    Row[]
  >(`SELECT f.* FROM market_predictor.forecast f LEFT JOIN market_predictor.outcome o ON o.forecast_id=f.id
    WHERE o.forecast_id IS NULL AND now()>f.target_at+interval '60 minutes' ORDER BY f.id LIMIT 300`);
  let evaluated = 0;
  for (const f of pending) {
    const bars = await prisma.$queryRawUnsafe<Bar[]>(
      `SELECT trade_date::text AS day,open::float8,high::float8,low::float8,close::float8 FROM bars_1d
      WHERE exchange='NSE' AND symbol_token=$1 AND trade_date=$2::date`,
      f.token,
      f.session_date,
    );
    const b = bars[0],
      p = f.payload;
    // No LTP fallback: absent/invalid EOD data remains pending.
    if (
      !b ||
      !validBar(b) ||
      Math.abs(b.close / p.reference - 1) > 0.25 ||
      Math.abs(b.open / p.open - 1) > 0.01
    )
      continue;
    const result = {
      ...score(
        p.predicted,
        p.low,
        p.high,
        p.probabilityAboveReference,
        p.reference,
        b.close,
      ),
      bar: b,
      condition: p.condition,
      model: f.model,
      symbol: f.symbol,
    };
    evaluated += await prisma.$executeRawUnsafe(
      `INSERT INTO market_predictor.outcome(forecast_id,source,payload) VALUES($1,'bars_1d EOD close; first accepted revision',$2::jsonb) ON CONFLICT DO NOTHING`,
      f.id,
      JSON.stringify(result),
    );
  }
  return evaluated;
}
/** Runs in a separate bounded process, never on a GET, pointer event or broker connection. */
export async function runPredictor(prisma: PrismaClient) {
  // DB transaction-scoped lease survives connection pooling correctly. Training is bounded.
  return prisma.$transaction(
    async (tx) => {
      const lock = await tx.$queryRawUnsafe<{ ok: boolean }[]>(
        `SELECT pg_try_advisory_xact_lock(59260919) ok`,
      );
      if (!lock[0]?.ok) return { state: "ALREADY_RUNNING" };
      const db = tx as unknown as PrismaClient,
        now = Date.now(),
        day = istDay(now);
      const sessions = await db.$queryRawUnsafe<Row[]>(
        `SELECT trade_date::text AS day,market_open_ts,market_close_ts FROM trading_calendar WHERE is_trading_day AND trade_date=$1::date`,
        day,
      );
      const next = await db.$queryRawUnsafe<Row[]>(
        `SELECT trade_date::text AS day,market_open_ts FROM trading_calendar WHERE is_trading_day AND market_open_ts>now() ORDER BY trade_date LIMIT 1`,
      );
      const session = sessions[0];
      const status: Row = {
        state: "WAITING_FOR_MORNING",
        day,
        nextSession: next[0] ?? null,
        window: "09:30–10:00 IST on regular sessions",
        forecastCount: 0,
        evaluated: await evaluate(db),
        eligibility: [],
        errors: [],
      };
      // Historical NIFTY study is available outside market hours, clearly separated from forward forecasts.
      const niftyBars = await history(db, "99926000", day);
      await study(db, "NIFTY", day, niftyBars);
      if (
        session &&
        withinMorning(
          now,
          +new Date(session.market_open_ts),
          +new Date(session.market_close_ts),
        )
      ) {
        const progression = await getScalperProgression(db);
        const rows = new Map(progression.rows.map((row) => [row.symbol, row]));
        const candidates = await db.$queryRawUnsafe<Row[]>(
          `WITH latest AS (
        SELECT run_id FROM oiis_live.selection_run WHERE trade_date=$1::date AND status='COMPLETED' AND completed_at<=now()
        ORDER BY completed_at DESC LIMIT 1)
        SELECT c.symbol,c.instrument_token token,c.direction,c.candidate_id,c.available_at,c.selected,c.recommended,c.auto_paper_selected
        FROM oiis_live.daily_candidate c JOIN latest USING(run_id)
        WHERE c.trade_date=$1::date AND c.available_at<=now() AND c.created_at<=now()
        AND (c.selected OR c.recommended OR c.auto_paper_selected) ORDER BY COALESCE(c.recommendation_rank,c.rank,999999),c.symbol`,
          day,
        );
        status.candidateCount = candidates.length;
        const universe = [
          { symbol: "NIFTY", token: "99926000", direction: "INDEX" },
          ...candidates,
        ];
        status.state = "MORNING_CAPTURE";
        for (const candidate of universe) {
          const entry: Row = {
            symbol: candidate.symbol,
            direction: candidate.direction,
            state: "PENDING",
          };
          status.eligibility.push(entry);
          const saved = await db.$queryRawUnsafe<Row[]>(
            `SELECT 1 FROM market_predictor.forecast WHERE session_date=$1::date AND symbol=$2 AND version=$3 LIMIT 1`,
            day,
            candidate.symbol,
            MODEL_VERSION,
          );
          if (saved.length) {
            entry.state = "ALREADY_SAVED";
            continue;
          }
          if (!candidate.token) {
            entry.state = "TOKEN_UNAVAILABLE";
            continue;
          }
          const points = await db.$queryRawUnsafe<Row[]>(
            `SELECT ts,open::float8,high::float8,low::float8,close::float8,created_at FROM bars_1m
          WHERE exchange='NSE' AND symbol_token=$1 AND ts>=$2::timestamptz AND ts<=now()-interval '1 minute' AND created_at<=now()
          ORDER BY ts`,
            candidate.token,
            session.market_open_ts,
          );
          const first = points[0],
            last = points.at(-1);
          if (
            !first ||
            !last ||
            +new Date(first.ts) !== +new Date(session.market_open_ts) ||
            Date.now() - +new Date(last.ts) > 180000 ||
            points.some(
              (p) =>
                !validBar({
                  day,
                  open: p.open,
                  high: p.high,
                  low: p.low,
                  close: p.close,
                }),
            )
          ) {
            entry.state = "FRESH_OPENING_BARS_UNAVAILABLE";
            continue;
          }
          const reference = last.close,
            open = first.open;
          const source = rows.get(candidate.symbol);
          if (
            source?.historyThrough &&
            source.historyThrough.slice(0, 10) > day
          ) {
            entry.state = "FUTURE_REFERENCE_REJECTED";
            continue;
          }
          const eligibility =
            candidate.symbol === "NIFTY"
              ? { eligible: true, route: "Index", gates: [] }
              : source
                ? mwdEligibility(
                    { ...source, todayOpen: open },
                    reference,
                    candidate.direction,
                  )
                : null;
          entry.eligibility = eligibility;
          if (!eligibility?.eligible) {
            entry.state = "MWD_NOT_PASSED";
            continue;
          }
          const bars =
            candidate.symbol === "NIFTY"
              ? niftyBars
              : await history(db, candidate.token, day);
          const previous = await db.$queryRawUnsafe<Row[]>(
            `SELECT trade_date::text AS day FROM trading_calendar WHERE is_trading_day AND trade_date<$1::date ORDER BY trade_date DESC LIMIT 1`,
            day,
          );
          if (bars.at(-1)?.day !== previous[0]?.day) {
            entry.state = "PREVIOUS_SESSION_MISSING";
            continue;
          }
          const x = features(bars, open),
            all = samples(bars);
          const models = x ? forecast(all, x, open, reference) : null;
          if (
            !x ||
            !models ||
            models.some((m) => ![m.predicted, m.low, m.high].every(positive))
          ) {
            entry.state = "INSUFFICIENT_OR_INVALID_HISTORY";
            entry.samples = all.length;
            continue;
          }
          await study(db, candidate.symbol, day, bars);
          // All three models share one immutable publication cohort, or none is inserted.
          if (
            !withinMorning(
              Date.now(),
              +new Date(session.market_open_ts),
              +new Date(session.market_close_ts),
            )
          ) {
            entry.state = "PUBLICATION_WINDOW_CLOSED";
            continue;
          }
          for (const model of models) {
            const { validation, ...result } = model;
            const payload = {
              ...result,
              reference,
              open,
              condition: condition(x),
              features: x,
              eligibility,
              candidate,
              sourcePriceAt: last.ts,
              sourceOpeningAt: first.ts,
              progression: source ?? null,
              trainingBars: bars,
              trainingHash: createHash("sha256")
                .update(JSON.stringify(bars))
                .digest("hex"),
              horizon: "Morning information to same-session EOD close",
              probabilityKind:
                "Smoothed frequency from past daily errors; not calibrated intraday probability",
            };
            status.forecastCount += await db.$executeRawUnsafe(
              `INSERT INTO market_predictor.forecast(session_date,symbol,token,model,version,deadline,target_at,source_at,payload)
            VALUES($1::date,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT DO NOTHING`,
              day,
              candidate.symbol,
              candidate.token,
              model.model,
              MODEL_VERSION,
              new Date(
                Math.min(
                  +new Date(session.market_open_ts) + 45 * 60000,
                  +new Date(session.market_close_ts) - 30 * 60000,
                ),
              ),
              session.market_close_ts,
              last.ts,
              JSON.stringify(payload),
            );
          }
          entry.state = "SAVED";
        }
      } else if (
        session &&
        now > +new Date(session.market_open_ts) + 45 * 60000
      )
        status.state = "MORNING_WINDOW_CLOSED";
      // Preserve morning eligibility across EOD scoring and repeated scheduler heartbeats.
      await db.$executeRawUnsafe(
        `INSERT INTO market_predictor.job_status(singleton,payload) VALUES(true,$1::jsonb)
      ON CONFLICT(singleton) DO UPDATE SET updated_at=clock_timestamp(),payload=CASE
      WHEN market_predictor.job_status.payload->>'day'=EXCLUDED.payload->>'day' AND jsonb_array_length(EXCLUDED.payload->'eligibility')=0
      THEN EXCLUDED.payload || jsonb_build_object('eligibility',market_predictor.job_status.payload->'eligibility','candidateCount',market_predictor.job_status.payload->'candidateCount')
      ELSE EXCLUDED.payload END`,
        JSON.stringify(status),
      );
      return status;
    },
    { timeout: 240000, maxWait: 10000 },
  );
}

export async function readPredictor(prisma: PrismaClient, day?: string) {
  const dates = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT DISTINCT session_date::text AS day FROM market_predictor.forecast ORDER BY day DESC LIMIT 60`,
  );
  const selected = day ?? istDay(Date.now());
  const [forecasts, studies, status] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT f.id::text,f.session_date::text AS day,f.symbol,f.model,f.version,f.published_at,f.target_at,f.source_at,
      f.payload-'trainingBars' payload,o.payload outcome,o.evaluated_at FROM market_predictor.forecast f
      LEFT JOIN market_predictor.outcome o ON o.forecast_id=f.id WHERE f.session_date=$1::date ORDER BY f.symbol,f.model`,
      selected,
    ),
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT ON(symbol) session_date::text AS day,symbol,generated_at,payload FROM market_predictor.study
      WHERE session_date<=$1::date AND (symbol='NIFTY' OR symbol IN(SELECT symbol FROM market_predictor.forecast WHERE session_date=$1::date))
      ORDER BY symbol,session_date DESC LIMIT 300`,
      selected,
    ),
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT updated_at,payload FROM market_predictor.job_status WHERE singleton`,
    ),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    selectedDay: selected,
    dates: dates.map((r) => r.day),
    forecasts,
    studies,
    status: status[0] ?? null,
    version: MODEL_VERSION,
    executionEnabled: false,
  };
}
