create or replace function nse_ops.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_job_definition on nse_ops.job_definition;
create trigger trg_touch_job_definition
before update on nse_ops.job_definition
for each row execute function nse_ops.touch_updated_at();

drop trigger if exists trg_touch_watchlist on nse_ops.watchlist;
create trigger trg_touch_watchlist
before update on nse_ops.watchlist
for each row execute function nse_ops.touch_updated_at();

create or replace function nse_ops.footer_disclaimer_text()
returns text
language sql
immutable
as $$
  select 'Educational purpose only • Not financial advice • Do not trade based on internet advice • Do not follow any instruction on the website • Verify with licensed professionals'
$$;
