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
      ('intraday-strength', 'Intraday Strength', 'Nifty 100 names showing strong continuation characteristics', 'system', 'intraday_strength', 20, true, 10),
      ('intraday-weakness', 'Intraday Weakness', 'Nifty 100 names showing persistent intraday weakness', 'system', 'intraday_weakness', 20, true, 20),
      ('vwap-reclaim', 'VWAP Reclaim', 'Names showing recovery toward or through VWAP after early weakness', 'system', 'vwap_reclaim', 20, true, 30),
      ('late-reversal', 'Late Reversal', 'Names with meaningful reversal probability into the final phase of the session', 'system', 'late_reversal', 20, true, 40)
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
