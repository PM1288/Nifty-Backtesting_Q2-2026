from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .config import get_settings
from .db import execute, fetch_all, fetch_one
from .utils import csv_bytes, dumps_json, flatten_summary_to_csv_rows, sha256_bytes, write_bytes

SECTION_META = {
    "regime-breadth": "Regime & Breadth",
    "momentum-breakouts": "Momentum & Breakouts",
    "mean-reversion": "Mean Reversion",
    "delivery-conviction": "Delivery & Conviction",
    "events-flows": "Events & Flows",
    "anomalies-risk": "Anomalies & Risk",
    "historical-learner": "Historical Learner",
}
ANALYSIS_TO_SECTION = {
    "momentum_breakout": "momentum-breakouts",
    "mean_reversion": "mean-reversion",
    "delivery_conviction": "delivery-conviction",
    "event_flow": "events-flows",
    "anomaly": "anomalies-risk",
}
DISCLAIMER = (
    "Educational purpose only • Not financial advice • Do not trade based on internet advice • "
    "Do not follow any instruction on the website • Verify with licensed professionals"
)


def latest_trade_date() -> date:
    row = fetch_one("select max(trade_date) as trade_date from nse_app.security_daily_features")
    if not row or not row.get("trade_date"):
        raise RuntimeError("No trade_date found in nse_app.security_daily_features")
    return row["trade_date"]


def _f(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except Exception:
        return None


def _dir(value: Any) -> str:
    num = _f(value)
    if num is None:
        return "neutral"
    return "up" if num > 0 else "down" if num < 0 else "neutral"


def _sig_dir(signal_direction: Any, fallback: Any = None) -> str:
    value = str(signal_direction or "").lower()
    if value in {"up", "bullish", "positive", "long"}:
        return "up"
    if value in {"down", "bearish", "negative", "short", "caution", "risk"}:
        return "down"
    return _dir(fallback)


def _accent(direction: str) -> str:
    return {"up": "green", "down": "red"}.get(direction, "white")


def _arrow(direction: str) -> str:
    return {"up": "▲", "down": "▼"}.get(direction, "•")


def _ser(row: dict[str, Any]) -> dict[str, Any]:
    return {k: (v.isoformat() if isinstance(v, (date, datetime)) else v) for k, v in row.items()}


def _delta_from_return(last_value: Any, return_ratio: Any) -> float | None:
    last_num = _f(last_value)
    ret = _f(return_ratio)
    if last_num is None or ret is None or abs(1 + ret) <= 1e-9:
        return None
    return last_num - (last_num / (1 + ret))


def _fetch_market(trade_date: date) -> dict[str, Any]:
    row = fetch_one("select * from nse_app.market_summary_daily where trade_date = %(trade_date)s", {"trade_date": trade_date})
    if not row:
        raise RuntimeError(f"No market summary found for {trade_date}")
    return row


def _fetch_signals(trade_date: date) -> list[dict[str, Any]]:
    return fetch_all(
        """
        select s.trade_date, s.symbol, s.series, s.analysis_type, s.signal_name, s.signal_direction, s.signal_strength,
               s.rationale, s.daily_return, s.volume_rel_20, s.delivery_rel_20, s.short_sell_qty, s.bulk_net_qty,
               s.block_net_qty, s.avg_applicable_margin_rate, s.fwd_return_5d, f.security_name, f.close_price,
               f.total_traded_qty, f.deliverable_pct, f.turnover_lacs, f.margin_financed_qty, f.has_announcement
        from nse_app.stock_analysis_signals_daily s
        left join nse_app.security_daily_features f
          on f.trade_date = s.trade_date and f.symbol = s.symbol and f.series = s.series
        where s.trade_date = %(trade_date)s
        order by s.signal_strength desc nulls last, s.symbol asc
        """,
        {"trade_date": trade_date},
    )


def _group_by_section(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped = {slug: [] for slug in SECTION_META if slug not in {"regime-breadth", "historical-learner"}}
    for row in rows:
        slug = ANALYSIS_TO_SECTION.get(str(row.get("analysis_type") or "").lower())
        if slug:
            grouped.setdefault(slug, []).append(row)
    return grouped


def _style_quote(row: dict[str, Any], key: str = "change_pct") -> dict[str, Any]:
    direction = _dir(row.get(key))
    return _ser({**row, "direction": direction, "accent_token": _accent(direction), "arrow": _arrow(direction)})


def _detail_from_signal(row: dict[str, Any]) -> dict[str, Any]:
    direction = _sig_dir(row.get("signal_direction"), row.get("daily_return"))
    return {
        "symbol": row["symbol"],
        "title": row.get("security_name") or row["symbol"],
        "subtitle": str(row.get("signal_name") or row.get("analysis_type") or "signal").replace("_", " ").title(),
        "direction": direction,
        "accent_token": _accent(direction),
        "score": row.get("signal_strength"),
        "confidence": row.get("volume_rel_20"),
        "primary_metric": row.get("daily_return"),
        "secondary_metric": row.get("delivery_rel_20"),
        "notes": row.get("rationale"),
        "payload": _ser(row),
    }


def _insert_section(trade_date: date, slug: str, direction: str, summary: dict[str, Any], highlights: list[str], narrative: str | None, rows: list[dict[str, Any]], historical: dict[str, Any] | None = None) -> None:
    execute(
        """
        insert into nse_ops.dashboard_section_daily (
          trade_date, section_slug, title, direction, accent_token, generated_at, summary_metrics_json,
          highlights_json, narrative, rows_json, historical_context_json, meta_json
        ) values (
          %(trade_date)s, %(slug)s, %(title)s, %(direction)s, %(accent)s, now(), %(summary)s::jsonb,
          %(highlights)s::jsonb, %(narrative)s, %(rows)s::jsonb, %(historical)s::jsonb, %(meta)s::jsonb
        )
        on conflict (trade_date, section_slug) do update set
          title = excluded.title, direction = excluded.direction, accent_token = excluded.accent_token,
          generated_at = excluded.generated_at, summary_metrics_json = excluded.summary_metrics_json,
          highlights_json = excluded.highlights_json, narrative = excluded.narrative, rows_json = excluded.rows_json,
          historical_context_json = excluded.historical_context_json, meta_json = excluded.meta_json
        """,
        {
            "trade_date": trade_date,
            "slug": slug,
            "title": SECTION_META[slug],
            "direction": direction,
            "accent": _accent(direction),
            "summary": json.dumps(summary, default=str),
            "highlights": json.dumps(highlights, default=str),
            "narrative": narrative,
            "rows": json.dumps(rows, default=str),
            "historical": json.dumps(historical or {}, default=str),
            "meta": json.dumps({"generated_by": "nse_orchestration_exports"}, default=str),
        },
    )


def refresh_dashboard_snapshots(trade_date: date | None = None) -> date:
    trade_date = trade_date or latest_trade_date()
    market = _fetch_market(trade_date)
    signals = _fetch_signals(trade_date)
    grouped = _group_by_section(signals)
    direction = _dir(market.get("nifty_return"))
    top_gainers = fetch_all("select symbol, security_name, close_price, daily_return as change_pct, total_traded_qty as volume from nse_app.security_daily_features where trade_date = %(trade_date)s order by daily_return desc nulls last, turnover_lacs desc nulls last limit 5", {"trade_date": trade_date})
    top_losers = fetch_all("select symbol, security_name, close_price, daily_return as change_pct, total_traded_qty as volume from nse_app.security_daily_features where trade_date = %(trade_date)s order by daily_return asc nulls last, turnover_lacs desc nulls last limit 5", {"trade_date": trade_date})
    ticker = fetch_all("select symbol, close_price as last_value, daily_return as change_pct from nse_app.security_daily_features where trade_date = %(trade_date)s order by turnover_lacs desc nulls last, symbol asc limit 30", {"trade_date": trade_date})
    sector_groups = []
    for slug in ["momentum-breakouts", "mean-reversion", "delivery-conviction", "events-flows", "anomalies-risk"]:
        rows = grouped.get(slug, [])[:5]
        if not rows:
            continue
        items = []
        for row in rows:
            d = _sig_dir(row.get("signal_direction"), row.get("daily_return"))
            items.append({"symbol": row["symbol"], "security_name": row.get("security_name"), "close_price": row.get("close_price"), "change_pct": row.get("daily_return"), "direction": d, "accent_token": _accent(d), "arrow": _arrow(d), "sector_name": SECTION_META[slug]})
        sector_groups.append({"sector_name": SECTION_META[slug], "items": items})
    cards = []
    for slug, title in SECTION_META.items():
        if slug == "historical-learner":
            cards.append({"section_slug": slug, "title": title, "summary_value": None, "summary_text": "Signal outcome archive", "direction": "neutral", "accent_token": "white"})
            continue
        rows = grouped.get(slug, [])
        up = sum(1 for row in rows if _sig_dir(row.get("signal_direction"), row.get("daily_return")) == "up")
        down = sum(1 for row in rows if _sig_dir(row.get("signal_direction"), row.get("daily_return")) == "down")
        d = "up" if up > down else "down" if down > up else "neutral"
        avg_score = (sum(_f(row.get("signal_strength")) or 0.0 for row in rows) / len(rows)) if rows else None
        cards.append({"section_slug": slug, "title": title, "summary_value": avg_score, "summary_text": f"{len(rows)} names" if rows else "No current signals", "direction": d, "accent_token": _accent(d)})
    hero = {"index_name": "NIFTY 50", "last_value": market.get("nifty_close"), "delta_value": _delta_from_return(market.get("nifty_close"), market.get("nifty_return")), "change_pct": market.get("nifty_return"), "as_of": market.get("updated_at").isoformat() if market.get("updated_at") else None, "direction": direction, "accent_token": _accent(direction), "arrow": _arrow(direction)}
    execute(
        """
        insert into nse_ops.dashboard_snapshot_daily (
          trade_date, generated_at, is_stale, hero_json, top_gainers_json, top_losers_json,
          sector_groups_json, ticker_tape_json, summary_cards_json, footer_disclaimer, accent_token, meta_json
        ) values (
          %(trade_date)s, now(), %(is_stale)s, %(hero)s::jsonb, %(gainers)s::jsonb, %(losers)s::jsonb,
          %(groups)s::jsonb, %(ticker)s::jsonb, %(cards)s::jsonb, %(footer)s, %(accent)s, %(meta)s::jsonb
        ) on conflict (trade_date) do update set
          generated_at = excluded.generated_at, is_stale = excluded.is_stale, hero_json = excluded.hero_json,
          top_gainers_json = excluded.top_gainers_json, top_losers_json = excluded.top_losers_json,
          sector_groups_json = excluded.sector_groups_json, ticker_tape_json = excluded.ticker_tape_json,
          summary_cards_json = excluded.summary_cards_json, footer_disclaimer = excluded.footer_disclaimer,
          accent_token = excluded.accent_token, meta_json = excluded.meta_json
        """,
        {"trade_date": trade_date, "is_stale": (datetime.now(timezone.utc).date() - trade_date).days > get_settings().data_stale_days_max, "hero": json.dumps(hero, default=str), "gainers": json.dumps([_style_quote(row) for row in top_gainers], default=str), "losers": json.dumps([_style_quote(row) for row in top_losers], default=str), "groups": json.dumps(sector_groups, default=str), "ticker": json.dumps([_style_quote(row) for row in ticker], default=str), "cards": json.dumps(cards, default=str), "footer": DISCLAIMER, "accent": _accent(direction), "meta": json.dumps({"signal_rows": len(signals)}, default=str)},
    )
    _refresh_sections(trade_date, market, grouped)
    return trade_date


def _refresh_sections(trade_date: date, market: dict[str, Any], grouped: dict[str, list[dict[str, Any]]]) -> None:
    execute("delete from nse_ops.dashboard_section_daily where trade_date = %(trade_date)s", {"trade_date": trade_date})
    breadth_rows = fetch_all("select symbol, security_name, close_price, daily_return, volume_rel_20, delivery_rel_20, composite_trend_score, composite_anomaly_score, composite_risk_score, total_traded_qty from nse_app.security_daily_features where trade_date = %(trade_date)s order by turnover_lacs desc nulls last, symbol asc limit 15", {"trade_date": trade_date})
    breadth_detail = [{"symbol": row["symbol"], "title": row.get("security_name") or row["symbol"], "subtitle": "Breadth leader by turnover", "direction": _dir(row.get("daily_return")), "accent_token": _accent(_dir(row.get("daily_return"))), "score": row.get("composite_trend_score"), "confidence": row.get("volume_rel_20"), "primary_metric": row.get("daily_return"), "secondary_metric": row.get("delivery_rel_20"), "notes": f"Volume {row.get('total_traded_qty') or 0}", "payload": _ser(row)} for row in breadth_rows]
    _insert_section(trade_date, "regime-breadth", _dir(market.get("nifty_return")), {"trade_date": trade_date.isoformat(), "securities_count": market.get("securities_count"), "advancers": market.get("advancers"), "decliners": market.get("decliners"), "unchanged": market.get("unchanged"), "positive_ratio": market.get("positive_ratio"), "avg_daily_return": market.get("avg_daily_return"), "median_daily_return": market.get("median_daily_return"), "total_turnover_lacs": market.get("total_turnover_lacs"), "avg_volume_rel_20": market.get("avg_volume_rel_20"), "avg_delivery_rel_20": market.get("avg_delivery_rel_20"), "breakout_count": market.get("breakout_count"), "breakdown_count": market.get("breakdown_count"), "event_count": market.get("event_count"), "anomaly_count": market.get("anomaly_count"), "risk_count": market.get("risk_count"), "nifty_close": market.get("nifty_close"), "nifty_return": market.get("nifty_return"), "market_regime": market.get("market_regime")}, [f"Advancers {market.get('advancers') or 0}", f"Decliners {market.get('decliners') or 0}", f"Regime {market.get('market_regime') or 'unknown'}"], "Session breadth, participation, and index regime snapshot.", breadth_detail)
    perf_date_row = fetch_one("select max(as_of_date) as as_of_date from nse_app.signal_performance_summary")
    perf_date = perf_date_row["as_of_date"] if perf_date_row and perf_date_row.get("as_of_date") else None
    for slug in ["momentum-breakouts", "mean-reversion", "delivery-conviction", "events-flows", "anomalies-risk"]:
        rows = grouped.get(slug, [])
        up = sum(1 for row in rows if _sig_dir(row.get("signal_direction"), row.get("daily_return")) == "up")
        down = sum(1 for row in rows if _sig_dir(row.get("signal_direction"), row.get("daily_return")) == "down")
        direction = "up" if up > down else "down" if down > up else "neutral"
        perf = []
        if perf_date:
            perf = fetch_all("select as_of_date, analysis_type, signal_name, signal_direction, sample_size, hit_rate_5d, avg_fwd_return_5d, median_fwd_return_5d from nse_app.signal_performance_summary where as_of_date = %(as_of_date)s and analysis_type = any(%(types)s) order by sample_size desc nulls last, hit_rate_5d desc nulls last limit 12", {"as_of_date": perf_date, "types": [k for k, v in ANALYSIS_TO_SECTION.items() if v == slug]})
        _insert_section(trade_date, slug, direction, {"item_count": len(rows), "avg_signal_score": (sum(_f(row.get("signal_strength")) or 0.0 for row in rows) / len(rows)) if rows else None, "up_count": up, "down_count": down}, [f"Rows {len(rows)}", f"Up {up} / Down {down}", f"Top section {SECTION_META[slug]}"], f"Latest {SECTION_META[slug]} names derived from nse_app analytics tables.", [_detail_from_signal(row) for row in rows[:25]], {"signal_performance": [_ser(row) for row in perf]})
    hist_rows = fetch_all("select as_of_date, analysis_type, signal_name, signal_direction, sample_size, hit_rate_5d, avg_fwd_return_5d, median_fwd_return_5d from nse_app.signal_performance_summary where as_of_date = (select max(as_of_date) from nse_app.signal_performance_summary) order by sample_size desc nulls last, hit_rate_5d desc nulls last limit 25")
    hist_detail = [{"title": str(row.get("signal_name") or "signal").replace("_", " ").title(), "subtitle": str(row.get("analysis_type") or "analysis").replace("_", " ").title(), "direction": _sig_dir(row.get("signal_direction"), row.get("avg_fwd_return_5d")), "accent_token": _accent(_sig_dir(row.get("signal_direction"), row.get("avg_fwd_return_5d"))), "score": row.get("avg_fwd_return_5d"), "confidence": row.get("hit_rate_5d"), "primary_metric": row.get("hit_rate_5d"), "secondary_metric": row.get("sample_size"), "notes": f"Median 5D {row.get('median_fwd_return_5d')}", "payload": _ser(row)} for row in hist_rows]
    _insert_section(trade_date, "historical-learner", "neutral", {"item_count": len(hist_detail)}, ["Uses archived signal outcome summaries.", f"Rows {len(hist_detail)}"], "Historical learner summarizes observed forward-return behavior by signal family.", hist_detail)


def refresh_watchlist_snapshots(trade_date: date | None = None) -> date:
    trade_date = trade_date or latest_trade_date()
    watchlists = fetch_all("select watchlist_id, slug, title, watchlist_kind, rule_key, selection_limit from nse_ops.watchlist where is_active = true order by ui_rank asc, watchlist_id asc")
    execute("delete from nse_ops.watchlist_snapshot_daily where trade_date = %(trade_date)s", {"trade_date": trade_date})
    for watchlist in watchlists:
        rows = _resolve_watchlist_rows(trade_date, watchlist)
        for rank_no, row in enumerate(rows, start=1):
            direction = row.get("direction") or _dir(row.get("change_pct"))
            execute(
                """
                insert into nse_ops.watchlist_snapshot_daily (
                  trade_date, watchlist_id, symbol, rank_no, direction, accent_token, signal_score, close_price,
                  change_pct, volume, delivery_pct, sector_name, tags_json, notes, payload_json, generated_at
                ) values (
                  %(trade_date)s, %(watchlist_id)s, %(symbol)s, %(rank_no)s, %(direction)s, %(accent_token)s,
                  %(signal_score)s, %(close_price)s, %(change_pct)s, %(volume)s, %(delivery_pct)s, %(sector_name)s,
                  %(tags_json)s::jsonb, %(notes)s, %(payload_json)s::jsonb, now()
                ) on conflict (trade_date, watchlist_id, symbol) do update set
                  rank_no = excluded.rank_no, direction = excluded.direction, accent_token = excluded.accent_token,
                  signal_score = excluded.signal_score, close_price = excluded.close_price, change_pct = excluded.change_pct,
                  volume = excluded.volume, delivery_pct = excluded.delivery_pct, sector_name = excluded.sector_name,
                  tags_json = excluded.tags_json, notes = excluded.notes, payload_json = excluded.payload_json, generated_at = excluded.generated_at
                """,
                {"trade_date": trade_date, "watchlist_id": watchlist["watchlist_id"], "symbol": row["symbol"], "rank_no": rank_no, "direction": direction, "accent_token": _accent(direction), "signal_score": row.get("signal_score"), "close_price": row.get("close_price"), "change_pct": row.get("change_pct"), "volume": row.get("volume"), "delivery_pct": row.get("delivery_pct"), "sector_name": row.get("sector_name"), "tags_json": json.dumps(row.get("tags", []), default=str), "notes": row.get("notes"), "payload_json": json.dumps(row, default=str)},
            )
    return trade_date


def _resolve_watchlist_rows(trade_date: date, watchlist: dict[str, Any]) -> list[dict[str, Any]]:
    limit = int(watchlist.get("selection_limit") or 20)
    rule_key = str(watchlist.get("rule_key") or "")
    if watchlist.get("watchlist_kind") == "manual":
        return fetch_all("with active_items as (select distinct on (symbol) symbol from nse_ops.watchlist_item where watchlist_id = %(watchlist_id)s and removed_at is null order by symbol, added_at desc) select f.symbol, f.security_name, null::text as sector_name, f.close_price, f.daily_return as change_pct, f.total_traded_qty as volume, f.deliverable_pct as delivery_pct, f.composite_anomaly_score as signal_score, array['manual'] as tags, 'Manual watchlist member' as notes from active_items a join nse_app.security_daily_features f on f.symbol = a.symbol and f.trade_date = %(trade_date)s order by f.turnover_lacs desc nulls last, f.symbol asc limit %(limit)s", {"watchlist_id": watchlist["watchlist_id"], "trade_date": trade_date, "limit": limit})
    if rule_key == "leaders":
        return fetch_all("select symbol, security_name, null::text as sector_name, close_price, daily_return as change_pct, total_traded_qty as volume, deliverable_pct as delivery_pct, daily_return as signal_score, array['leaders'] as tags, 'Strongest daily outperformance' as notes from nse_app.security_daily_features where trade_date = %(trade_date)s order by daily_return desc nulls last, turnover_lacs desc nulls last limit %(limit)s", {"trade_date": trade_date, "limit": limit})
    if rule_key == "laggards":
        return fetch_all("select symbol, security_name, null::text as sector_name, close_price, daily_return as change_pct, total_traded_qty as volume, deliverable_pct as delivery_pct, abs(daily_return) as signal_score, array['laggards'] as tags, 'Weakest daily performance' as notes from nse_app.security_daily_features where trade_date = %(trade_date)s order by daily_return asc nulls last, turnover_lacs desc nulls last limit %(limit)s", {"trade_date": trade_date, "limit": limit})
    if rule_key == "high_delivery":
        return fetch_all("select symbol, security_name, null::text as sector_name, close_price, daily_return as change_pct, total_traded_qty as volume, deliverable_pct as delivery_pct, coalesce(deliverable_pct, 0) + coalesce(delivery_rel_20, 0) as signal_score, array['high_delivery'] as tags, 'High-conviction delivery activity' as notes from nse_app.security_daily_features where trade_date = %(trade_date)s order by deliverable_pct desc nulls last, delivery_rel_20 desc nulls last, turnover_lacs desc nulls last limit %(limit)s", {"trade_date": trade_date, "limit": limit})
    rule_map = {"breakouts": ("momentum_breakout", False), "mean_reversion": ("mean_reversion", False), "events_flow": ("event_flow", False), "anomalies": ("anomaly", False), "risk_caution": ("*", True)}
    if rule_key not in rule_map:
        return []
    analysis_type, caution_only = rule_map[rule_key]
    where = ["s.trade_date = %(trade_date)s"]
    params: dict[str, Any] = {"trade_date": trade_date, "limit": limit}
    if analysis_type != "*":
        where.append("s.analysis_type = %(analysis_type)s")
        params["analysis_type"] = analysis_type
    if caution_only:
        where.append("lower(coalesce(s.signal_direction, '')) in ('bearish', 'caution', 'risk')")
    rows = fetch_all(f"select s.symbol, coalesce(f.security_name, s.symbol) as security_name, null::text as sector_name, f.close_price, coalesce(f.daily_return, s.daily_return) as change_pct, f.total_traded_qty as volume, f.deliverable_pct as delivery_pct, s.signal_strength as signal_score, array[s.analysis_type, s.signal_name] as tags, s.rationale as notes, s.signal_direction from nse_app.stock_analysis_signals_daily s left join nse_app.security_daily_features f on f.trade_date = s.trade_date and f.symbol = s.symbol and f.series = s.series where {' and '.join(where)} order by s.signal_strength desc nulls last, f.turnover_lacs desc nulls last, s.symbol asc limit %(limit)s", params)
    for row in rows:
        row["direction"] = _sig_dir(row.get("signal_direction"), row.get("change_pct"))
    return rows


def build_summary_payload(trade_date: date | None = None) -> dict[str, Any]:
    if trade_date is None:
        row = fetch_one("select max(trade_date) as trade_date from nse_ops.dashboard_snapshot_daily")
        trade_date = row["trade_date"] if row and row.get("trade_date") else refresh_dashboard_snapshots()
    row = fetch_one("select trade_date, generated_at, is_stale, hero_json, top_gainers_json, top_losers_json, sector_groups_json, ticker_tape_json, summary_cards_json, footer_disclaimer, accent_token from nse_ops.dashboard_snapshot_daily where trade_date = %(trade_date)s", {"trade_date": trade_date})
    if not row:
        refresh_dashboard_snapshots(trade_date)
        row = fetch_one("select trade_date, generated_at, is_stale, hero_json, top_gainers_json, top_losers_json, sector_groups_json, ticker_tape_json, summary_cards_json, footer_disclaimer, accent_token from nse_ops.dashboard_snapshot_daily where trade_date = %(trade_date)s", {"trade_date": trade_date})
    if not row:
        raise RuntimeError(f"Unable to build dashboard summary for {trade_date}")
    return {"trade_date": row["trade_date"].isoformat(), "generated_at": row["generated_at"].isoformat() if row.get("generated_at") else None, "is_stale": row.get("is_stale", False), "accent_token": row.get("accent_token", "white"), "hero": row.get("hero_json"), "top_gainers": row.get("top_gainers_json"), "top_losers": row.get("top_losers_json"), "sector_groups": row.get("sector_groups_json"), "ticker_tape": row.get("ticker_tape_json"), "summary_cards": row.get("summary_cards_json"), "footer_disclaimer": row.get("footer_disclaimer", DISCLAIMER), "educational_purpose_only": True}


def build_section_payload(section_slug: str, trade_date: date | None = None) -> dict[str, Any]:
    if trade_date is None:
        row = fetch_one("select max(trade_date) as trade_date from nse_ops.dashboard_section_daily")
        trade_date = row["trade_date"] if row and row.get("trade_date") else refresh_dashboard_snapshots()
    row = fetch_one("select trade_date, section_slug, title, direction, accent_token, generated_at, summary_metrics_json, highlights_json, narrative, rows_json, historical_context_json from nse_ops.dashboard_section_daily where trade_date = %(trade_date)s and section_slug = %(section_slug)s", {"trade_date": trade_date, "section_slug": section_slug})
    if not row:
        refresh_dashboard_snapshots(trade_date)
        row = fetch_one("select trade_date, section_slug, title, direction, accent_token, generated_at, summary_metrics_json, highlights_json, narrative, rows_json, historical_context_json from nse_ops.dashboard_section_daily where trade_date = %(trade_date)s and section_slug = %(section_slug)s", {"trade_date": trade_date, "section_slug": section_slug})
    if not row:
        raise RuntimeError(f"Unable to build section payload for {section_slug} / {trade_date}")
    return {"trade_date": row["trade_date"].isoformat(), "section_slug": row["section_slug"], "title": row["title"], "direction": row["direction"], "accent_token": row["accent_token"], "generated_at": row["generated_at"].isoformat() if row.get("generated_at") else None, "summary_metrics": row["summary_metrics_json"], "highlights": row["highlights_json"], "narrative": row["narrative"], "rows": row["rows_json"], "historical_context": row["historical_context_json"]}


def build_watchlists_payload() -> list[dict[str, Any]]:
    rows = fetch_all("select w.slug, w.title, w.description, w.watchlist_kind, w.rule_key, w.selection_limit, w.ui_rank, (select max(trade_date) from nse_ops.watchlist_snapshot_daily s where s.watchlist_id = w.watchlist_id) as latest_trade_date, (select count(*) from nse_ops.watchlist_snapshot_daily s where s.watchlist_id = w.watchlist_id and s.trade_date = (select max(trade_date) from nse_ops.watchlist_snapshot_daily s2 where s2.watchlist_id = w.watchlist_id)) as latest_count from nse_ops.watchlist w where w.is_active = true order by w.ui_rank asc, w.title asc")
    return [_ser(row) for row in rows]


def build_watchlist_payload(slug: str, trade_date: date | None = None) -> dict[str, Any]:
    watchlist = fetch_one("select watchlist_id, slug, title, description, watchlist_kind, rule_key, selection_limit, ui_rank from nse_ops.watchlist where slug = %(slug)s and is_active = true", {"slug": slug})
    if not watchlist:
        raise RuntimeError(f"Unknown watchlist: {slug}")
    if trade_date is None:
        row = fetch_one("select max(trade_date) as trade_date from nse_ops.watchlist_snapshot_daily where watchlist_id = %(watchlist_id)s", {"watchlist_id": watchlist["watchlist_id"]})
        trade_date = row["trade_date"] if row and row.get("trade_date") else latest_trade_date()
    rows = fetch_all("select symbol, rank_no, direction, accent_token, signal_score, close_price, change_pct, volume, delivery_pct, sector_name, tags_json, notes, payload_json, generated_at from nse_ops.watchlist_snapshot_daily where trade_date = %(trade_date)s and watchlist_id = %(watchlist_id)s order by rank_no asc nulls last, symbol asc", {"trade_date": trade_date, "watchlist_id": watchlist["watchlist_id"]})
    latest_generated = max((row["generated_at"] for row in rows if row.get("generated_at")), default=None)
    return {"trade_date": trade_date.isoformat(), "generated_at": latest_generated.isoformat() if latest_generated else None, "watchlist": _ser(watchlist), "rows": [_ser(row) for row in rows]}


def build_watchlist_history_payload(slug: str, days: int = 90) -> dict[str, Any]:
    watchlist = fetch_one("select watchlist_id, slug, title, description from nse_ops.watchlist where slug = %(slug)s and is_active = true", {"slug": slug})
    if not watchlist:
        raise RuntimeError(f"Unknown watchlist: {slug}")
    rows = fetch_all("select trade_date, symbol, rank_no, direction, accent_token, signal_score, close_price, change_pct, volume, delivery_pct, sector_name, tags_json, notes from nse_ops.watchlist_snapshot_daily where watchlist_id = %(watchlist_id)s and trade_date >= current_date - (%(days)s::int || ' days')::interval order by trade_date desc, rank_no asc nulls last, symbol asc", {"watchlist_id": watchlist["watchlist_id"], "days": days})
    return {"watchlist": _ser(watchlist), "days": days, "rows": [_ser(row) for row in rows]}


def refresh_exports(trade_date: date | None = None) -> date:
    Path(get_settings().export_root).mkdir(parents=True, exist_ok=True)
    trade_date = trade_date or latest_trade_date()
    summary = build_summary_payload(trade_date)
    _write_export("dashboard", "summary", trade_date, "json", dumps_json(summary).encode("utf-8"), "application/json", f"dashboard/summary-{trade_date.isoformat()}.json", {"type": "dashboard_summary"})
    _write_export("dashboard", "summary", trade_date, "csv", csv_bytes(flatten_summary_to_csv_rows(summary)), "text/csv", f"dashboard/summary-{trade_date.isoformat()}.csv", {"type": "dashboard_summary"})
    for row in fetch_all("select section_slug from nse_ops.dashboard_section_daily where trade_date = %(trade_date)s order by section_slug", {"trade_date": trade_date}):
        slug = row["section_slug"]
        payload = build_section_payload(slug, trade_date)
        _write_export("dashboard-section", slug, trade_date, "json", dumps_json(payload).encode("utf-8"), "application/json", f"sections/{slug}-{trade_date.isoformat()}.json", {"section_slug": slug})
        _write_export("dashboard-section", slug, trade_date, "csv", csv_bytes(payload.get("rows", [])), "text/csv", f"sections/{slug}-{trade_date.isoformat()}.csv", {"section_slug": slug})
    for watchlist in fetch_all("select slug from nse_ops.watchlist where is_active = true order by ui_rank asc"):
        slug = watchlist["slug"]
        payload = build_watchlist_payload(slug, trade_date)
        _write_export("watchlist", slug, trade_date, "json", dumps_json(payload).encode("utf-8"), "application/json", f"watchlists/{slug}-{trade_date.isoformat()}.json", {"watchlist_slug": slug})
        _write_export("watchlist", slug, trade_date, "csv", csv_bytes(payload.get("rows", [])), "text/csv", f"watchlists/{slug}-{trade_date.isoformat()}.csv", {"watchlist_slug": slug})
    return trade_date


def _write_export(scope: str, key: str, trade_date: date, export_format: str, content_bytes: bytes, content_type: str, relative_name: str, meta_json: dict[str, Any]) -> None:
    path = Path(get_settings().export_root) / relative_name
    byte_size = write_bytes(path, content_bytes)
    row_count = max(content_bytes.decode("utf-8").count("\n") - 1, 0) if content_type == "text/csv" and content_bytes else None
    execute("insert into nse_ops.export_manifest (export_id, export_scope, export_key, trade_date, export_format, storage_path, content_type, row_count, byte_size, checksum_sha256, expires_at, meta_json) values (%(export_id)s, %(scope)s, %(key)s, %(trade_date)s, %(export_format)s, %(storage_path)s, %(content_type)s, %(row_count)s, %(byte_size)s, %(checksum)s, now() + (%(retention_days)s::int || ' days')::interval, %(meta_json)s::jsonb)", {"export_id": str(uuid.uuid4()), "scope": scope, "key": key, "trade_date": trade_date, "export_format": export_format, "storage_path": str(path), "content_type": content_type, "row_count": row_count, "byte_size": byte_size, "checksum": sha256_bytes(content_bytes), "retention_days": get_settings().export_retention_days, "meta_json": json.dumps(meta_json, default=str)})


def run_quality_checks(parent_run_id: str | None = None) -> list[dict[str, Any]]:
    latest_dt = latest_trade_date()
    age_days = (datetime.now(timezone.utc).date() - latest_dt).days
    checks = [{"check_key": "latest_trade_date_not_stale", "severity": "error", "passed": age_days <= get_settings().data_stale_days_max, "observed_value": str(age_days), "threshold_value": str(get_settings().data_stale_days_max), "detail": f"Latest trade date is {latest_dt.isoformat()}"}, {"check_key": "dashboard_snapshot_exists", "severity": "error", "passed": fetch_one("select 1 as ok from nse_ops.dashboard_snapshot_daily where trade_date = %(trade_date)s", {"trade_date": latest_dt}) is not None, "observed_value": latest_dt.isoformat(), "threshold_value": "exists", "detail": "Dashboard snapshot should exist for the latest trade date"}]
    watchlist_count = fetch_one("select count(*)::int as ct from nse_ops.watchlist_snapshot_daily where trade_date = %(trade_date)s", {"trade_date": latest_dt}) or {"ct": 0}
    export_count = fetch_one("select count(*)::int as ct from nse_ops.export_manifest where trade_date = %(trade_date)s", {"trade_date": latest_dt}) or {"ct": 0}
    signal_count = fetch_one("select count(*)::int as ct from nse_app.stock_analysis_signals_daily where trade_date = %(trade_date)s", {"trade_date": latest_dt}) or {"ct": 0}
    checks.extend([{"check_key": "watchlist_snapshots_present", "severity": "warn", "passed": (watchlist_count.get("ct") or 0) > 0, "observed_value": str(watchlist_count.get("ct") or 0), "threshold_value": ">0", "detail": "Watchlist snapshots should exist for the latest trade date"}, {"check_key": "export_manifest_present", "severity": "warn", "passed": (export_count.get("ct") or 0) > 0, "observed_value": str(export_count.get("ct") or 0), "threshold_value": ">0", "detail": "At least one export should exist for the latest trade date"}, {"check_key": "signal_rows_present", "severity": "warn", "passed": (signal_count.get("ct") or 0) > 0, "observed_value": str(signal_count.get("ct") or 0), "threshold_value": ">0", "detail": "Signals should exist for the latest trade date"}])
    for check in checks:
        execute("insert into nse_ops.quality_check_result (run_id, check_key, severity, passed, observed_value, threshold_value, detail) values (%(run_id)s, %(check_key)s, %(severity)s, %(passed)s, %(observed_value)s, %(threshold_value)s, %(detail)s)", {"run_id": parent_run_id, **check})
    return checks


def retention_cleanup() -> dict[str, Any]:
    settings = get_settings()
    export_root = Path(settings.export_root)
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.export_retention_days)
    deleted_files = 0
    for row in fetch_all("select export_id, storage_path from nse_ops.export_manifest where created_at < %(cutoff)s", {"cutoff": cutoff}):
        path = Path(row["storage_path"])
        if path.exists() and export_root in path.parents:
            path.unlink()
            deleted_files += 1
    execute("delete from nse_ops.export_manifest where created_at < %(cutoff)s", {"cutoff": cutoff})
    run_cutoff = datetime.now(timezone.utc) - timedelta(days=settings.ops_run_retention_days)
    execute("delete from nse_ops.job_run where requested_at < %(cutoff)s", {"cutoff": run_cutoff})
    execute("delete from nse_ops.quality_check_result where created_at < %(cutoff)s", {"cutoff": run_cutoff})
    return {"deleted_files": deleted_files, "export_manifest_cutoff": cutoff.isoformat(), "ops_run_cutoff": run_cutoff.isoformat()}
