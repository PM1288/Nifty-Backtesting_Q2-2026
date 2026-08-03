const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const app = express();

const PORT = Number(process.env.PORT || 18183);
const PGHOST = process.env.PGHOST || 'postgres';
const PGPORT = Number(process.env.PGPORT || 5432);
const PGDATABASE = process.env.PGDATABASE || process.env.POSTGRES_DB || 'tradingdb';
const PGUSER = process.env.PGUSER || process.env.POSTGRES_USER || 'trader';
const PGPASSWORD = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '';
const ADMIN_USER = process.env.LITE_DASH_USER || 'admin';
const ADMIN_PASSWORD = process.env.LITE_DASH_PASSWORD || 'admin1234';
const SESSION_SECRET = process.env.LITE_DASH_SESSION_SECRET || 'lite-dashboard-change-me';
const SESSION_TTL_SECONDS = Number(process.env.LITE_DASH_SESSION_TTL_SECONDS || 43200);
const DASHBOARD_CACHE_TTL_MS = Number(process.env.LITE_DASH_CACHE_TTL_MS || 3000);
const HEATMAP_CACHE_TTL_MS = Number(process.env.LITE_HEATMAP_CACHE_TTL_MS || 5000);
const RSI_HEATMAP_CACHE_TTL_MS = Number(process.env.LITE_RSI_HEATMAP_CACHE_TTL_MS || 5000);
const PG_POOL_MAX = Number(process.env.LITE_DASH_DB_MAX_CONNS || 2);
const PG_IDLE_TIMEOUT_MS = Number(process.env.LITE_DASH_DB_IDLE_TIMEOUT_MS || 10000);
const PG_CONNECTION_TIMEOUT_MS = Number(process.env.LITE_DASH_DB_CONNECTION_TIMEOUT_MS || 5000);

const pool = new Pool({
  host: PGHOST,
  port: PGPORT,
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
  max: PG_POOL_MAX,
  idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
});

const COOKIE_NAME = 'lite_dash_auth';
const dashboardCache = new Map();
let heatmapCache = null;
let rsiHeatmapCache = null;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

function parseNum(v) {
  if (v === null || v === undefined) {
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return null;
  }
  return n;
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function createSessionToken(username) {
  const payload = {
    u: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, receivedSig] = parts;
  const expectedSig = sign(encoded);
  if (receivedSig.length !== expectedSig.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const session = verifySessionToken(req.cookies[COOKIE_NAME]);
  if (!session) {
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
    res.redirect('./login');
    return;
  }
  req.user = session;
  next();
}

function calcRSISeries(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (period <= 0 || closes.length <= period) {
    return out;
  }
  const gains = new Array(closes.length).fill(0);
  const losses = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      gains[i] = diff;
    } else {
      losses[i] = -diff;
    }
  }

  let sumGain = 0;
  let sumLoss = 0;
  for (let i = 1; i <= period && i < closes.length; i += 1) {
    sumGain += gains[i];
    sumLoss += losses[i];
  }

  const rsiValue = (avgGain, avgLoss) => {
    if (avgLoss === 0) {
      return 100;
    }
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  out[period] = rsiValue(sumGain / period, sumLoss / period);
  for (let i = period + 1; i < closes.length; i += 1) {
    sumGain += gains[i] - gains[i - period];
    sumLoss += losses[i] - losses[i - period];
    out[i] = rsiValue(sumGain / period, sumLoss / period);
  }
  return out;
}

function calcWillRSeries(highs, lows, closes, period) {
  const out = new Array(closes.length).fill(null);
  if (period <= 0) {
    return out;
  }
  for (let i = period - 1; i < closes.length; i += 1) {
    let hi = highs[i];
    let lo = lows[i];
    for (let j = i - period + 1; j <= i; j += 1) {
      if (highs[j] > hi) {
        hi = highs[j];
      }
      if (lows[j] < lo) {
        lo = lows[j];
      }
    }
    if (hi === lo) {
      out[i] = 0;
    } else {
      out[i] = -100 * ((hi - closes[i]) / (hi - lo));
    }
  }
  return out;
}

async function listStocks() {
  const result = await pool.query(
    `
    SELECT DISTINCT tradingsymbol
    FROM instrument_universe
    WHERE universe_name = 'nifty100_equity'
      AND active_to IS NULL
      AND tradingsymbol IS NOT NULL
      AND tradingsymbol <> ''
    ORDER BY tradingsymbol ASC
    `,
  );
  return result.rows.map(r => String(r.tradingsymbol));
}

async function listStocksWithCategory() {
  const result = await pool.query(
    `
    WITH base AS (
      SELECT DISTINCT iu.tradingsymbol
      FROM instrument_universe iu
      WHERE iu.universe_name = 'nifty100_equity'
        AND iu.active_to IS NULL
        AND iu.tradingsymbol IS NOT NULL
        AND iu.tradingsymbol <> ''
    ),
    tagged AS (
      SELECT
        b.tradingsymbol,
        COALESCE(
          NULLIF(TRIM(ic.sector), ''),
          NULLIF(TRIM(ic.industry), ''),
          NULLIF(TRIM(ic.basic_industry), ''),
          'Other'
        ) AS category
      FROM base b
      LEFT JOIN LATERAL (
        SELECT c.sector, c.industry, c.basic_industry
        FROM index_constituents c
        WHERE UPPER(TRIM(c.symbol)) = UPPER(REGEXP_REPLACE(TRIM(b.tradingsymbol), '-EQ$', ''))
        ORDER BY
          CASE WHEN UPPER(TRIM(c.index_name)) IN ('NIFTY100', 'NIFTY 100') THEN 0 ELSE 1 END,
          c.updated_at DESC
        LIMIT 1
      ) ic ON true
    )
    SELECT tradingsymbol, category
    FROM tagged
    ORDER BY category ASC, tradingsymbol ASC
    `,
  );
  return result.rows.map(r => ({
    symbol: String(r.tradingsymbol),
    category: String(r.category || 'Other'),
  }));
}

function todayIstDateString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return `${year}-${month}-${day}`;
}

function buildIstTimeline() {
  const dateStr = todayIstDateString();
  const labels = [];
  const iso = [];
  let hour = 9;
  let minute = 15;
  while (hour < 15 || (hour === 15 && minute <= 30)) {
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    labels.push(`${hh}:${mm}`);
    iso.push(`${dateStr}T${hh}:${mm}:00+05:30`);
    minute += 1;
    if (minute >= 60) {
      minute = 0;
      hour += 1;
    }
  }
  return { labels, iso };
}

async function fetchHeatmapSeries(stocksInfo) {
  const timeline = buildIstTimeline();
  const symbolRows = [{ symbol: 'NIFTY50', token: '99926000' }];
  const stocks = stocksInfo.map(s => s.symbol);
  const categoryBySymbol = new Map(stocksInfo.map(s => [s.symbol, s.category || 'Other']));

  if (stocks.length > 0) {
    const rows = await pool.query(
      `
      SELECT tradingsymbol, symbol_token
      FROM instrument_universe
      WHERE exchange = 'NSE'
        AND active_to IS NULL
        AND tradingsymbol = ANY($1::text[])
      `,
      [stocks],
    );
    for (const row of rows.rows) {
      symbolRows.push({ symbol: String(row.tradingsymbol), token: String(row.symbol_token) });
    }
  }

  const tokenBySymbol = new Map(symbolRows.map(r => [r.symbol, r.token]));
  const symbolByToken = new Map(symbolRows.map(r => [r.token, r.symbol]));
  const tokens = Array.from(new Set(symbolRows.map(r => r.token)));

  const tokenData = new Map();
  for (const token of tokens) {
    tokenData.set(token, new Array(timeline.labels.length).fill(null));
  }

  if (tokens.length > 0) {
    const dataRes = await pool.query(
      `
      WITH src AS (
        SELECT
          symbol_token,
          ts,
          close,
          FIRST_VALUE(open) OVER (PARTITION BY symbol_token ORDER BY ts ASC) AS day_open
        FROM bars_1m
        WHERE exchange = 'NSE'
          AND symbol_token = ANY($1::text[])
          AND (ts AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
          AND (ts AT TIME ZONE 'Asia/Kolkata')::time >= time '09:15:00'
          AND (ts AT TIME ZONE 'Asia/Kolkata')::time <= time '15:30:00'
      )
      SELECT
        symbol_token,
        to_char(ts AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS hhmm,
        ((close - day_open) * 100.0 / NULLIF(day_open, 0))::double precision AS pct_change
      FROM src
      `,
      [tokens],
    );

    const indexByLabel = new Map(timeline.labels.map((v, i) => [v, i]));
    for (const row of dataRes.rows) {
      const token = String(row.symbol_token);
      const label = String(row.hhmm);
      const idx = indexByLabel.get(label);
      if (idx === undefined) {
        continue;
      }
      const arr = tokenData.get(token);
      if (!arr) {
        continue;
      }
      arr[idx] = parseNum(row.pct_change);
    }
  }

  const symbolsOrdered = ['NIFTY50', ...stocks];
  const categories = symbolsOrdered.map(s => (s === 'NIFTY50' ? 'Index' : (categoryBySymbol.get(s) || 'Other')));
  const categoryRanges = [];
  for (let i = 0; i < symbolsOrdered.length; i += 1) {
    const name = categories[i];
    if (!categoryRanges.length || categoryRanges[categoryRanges.length - 1].name !== name) {
      categoryRanges.push({ name, start: i, end: i });
    } else {
      categoryRanges[categoryRanges.length - 1].end = i;
    }
  }
  const matrix = symbolsOrdered.map(symbol => {
    const token = tokenBySymbol.get(symbol);
    return token && tokenData.has(token) ? tokenData.get(token) : new Array(timeline.labels.length).fill(null);
  });

  return {
    timelineIst: timeline.labels,
    symbols: symbolsOrdered,
    categories,
    categoryRanges,
    matrix,
    scaleMin: -1.5,
    scaleMax: 1.5,
    generatedAt: new Date().toISOString(),
  };
}

async function fetchRsiHeatmapSeries(stocksInfo) {
  const timeline = buildIstTimeline();
  const symbolRows = [{ symbol: 'NIFTY50', token: '99926000' }];
  const stocks = stocksInfo.map(s => s.symbol);
  const categoryBySymbol = new Map(stocksInfo.map(s => [s.symbol, s.category || 'Other']));

  if (stocks.length > 0) {
    const rows = await pool.query(
      `
      SELECT tradingsymbol, symbol_token
      FROM instrument_universe
      WHERE exchange = 'NSE'
        AND active_to IS NULL
        AND tradingsymbol = ANY($1::text[])
      `,
      [stocks],
    );
    for (const row of rows.rows) {
      symbolRows.push({ symbol: String(row.tradingsymbol), token: String(row.symbol_token) });
    }
  }

  const tokenBySymbol = new Map(symbolRows.map(r => [r.symbol, r.token]));
  const tokens = Array.from(new Set(symbolRows.map(r => r.token)));

  const tokenData = new Map();
  for (const token of tokens) {
    tokenData.set(token, new Array(timeline.labels.length).fill(null));
  }

  if (tokens.length > 0) {
    const rsiRes = await pool.query(
      `
      WITH base AS (
        SELECT
          symbol_token,
          ts,
          close,
          lag(close) OVER (PARTITION BY symbol_token ORDER BY ts) AS prev_close
        FROM bars_1m
        WHERE exchange = 'NSE'
          AND symbol_token = ANY($1::text[])
          AND (ts AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
          AND (ts AT TIME ZONE 'Asia/Kolkata')::time >= time '09:15:00'
          AND (ts AT TIME ZONE 'Asia/Kolkata')::time <= time '15:30:00'
      ),
      diffs AS (
        SELECT
          symbol_token,
          ts,
          GREATEST(close - prev_close, 0) AS gain,
          GREATEST(prev_close - close, 0) AS loss
        FROM base
        WHERE prev_close IS NOT NULL
      ),
      rolling AS (
        SELECT
          symbol_token,
          ts,
          (SUM(gain) OVER (
            PARTITION BY symbol_token
            ORDER BY ts
            ROWS BETWEEN 13 PRECEDING AND CURRENT ROW
          )) / 14.0 AS avg_gain,
          (SUM(loss) OVER (
            PARTITION BY symbol_token
            ORDER BY ts
            ROWS BETWEEN 13 PRECEDING AND CURRENT ROW
          )) / 14.0 AS avg_loss,
          ROW_NUMBER() OVER (PARTITION BY symbol_token ORDER BY ts) AS rn
        FROM diffs
      )
      SELECT
        symbol_token,
        to_char(ts AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS hhmm,
        CASE
          WHEN avg_loss = 0 THEN 100::double precision
          ELSE (100 - (100 / (1 + (avg_gain / NULLIF(avg_loss, 0)))))::double precision
        END AS rsi
      FROM rolling
      WHERE rn >= 14
      `,
      [tokens],
    );

    const indexByLabel = new Map(timeline.labels.map((v, i) => [v, i]));
    for (const row of rsiRes.rows) {
      const token = String(row.symbol_token);
      const label = String(row.hhmm);
      const idx = indexByLabel.get(label);
      if (idx === undefined) {
        continue;
      }
      const arr = tokenData.get(token);
      if (!arr) {
        continue;
      }
      arr[idx] = parseNum(row.rsi);
    }
  }

  const symbolsOrdered = ['NIFTY50', ...stocks];
  const categories = symbolsOrdered.map(s => (s === 'NIFTY50' ? 'Index' : (categoryBySymbol.get(s) || 'Other')));
  const categoryRanges = [];
  for (let i = 0; i < symbolsOrdered.length; i += 1) {
    const name = categories[i];
    if (!categoryRanges.length || categoryRanges[categoryRanges.length - 1].name !== name) {
      categoryRanges.push({ name, start: i, end: i });
    } else {
      categoryRanges[categoryRanges.length - 1].end = i;
    }
  }
  const matrix = symbolsOrdered.map(symbol => {
    const token = tokenBySymbol.get(symbol);
    return token && tokenData.has(token) ? tokenData.get(token) : new Array(timeline.labels.length).fill(null);
  });

  return {
    timelineIst: timeline.labels,
    symbols: symbolsOrdered,
    categories,
    categoryRanges,
    matrix,
    scaleMin: 0,
    scaleMax: 100,
    generatedAt: new Date().toISOString(),
  };
}

async function findTokenByTradingSymbol(symbol) {
  const result = await pool.query(
    `
    SELECT symbol_token
    FROM instrument_universe
    WHERE exchange = 'NSE'
      AND tradingsymbol = $1
      AND active_to IS NULL
    ORDER BY active_from DESC NULLS LAST
    LIMIT 1
    `,
    [symbol],
  );
  if (!result.rows[0]) {
    return null;
  }
  return String(result.rows[0].symbol_token);
}

async function fetchDayBars(symbolToken) {
  const result = await pool.query(
    `
    SELECT ts, open, high, low, close, volume
    FROM bars_1m
    WHERE exchange = 'NSE'
      AND symbol_token = $1
      AND (ts AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
    ORDER BY ts ASC
    `,
    [symbolToken],
  );

  return result.rows.map(r => ({
    ts: new Date(r.ts).toISOString(),
    open: parseNum(r.open),
    high: parseNum(r.high),
    low: parseNum(r.low),
    close: parseNum(r.close),
    volume: parseNum(r.volume),
  }));
}

async function fetchStateByToken(symbolToken) {
  const result = await pool.query(
    `
    SELECT last_price, percent_change, net_change, last_open, last_high, last_low, last_close, last_seen_ts
    FROM instrument_state
    WHERE exchange = 'NSE'
      AND symbol_token = $1
    ORDER BY last_seen_ts DESC
    LIMIT 1
    `,
    [symbolToken],
  );
  if (!result.rows[0]) {
    return null;
  }
  const row = result.rows[0];
  return {
    ltp: parseNum(row.last_price),
    percentChange: parseNum(row.percent_change),
    netChange: parseNum(row.net_change),
    open: parseNum(row.last_open),
    high: parseNum(row.last_high),
    low: parseNum(row.last_low),
    close: parseNum(row.last_close),
    lastSeen: row.last_seen_ts ? new Date(row.last_seen_ts).toISOString() : null,
  };
}

async function fetchLatestOptionChain() {
  const snapRes = await pool.query(
    `
    SELECT id, captured_at, symbol, expiry_date, underlying_value, atm_strike
    FROM option_chain_snapshots
    WHERE symbol = 'NIFTY'
    ORDER BY captured_at DESC
    LIMIT 1
    `,
  );
  if (!snapRes.rows[0]) {
    return null;
  }
  const snap = snapRes.rows[0];

  const legsRes = await pool.query(
    `
    SELECT strike, option_type, last_price, open_interest, change_in_oi, implied_volatility
    FROM option_chain_legs
    WHERE snapshot_id = $1
    ORDER BY strike ASC, option_type ASC
    `,
    [snap.id],
  );

  const strikes = new Map();
  for (const row of legsRes.rows) {
    const strike = parseNum(row.strike);
    if (strike === null) {
      continue;
    }
    if (!strikes.has(strike)) {
      strikes.set(strike, {
        strike,
        ceLtp: null,
        peLtp: null,
        ceOi: null,
        peOi: null,
        ceChangeOi: null,
        peChangeOi: null,
        ceIv: null,
        peIv: null,
      });
    }
    const item = strikes.get(strike);
    const legType = String(row.option_type).trim().toUpperCase();
    if (legType === 'CE') {
      item.ceLtp = parseNum(row.last_price);
      item.ceOi = parseNum(row.open_interest);
      item.ceChangeOi = parseNum(row.change_in_oi);
      item.ceIv = parseNum(row.implied_volatility);
    }
    if (legType === 'PE') {
      item.peLtp = parseNum(row.last_price);
      item.peOi = parseNum(row.open_interest);
      item.peChangeOi = parseNum(row.change_in_oi);
      item.peIv = parseNum(row.implied_volatility);
    }
  }

  const strikeRows = Array.from(strikes.values()).sort((a, b) => a.strike - b.strike);

  let atm = null;
  const atmStrike = parseNum(snap.atm_strike);
  if (atmStrike !== null) {
    atm = strikeRows.find(x => x.strike === atmStrike) || null;
  }

  const dayOpenRes = await pool.query(
    `
    SELECT id, captured_at, atm_strike
    FROM option_chain_snapshots
    WHERE symbol = 'NIFTY'
      AND (captured_at AT TIME ZONE 'Asia/Kolkata')::date = ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
    ORDER BY captured_at ASC
    LIMIT 1
    `,
    [snap.captured_at],
  );

  let atmOpenCombo = null;
  let atmOpenAt = null;
  let atmOpenStrike = null;
  if (dayOpenRes.rows[0]) {
    atmOpenStrike = parseNum(dayOpenRes.rows[0].atm_strike);
    const openLegRes = await pool.query(
      `
      SELECT option_type, last_price
      FROM option_chain_legs
      WHERE snapshot_id = $1
        AND strike = $2
      `,
      [dayOpenRes.rows[0].id, atmOpenStrike],
    );
    let ceOpen = null;
    let peOpen = null;
    for (const leg of openLegRes.rows) {
      const t = String(leg.option_type).trim().toUpperCase();
      if (t === 'CE') {
        ceOpen = parseNum(leg.last_price);
      }
      if (t === 'PE') {
        peOpen = parseNum(leg.last_price);
      }
    }
    if (ceOpen !== null && peOpen !== null) {
      atmOpenCombo = ceOpen + peOpen;
      atmOpenAt = new Date(dayOpenRes.rows[0].captured_at).toISOString();
    }
  }

  const atmSeriesRes = await pool.query(
    `
    SELECT
      s.captured_at,
      s.atm_strike,
      MAX(CASE WHEN l.option_type = 'CE' THEN l.last_price END) AS ce_ltp,
      MAX(CASE WHEN l.option_type = 'PE' THEN l.last_price END) AS pe_ltp
    FROM option_chain_snapshots s
    LEFT JOIN option_chain_legs l
      ON l.snapshot_id = s.id
      AND l.strike = s.atm_strike
    WHERE s.symbol = 'NIFTY'
      AND (s.captured_at AT TIME ZONE 'Asia/Kolkata')::date = ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
    GROUP BY s.id, s.captured_at, s.atm_strike
    ORDER BY s.captured_at ASC
    `,
    [snap.captured_at],
  );

  const atmSeries = atmSeriesRes.rows.map(r => {
    const ce = parseNum(r.ce_ltp);
    const pe = parseNum(r.pe_ltp);
    return {
      ts: new Date(r.captured_at).toISOString(),
      atmStrike: parseNum(r.atm_strike),
      ceLtp: ce,
      peLtp: pe,
      combo: (ce !== null && pe !== null) ? ce + pe : null,
    };
  });

  const atmCurrentCombo = (atm && atm.ceLtp !== null && atm.peLtp !== null) ? (atm.ceLtp + atm.peLtp) : null;

  return {
    capturedAt: new Date(snap.captured_at).toISOString(),
    symbol: String(snap.symbol),
    expiryDate: snap.expiry_date ? new Date(snap.expiry_date).toISOString().slice(0, 10) : null,
    underlyingValue: parseNum(snap.underlying_value),
    atmStrike,
    atm,
    atmCurrentCombo,
    atmOpenCombo,
    atmOpenAt,
    atmOpenStrike,
    atmSeries,
    strikes: strikeRows,
  };
}

async function fetchEquilibriumSeries() {
  const res = await pool.query(
    `
    WITH picked AS (
      SELECT max(expiry) AS expiry
      FROM equilibrium_mean_series
      WHERE underlying = 'NIFTY50'
    )
    SELECT e.ts, e.ce_mean_norm, e.pe_mean_norm
    FROM equilibrium_mean_series e
    JOIN picked p ON e.expiry = p.expiry
    WHERE e.underlying = 'NIFTY50'
      AND (e.ts AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
    ORDER BY e.ts ASC
    `,
  );

  return res.rows.map(r => ({
    ts: new Date(r.ts).toISOString(),
    ceNorm: parseNum(r.ce_mean_norm),
    peNorm: parseNum(r.pe_mean_norm),
  }));
}

function calcHundredMarks(minValue, maxValue) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return [];
  }
  const start = Math.floor(minValue / 100) * 100;
  const end = Math.ceil(maxValue / 100) * 100;
  const out = [];
  for (let mark = start; mark <= end; mark += 100) {
    out.push(mark);
  }
  return out;
}

async function buildDashboard(symbolQuery) {
  const stocks = await listStocks();
  const symbol = stocks.includes(symbolQuery) ? symbolQuery : (stocks[0] || 'RELIANCE');

  const niftyToken = '99926000';
  const stockToken = await findTokenByTradingSymbol(symbol);

  const [niftyState, niftyBars, stockState, stockBars, optionChain, equilibriumSeries] = await Promise.all([
    fetchStateByToken(niftyToken),
    fetchDayBars(niftyToken),
    stockToken ? fetchStateByToken(stockToken) : null,
    stockToken ? fetchDayBars(stockToken) : [],
    fetchLatestOptionChain(),
    fetchEquilibriumSeries(),
  ]);

  const niftyLows = niftyBars.map(r => r.low).filter(v => Number.isFinite(v));
  const niftyHighs = niftyBars.map(r => r.high).filter(v => Number.isFinite(v));
  const niftyDayLow = niftyLows.length ? Math.min(...niftyLows) : null;
  const niftyDayHigh = niftyHighs.length ? Math.max(...niftyHighs) : null;

  const stockCloses = stockBars.map(r => r.close || 0);
  const stockHighs = stockBars.map(r => r.high || 0);
  const stockLows = stockBars.map(r => r.low || 0);
  const rsiSeries = calcRSISeries(stockCloses, 14);
  const willrSeries = calcWillRSeries(stockHighs, stockLows, stockCloses, 14);

  const stockSeries = stockBars.map((bar, idx) => ({
    ...bar,
    rsi: rsiSeries[idx],
    willr: willrSeries[idx],
  }));

  const stockOpen = stockBars[0] ? stockBars[0].open : null;
  const stockLast = stockBars.length ? stockBars[stockBars.length - 1].close : null;
  const stockDelta = (stockOpen !== null && stockLast !== null) ? stockLast - stockOpen : null;
  const stockDeltaPct = (stockOpen && stockLast !== null) ? (stockDelta * 100) / stockOpen : null;

  return {
    generatedAt: new Date().toISOString(),
    stocks,
    selectedStock: symbol,
    nifty: {
      state: niftyState,
      open: niftyBars[0] ? niftyBars[0].open : null,
      dayLow: niftyDayLow,
      dayHigh: niftyDayHigh,
      hundredMarks: calcHundredMarks(niftyDayLow, niftyDayHigh),
      bars: niftyBars,
    },
    stock: {
      symbol,
      state: stockState,
      open: stockOpen,
      dayDelta: stockDelta,
      dayDeltaPct: stockDeltaPct,
      bars: stockSeries,
      guides: {
        rsi30: 30,
        rsi75: 75,
        willr80: -80,
      },
    },
    optionChain: {
      latest: optionChain,
      equilibriumSeries,
    },
  };
}

function getCachedDashboard(symbol) {
  const key = (symbol || '').trim().toUpperCase() || '__DEFAULT__';
  const cached = dashboardCache.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.ts > DASHBOARD_CACHE_TTL_MS) {
    dashboardCache.delete(key);
    return null;
  }
  return cached.payload;
}

function setCachedDashboard(symbol, payload) {
  const key = (symbol || '').trim().toUpperCase() || '__DEFAULT__';
  dashboardCache.set(key, { ts: Date.now(), payload });
}

function getCachedHeatmap() {
  if (!heatmapCache) {
    return null;
  }
  if (Date.now() - heatmapCache.ts > HEATMAP_CACHE_TTL_MS) {
    heatmapCache = null;
    return null;
  }
  return heatmapCache.payload;
}

function setCachedHeatmap(payload) {
  heatmapCache = { ts: Date.now(), payload };
}

function getCachedRsiHeatmap() {
  if (!rsiHeatmapCache) {
    return null;
  }
  if (Date.now() - rsiHeatmapCache.ts > RSI_HEATMAP_CACHE_TTL_MS) {
    rsiHeatmapCache = null;
    return null;
  }
  return rsiHeatmapCache.payload;
}

function setCachedRsiHeatmap(payload) {
  rsiHeatmapCache = { ts: Date.now(), payload };
}

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, status: 'ok' });
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message });
  }
});

app.get('/login', (req, res) => {
  const existing = verifySessionToken(req.cookies[COOKIE_NAME]);
  if (existing) {
    res.redirect('./');
    return;
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/auth/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, error: 'invalid credentials' });
    return;
  }

  const token = createSessionToken(username);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });

  res.json({ ok: true });
});

app.post('/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.use('/api', requireAuth);
app.use('/', (req, res, next) => {
  if (req.path === '/login' || req.path === '/healthz' || req.path === '/auth/login' || req.path === '/auth/logout') {
    next();
    return;
  }
  requireAuth(req, res, next);
});

app.get('/api/stocks', async (_req, res) => {
  try {
    const stocks = await listStocks();
    res.json({ ok: true, stocks });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    const fromCache = getCachedDashboard(symbol);
    if (fromCache) {
      res.json({ ok: true, cached: true, data: fromCache });
      return;
    }
    const data = await buildDashboard(symbol);
    setCachedDashboard(symbol, data);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/heatmap', async (_req, res) => {
  try {
    const fromCache = getCachedHeatmap();
    if (fromCache) {
      res.json({ ok: true, cached: true, data: fromCache });
      return;
    }
    const stocksInfo = await listStocksWithCategory();
    const data = await fetchHeatmapSeries(stocksInfo);
    setCachedHeatmap(data);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/rsi-heatmap', async (_req, res) => {
  try {
    const fromCache = getCachedRsiHeatmap();
    if (fromCache) {
      res.json({ ok: true, cached: true, data: fromCache });
      return;
    }
    const stocksInfo = await listStocksWithCategory();
    const data = await fetchRsiHeatmapSeries(stocksInfo);
    setCachedRsiHeatmap(data);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/heatmap', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'heatmap.html'));
});

app.get('/rsi-heatmap', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rsi-heatmap.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`[lite-dashboard] listening on ${PORT}`);
});
