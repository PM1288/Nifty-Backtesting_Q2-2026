create schema if not exists integration;

-- Canonical cash universe for stock analytics: NIFTY LargeMidcap 250 union
-- current NSE F&O. The active cash subscription supplies the collector token,
-- avoiding stale or duplicate instrument-master rows.
create or replace view integration.v_source_security_1m as
with membership as (
  select distinct
    upper(p.symbol) as symbol,
    s.symbol_token
  from public.instrument_profiles p
  join public.subscriptions s
    on upper(s.underlying) = upper(p.symbol)
   and s.exchange = 'NSE'
   and s.kind = 'EQUITY'
   and s.active
  where p.is_nifty_largemidcap_250 or p.is_nse_fno
),
filtered as (
  select
    b.ts as minute_ts,
    (b.ts at time zone 'Asia/Kolkata')::date as trade_date,
    m.symbol,
    b.open::numeric(18,6) as open_px,
    b.high::numeric(18,6) as high_px,
    b.low::numeric(18,6) as low_px,
    b.close::numeric(18,6) as close_px,
    b.volume::bigint as volume,
    null::numeric(20,2) as turnover,
    null::numeric(18,6) as vwap,
    null::integer as trades,
    concat(m.symbol, ':', b.ts::text) as source_pk,
    coalesce(b.source, 'collector')::text as source_system
  from public.bars_1m b
  join membership m on m.symbol_token = b.symbol_token
  where b.exchange = 'NSE'
    and extract(isodow from (b.ts at time zone 'Asia/Kolkata')) between 1 and 5
    and (b.ts at time zone 'Asia/Kolkata')::time between time '09:15' and time '15:30'
)
select * from filtered;

create or replace view integration.v_prev_security_daily as
with session_symbols as (
  select distinct s.trade_date, s.symbol
  from integration.v_source_security_1m s
),
profile_map as (
  select
    upper(p.symbol) as symbol,
    coalesce(nullif(trim(p.sector), ''), 'OTHER')::text as sector_name,
    coalesce(n100.weight::numeric(18,8), 1.0::numeric(18,8)) as universe_weight
  from public.instrument_profiles p
  left join lateral (
    select c.weight
    from public.index_constituents c
    where c.index_name = 'NIFTY100' and upper(c.symbol) = upper(p.symbol)
    order by c.updated_at desc
    limit 1
  ) n100 on true
  where p.is_nifty_largemidcap_250 or p.is_nse_fno
)
select
  ss.trade_date,
  ss.symbol,
  prev.prev_close,
  stats.avg_daily_volume_20d,
  pm.sector_name,
  pm.universe_weight,
  null::numeric(18,2) as market_cap
from session_symbols ss
join profile_map pm on pm.symbol = ss.symbol
left join lateral (
  select d.close_price::numeric(18,6) as prev_close
  from nse.fact_eod_prices d
  -- NSE symbols are canonical uppercase. Keep the indexed column bare so the
  -- (symbol, trade_date desc) index can serve this latest-session lookup.
  where d.symbol = ss.symbol and d.series = 'EQ' and d.trade_date < ss.trade_date
  order by d.trade_date desc
  limit 1
) prev on true
left join lateral (
  select round(avg(d.volume)::numeric, 0)::bigint as avg_daily_volume_20d
  from (
    select d.total_traded_qty as volume
    from nse.fact_eod_prices d
    where d.symbol = ss.symbol and d.series = 'EQ' and d.trade_date < ss.trade_date
    order by d.trade_date desc
    limit 20
  ) d
) stats on true;

create or replace view integration.v_universe_membership as
select
  'NIFTY250_FNO'::text as universe_name,
  upper(p.symbol) as symbol,
  coalesce(n100.weight::numeric(18,8), 1.0::numeric(18,8)) as weight,
  coalesce(nullif(trim(p.sector), ''), 'OTHER')::text as sector_name,
  coalesce(p.source_as_of, current_date)::date as effective_from,
  null::date as effective_to,
  coalesce(nullif(p.source_name, ''), 'instrument_profiles')::text as source_system,
  coalesce(p.source_as_of, current_date)::date as trade_date,
  true as is_active
from public.instrument_profiles p
left join lateral (
  select c.weight
  from public.index_constituents c
  where c.index_name = 'NIFTY100' and upper(c.symbol) = upper(p.symbol)
  order by c.updated_at desc
  limit 1
) n100 on true
where p.is_nifty_largemidcap_250 or p.is_nse_fno;
