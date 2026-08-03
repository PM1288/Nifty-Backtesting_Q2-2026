from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from sqlalchemy.engine import Connection

from nse_reco_state_aware_engine.db.sql import fetch_one, exec_text


def historical_edge_points(
    conn: Connection,
    *,
    horizon: str,
    regime: str,
    signal_family: str,
    thresholds: Dict[str, Any],
) -> Tuple[float, Dict[str, Any]]:
    """Return edge points and metadata.

    Edge points are scaled from avg_return_pct with shrinkage for low samples.
    """
    row = fetch_one(
        conn,
        """
        SELECT sample_count, win_rate, avg_return_pct
        FROM nse_reco.bucket_scorecard
        WHERE horizon=:h AND regime=:r AND signal_family=:s
        """,
        {"h": horizon, "r": regime, "s": signal_family},
    )
    if not row:
        return 0.0, {"source": "none"}

    sample = int(row["sample_count"])
    avg_ret = float(row["avg_return_pct"])
    win = float(row["win_rate"])

    mins = thresholds["weights"]["scorecard_min_samples"]
    low = int(mins["low"])
    medium = int(mins["medium"])

    if sample < low:
        shrink = 0.15
    elif sample < medium:
        shrink = 0.5
    else:
        shrink = 1.0

    # avg_ret is in percent; scale to points with cap
    pts = max(-10.0, min(10.0, avg_ret * 8.0)) * shrink
    meta = {"source": "bucket_scorecard", "sample_count": sample, "win_rate": win, "avg_return_pct": avg_ret, "shrink": shrink}
    return float(pts), meta


def refresh_scorecards(conn: Connection, *, index_code: str) -> int:
    """Recompute scorecards from recommendation outcomes."""
    # Use ret based on horizon text. Allowed: 15m, 30m, 60m, close
    sql = """
    WITH joined AS (
      SELECT
        o.horizon,
        m.regime,
        o.signal_family,
        CASE
          WHEN o.horizon='15m' THEN o.ret_fwd_15m_pct
          WHEN o.horizon='30m' THEN o.ret_fwd_30m_pct
          WHEN o.horizon='60m' THEN o.ret_fwd_60m_pct
          WHEN o.horizon='close' THEN o.ret_to_close_pct
          ELSE o.ret_fwd_30m_pct
        END AS ret
      FROM nse_reco.v_reco_outcomes o
      JOIN nse_reco.market_regime_snapshot m
        ON m.trade_date=o.trade_date AND m.index_code=o.index_code
      WHERE o.index_code=:idx
    ), agg AS (
      SELECT
        horizon,
        regime,
        signal_family,
        COUNT(*)::int AS sample_count,
        AVG(CASE WHEN ret IS NOT NULL AND ret>0 THEN 1.0 ELSE 0.0 END) AS win_rate,
        AVG(COALESCE(ret,0.0)) AS avg_return_pct,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(ret,0.0)) AS p50_return_pct
      FROM joined
      WHERE ret IS NOT NULL
      GROUP BY horizon, regime, signal_family
    )
    INSERT INTO nse_reco.bucket_scorecard (horizon, regime, signal_family, sample_count, win_rate, avg_return_pct, p50_return_pct, updated_at)
    SELECT horizon, regime, signal_family, sample_count, win_rate, avg_return_pct, p50_return_pct, now()
    FROM agg
    ON CONFLICT (horizon, regime, signal_family) DO UPDATE SET
      sample_count=EXCLUDED.sample_count,
      win_rate=EXCLUDED.win_rate,
      avg_return_pct=EXCLUDED.avg_return_pct,
      p50_return_pct=EXCLUDED.p50_return_pct,
      updated_at=now();
    """
    res = exec_text(conn, sql, {"idx": index_code})
    # rowcount is unreliable for INSERT .. SELECT; return 0 and rely on logs
    return 0
