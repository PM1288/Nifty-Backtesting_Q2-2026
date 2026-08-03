from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.engine import Connection

from nse_reco_state_aware_engine.core.anomalies import detect_market_anomalies, detect_single_stock_anomalies
from nse_reco_state_aware_engine.core.regime import classify_regime, regime_signal_fit
from nse_reco_state_aware_engine.core.scoring import infer_signal, score_action
from nse_reco_state_aware_engine.core.scorecards import historical_edge_points, refresh_scorecards
from nse_reco_state_aware_engine.core.watchlists import refresh_watchlists
from nse_reco_state_aware_engine.core.config import settings
from nse_reco_state_aware_engine.db.sql import exec_text, fetch_all, fetch_one, run_many
from nse_reco_state_aware_engine.jobs.runner import contract_check_or_raise

logger = logging.getLogger(__name__)


def refresh_baselines(conn: Connection, *, trade_date: str, index_code: str, lookback_sessions: int = 60) -> Dict[str, int]:
    """Compute minute-of-day baselines for volume and market breadth/dispersion.

    Improves anomaly detection and can be used by upstream feature builders.
    """
    # stock volume profile
    sql_stock = """
    WITH sessions AS (
      SELECT DISTINCT trade_date
      FROM integration.v_security_minute_feature
      WHERE trade_date < :d
      ORDER BY trade_date DESC
      LIMIT :n
    ), agg AS (
      SELECT symbol, minute_of_day,
             avg(volume) AS mean_volume,
             COALESCE(stddev_pop(volume), 0.0) AS std_volume,
             count(*)::int AS sample_count
      FROM integration.v_security_minute_feature
      WHERE trade_date IN (SELECT trade_date FROM sessions)
      GROUP BY symbol, minute_of_day
    )
    INSERT INTO nse_reco.stock_minute_profile(symbol, minute_of_day, mean_volume, std_volume, sample_count, updated_at)
    SELECT symbol, minute_of_day, mean_volume, std_volume, sample_count, now()
    FROM agg
    ON CONFLICT (symbol, minute_of_day) DO UPDATE SET
      mean_volume=EXCLUDED.mean_volume,
      std_volume=EXCLUDED.std_volume,
      sample_count=EXCLUDED.sample_count,
      updated_at=now();
    """
    exec_text(conn, sql_stock, {"d": trade_date, "n": lookback_sessions})

    # market profile
    sql_mkt = """
    WITH sessions AS (
      SELECT DISTINCT trade_date
      FROM integration.v_market_minute_feature
      WHERE trade_date < :d AND index_code=:idx
      ORDER BY trade_date DESC
      LIMIT :n
    ), agg AS (
      SELECT minute_of_day,
             COALESCE(avg(breadth_up_pct), 0.0) AS mean_breadth_up_pct,
             COALESCE(stddev_pop(breadth_up_pct),0.0) AS std_breadth_up_pct,
             COALESCE(avg(dispersion_pctile), 0.0) AS mean_dispersion_pctile,
             COALESCE(stddev_pop(dispersion_pctile),0.0) AS std_dispersion_pctile,
             count(*)::int AS sample_count
      FROM integration.v_market_minute_feature
      WHERE trade_date IN (SELECT trade_date FROM sessions) AND index_code=:idx
      GROUP BY minute_of_day
    )
    INSERT INTO nse_reco.market_minute_profile(index_code, minute_of_day, mean_breadth_up_pct, std_breadth_up_pct, mean_dispersion_pctile, std_dispersion_pctile, sample_count, updated_at)
    SELECT :idx, minute_of_day, mean_breadth_up_pct, std_breadth_up_pct, mean_dispersion_pctile, std_dispersion_pctile, sample_count, now()
    FROM agg
    ON CONFLICT (index_code, minute_of_day) DO UPDATE SET
      mean_breadth_up_pct=EXCLUDED.mean_breadth_up_pct,
      std_breadth_up_pct=EXCLUDED.std_breadth_up_pct,
      mean_dispersion_pctile=EXCLUDED.mean_dispersion_pctile,
      std_dispersion_pctile=EXCLUDED.std_dispersion_pctile,
      sample_count=EXCLUDED.sample_count,
      updated_at=now();
    """
    exec_text(conn, sql_mkt, {"d": trade_date, "n": lookback_sessions, "idx": index_code})

    return {"stock_minute_profile": 1, "market_minute_profile": 1}


def refresh_regime(conn: Connection, *, trade_date: str, index_code: str, thresholds: Dict[str, Any]) -> Dict[str, Any]:
    latest = fetch_one(
        conn,
        """
        SELECT * FROM integration.v_market_minute_feature
        WHERE trade_date=:d AND index_code=:idx
        ORDER BY ts DESC
        LIMIT 1
        """,
        {"d": trade_date, "idx": index_code},
    )
    if not latest:
        raise RuntimeError("No market_minute_feature rows for trade_date")

    first = fetch_one(
        conn,
        """
        SELECT * FROM integration.v_market_minute_feature
        WHERE trade_date=:d AND index_code=:idx
        ORDER BY ts ASC
        LIMIT 1
        """,
        {"d": trade_date, "idx": index_code},
    )

    prior = fetch_one(
        conn,
        """
        SELECT close, high, low
        FROM integration.v_index_daily_history
        WHERE index_code=:idx AND trade_date < :d
        ORDER BY trade_date DESC
        LIMIT 1
        """,
        {"idx": index_code, "d": trade_date},
    )

    open_px = float(first["index_close"]) if first else float(latest["index_close"])  # best effort
    last_px = float(latest["index_close"])  # current
    index_ret_from_open_pct = 100.0 * (last_px / open_px - 1.0) if open_px else 0.0

    opening_gap_pct = latest.get("opening_gap_pct")
    if opening_gap_pct is None and prior and prior.get("close"):
        opening_gap_pct = 100.0 * (open_px / float(prior["close"]) - 1.0)

    first15_range_expansion_pct = latest.get("first15_range_expansion_pct")
    if first15_range_expansion_pct is None and prior and prior.get("high") and prior.get("low"):
        prior_range = float(prior["high"]) - float(prior["low"])
        # compute first 15m range from market data
        r = fetch_one(
            conn,
            """
            SELECT max(index_close) AS hi, min(index_close) AS lo
            FROM integration.v_market_minute_feature
            WHERE trade_date=:d AND index_code=:idx AND minute_of_day <= 14
            """,
            {"d": trade_date, "idx": index_code},
        )
        if r and prior_range > 0:
            first15_range = float(r["hi"]) - float(r["lo"]) if r["hi"] is not None and r["lo"] is not None else 0.0
            first15_range_expansion_pct = 100.0 * (first15_range / prior_range)

    res = classify_regime(
        index_ret_from_open_pct=index_ret_from_open_pct,
        opening_gap_pct=float(opening_gap_pct) if opening_gap_pct is not None else None,
        first15_range_expansion_pct=float(first15_range_expansion_pct) if first15_range_expansion_pct is not None else None,
        breadth_up_pct=float(latest["breadth_up_pct"]),
        breadth_above_vwap_pct=float(latest["breadth_above_vwap_pct"]),
        dispersion_pctile=float(latest["dispersion_pctile"]),
        realized_vol_pctile=float(latest["realized_vol_pctile"]),
        thresholds=thresholds,
    )

    exec_text(
        conn,
        """
        INSERT INTO nse_reco.market_regime_snapshot(trade_date, index_code, regime, direction, accent_token, score, features, updated_at)
        VALUES(:d, :idx, :reg, :dir, :acc, :score, CAST(:feat AS jsonb), now())
        ON CONFLICT (trade_date, index_code) DO UPDATE SET
          regime=EXCLUDED.regime,
          direction=EXCLUDED.direction,
          accent_token=EXCLUDED.accent_token,
          score=EXCLUDED.score,
          features=EXCLUDED.features,
          updated_at=now();
        """,
        {
            "d": trade_date,
            "idx": index_code,
            "reg": res.regime,
            "dir": res.direction,
            "acc": res.accent_token,
            "score": res.score,
                "feat": json.dumps(res.features, default=str),
        },
    )

    return {"regime": res.regime, "direction": res.direction, "accent_token": res.accent_token, "score": res.score}


def refresh_anomalies(conn: Connection, *, trade_date: str, index_code: str, thresholds: Dict[str, Any]) -> int:
    # latest market row
    mkt = fetch_one(
        conn,
        """
        SELECT * FROM integration.v_market_minute_feature
        WHERE trade_date=:d AND index_code=:idx
        ORDER BY ts DESC
        LIMIT 1
        """,
        {"d": trade_date, "idx": index_code},
    )
    if not mkt:
        return 0

    # baseline breadth at minute_of_day
    base = fetch_one(
        conn,
        """
        SELECT mean_breadth_up_pct
        FROM nse_reco.market_minute_profile
        WHERE index_code=:idx AND minute_of_day=:m
        """,
        {"idx": index_code, "m": int(mkt["minute_of_day"])},
    )
    baseline_breadth = float(base["mean_breadth_up_pct"]) if base and base.get("mean_breadth_up_pct") is not None else None

    market_anoms = detect_market_anomalies(
        breadth_up_pct=float(mkt["breadth_up_pct"]),
        baseline_breadth_up_pct=baseline_breadth,
        dispersion_pctile=float(mkt["dispersion_pctile"]),
        correlation_mean=float(mkt["correlation_mean"]) if "correlation_mean" in mkt and mkt["correlation_mean"] is not None else None,
        thresholds=thresholds,
    )

    inserted = 0
    for a in market_anoms:
        exec_text(
            conn,
            """
            INSERT INTO nse_reco.anomaly_event(trade_date, ts, scope, key, severity, score, reason, details)
            VALUES(:d, :ts, :scope, :key, :sev, :score, :reason, CAST(:details AS jsonb))
            ON CONFLICT DO NOTHING;
            """,
            {
                "d": trade_date,
                "ts": mkt["ts"],
                "scope": a.scope,
                "key": a.key,
                "sev": a.severity,
                "score": a.score,
                "reason": a.reason,
                "details": json.dumps(a.details, default=str),
            },
        )
        inserted += 1

    # latest stock features per symbol
    stocks = fetch_all(
        conn,
        """
        SELECT DISTINCT ON (s.symbol)
          s.trade_date, s.ts, s.minute_of_day, s.symbol, s.sector_name,
          s.close, s.vwap, s.volume, s.index_close, s.beta,
          s.residual_ret_5m_pct, s.residual_ret_15m_pct, s.residual_ret_30m_pct, s.residual_ret_60m_pct,
          s.time_above_vwap_pct, s.vwap_deviation_pct, s.volume_surprise_z, s.range_efficiency, s.close_location,
          COALESCE(s.vwap_cross_count, 0) AS vwap_cross_count,
          COALESCE(s.volume_ratio, NULL) AS volume_ratio
        FROM integration.v_security_minute_feature s
        JOIN integration.v_universe_membership u
          ON u.trade_date=s.trade_date AND u.symbol=s.symbol AND u.is_active=true
        WHERE s.trade_date=:d
        ORDER BY s.symbol, s.ts DESC
        """,
        {"d": trade_date},
    )

    # cross-sectional peer divergence by sector (residual 30m)
    sector_map: Dict[str, List[Dict[str, Any]]] = {}
    for row in stocks:
        sector_map.setdefault(str(row.get("sector_name") or "UNKNOWN"), []).append(row)

    for row in stocks:
        feats = dict(row)
        single = detect_single_stock_anomalies({**feats, "symbol": row["symbol"]}, thresholds)
        for a in single:
            exec_text(
                conn,
                """
                INSERT INTO nse_reco.anomaly_event(trade_date, ts, scope, key, severity, score, reason, details)
                VALUES(:d, :ts, :scope, :key, :sev, :score, :reason, CAST(:details AS jsonb))
                ON CONFLICT DO NOTHING;
                """,
                {
                    "d": trade_date,
                    "ts": row["ts"],
                    "scope": a.scope,
                    "key": a.key,
                    "sev": a.severity,
                    "score": a.score,
                    "reason": a.reason,
                    "details": json.dumps(a.details, default=str),
                },
            )
            inserted += 1

    # sector divergence: if one stock residual far from sector median
    for sector, rows in sector_map.items():
        if len(rows) < 4:
            continue
        residuals = sorted(float(r.get("residual_ret_30m_pct") or 0.0) for r in rows)
        median = residuals[len(residuals) // 2]
        for r in rows:
            rr = float(r.get("residual_ret_30m_pct") or 0.0)
            delta = abs(rr - median)
            if delta >= 1.0:
                sev = "severe" if delta >= 1.5 else "warn"
                exec_text(
                    conn,
                    """
                    INSERT INTO nse_reco.anomaly_event(trade_date, ts, scope, key, severity, score, reason, details)
                    VALUES(:d, :ts, 'cross_section', :key, :sev, :score, 'sector_residual_divergence', CAST(:details AS jsonb))
                    ON CONFLICT DO NOTHING;
                    """,
                    {
                        "d": trade_date,
                        "ts": r["ts"],
                        "key": r["symbol"],
                        "sev": sev,
                        "score": delta,
                        "details": json.dumps({"sector": sector, "median_residual_30m_pct": median, "residual_30m_pct": rr, "delta": delta}, default=str),
                    },
                )
                inserted += 1

    return inserted


def refresh_recommendations(conn: Connection, *, trade_date: str, index_code: str, horizon: str, thresholds: Dict[str, Any]) -> int:
    # load regime
    reg = fetch_one(
        conn,
        """
        SELECT regime, direction
        FROM nse_reco.market_regime_snapshot
        WHERE trade_date=:d AND index_code=:idx
        """,
        {"d": trade_date, "idx": index_code},
    )
    if not reg:
        raise RuntimeError("Regime snapshot missing; run regime step first")

    regime = str(reg["regime"])
    direction = str(reg["direction"])

    # events optional
    events = {}
    if fetch_one(conn, "SELECT to_regclass('integration.v_events_daily') as r") and fetch_one(conn, "SELECT to_regclass('integration.v_events_daily') as r").get("r"):
        ev_rows = fetch_all(conn, "SELECT symbol, event_count, event_tags FROM integration.v_events_daily WHERE trade_date=:d", {"d": trade_date})
        for r in ev_rows:
            events[str(r["symbol"])] = {"event_count": int(r.get("event_count") or 0), "event_tags": r.get("event_tags")}

    # latest features per symbol
    stocks = fetch_all(
        conn,
        """
        SELECT DISTINCT ON (s.symbol)
          s.trade_date, s.ts, s.minute_of_day, s.symbol, s.sector_name,
          s.close, s.vwap, s.volume, s.index_close, s.beta,
          s.residual_ret_5m_pct, s.residual_ret_15m_pct, s.residual_ret_30m_pct, s.residual_ret_60m_pct,
          s.time_above_vwap_pct, s.vwap_deviation_pct, s.volume_surprise_z, s.range_efficiency, s.close_location,
          COALESCE(s.vwap_cross_count, 0) AS vwap_cross_count,
          COALESCE(s.volume_ratio, NULL) AS volume_ratio
        FROM integration.v_security_minute_feature s
        JOIN integration.v_universe_membership u
          ON u.trade_date=s.trade_date AND u.symbol=s.symbol AND u.is_active=true
        WHERE s.trade_date=:d
        ORDER BY s.symbol, s.ts DESC
        """,
        {"d": trade_date},
    )
    if not stocks:
        return 0

    # anomalies at latest minute for penalties
    anom_rows = fetch_all(
        conn,
        """
        SELECT key, max(CASE WHEN severity='severe' THEN 2 WHEN severity='warn' THEN 1 ELSE 0 END) AS sev
        FROM nse_reco.anomaly_event
        WHERE trade_date=:d AND ts=(SELECT max(ts) FROM integration.v_security_minute_feature WHERE trade_date=:d)
        GROUP BY key
        """,
        {"d": trade_date},
    )
    anom_sev = {str(r["key"]): int(r["sev"]) for r in anom_rows}

    upserts = []
    for row in stocks:
        sym = str(row["symbol"])
        ev = events.get(sym, {})
        event_count = ev.get("event_count")

        signal = infer_signal(row, thresholds, event_count=event_count)

        fit_pts = float(regime_signal_fit(regime, signal.signal_family))

        # penalties
        beta = abs(float(row.get("beta") or 1.0))
        risk_penalty = 4.0 + max(0.0, beta - 1.0) * 3.0
        # penalize noisy path in breakout setups
        if signal.signal_family == "breakout_continuation" and float(row.get("range_efficiency") or 0.5) < 0.55:
            risk_penalty += 4.0

        # anomaly penalty
        sev = anom_sev.get(sym, 0)
        anomaly_penalty = 0.0
        if sev == 1:
            anomaly_penalty = 10.0
        elif sev >= 2:
            anomaly_penalty = 25.0

        # historical edge
        edge_pts, edge_meta = historical_edge_points(conn, horizon=horizon, regime=regime, signal_family=signal.signal_family, thresholds=thresholds)

        final_score, action, accent_token, arrow = score_action(
            regime=regime,
            direction=direction,
            signal=signal,
            historical_edge_pts=edge_pts,
            risk_penalty_pts=risk_penalty,
            anomaly_penalty_pts=anomaly_penalty,
            thresholds=thresholds,
        )

        explanation = {
            "reasons": signal.reasons,
            "flags": signal.flags,
            "edge_meta": edge_meta,
            "penalties": {"risk": risk_penalty, "anomaly": anomaly_penalty},
            "regime_fit": fit_pts,
            "features": {
                "residual_ret_15m_pct": float(row.get("residual_ret_15m_pct") or 0.0),
                "residual_ret_30m_pct": float(row.get("residual_ret_30m_pct") or 0.0),
                "time_above_vwap_pct": float(row.get("time_above_vwap_pct") or 0.0),
                "volume_surprise_z": float(row.get("volume_surprise_z") or 0.0),
                "range_efficiency": float(row.get("range_efficiency") or 0.0),
                "close_location": float(row.get("close_location") or 0.0),
            },
            "event": ev,
        }

        upserts.append(
            {
                "d": trade_date,
                "idx": index_code,
                "h": horizon,
                "sym": sym,
                "ts": row["ts"],
                "sf": signal.signal_family,
                "sq": signal.signal_quality,
                "rf": fit_pts,  # stored separately; computed in score_action via matrix, not persisted here
                "he": edge_pts,
                "rp": risk_penalty,
                "ap": anomaly_penalty,
                "fs": final_score,
                "act": action,
                "dir": direction,
                "acc": accent_token,
                "arr": arrow,
                "exp": json.dumps(explanation, default=str),
            }
        )

    sql_upsert = """
    INSERT INTO nse_reco.recommendation_snapshot(
      trade_date, index_code, horizon, symbol, asof_ts,
      signal_family, signal_quality, regime_fit, historical_edge, risk_penalty, anomaly_penalty,
      final_score, action, direction, accent_token, arrow, explanation, updated_at
    )
    VALUES(
      :d, :idx, :h, :sym, :ts,
      :sf, :sq, :rf, :he, :rp, :ap,
      :fs, :act, :dir, :acc, :arr, CAST(:exp AS jsonb), now()
    )
    ON CONFLICT (trade_date, index_code, horizon, symbol) DO UPDATE SET
      asof_ts=EXCLUDED.asof_ts,
      signal_family=EXCLUDED.signal_family,
      signal_quality=EXCLUDED.signal_quality,
      regime_fit=EXCLUDED.regime_fit,
      historical_edge=EXCLUDED.historical_edge,
      risk_penalty=EXCLUDED.risk_penalty,
      anomaly_penalty=EXCLUDED.anomaly_penalty,
      final_score=EXCLUDED.final_score,
      action=EXCLUDED.action,
      direction=EXCLUDED.direction,
      accent_token=EXCLUDED.accent_token,
      arrow=EXCLUDED.arrow,
      explanation=EXCLUDED.explanation,
      updated_at=now();
    """

    # use executemany


    # bulk upsert
    run_many(conn, sql_upsert, upserts)

    return len(upserts)


def refresh_quality_checks(conn: Connection, *, trade_date: str, index_code: str, horizon: str) -> int:
    checks = []
    # contract
    row = fetch_one(conn, "SELECT ok, message, missing FROM nse_reco_ops.contract_check()")
    checks.append(("contract", "PASS" if row and row.get("ok") else "FAIL", json.dumps({"missing": row.get("missing") if row else None}, default=str)))

    # reco exists
    r = fetch_one(
        conn,
        "SELECT count(*) AS c, max(asof_ts) AS ts FROM nse_reco.recommendation_snapshot WHERE trade_date=:d AND index_code=:idx AND horizon=:h",
        {"d": trade_date, "idx": index_code, "h": horizon},
    )
    c = int(r["c"]) if r else 0
    checks.append(("recommendations_rowcount", "PASS" if c >= 50 else "WARN" if c > 0 else "FAIL", json.dumps({"count": c, "asof_ts": str(r.get("ts")) if r else None}, default=str)))

    # regime exists
    reg = fetch_one(conn, "SELECT regime FROM nse_reco.market_regime_snapshot WHERE trade_date=:d AND index_code=:idx", {"d": trade_date, "idx": index_code})
    checks.append(("regime_present", "PASS" if reg else "FAIL", json.dumps({"regime": reg.get("regime") if reg else None}, default=str)))

    inserted = 0
    for name, status, meta in checks:
        exec_text(
            conn,
            """
            INSERT INTO nse_reco_ops.quality_check_result(trade_date, check_name, status, detail, meta)
            VALUES(:d, :n, :s, :detail, CAST(:m AS jsonb))
            """,
            {"d": trade_date, "n": name, "s": status, "detail": status, "m": meta},
        )
        inserted += 1
    return inserted


def apply_retention(conn: Connection, retention_days: int) -> None:
    exec_text(conn, "SELECT nse_reco_ops.apply_retention(:d)", {"d": retention_days})


def run_chain(conn: Connection, *, trade_date: str, index_code: str, horizon: str, thresholds: Dict[str, Any], steps: List[str]) -> Dict[str, Any]:
    contract_check_or_raise(conn)

    out: Dict[str, Any] = {}
    if "baselines" in steps:
        out["baselines"] = refresh_baselines(conn, trade_date=trade_date, index_code=index_code)
    if "regime" in steps:
        out["regime"] = refresh_regime(conn, trade_date=trade_date, index_code=index_code, thresholds=thresholds)
    if "anomalies" in steps:
        out["anomalies"] = {"inserted": refresh_anomalies(conn, trade_date=trade_date, index_code=index_code, thresholds=thresholds)}
    if "recommendations" in steps:
        out["recommendations"] = {"upserted": refresh_recommendations(conn, trade_date=trade_date, index_code=index_code, horizon=horizon, thresholds=thresholds)}
    if "scorecards" in steps:
        out["scorecards"] = {"updated": refresh_scorecards(conn, index_code=index_code)}
    if "watchlists" in steps:
        out["watchlists"] = {"updated": refresh_watchlists(conn, trade_date=trade_date, index_code=index_code)}
    if "quality" in steps:
        out["quality"] = {"inserted": refresh_quality_checks(conn, trade_date=trade_date, index_code=index_code, horizon=horizon)}
    if "retention" in steps:
        apply_retention(conn, settings.RETENTION_DAYS)
        out["retention"] = {"days": settings.RETENTION_DAYS}
    return out
