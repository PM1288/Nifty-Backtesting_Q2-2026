create schema if not exists integration;

create or replace view integration.v_source_security_1m as
with membership as (
  select distinct
    c.symbol,
    c.symbol_token
  from public.index_constituents c
  where c.index_name = 'NIFTY100'
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
  join membership m
    on m.symbol_token = b.symbol_token
  where b.exchange = 'NSE'
    and extract(isodow from (b.ts at time zone 'Asia/Kolkata')) between 1 and 5
    and (b.ts at time zone 'Asia/Kolkata')::time between time '09:15' and time '15:30'
)
select *
from filtered;

create or replace view integration.v_source_index_1m as
with index_map(symbol_token, index_code, index_name) as (
  values
    ('99926000'::text, 'NIFTY 50'::text, 'NIFTY 50'::text),
    ('99926009'::text, 'BANK NIFTY'::text, 'BANK NIFTY'::text),
    ('99926017'::text, 'INDIA VIX'::text, 'INDIA VIX'::text)
)
select
  b.ts as minute_ts,
  (b.ts at time zone 'Asia/Kolkata')::date as trade_date,
  m.index_code,
  m.index_name,
  b.open::numeric(18,6) as open_px,
  b.high::numeric(18,6) as high_px,
  b.low::numeric(18,6) as low_px,
  b.close::numeric(18,6) as close_px,
  b.volume::bigint as volume,
  null::numeric(20,2) as turnover,
  null::numeric(18,6) as vwap,
  null::integer as trades,
  concat(m.index_code, ':', b.ts::text) as source_pk,
  coalesce(b.source, 'collector')::text as source_system
from public.bars_1m b
join index_map m
  on m.symbol_token = b.symbol_token
where b.exchange = 'NSE'
  and extract(isodow from (b.ts at time zone 'Asia/Kolkata')) between 1 and 5
  and (b.ts at time zone 'Asia/Kolkata')::time between time '09:15' and time '15:30';

create or replace view integration.v_prev_security_daily as
with session_symbols as (
  select distinct
    s.trade_date,
    s.symbol
  from integration.v_source_security_1m s
),
token_map as (
  select distinct
    c.symbol,
    c.symbol_token,
    c.sector as sector_name,
    c.weight::numeric(18,8) as universe_weight
  from public.index_constituents c
  where c.index_name = 'NIFTY100'
)
select
  ss.trade_date,
  ss.symbol,
  prev.prev_close,
  stats.avg_daily_volume_20d,
  tm.sector_name,
  tm.universe_weight,
  null::numeric(18,2) as market_cap
from session_symbols ss
join token_map tm
  on tm.symbol = ss.symbol
left join lateral (
  select d.close_price::numeric(18,6) as prev_close
  from nse.fact_eod_prices d
  where d.symbol = ss.symbol
    and d.series = 'EQ'
    and d.trade_date < ss.trade_date
  order by d.trade_date desc
  limit 1
) prev on true
left join lateral (
  select round(avg(d.volume)::numeric, 0)::bigint as avg_daily_volume_20d
  from (
    select d.total_traded_qty as volume
    from nse.fact_eod_prices d
    where d.symbol = ss.symbol
      and d.series = 'EQ'
      and d.trade_date < ss.trade_date
    order by d.trade_date desc
    limit 20
  ) d
) stats on true;

create or replace view integration.v_prev_index_daily as
with session_dates as (
  select distinct
    s.trade_date,
    s.index_code
  from integration.v_source_index_1m s
),
index_map(index_code, symbol_token) as (
  values
    ('NIFTY 50'::text, '99926000'::text),
    ('BANK NIFTY'::text, '99926009'::text),
    ('INDIA VIX'::text, '99926017'::text)
),
daily_index_close as (
  select
    (b.ts at time zone 'Asia/Kolkata')::date as trade_date,
    b.symbol_token,
    (
      array_agg(b.close order by b.ts desc)
    )[1]::numeric(18,6) as close_px
  from public.bars_1m b
  where b.exchange = 'NSE'
    and b.symbol_token in ('99926000', '99926009', '99926017')
    and extract(isodow from (b.ts at time zone 'Asia/Kolkata')) between 1 and 5
    and (b.ts at time zone 'Asia/Kolkata')::time between time '09:15' and time '15:30'
  group by 1, 2
)
select
  sd.trade_date,
  sd.index_code,
  prev.prev_close
from session_dates sd
join index_map im
  on im.index_code = sd.index_code
left join lateral (
  select d.close_px as prev_close
  from daily_index_close d
  where d.symbol_token = im.symbol_token
    and d.trade_date < sd.trade_date
  order by d.trade_date desc
  limit 1
) prev on true;

create or replace view integration.v_universe_membership as
select
  'NIFTY100'::text as universe_name,
  c.symbol,
  c.weight::numeric(18,8) as weight,
  c.sector::text as sector_name,
  coalesce(c.as_of_date, current_date)::date as effective_from,
  null::date as effective_to,
  'collector_index_constituents'::text as source_system
from public.index_constituents c
where c.index_name = 'NIFTY100';

create or replace view integration.v_index_daily_history as
with market_activity as (
  select
    trade_date,
    case
      when upper(index_name) in ('NIFTY 50', 'NIFTY50') then 'NIFTY 50'
      when upper(index_name) in ('NIFTY BANK', 'BANK NIFTY') then 'BANK NIFTY'
      when upper(index_name) = 'INDIA VIX' then 'INDIA VIX'
      else null
    end as index_code,
    close_price::numeric(18,6) as close_px
  from nse.fact_market_activity_index
  where upper(index_name) in ('NIFTY 50', 'NIFTY50', 'NIFTY BANK', 'BANK NIFTY', 'INDIA VIX')
),
minute_fallback as (
  with index_map(index_code, symbol_token) as (
    values
      ('NIFTY 50'::text, '99926000'::text),
      ('BANK NIFTY'::text, '99926009'::text),
      ('INDIA VIX'::text, '99926017'::text)
  )
  select
    (d.ts at time zone 'Asia/Kolkata')::date as trade_date,
    im.index_code,
    (
      array_agg(d.close order by d.ts desc)
    )[1]::numeric(18,6) as close_px
  from public.bars_1m d
  join index_map im
    on im.symbol_token = d.symbol_token
  where d.exchange = 'NSE'
    and extract(isodow from (d.ts at time zone 'Asia/Kolkata')) between 1 and 5
    and (d.ts at time zone 'Asia/Kolkata')::time between time '09:15' and time '15:30'
  group by 1, 2
)
select
  ma.trade_date,
  ma.index_code,
  ma.close_px
from market_activity ma
where ma.index_code is not null
union all
select
  mf.trade_date,
  mf.index_code,
  mf.close_px
from minute_fallback mf
where not exists (
  select 1
  from market_activity ma
  where ma.index_code = mf.index_code
    and ma.trade_date = mf.trade_date
);
