from __future__ import annotations

import json
from typing import Any, Dict, List

from sqlalchemy.engine import Connection

from nse_reco_state_aware_engine.db.sql import fetch_all, exec_text


def refresh_watchlists(conn: Connection, *, trade_date: str, index_code: str) -> int:
    defs = fetch_all(conn, "SELECT slug, query_kind, query_params FROM nse_reco.watchlist_def ORDER BY slug")
    rows_written = 0
    for d in defs:
        slug = d["slug"]
        kind = d["query_kind"]
        params = d["query_params"]
        limit = int(params.get("limit", 25))

        if kind == "action_rank":
            action = params["action"]
            items = fetch_all(
                conn,
                """
                SELECT symbol, final_score, signal_family, action, direction, accent_token, arrow
                FROM nse_reco.recommendation_snapshot
                WHERE trade_date=:d AND index_code=:idx AND action=:a
                ORDER BY final_score DESC
                LIMIT :lim
                """,
                {"d": trade_date, "idx": index_code, "a": action, "lim": limit},
            )
        elif kind == "metric_rank":
            metric = params["metric"]
            # metric must exist in explanation->features or fall back to residual_ret_30m from integration
            if metric == "residual_ret_30m_pct":
                items = fetch_all(
                    conn,
                    """
                    SELECT symbol, (explanation->'features'->>'residual_ret_30m_pct')::numeric AS metric_value,
                           final_score, signal_family, action, direction, accent_token, arrow
                    FROM nse_reco.recommendation_snapshot
                    WHERE trade_date=:d AND index_code=:idx
                    ORDER BY metric_value DESC NULLS LAST
                    LIMIT :lim
                    """,
                    {"d": trade_date, "idx": index_code, "lim": limit},
                )
            else:
                items = []
        elif kind == "flag":
            flag = params["flag"]
            items = fetch_all(
                conn,
                """
                SELECT symbol, final_score, signal_family, action, direction, accent_token, arrow
                FROM nse_reco.recommendation_snapshot
                WHERE trade_date=:d AND index_code=:idx
                  AND COALESCE((explanation->'flags'->>:flag)::boolean, false) = true
                ORDER BY final_score DESC
                LIMIT :lim
                """,
                {"d": trade_date, "idx": index_code, "lim": limit, "flag": flag},
            )
        else:
            items = []

        exec_text(
            conn,
            """
            INSERT INTO nse_reco.watchlist_snapshot(trade_date, index_code, slug, asof_ts, items)
            VALUES(:d, :idx, :slug, (SELECT max(asof_ts) FROM nse_reco.recommendation_snapshot WHERE trade_date=:d AND index_code=:idx), CAST(:items AS jsonb))
            ON CONFLICT (trade_date, index_code, slug) DO UPDATE SET
              asof_ts=EXCLUDED.asof_ts,
              items=EXCLUDED.items,
              created_at=now();
            """,
            {"d": trade_date, "idx": index_code, "slug": slug, "items": json.dumps(items, default=str)},
        )
        rows_written += 1
    return rows_written
