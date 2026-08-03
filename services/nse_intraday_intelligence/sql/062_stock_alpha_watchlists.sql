
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'nse_ops'
      and table_name = 'watchlist'
  ) then
    insert into nse_ops.watchlist (slug, title, description, watchlist_kind, rule_key, selection_limit, is_active, ui_rank)
    values
      ('residual-leaders', 'Residual Leaders', 'Names outperforming the index even after beta adjustment', 'system', 'residual_leaders', 20, true, 50),
      ('vwap-control-breakouts', 'VWAP Control Breakouts', 'Breakouts supported by VWAP hold quality and persistent relative strength', 'system', 'vwap_control', 20, true, 60),
      ('headline-spikes', 'Headline Spikes', 'Fast movers whose move quality looks weak after persistence and VWAP checks', 'system', 'headline_spikes', 20, true, 70),
      ('catch-up-candidates', 'Catch-up Candidates', 'Names improving in relative strength that may catch up if participation stays healthy', 'system', 'catch_up', 20, true, 80),
      ('index-beta-followers', 'Index Beta Followers', 'Names moving mostly with index beta rather than independent residual strength', 'system', 'index_beta_followers', 20, true, 90)
    on conflict (slug) do update
    set title = excluded.title,
        description = excluded.description,
        watchlist_kind = excluded.watchlist_kind,
        rule_key = excluded.rule_key,
        selection_limit = excluded.selection_limit,
        is_active = excluded.is_active,
        ui_rank = excluded.ui_rank,
        updated_at = now();
  end if;
end $$;
