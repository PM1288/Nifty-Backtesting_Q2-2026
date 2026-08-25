import { DateTime } from 'luxon';
import { Pool } from 'pg';
import { SelectedSnapshot } from './transform';
import { ExchangeSession } from './sessionPolicy';

type SnapshotRow = {
  id: number;
  capturedAt: string;
  symbol: string;
  expiryDate: string;
  underlyingValue: number | null;
  atmStrike: number | null;
  strikesAround: number;
  fetchMs: number | null;
};

type LegRow = {
  strike: number;
  optionType: 'CE' | 'PE';
  lastPrice: number | null;
  change: number | null;
  iv: number | null;
  volume: number | null;
  oi: number | null;
  chgOi: number | null;
  bidQty: number | null;
  bidPrice: number | null;
  askQty: number | null;
  askPrice: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  instrumentIdentifier: string | null;
};

export type OptionChainAnalyticsStrikeSnapshot = {
  strike: number;
  ceClose: number | null;
  peClose: number | null;
  ceNorm: number | null;
  peNorm: number | null;
};

export type OptionChainAnalyticsEquilibriumPoint = {
  capturedAt: string;
  underlyingValue: number | null;
  atmStrike: number | null;
  ceAggregateNorm: number | null;
  peAggregateNorm: number | null;
  equilibriumSpread: number | null;
  equilibriumFlag: boolean;
  crossoverFlag: boolean;
  ceCount: number;
  peCount: number;
};

export type OptionChainAnalyticsAtmComboPoint = {
  capturedAt: string;
  underlyingValue: number | null;
  atmStrike: number | null;
  ceLtp: number | null;
  peLtp: number | null;
  atmCombo: number | null;
  sessionOpenCombo: number | null;
  comboDelta: number | null;
  comboDeltaPct: number | null;
  comboDirection: 'up' | 'down' | 'flat' | 'na';
  atmStrikeChanged: boolean;
};

export type OptionChainAnalyticsResult = {
  snapshot: SnapshotRow;
  legs: LegRow[];
  availableExpiries: string[];
  tradeDate: string;
  strikeWindow: {
    baseAtmStrike: number | null;
    strikes: number[];
    strikesAround: number;
    tieBreakRule: 'lower_on_tie';
    tieBreakUsed: boolean;
  };
  expiryContext: {
    selectedExpiry: string;
    nextExpiry: string;
    dteDays: number | null;
    dteHours: number | null;
    expiryProgressPct: number | null;
    currentAtmStrike: number | null;
    currentSpot: number | null;
    spotToAtmDistance: number | null;
    currentEquilibriumSpread: number | null;
    currentSideDominance: 'CE dominant' | 'PE dominant' | 'Near equilibrium' | 'Unavailable';
    lastCrossoverAt: string | null;
  };
  equilibrium: {
    epsilon: number;
    points: OptionChainAnalyticsEquilibriumPoint[];
    latestStrikes: OptionChainAnalyticsStrikeSnapshot[];
    ceAggregateCurrent: number | null;
    peAggregateCurrent: number | null;
    currentSpread: number | null;
    currentDominance: 'CE dominant' | 'PE dominant' | 'Near equilibrium' | 'Unavailable';
    lastCrossoverAt: string | null;
  };
  atmCombo: {
    openCombo: number | null;
    currentCombo: number | null;
    currentDelta: number | null;
    currentDeltaPct: number | null;
    points: OptionChainAnalyticsAtmComboPoint[];
  };
  diagnostics: {
    freshnessMinutes: number | null;
    strikeCount: number;
    strikeWindowSize: number;
    missingCeSeriesCount: number;
    missingPeSeriesCount: number;
    timestampDriftSeconds: number;
    normalizationFallbackCount: number;
    crossoverCount: number;
    cacheMode: 'live_db';
    queryMode: 'batched_intraday_snapshot';
    latestSnapshotAt: string | null;
    latestPollOkAt: string | null;
  };
};

type FlatSeriesRow = {
  capturedAt: string;
  underlyingValue: number | null;
  atmStrike: number | null;
  strike: number;
  optionType: 'CE' | 'PE';
  lastPrice: number | null;
  iv: number | null;
  oi: number | null;
  chgOi: number | null;
};

type NormalizationStats = {
  min: number;
  max: number;
};

function minutesSince(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return (Date.now() - parsed) / 60_000;
}

function nearestListedStrike(
  strikes: number[],
  spot: number | null,
): { strike: number | null; tieBreakUsed: boolean } {
  if (!strikes.length || spot == null || !Number.isFinite(spot)) {
    return { strike: strikes[Math.floor(strikes.length / 2)] ?? null, tieBreakUsed: false };
  }

  let best = strikes[0];
  let bestDist = Math.abs(best - spot);
  let tieBreakUsed = false;

  for (const strike of strikes) {
    const distance = Math.abs(strike - spot);
    if (distance < bestDist) {
      best = strike;
      bestDist = distance;
      tieBreakUsed = false;
      continue;
    }
    if (distance === bestDist && strike < best) {
      best = strike;
      tieBreakUsed = true;
    }
  }

  return { strike: best, tieBreakUsed };
}

function normalizeSeriesValue(
  value: number | null,
  stats: NormalizationStats | null,
): { value: number | null; usedFallback: boolean } {
  if (value == null || stats == null) return { value: null, usedFallback: false };
  const span = stats.max - stats.min;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-9) {
    return { value: 50, usedFallback: true };
  }
  const normalized = ((value - stats.min) / span) * 100;
  return { value: Math.max(0, Math.min(100, normalized)), usedFallback: false };
}

function average(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function roundTo(value: number | null, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toIsoDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date).toISOString().slice(0, 10);
}

export class OptionChainStore {
  constructor(private readonly pool: Pool) {}

  async getExchangeSession(at: Date): Promise<ExchangeSession | null> {
    const result = await this.pool.query(
      `
      select trade_date, is_trading_day, market_open_ts, market_close_ts, note
      from public.trading_calendar
      where trade_date = ($1::timestamptz at time zone 'Asia/Kolkata')::date
      limit 1
      `,
      [at],
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      tradeDate: toIsoDate(row.trade_date),
      isTradingDay: Boolean(row.is_trading_day),
      marketOpenAt: row.market_open_ts ? new Date(row.market_open_ts) : null,
      marketCloseAt: row.market_close_ts ? new Date(row.market_close_ts) : null,
      specialSession: typeof row.note === 'string' && /special/i.test(row.note),
      sessionLabel: row.note == null ? null : String(row.note),
    };
  }

  private mapSnapshotRow(row: any): SnapshotRow {
    return {
      id: Number(row.id),
      capturedAt: new Date(row.captured_at).toISOString(),
      symbol: String(row.symbol),
      expiryDate: new Date(row.expiry_date).toISOString().slice(0, 10),
      underlyingValue: row.underlying_value === null ? null : Number(row.underlying_value),
      atmStrike: row.atm_strike === null ? null : Number(row.atm_strike),
      strikesAround: Number(row.strikes_around),
      fetchMs: row.fetch_ms === null ? null : Number(row.fetch_ms),
    };
  }

  private mapLegRows(rows: any[]): LegRow[] {
    return rows.map(r => ({
      strike: Number(r.strike),
      optionType: String(r.option_type).trim() as 'CE' | 'PE',
      lastPrice: r.last_price === null ? null : Number(r.last_price),
      change: r.change === null ? null : Number(r.change),
      iv: r.implied_volatility === null ? null : Number(r.implied_volatility),
      volume: r.total_traded_volume === null ? null : Number(r.total_traded_volume),
      oi: r.open_interest === null ? null : Number(r.open_interest),
      chgOi: r.change_in_oi === null ? null : Number(r.change_in_oi),
      bidQty: r.bid_qty === null ? null : Number(r.bid_qty),
      bidPrice: r.bid_price === null ? null : Number(r.bid_price),
      askQty: r.ask_qty === null ? null : Number(r.ask_qty),
      askPrice: r.ask_price === null ? null : Number(r.ask_price),
      delta: r.delta === null ? null : Number(r.delta),
      gamma: r.gamma === null ? null : Number(r.gamma),
      theta: r.theta === null ? null : Number(r.theta),
      vega: r.vega === null ? null : Number(r.vega),
      instrumentIdentifier: r.instrument_identifier === null ? null : String(r.instrument_identifier),
    }));
  }

  private async getLatestSnapshotRow(symbol: string, expiryDate?: string | null): Promise<SnapshotRow | null> {
    const res = await this.pool.query(
      `
      select
        id,
        captured_at,
        symbol,
        expiry_date,
        underlying_value,
        atm_strike,
        strikes_around,
        fetch_ms
      from option_chain_snapshots
      where symbol = $1
        and ($2::date is null or expiry_date = $2::date)
      order by captured_at desc
      limit 1
      `,
      [symbol, expiryDate ?? null],
    );

    const row = res.rows?.[0];
    return row ? this.mapSnapshotRow(row) : null;
  }

  async listExpiries(symbol: string, limit = 12): Promise<string[]> {
    const res = await this.pool.query(
      `
      select distinct expiry_date
      from option_chain_snapshots
      where symbol = $1
      order by expiry_date asc
      limit $2
      `,
      [symbol, limit],
    );

    return res.rows.map(row => toIsoDate(row.expiry_date));
  }

  async insertSnapshot(snapshot: SelectedSnapshot, fetchMs: number | null): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const snapRes = await client.query(
        `
        insert into option_chain_snapshots
          (captured_at, symbol, expiry_date, underlying_value, atm_strike, strikes_around, source, fetch_ms, raw)
        values
          ($1, $2, $3, $4, $5, $6, 'nseindia', $7, $8)
        returning id
        `,
        [
          snapshot.capturedAt,
          snapshot.symbol,
          snapshot.expiryDate,
          snapshot.underlyingValue,
          snapshot.atmStrike,
          snapshot.strikesAround,
          fetchMs,
          snapshot.raw ? JSON.stringify(snapshot.raw) : null,
        ],
      );

      const snapshotId = snapRes.rows[0].id as number;

      for (const leg of snapshot.legs) {
        await client.query(
          `
          insert into option_chain_legs
            (snapshot_id, strike, option_type, last_price, change, implied_volatility, total_traded_volume,
             open_interest, change_in_oi, bid_qty, bid_price, ask_qty, ask_price,
             delta, gamma, theta, vega,
             instrument_identifier)
          values
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          on conflict (snapshot_id, strike, option_type) do nothing
          `,
          [
            snapshotId,
            leg.strike,
            leg.optionType,
            leg.lastPrice,
            leg.change,
            leg.iv,
            leg.volume,
            leg.oi,
            leg.chgOi,
            leg.bidQty,
            leg.bidPrice,
            leg.askQty,
            leg.askPrice,
            leg.delta,
            leg.gamma,
            leg.theta,
            leg.vega,
            leg.instrumentIdentifier,
          ],
        );
      }

      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }

  async getLastCleanupAt(): Promise<Date | null> {
    const res = await this.pool.query(`select last_cleanup_at from option_chain_housekeeping where id=true`);
    const v = res.rows?.[0]?.last_cleanup_at;
    return v ? new Date(v) : null;
  }

  async cleanupBefore(cutoff: Date): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query(
        `
        delete from option_chain_snapshots
        where captured_at < $1
        `,
        [cutoff],
      );
      await client.query(`update option_chain_housekeeping set last_cleanup_at = now() where id = true;`);
      await client.query('commit');
      return Number(result.rowCount ?? 0);
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }

  async getLatestSnapshotWithLegs(symbol: string, expiryDate?: string | null): Promise<
    | {
        snapshot: {
          id: number;
          capturedAt: string;
          symbol: string;
          expiryDate: string;
          underlyingValue: number | null;
          atmStrike: number | null;
          strikesAround: number;
          fetchMs: number | null;
        };
        legs: Array<{
          strike: number;
          optionType: 'CE' | 'PE';
          lastPrice: number | null;
          change: number | null;
          iv: number | null;
          volume: number | null;
          oi: number | null;
          chgOi: number | null;
          bidQty: number | null;
          bidPrice: number | null;
          askQty: number | null;
          askPrice: number | null;
          delta: number | null;
          gamma: number | null;
          theta: number | null;
          vega: number | null;
          instrumentIdentifier: string | null;
        }>;
      }
    | null
  > {
    const snapshot = await this.getLatestSnapshotRow(symbol, expiryDate);
    if (!snapshot) return null;

    const legsRes = await this.pool.query(
      `
      select
        strike,
        option_type,
        last_price,
        change,
        implied_volatility,
        total_traded_volume,
        open_interest,
        change_in_oi,
        bid_qty,
        bid_price,
        ask_qty,
        ask_price,
        delta,
        gamma,
        theta,
        vega,
        instrument_identifier
      from option_chain_legs
      where snapshot_id = $1
      order by strike asc, option_type asc
      `,
      [snapshot.id],
    );

    return {
      snapshot,
      legs: this.mapLegRows(legsRes.rows),
    };
  }

  async getSnapshotWithLegsNearTime(
    symbol: string,
    targetTime: Date,
    windowMinutes: number,
    expiryDate?: string | null,
  ): Promise<
    | {
        snapshot: {
          id: number;
          capturedAt: string;
          symbol: string;
          expiryDate: string;
          underlyingValue: number | null;
          atmStrike: number | null;
          strikesAround: number;
          fetchMs: number | null;
        };
        legs: Array<{
          strike: number;
          optionType: 'CE' | 'PE';
          lastPrice: number | null;
          change: number | null;
          iv: number | null;
          volume: number | null;
          oi: number | null;
          chgOi: number | null;
          bidQty: number | null;
          bidPrice: number | null;
          askQty: number | null;
          askPrice: number | null;
          delta: number | null;
          gamma: number | null;
          theta: number | null;
          vega: number | null;
          instrumentIdentifier: string | null;
        }>;
      }
    | null
  > {
    const snapRes = await this.pool.query(
      `
      select
        id,
        captured_at,
        symbol,
        expiry_date,
        underlying_value,
        atm_strike,
        strikes_around,
        fetch_ms
      from option_chain_snapshots
      where symbol = $1
        and ($4::date is null or expiry_date = $4::date)
        and captured_at between ($2::timestamptz - make_interval(mins => $3::int)) and ($2::timestamptz + make_interval(mins => $3::int))
      order by abs(extract(epoch from (captured_at - $2::timestamptz))) asc
      limit 1
      `,
      [symbol, targetTime, windowMinutes, expiryDate ?? null],
    );

    const s = snapRes.rows?.[0];
    if (!s) return null;

    const legsRes = await this.pool.query(
      `
      select
        strike,
        option_type,
        last_price,
        change,
        implied_volatility,
        total_traded_volume,
        open_interest,
        change_in_oi,
        bid_qty,
        bid_price,
        ask_qty,
        ask_price,
        delta,
        gamma,
        theta,
        vega,
        instrument_identifier
      from option_chain_legs
      where snapshot_id = $1
      order by strike asc, option_type asc
      `,
      [s.id],
    );

    return { snapshot: this.mapSnapshotRow(s), legs: this.mapLegRows(legsRes.rows) };
  }

  async getAtmSeries(symbol: string, minutes: number, limit: number): Promise<
    Array<{
      capturedAt: string;
      underlyingValue: number | null;
      atmStrike: number | null;
      ceLtp: number | null;
      peLtp: number | null;
      ceIv: number | null;
      peIv: number | null;
      ceDelta: number | null;
      peDelta: number | null;
    }>
  > {
    const res = await this.pool.query(
      `
      with snaps as (
        select id, captured_at, underlying_value, atm_strike
        from option_chain_snapshots
        where symbol = $1
          and captured_at >= now() - make_interval(mins => $2)
        order by captured_at asc
        limit $3
      )
      select
        s.captured_at,
        s.underlying_value,
        s.atm_strike,
        ce.last_price as ce_ltp,
        pe.last_price as pe_ltp,
        ce.implied_volatility as ce_iv,
        pe.implied_volatility as pe_iv,
        ce.delta as ce_delta,
        pe.delta as pe_delta
      from snaps s
      left join option_chain_legs ce
        on ce.snapshot_id = s.id and ce.option_type = 'CE' and ce.strike = s.atm_strike
      left join option_chain_legs pe
        on pe.snapshot_id = s.id and pe.option_type = 'PE' and pe.strike = s.atm_strike
      order by s.captured_at asc
      `,
      [symbol, minutes, limit],
    );

    return res.rows.map(r => ({
      capturedAt: new Date(r.captured_at).toISOString(),
      underlyingValue: r.underlying_value === null ? null : Number(r.underlying_value),
      atmStrike: r.atm_strike === null ? null : Number(r.atm_strike),
      ceLtp: r.ce_ltp === null ? null : Number(r.ce_ltp),
      peLtp: r.pe_ltp === null ? null : Number(r.pe_ltp),
      ceIv: r.ce_iv === null ? null : Number(r.ce_iv),
      peIv: r.pe_iv === null ? null : Number(r.pe_iv),
      ceDelta: r.ce_delta === null ? null : Number(r.ce_delta),
      peDelta: r.pe_delta === null ? null : Number(r.pe_delta),
    }));
  }

  async getOptionAnalytics(
    symbol: string,
    opts: {
      expiryDate?: string | null;
      minutes: number;
      strikesAround: number;
    },
  ): Promise<OptionChainAnalyticsResult | null> {
    const snapshot = await this.getLatestSnapshotRow(symbol, opts.expiryDate);
    if (!snapshot) return null;

    const legsRes = await this.pool.query(
      `
      select
        strike,
        option_type,
        last_price,
        change,
        implied_volatility,
        total_traded_volume,
        open_interest,
        change_in_oi,
        bid_qty,
        bid_price,
        ask_qty,
        ask_price,
        delta,
        gamma,
        theta,
        vega,
        instrument_identifier
      from option_chain_legs
      where snapshot_id = $1
      order by strike asc, option_type asc
      `,
      [snapshot.id],
    );
    const legs = this.mapLegRows(legsRes.rows);
    const availableExpiries = await this.listExpiries(symbol);

    const allStrikes = Array.from(new Set(legs.map(leg => leg.strike))).sort((left, right) => left - right);
    const nearest = nearestListedStrike(allStrikes, snapshot.underlyingValue);
    const baseAtmStrike = nearest.strike ?? snapshot.atmStrike;
    const baseIndex = baseAtmStrike == null ? -1 : allStrikes.indexOf(baseAtmStrike);
    const strikeWindow =
      baseIndex >= 0
        ? allStrikes.slice(Math.max(0, baseIndex - opts.strikesAround), Math.min(allStrikes.length, baseIndex + opts.strikesAround + 1))
        : allStrikes.slice(0, Math.min(allStrikes.length, opts.strikesAround * 2 + 1));

    const latestSnapshotIst = DateTime.fromISO(snapshot.capturedAt).setZone('Asia/Kolkata');
    const tradeDate = latestSnapshotIst.toISODate()!;

    const dayRowsRes = await this.pool.query(
      `
      with day_snaps as (
        select id, captured_at, underlying_value, atm_strike
        from option_chain_snapshots
        where symbol = $1
          and expiry_date = $2::date
          and (captured_at at time zone 'Asia/Kolkata')::date = $3::date
        order by captured_at asc
      )
      select
        s.captured_at,
        s.underlying_value,
        s.atm_strike,
        l.strike,
        l.option_type,
        l.last_price,
        l.implied_volatility,
        l.open_interest,
        l.change_in_oi
      from day_snaps s
      left join option_chain_legs l
        on l.snapshot_id = s.id
       and l.strike = any($4::numeric[])
      order by s.captured_at asc, l.strike asc, l.option_type asc
      `,
      [symbol, snapshot.expiryDate, tradeDate, strikeWindow],
    );

    const atmComboRes = await this.pool.query(
      `
      with day_snaps as (
        select id, captured_at, underlying_value, atm_strike
        from option_chain_snapshots
        where symbol = $1
          and expiry_date = $2::date
          and (captured_at at time zone 'Asia/Kolkata')::date = $3::date
        order by captured_at asc
      )
      select
        s.captured_at,
        s.underlying_value,
        s.atm_strike,
        ce.last_price as ce_ltp,
        pe.last_price as pe_ltp
      from day_snaps s
      left join option_chain_legs ce
        on ce.snapshot_id = s.id and ce.option_type = 'CE' and ce.strike = s.atm_strike
      left join option_chain_legs pe
        on pe.snapshot_id = s.id and pe.option_type = 'PE' and pe.strike = s.atm_strike
      order by s.captured_at asc
      `,
      [symbol, snapshot.expiryDate, tradeDate],
    );

    const rowMap = new Map<string, Map<number, { CE: FlatSeriesRow | null; PE: FlatSeriesRow | null }>>();
    const statsMap = new Map<string, NormalizationStats>();

    for (const row of dayRowsRes.rows) {
      const capturedAt = new Date(row.captured_at).toISOString();
      const strike = row.strike === null ? null : Number(row.strike);
      const optionType = row.option_type ? (String(row.option_type).trim() as 'CE' | 'PE') : null;
      const lastPrice = row.last_price === null ? null : Number(row.last_price);

      if (strike != null && optionType) {
        const key = `${strike}:${optionType}`;
        if (lastPrice != null) {
          const existing = statsMap.get(key);
          if (!existing) {
            statsMap.set(key, { min: lastPrice, max: lastPrice });
          } else {
            if (lastPrice < existing.min) existing.min = lastPrice;
            if (lastPrice > existing.max) existing.max = lastPrice;
          }
        }

        let strikeMap = rowMap.get(capturedAt);
        if (!strikeMap) {
          strikeMap = new Map();
          rowMap.set(capturedAt, strikeMap);
        }
        const existing = strikeMap.get(strike) ?? { CE: null, PE: null };
        const flatRow: FlatSeriesRow = {
          capturedAt,
          underlyingValue: row.underlying_value === null ? null : Number(row.underlying_value),
          atmStrike: row.atm_strike === null ? null : Number(row.atm_strike),
          strike,
          optionType,
          lastPrice,
          iv: row.implied_volatility === null ? null : Number(row.implied_volatility),
          oi: row.open_interest === null ? null : Number(row.open_interest),
          chgOi: row.change_in_oi === null ? null : Number(row.change_in_oi),
        };
        existing[optionType] = flatRow;
        strikeMap.set(strike, existing);
      } else if (!rowMap.has(capturedAt)) {
        rowMap.set(capturedAt, new Map());
      }
    }

    const fullEquilibriumPoints: OptionChainAnalyticsEquilibriumPoint[] = [];
    const totalSlots = rowMap.size * strikeWindow.length;
    let observedCeSlots = 0;
    let observedPeSlots = 0;
    let normalizationFallbackCount = 0;
    let previousSpread: number | null = null;
    const epsilon = 2;

    for (const [capturedAt, strikeMap] of rowMap.entries()) {
      const ceValues: Array<number | null> = [];
      const peValues: Array<number | null> = [];
      let pointUnderlying: number | null = null;
      let pointAtmStrike: number | null = null;

      for (const strike of strikeWindow) {
        const pair = strikeMap.get(strike);
        const ce = pair?.CE ?? null;
        const pe = pair?.PE ?? null;
        if (pointUnderlying == null) pointUnderlying = ce?.underlyingValue ?? pe?.underlyingValue ?? null;
        if (pointAtmStrike == null) pointAtmStrike = ce?.atmStrike ?? pe?.atmStrike ?? null;

        const ceNorm = normalizeSeriesValue(ce?.lastPrice ?? null, statsMap.get(`${strike}:CE`) ?? null);
        const peNorm = normalizeSeriesValue(pe?.lastPrice ?? null, statsMap.get(`${strike}:PE`) ?? null);
        if (ceNorm.usedFallback) normalizationFallbackCount += 1;
        if (peNorm.usedFallback) normalizationFallbackCount += 1;
        if (ce?.lastPrice != null) observedCeSlots += 1;
        if (pe?.lastPrice != null) observedPeSlots += 1;
        ceValues.push(ceNorm.value);
        peValues.push(peNorm.value);
      }

      const ceAggregateNorm = roundTo(average(ceValues), 2);
      const peAggregateNorm = roundTo(average(peValues), 2);
      const spread =
        ceAggregateNorm != null && peAggregateNorm != null ? roundTo(ceAggregateNorm - peAggregateNorm, 2) : null;
      const equilibriumFlag = spread != null ? Math.abs(spread) <= epsilon : false;
      const crossoverFlag =
        spread != null &&
        previousSpread != null &&
        ((spread === 0 || previousSpread === 0) || (spread > 0 && previousSpread < 0) || (spread < 0 && previousSpread > 0));

      fullEquilibriumPoints.push({
        capturedAt,
        underlyingValue: pointUnderlying,
        atmStrike: pointAtmStrike,
        ceAggregateNorm,
        peAggregateNorm,
        equilibriumSpread: spread,
        equilibriumFlag,
        crossoverFlag,
        ceCount: ceValues.filter(value => value != null).length,
        peCount: peValues.filter(value => value != null).length,
      });

      if (spread != null) previousSpread = spread;
    }

    const latestTimeMs = Date.parse(snapshot.capturedAt);
    const cutoffMs = latestTimeMs - opts.minutes * 60_000;
    const equilibriumPoints = fullEquilibriumPoints.filter(point => Date.parse(point.capturedAt) >= cutoffMs);
    const currentEquilibriumPoint = fullEquilibriumPoints[fullEquilibriumPoints.length - 1] ?? null;
    const lastCrossoverAt =
      [...fullEquilibriumPoints]
        .reverse()
        .find(point => point.crossoverFlag || point.equilibriumFlag)?.capturedAt ?? null;

    const latestStrikeMap = rowMap.get(snapshot.capturedAt) ?? new Map<number, { CE: FlatSeriesRow | null; PE: FlatSeriesRow | null }>();
    const latestStrikes = strikeWindow.map<OptionChainAnalyticsStrikeSnapshot>(strike => {
      const pair = latestStrikeMap.get(strike);
      const ceNorm = normalizeSeriesValue(pair?.CE?.lastPrice ?? null, statsMap.get(`${strike}:CE`) ?? null);
      const peNorm = normalizeSeriesValue(pair?.PE?.lastPrice ?? null, statsMap.get(`${strike}:PE`) ?? null);
      return {
        strike,
        ceClose: pair?.CE?.lastPrice ?? null,
        peClose: pair?.PE?.lastPrice ?? null,
        ceNorm: roundTo(ceNorm.value, 2),
        peNorm: roundTo(peNorm.value, 2),
      };
    });

    const rawAtmComboPoints = atmComboRes.rows.map(row => {
      const ceLtp = row.ce_ltp === null ? null : Number(row.ce_ltp);
      const peLtp = row.pe_ltp === null ? null : Number(row.pe_ltp);
      return {
        capturedAt: new Date(row.captured_at).toISOString(),
        underlyingValue: row.underlying_value === null ? null : Number(row.underlying_value),
        atmStrike: row.atm_strike === null ? null : Number(row.atm_strike),
        ceLtp,
        peLtp,
        atmCombo: ceLtp != null && peLtp != null ? ceLtp + peLtp : null,
      };
    });

    const openCombo = rawAtmComboPoints.find(point => point.atmCombo != null)?.atmCombo ?? null;
    let previousAtmStrike: number | null = null;
    const fullAtmComboPoints: OptionChainAnalyticsAtmComboPoint[] = rawAtmComboPoints.map(point => {
      const comboDelta = point.atmCombo != null && openCombo != null ? roundTo(point.atmCombo - openCombo, 2) : null;
      const comboDeltaPct =
        point.atmCombo != null && openCombo != null && openCombo !== 0
          ? roundTo(((point.atmCombo - openCombo) / openCombo) * 100, 2)
          : null;
      const atmStrikeChanged = previousAtmStrike != null && point.atmStrike != null && previousAtmStrike !== point.atmStrike;
      previousAtmStrike = point.atmStrike ?? previousAtmStrike;
      return {
        ...point,
        sessionOpenCombo: openCombo,
        comboDelta,
        comboDeltaPct,
        comboDirection: comboDelta == null ? 'na' : comboDelta > 0 ? 'up' : comboDelta < 0 ? 'down' : 'flat',
        atmStrikeChanged,
      };
    });

    const atmComboPoints = fullAtmComboPoints.filter(point => Date.parse(point.capturedAt) >= cutoffMs);
    const currentComboPoint = fullAtmComboPoints[fullAtmComboPoints.length - 1] ?? null;

    const selectedExpiryMoment = DateTime.fromISO(snapshot.expiryDate, { zone: 'Asia/Kolkata' }).set({
      hour: 15,
      minute: 30,
      second: 0,
      millisecond: 0,
    });
    const snapshotMoment = DateTime.fromISO(snapshot.capturedAt).setZone('Asia/Kolkata');
    const dteHoursRaw = selectedExpiryMoment.diff(snapshotMoment, 'hours').hours;
    const dteHours = Number.isFinite(dteHoursRaw) ? Math.max(0, dteHoursRaw) : null;
    const dteDays = dteHours == null ? null : roundTo(dteHours / 24, 2);

    const previousExpiry = [...availableExpiries]
      .filter(expiry => expiry < snapshot.expiryDate)
      .sort()
      .pop() ?? null;
    let expiryProgressPct: number | null = null;
    if (previousExpiry) {
      const previousMoment = DateTime.fromISO(previousExpiry, { zone: 'Asia/Kolkata' }).set({
        hour: 15,
        minute: 30,
        second: 0,
        millisecond: 0,
      });
      const totalMs = selectedExpiryMoment.toMillis() - previousMoment.toMillis();
      if (totalMs > 0) {
        expiryProgressPct = roundTo(
          Math.max(0, Math.min(1, (snapshotMoment.toMillis() - previousMoment.toMillis()) / totalMs)) * 100,
          1,
        );
      }
    }

    const currentSpread = currentEquilibriumPoint?.equilibriumSpread ?? null;
    const currentDominance =
      currentSpread == null
        ? 'Unavailable'
        : Math.abs(currentSpread) <= epsilon
          ? 'Near equilibrium'
          : currentSpread > 0
            ? 'CE dominant'
            : 'PE dominant';

    return {
      snapshot,
      legs,
      availableExpiries,
      tradeDate,
      strikeWindow: {
        baseAtmStrike,
        strikes: strikeWindow,
        strikesAround: opts.strikesAround,
        tieBreakRule: 'lower_on_tie',
        tieBreakUsed: nearest.tieBreakUsed,
      },
      expiryContext: {
        selectedExpiry: snapshot.expiryDate,
        nextExpiry: snapshot.expiryDate,
        dteDays,
        dteHours: dteHours == null ? null : roundTo(dteHours, 2),
        expiryProgressPct,
        currentAtmStrike: baseAtmStrike,
        currentSpot: snapshot.underlyingValue,
        spotToAtmDistance:
          snapshot.underlyingValue != null && baseAtmStrike != null ? roundTo(snapshot.underlyingValue - baseAtmStrike, 2) : null,
        currentEquilibriumSpread: currentSpread,
        currentSideDominance: currentDominance,
        lastCrossoverAt,
      },
      equilibrium: {
        epsilon,
        points: equilibriumPoints,
        latestStrikes,
        ceAggregateCurrent: currentEquilibriumPoint?.ceAggregateNorm ?? null,
        peAggregateCurrent: currentEquilibriumPoint?.peAggregateNorm ?? null,
        currentSpread,
        currentDominance,
        lastCrossoverAt,
      },
      atmCombo: {
        openCombo,
        currentCombo: currentComboPoint?.atmCombo ?? null,
        currentDelta: currentComboPoint?.comboDelta ?? null,
        currentDeltaPct: currentComboPoint?.comboDeltaPct ?? null,
        points: atmComboPoints,
      },
      diagnostics: {
        freshnessMinutes: minutesSince(snapshot.capturedAt),
        strikeCount: allStrikes.length,
        strikeWindowSize: strikeWindow.length,
        missingCeSeriesCount: Math.max(0, totalSlots - observedCeSlots),
        missingPeSeriesCount: Math.max(0, totalSlots - observedPeSlots),
        timestampDriftSeconds: 0,
        normalizationFallbackCount,
        crossoverCount: fullEquilibriumPoints.filter(point => point.crossoverFlag || point.equilibriumFlag).length,
        cacheMode: 'live_db',
        queryMode: 'batched_intraday_snapshot',
        latestSnapshotAt: snapshot.capturedAt,
        latestPollOkAt: snapshot.capturedAt,
      },
    };
  }
}
