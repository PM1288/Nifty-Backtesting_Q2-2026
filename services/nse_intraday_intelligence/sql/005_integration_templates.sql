create schema if not exists integration;

do $$
begin
  if to_regclass('integration.v_source_security_1m') is null then
    execute $view$
      create view integration.v_source_security_1m as
      select
        null::timestamptz as minute_ts,
        null::date as trade_date,
        null::text as symbol,
        null::numeric(18,6) as open_px,
        null::numeric(18,6) as high_px,
        null::numeric(18,6) as low_px,
        null::numeric(18,6) as close_px,
        null::bigint as volume,
        null::numeric(20,2) as turnover,
        null::numeric(18,6) as vwap,
        null::integer as trades,
        null::text as source_pk,
        null::text as source_system
      where false
    $view$;
  end if;
end $$;

do $$
begin
  if to_regclass('integration.v_source_index_1m') is null then
    execute $view$
      create view integration.v_source_index_1m as
      select
        null::timestamptz as minute_ts,
        null::date as trade_date,
        null::text as index_code,
        null::text as index_name,
        null::numeric(18,6) as open_px,
        null::numeric(18,6) as high_px,
        null::numeric(18,6) as low_px,
        null::numeric(18,6) as close_px,
        null::bigint as volume,
        null::numeric(20,2) as turnover,
        null::numeric(18,6) as vwap,
        null::integer as trades,
        null::text as source_pk,
        null::text as source_system
      where false
    $view$;
  end if;
end $$;

do $$
begin
  if to_regclass('integration.v_prev_security_daily') is null then
    execute $view$
      create view integration.v_prev_security_daily as
      select
        null::date as trade_date,
        null::text as symbol,
        null::numeric(18,6) as prev_close,
        null::bigint as avg_daily_volume_20d,
        null::text as sector_name,
        null::numeric(18,8) as universe_weight,
        null::numeric(18,2) as market_cap
      where false
    $view$;
  end if;
end $$;

do $$
begin
  if to_regclass('integration.v_prev_index_daily') is null then
    execute $view$
      create view integration.v_prev_index_daily as
      select
        null::date as trade_date,
        null::text as index_code,
        null::numeric(18,6) as prev_close
      where false
    $view$;
  end if;
end $$;

do $$
begin
  if to_regclass('integration.v_universe_membership') is null then
    execute $view$
      create view integration.v_universe_membership as
      select
        'NIFTY100'::text as universe_name,
        null::text as symbol,
        null::numeric(18,8) as weight,
        null::text as sector_name,
        null::date as effective_from,
        null::date as effective_to,
        null::text as source_system
      where false
    $view$;
  end if;
end $$;

do $$
begin
  if to_regclass('integration.v_index_daily_history') is null then
    execute $view$
      create view integration.v_index_daily_history as
      select
        null::date as trade_date,
        null::text as index_code,
        null::numeric(18,6) as close_px
      where false
    $view$;
  end if;
end $$;
