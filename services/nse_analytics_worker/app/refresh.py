from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from .config import Settings
from .db import execute, fetch_value, start_job_step, finish_job_step, query_df
from .backtesting import refresh_backtesting_snapshots
from .indicator_strategy import refresh_indicator_strategy_snapshots

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RefreshWindow:
    max_trade_date: Any
    start_date: Any
    base_start_date: Any


def determine_refresh_window(conn, settings: Settings) -> RefreshWindow:
    max_trade_date = fetch_value(conn, "SELECT MAX(trade_date) FROM nse.fact_eod_prices")
    if max_trade_date is None:
        raise RuntimeError("No rows found in nse.fact_eod_prices. Load raw data first.")
    start_date = max_trade_date - timedelta(days=settings.rebuild_window_days)
    base_start_date = start_date - timedelta(days=70)
    return RefreshWindow(max_trade_date=max_trade_date, start_date=start_date, base_start_date=base_start_date)


def refresh_security_features(conn, window: RefreshWindow) -> dict[str, Any]:
    logger.info("Refreshing security features from %s (base window starts %s)", window.start_date, window.base_start_date)
    execute(
        conn,
        """
        DELETE FROM nse_app.security_daily_features
        WHERE trade_date >= %(start_date)s
        """,
        {"start_date": window.start_date},
    )

    sql = """
    INSERT INTO nse_app.security_daily_features (
        trade_date, symbol, series, fininstrm_id, isin, security_name,
        close_price, prev_close, open_price, high_price, low_price,
        total_traded_qty, turnover_lacs, no_of_trades, deliverable_qty, deliverable_pct,
        current_day_daily_volatility, annualised_volatility,
        adjusted_52_week_high, adjusted_52_week_low,
        surveillance_non_default_flag_count,
        bulk_buy_qty, bulk_sell_qty, block_buy_qty, block_sell_qty,
        short_sell_qty, margin_financed_qty, margin_financed_amt_lakhs, avg_applicable_margin_rate,
        has_announcement, has_board_meeting, has_corporate_action,
        daily_return, gap_return, intraday_return, day_range_pct, close_location_value,
        distance_to_52w_high, distance_from_52w_low,
        ret_3d, ret_5d, ret_10d,
        avg_qty_20, avg_deliverable_pct_20, avg_daily_return_60, stdev_daily_return_60,
        volume_rel_20, delivery_rel_20, return_z_60,
        prior_close_max_20, prior_close_min_20,
        breakout_20d_flag, breakdown_20d_flag, high_volume_flag, high_delivery_flag,
        fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d,
        composite_trend_score, composite_reversal_score, composite_anomaly_score, composite_risk_score
    )
    WITH bulk AS (
        SELECT
            trade_date,
            symbol,
            SUM(CASE WHEN UPPER(side) LIKE 'BUY%%' THEN COALESCE(quantity_traded, 0) ELSE 0 END) AS bulk_buy_qty,
            SUM(CASE WHEN UPPER(side) LIKE 'SELL%%' THEN COALESCE(quantity_traded, 0) ELSE 0 END) AS bulk_sell_qty
        FROM nse.fact_bulk_deals
        WHERE trade_date >= %(base_start_date)s
        GROUP BY 1,2
    ),
    block AS (
        SELECT
            trade_date,
            symbol,
            SUM(CASE WHEN UPPER(side) LIKE 'BUY%%' THEN COALESCE(quantity_traded, 0) ELSE 0 END) AS block_buy_qty,
            SUM(CASE WHEN UPPER(side) LIKE 'SELL%%' THEN COALESCE(quantity_traded, 0) ELSE 0 END) AS block_sell_qty
        FROM nse.fact_block_deals
        WHERE trade_date >= %(base_start_date)s
        GROUP BY 1,2
    ),
    shorts AS (
        SELECT
            trade_date,
            symbol,
            SUM(COALESCE(quantity, 0)) AS short_sell_qty
        FROM nse.fact_short_selling
        WHERE trade_date >= %(base_start_date)s
        GROUP BY 1,2
    ),
    margin_scrip AS (
        SELECT
            report_date AS trade_date,
            symbol,
            SUM(COALESCE(qty_financed, 0)) AS margin_financed_qty,
            SUM(COALESCE(amt_financed_lakhs, 0)) AS margin_financed_amt_lakhs
        FROM nse.fact_margin_trading_scrip
        WHERE report_date >= %(base_start_date)s
        GROUP BY 1,2
    ),
    varm AS (
        SELECT
            report_date AS trade_date,
            symbol,
            AVG(COALESCE(applicable_margin_rate, 0)) AS avg_applicable_margin_rate
        FROM nse.fact_var_margin
        WHERE report_date >= %(base_start_date)s
        GROUP BY 1,2
    ),
    events AS (
        SELECT
            report_date AS trade_date,
            symbol,
            BOOL_OR(event_type = 'announcement') AS has_announcement,
            BOOL_OR(event_type = 'board_meeting') AS has_board_meeting
        FROM nse.fact_text_events
        WHERE report_date >= %(base_start_date)s
          AND symbol IS NOT NULL
        GROUP BY 1,2
    ),
    corp AS (
        SELECT
            ex_date AS trade_date,
            symbol,
            COALESCE(series, '') AS series,
            TRUE AS has_corporate_action
        FROM nse.fact_corporate_actions
        WHERE ex_date >= %(base_start_date)s
        GROUP BY 1,2,3,4
    ),
    base AS (
        SELECT
            s.trade_date,
            s.symbol,
            COALESCE(s.series, '') AS series,
            s.fininstrm_id,
            s.isin,
            s.security_name,
            s.close_price,
            s.prev_close,
            s.open_price,
            s.high_price,
            s.low_price,
            s.total_traded_qty,
            s.turnover_lacs,
            s.no_of_trades,
            s.deliverable_qty,
            s.deliverable_pct,
            s.current_day_daily_volatility,
            s.annualised_volatility,
            s.adjusted_52_week_high,
            s.adjusted_52_week_low,
            COALESCE(s.daily_return, CASE WHEN s.prev_close IS NOT NULL AND s.prev_close <> 0 THEN (s.close_price - s.prev_close) / s.prev_close END) AS daily_return,
            COALESCE(s.gap_return, CASE WHEN s.prev_close IS NOT NULL AND s.prev_close <> 0 THEN (s.open_price - s.prev_close) / s.prev_close END) AS gap_return,
            COALESCE(s.intraday_return, CASE WHEN s.open_price IS NOT NULL AND s.open_price <> 0 THEN (s.close_price - s.open_price) / s.open_price END) AS intraday_return,
            COALESCE(s.day_range_pct, CASE WHEN s.low_price IS NOT NULL AND s.low_price <> 0 THEN (s.high_price - s.low_price) / s.low_price END) AS day_range_pct,
            COALESCE(s.close_location_value, CASE WHEN s.high_price IS NOT NULL AND s.low_price IS NOT NULL AND s.high_price <> s.low_price THEN (s.close_price - s.low_price) / NULLIF(s.high_price - s.low_price, 0) END) AS close_location_value,
            COALESCE(s.distance_to_52w_high, CASE WHEN s.adjusted_52_week_high IS NOT NULL AND s.adjusted_52_week_high <> 0 THEN (s.adjusted_52_week_high - s.close_price) / s.adjusted_52_week_high END) AS distance_to_52w_high,
            COALESCE(s.distance_from_52w_low, CASE WHEN s.adjusted_52_week_low IS NOT NULL AND s.adjusted_52_week_low <> 0 THEN (s.close_price - s.adjusted_52_week_low) / s.adjusted_52_week_low END) AS distance_from_52w_low,
            COALESCE((
                SELECT si.non_default_flag_count
                FROM nse.fact_surveillance_indicators si
                WHERE si.symbol = s.symbol
                  AND COALESCE(si.series, '') = COALESCE(s.series, '')
                  AND si.source_version = 'REG1'
                  AND si.report_date < s.trade_date
                ORDER BY si.report_date DESC
                LIMIT 1
            ), 0) AS surveillance_non_default_flag_count,
            COALESCE(b.bulk_buy_qty, 0) AS bulk_buy_qty,
            COALESCE(b.bulk_sell_qty, 0) AS bulk_sell_qty,
            COALESCE(bl.block_buy_qty, 0) AS block_buy_qty,
            COALESCE(bl.block_sell_qty, 0) AS block_sell_qty,
            COALESCE(sh.short_sell_qty, 0) AS short_sell_qty,
            COALESCE(ms.margin_financed_qty, 0) AS margin_financed_qty,
            COALESCE(ms.margin_financed_amt_lakhs, 0) AS margin_financed_amt_lakhs,
            COALESCE(vm.avg_applicable_margin_rate, 0) AS avg_applicable_margin_rate,
            COALESCE(ev.has_announcement, FALSE) AS has_announcement,
            COALESCE(ev.has_board_meeting, FALSE) AS has_board_meeting,
            COALESCE(ca.has_corporate_action, FALSE) AS has_corporate_action
        FROM nse.vw_stock_features_daily s
        LEFT JOIN bulk b
          ON b.trade_date = s.trade_date
         AND b.symbol = s.symbol
        LEFT JOIN block bl
          ON bl.trade_date = s.trade_date
         AND bl.symbol = s.symbol
        LEFT JOIN shorts sh
          ON sh.trade_date = s.trade_date
         AND sh.symbol = s.symbol
        LEFT JOIN margin_scrip ms
          ON ms.trade_date = s.trade_date
         AND ms.symbol = s.symbol
        LEFT JOIN varm vm
          ON vm.trade_date = s.trade_date
         AND vm.symbol = s.symbol
        LEFT JOIN events ev
          ON ev.trade_date = s.trade_date
         AND ev.symbol = s.symbol
        LEFT JOIN corp ca
          ON ca.trade_date = s.trade_date
         AND ca.symbol = s.symbol
         AND ca.series = COALESCE(s.series, '')
        WHERE s.trade_date >= %(base_start_date)s
    ),
    feat AS (
        SELECT
            b.*,
            CASE WHEN LAG(b.close_price, 3) OVER w IS NOT NULL AND LAG(b.close_price, 3) OVER w <> 0
                 THEN (b.close_price - LAG(b.close_price, 3) OVER w) / LAG(b.close_price, 3) OVER w END AS ret_3d,
            CASE WHEN LAG(b.close_price, 5) OVER w IS NOT NULL AND LAG(b.close_price, 5) OVER w <> 0
                 THEN (b.close_price - LAG(b.close_price, 5) OVER w) / LAG(b.close_price, 5) OVER w END AS ret_5d,
            CASE WHEN LAG(b.close_price, 10) OVER w IS NOT NULL AND LAG(b.close_price, 10) OVER w <> 0
                 THEN (b.close_price - LAG(b.close_price, 10) OVER w) / LAG(b.close_price, 10) OVER w END AS ret_10d,
            AVG(b.total_traded_qty::numeric) OVER w20 AS avg_qty_20,
            AVG(b.deliverable_pct) OVER w20 AS avg_deliverable_pct_20,
            AVG(b.daily_return) OVER w60 AS avg_daily_return_60,
            STDDEV_SAMP(b.daily_return) OVER w60 AS stdev_daily_return_60,
            MAX(b.close_price) OVER w20 AS prior_close_max_20,
            MIN(b.close_price) OVER w20 AS prior_close_min_20,
            LEAD(b.close_price, 1) OVER w AS close_lead_1,
            LEAD(b.close_price, 3) OVER w AS close_lead_3,
            LEAD(b.close_price, 5) OVER w AS close_lead_5,
            LEAD(b.close_price, 10) OVER w AS close_lead_10
        FROM base b
        WINDOW
            w AS (PARTITION BY b.symbol, b.series ORDER BY b.trade_date),
            w20 AS (PARTITION BY b.symbol, b.series ORDER BY b.trade_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING),
            w60 AS (PARTITION BY b.symbol, b.series ORDER BY b.trade_date ROWS BETWEEN 60 PRECEDING AND 1 PRECEDING)
    )
    SELECT
        trade_date, symbol, series, fininstrm_id, isin, security_name,
        close_price, prev_close, open_price, high_price, low_price,
        total_traded_qty, turnover_lacs, no_of_trades, deliverable_qty, deliverable_pct,
        current_day_daily_volatility, annualised_volatility,
        adjusted_52_week_high, adjusted_52_week_low,
        surveillance_non_default_flag_count,
        bulk_buy_qty, bulk_sell_qty, block_buy_qty, block_sell_qty,
        short_sell_qty, margin_financed_qty, margin_financed_amt_lakhs, avg_applicable_margin_rate,
        has_announcement, has_board_meeting, has_corporate_action,
        daily_return, gap_return, intraday_return, day_range_pct, close_location_value,
        distance_to_52w_high, distance_from_52w_low,
        ret_3d, ret_5d, ret_10d,
        avg_qty_20, avg_deliverable_pct_20, avg_daily_return_60, stdev_daily_return_60,
        CASE WHEN avg_qty_20 IS NOT NULL AND avg_qty_20 <> 0 THEN total_traded_qty::numeric / avg_qty_20 END AS volume_rel_20,
        CASE WHEN avg_deliverable_pct_20 IS NOT NULL AND avg_deliverable_pct_20 <> 0 THEN deliverable_pct / avg_deliverable_pct_20 END AS delivery_rel_20,
        CASE WHEN stdev_daily_return_60 IS NOT NULL AND stdev_daily_return_60 <> 0
             THEN (daily_return - avg_daily_return_60) / stdev_daily_return_60 END AS return_z_60,
        prior_close_max_20, prior_close_min_20,
        CASE WHEN prior_close_max_20 IS NOT NULL AND close_price > prior_close_max_20 THEN TRUE ELSE FALSE END AS breakout_20d_flag,
        CASE WHEN prior_close_min_20 IS NOT NULL AND close_price < prior_close_min_20 THEN TRUE ELSE FALSE END AS breakdown_20d_flag,
        CASE WHEN avg_qty_20 IS NOT NULL AND avg_qty_20 <> 0 AND total_traded_qty::numeric / avg_qty_20 >= 1.5 THEN TRUE ELSE FALSE END AS high_volume_flag,
        CASE WHEN avg_deliverable_pct_20 IS NOT NULL AND avg_deliverable_pct_20 <> 0 AND deliverable_pct / avg_deliverable_pct_20 >= 1.15 THEN TRUE ELSE FALSE END AS high_delivery_flag,
        CASE WHEN close_lead_1 IS NOT NULL AND close_price IS NOT NULL AND close_price <> 0 THEN (close_lead_1 - close_price) / close_price END AS fwd_return_1d,
        CASE WHEN close_lead_3 IS NOT NULL AND close_price IS NOT NULL AND close_price <> 0 THEN (close_lead_3 - close_price) / close_price END AS fwd_return_3d,
        CASE WHEN close_lead_5 IS NOT NULL AND close_price IS NOT NULL AND close_price <> 0 THEN (close_lead_5 - close_price) / close_price END AS fwd_return_5d,
        CASE WHEN close_lead_10 IS NOT NULL AND close_price IS NOT NULL AND close_price <> 0 THEN (close_lead_10 - close_price) / close_price END AS fwd_return_10d,
        (
            (CASE WHEN prior_close_max_20 IS NOT NULL AND close_price > prior_close_max_20 THEN 1.5 ELSE 0 END) +
            (CASE WHEN COALESCE(daily_return, 0) > 0 THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(ret_5d, 0) > 0 THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(close_location_value, 0) >= 0.75 THEN 0.75 ELSE 0 END) +
            (CASE WHEN COALESCE(avg_qty_20, 0) > 0 AND total_traded_qty::numeric / avg_qty_20 >= 1.5 THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(distance_to_52w_high, 1) <= 0.05 THEN 0.75 ELSE 0 END)
        ) AS composite_trend_score,
        (
            (CASE WHEN COALESCE(daily_return, 0) <= -0.03 THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(close_location_value, 0) >= 0.70 THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(avg_qty_20, 0) > 0 AND total_traded_qty::numeric / avg_qty_20 >= 1.2 THEN 0.75 ELSE 0 END) +
            (CASE WHEN COALESCE(short_sell_qty, 0) > 0 THEN 0.5 ELSE 0 END)
        ) AS composite_reversal_score,
        (
            (CASE WHEN ABS(COALESCE((CASE WHEN stdev_daily_return_60 IS NOT NULL AND stdev_daily_return_60 <> 0 THEN (daily_return - avg_daily_return_60) / stdev_daily_return_60 END), 0)) >= 2.5 THEN 1.5 ELSE 0 END) +
            (CASE WHEN COALESCE(avg_qty_20, 0) > 0 AND total_traded_qty::numeric / avg_qty_20 >= 2 THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(avg_deliverable_pct_20, 0) > 0 AND deliverable_pct / avg_deliverable_pct_20 >= 1.4 THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(surveillance_non_default_flag_count, 0) > 0 THEN 1 ELSE 0 END)
        ) AS composite_anomaly_score,
        (
            (CASE WHEN COALESCE(surveillance_non_default_flag_count, 0) > 0 THEN 2 ELSE 0 END) +
            (CASE WHEN COALESCE(avg_applicable_margin_rate, 0) >= 30 THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(short_sell_qty, 0) > GREATEST(COALESCE(avg_qty_20, 0) * 0.10, 1000) THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(margin_financed_qty, 0) > GREATEST(COALESCE(avg_qty_20, 0) * 0.20, 10000) THEN 1 ELSE 0 END)
        ) AS composite_risk_score
    FROM feat
    WHERE trade_date >= %(start_date)s
    """
    execute(
        conn,
        sql,
        {
            "start_date": window.start_date,
            "base_start_date": window.base_start_date,
        },
    )
    rows = fetch_value(conn, "SELECT COUNT(*) FROM nse_app.security_daily_features WHERE trade_date >= %(start_date)s", {"start_date": window.start_date})
    return {"features_rows_recent_window": int(rows or 0), "feature_start_date": str(window.start_date), "feature_max_date": str(window.max_trade_date)}


def refresh_signals(conn, window: RefreshWindow) -> dict[str, Any]:
    logger.info("Refreshing stock analysis signals from %s", window.start_date)
    execute(
        conn,
        """
        DELETE FROM nse_app.stock_analysis_signals_daily
        WHERE trade_date >= %(start_date)s
        """,
        {"start_date": window.start_date},
    )
    sql = """
    INSERT INTO nse_app.stock_analysis_signals_daily (
        trade_date, symbol, series, analysis_type, signal_name, signal_direction,
        signal_strength, rationale, daily_return, volume_rel_20, delivery_rel_20,
        short_sell_qty, bulk_net_qty, block_net_qty, avg_applicable_margin_rate,
        surveillance_non_default_flag_count, fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
    )
    WITH f AS (
        SELECT *,
               COALESCE(bulk_buy_qty, 0) - COALESCE(bulk_sell_qty, 0) AS bulk_net_qty,
               COALESCE(block_buy_qty, 0) - COALESCE(block_sell_qty, 0) AS block_net_qty
        FROM nse_app.security_daily_features
        WHERE trade_date >= %(start_date)s
    )
    SELECT
        trade_date, symbol, series, analysis_type, signal_name, signal_direction,
        signal_strength, rationale, daily_return, volume_rel_20, delivery_rel_20,
        short_sell_qty, bulk_net_qty, block_net_qty, avg_applicable_margin_rate,
        surveillance_non_default_flag_count, fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
    FROM (
        SELECT
            trade_date, symbol, series,
            'momentum_breakout'::text AS analysis_type,
            'breakout_20d'::text AS signal_name,
            'bullish'::text AS signal_direction,
            ROUND(COALESCE(composite_trend_score, 0), 4) AS signal_strength,
            'Close above prior 20-day closing range with expanding participation'::text AS rationale,
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE breakout_20d_flag = TRUE
          AND COALESCE(volume_rel_20, 0) >= 1.2

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'momentum_breakout', 'near_52w_high', 'bullish',
            ROUND(COALESCE(composite_trend_score, 0) + 0.5, 4),
            'Trading close to adjusted 52-week high with acceptable participation',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE COALESCE(distance_to_52w_high, 1) <= 0.02
          AND COALESCE(volume_rel_20, 0) >= 1.1

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'momentum_breakout', 'breakdown_20d', 'bearish',
            ROUND(COALESCE(composite_trend_score, 0) + 0.5, 4),
            'Close below prior 20-day closing range with weakness confirmation',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE breakdown_20d_flag = TRUE
          AND COALESCE(volume_rel_20, 0) >= 1.2

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'mean_reversion', 'exhaustion_reversal_up', 'bullish',
            ROUND(COALESCE(composite_reversal_score, 0), 4),
            'Large down day that closes well off the lows with active participation',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE COALESCE(daily_return, 0) <= -0.03
          AND COALESCE(close_location_value, 0) >= 0.70
          AND COALESCE(volume_rel_20, 0) >= 1.2

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'mean_reversion', 'exhaustion_reversal_down', 'bearish',
            ROUND(COALESCE(composite_reversal_score, 0), 4),
            'Large up day that closes near the lows, often a sign of upside exhaustion',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE COALESCE(daily_return, 0) >= 0.03
          AND COALESCE(close_location_value, 1) <= 0.30
          AND COALESCE(volume_rel_20, 0) >= 1.2

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'delivery_conviction', 'accumulation', 'bullish',
            ROUND(COALESCE(volume_rel_20, 0) + COALESCE(delivery_rel_20, 0), 4),
            'Price up with strong volume and elevated delivery participation',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE COALESCE(daily_return, 0) > 0.01
          AND COALESCE(volume_rel_20, 0) >= 1.5
          AND COALESCE(delivery_rel_20, 0) >= 1.1

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'delivery_conviction', 'distribution', 'bearish',
            ROUND(COALESCE(volume_rel_20, 0) + COALESCE(delivery_rel_20, 0), 4),
            'Price down with strong volume and elevated delivery participation',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE COALESCE(daily_return, 0) < -0.01
          AND COALESCE(volume_rel_20, 0) >= 1.5
          AND COALESCE(delivery_rel_20, 0) >= 1.1

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'delivery_conviction', 'speculative_rise', 'caution',
            ROUND(COALESCE(volume_rel_20, 0) + COALESCE(2 - delivery_rel_20, 0), 4),
            'Price up with high activity but weak delivery confirmation',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE COALESCE(daily_return, 0) > 0.02
          AND COALESCE(volume_rel_20, 0) >= 1.5
          AND COALESCE(delivery_rel_20, 1) < 0.9

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'event_flow', 'bulk_buy_support', 'bullish',
            ROUND(COALESCE(volume_rel_20, 0) + 0.5, 4),
            'Bulk-deal net buying present on the day',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE bulk_net_qty > GREATEST(COALESCE(avg_qty_20, 0) * 0.25, 10000)

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'event_flow', 'bulk_sell_pressure', 'bearish',
            ROUND(COALESCE(volume_rel_20, 0) + 0.5, 4),
            'Bulk-deal net selling present on the day',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE bulk_net_qty < -GREATEST(COALESCE(avg_qty_20, 0) * 0.25, 10000)

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'event_flow', 'block_buy_interest', 'bullish',
            ROUND(COALESCE(volume_rel_20, 0) + 0.5, 4),
            'Block-deal net buying present on the day',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE block_net_qty > GREATEST(COALESCE(avg_qty_20, 0) * 0.25, 10000)

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'event_flow', 'short_build_up', 'bearish',
            ROUND(COALESCE(composite_risk_score, 0), 4),
            'Meaningful short-selling quantity with a weak closing day',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE short_sell_qty > GREATEST(COALESCE(avg_qty_20, 0) * 0.10, 1000)
          AND COALESCE(daily_return, 0) < 0

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'event_flow', 'short_cover_candidate', 'bullish',
            ROUND(COALESCE(composite_reversal_score, 0) + 0.5, 4),
            'Short-selling present but price closes strong, often a squeeze watch',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE short_sell_qty > GREATEST(COALESCE(avg_qty_20, 0) * 0.10, 1000)
          AND COALESCE(daily_return, 0) > 0.02
          AND COALESCE(close_location_value, 0) >= 0.70

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'event_flow', 'announcement_watch', 'caution',
            1.0,
            'Announcement present for the symbol',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE has_announcement = TRUE

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'event_flow', 'board_meeting_watch', 'caution',
            1.0,
            'Board meeting item present for the symbol',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE has_board_meeting = TRUE

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'event_flow', 'corporate_action_day', 'neutral',
            1.0,
            'Corporate-action date overlaps with this trade date',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE has_corporate_action = TRUE

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'anomaly', 'price_volume_anomaly', 'caution',
            ROUND(COALESCE(composite_anomaly_score, 0), 4),
            'Large return relative to baseline with unusual activity',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE ABS(COALESCE(return_z_60, 0)) >= 2.5
          AND COALESCE(volume_rel_20, 0) >= 1.5

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'anomaly', 'delivery_spike_anomaly', 'caution',
            ROUND(COALESCE(composite_anomaly_score, 0), 4),
            'Delivery participation spikes far above the trailing baseline',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE COALESCE(delivery_rel_20, 0) >= 1.4
          AND COALESCE(volume_rel_20, 0) >= 1.3

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'risk', 'surveillance_caution', 'caution',
            ROUND(COALESCE(composite_risk_score, 0), 4),
            'Lagged surveillance file indicates one or more non-default caution flags',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE COALESCE(surveillance_non_default_flag_count, 0) > 0

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'risk', 'margin_risk', 'caution',
            ROUND(COALESCE(composite_risk_score, 0), 4),
            'Applicable margin rate is elevated',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE COALESCE(avg_applicable_margin_rate, 0) >= 30

        UNION ALL

        SELECT
            trade_date, symbol, series,
            'risk', 'financed_crowding', 'caution',
            ROUND(COALESCE(composite_risk_score, 0), 4),
            'Margin-financed quantity is meaningful versus the trailing baseline',
            daily_return, volume_rel_20, delivery_rel_20, short_sell_qty, bulk_net_qty, block_net_qty,
            avg_applicable_margin_rate, surveillance_non_default_flag_count,
            fwd_return_1d, fwd_return_3d, fwd_return_5d, fwd_return_10d
        FROM f
        WHERE margin_financed_qty > GREATEST(COALESCE(avg_qty_20, 0) * 0.20, 10000)
    ) unioned
    """
    execute(conn, sql, {"start_date": window.start_date})
    rows = fetch_value(conn, "SELECT COUNT(*) FROM nse_app.stock_analysis_signals_daily WHERE trade_date >= %(start_date)s", {"start_date": window.start_date})
    return {"signals_rows_recent_window": int(rows or 0), "signals_start_date": str(window.start_date)}


def refresh_market_summary(conn, window: RefreshWindow) -> dict[str, Any]:
    logger.info("Refreshing market summary from %s", window.start_date)
    execute(
        conn,
        """
        DELETE FROM nse_app.market_summary_daily
        WHERE trade_date >= %(start_date)s
        """,
        {"start_date": window.start_date},
    )
    sql = """
    INSERT INTO nse_app.market_summary_daily (
        trade_date, securities_count, advancers, decliners, unchanged, positive_ratio,
        avg_daily_return, median_daily_return, total_turnover_lacs, avg_volume_rel_20, avg_delivery_rel_20,
        breakout_count, breakdown_count, accumulation_count, distribution_count, event_count, anomaly_count, risk_count,
        near_52w_high_count, near_52w_low_count, surveillance_flagged_count,
        nifty_close, nifty_return, market_regime
    )
    WITH f AS (
        SELECT *
        FROM nse_app.security_daily_features
        WHERE trade_date >= %(start_date)s
    ),
    sig AS (
        SELECT
            trade_date,
            COUNT(*) FILTER (WHERE analysis_type = 'momentum_breakout' AND signal_name IN ('breakout_20d', 'near_52w_high')) AS breakout_count,
            COUNT(*) FILTER (WHERE analysis_type = 'momentum_breakout' AND signal_name = 'breakdown_20d') AS breakdown_count,
            COUNT(*) FILTER (WHERE analysis_type = 'delivery_conviction' AND signal_name = 'accumulation') AS accumulation_count,
            COUNT(*) FILTER (WHERE analysis_type = 'delivery_conviction' AND signal_name = 'distribution') AS distribution_count,
            COUNT(*) FILTER (WHERE analysis_type = 'event_flow') AS event_count,
            COUNT(*) FILTER (WHERE analysis_type = 'anomaly') AS anomaly_count,
            COUNT(*) FILTER (WHERE analysis_type = 'risk') AS risk_count
        FROM nse_app.stock_analysis_signals_daily
        WHERE trade_date >= %(start_date)s
        GROUP BY 1
    ),
    nifty AS (
        SELECT
            trade_date,
            close_price AS nifty_close,
            CASE WHEN prev_close IS NOT NULL AND prev_close <> 0 THEN (close_price - prev_close) / prev_close END AS nifty_return
        FROM (
            SELECT
                trade_date,
                close_price,
                prev_close,
                ROW_NUMBER() OVER (
                    PARTITION BY trade_date
                    ORDER BY CASE
                        WHEN LOWER(index_name) = 'nifty 50' THEN 1
                        WHEN LOWER(index_name) LIKE 'nifty 50%%' THEN 2
                        ELSE 99
                    END
                ) AS rn
            FROM nse.fact_market_activity_index
            WHERE trade_date >= %(start_date)s
        ) x
        WHERE rn = 1
    )
    SELECT
        f.trade_date,
        COUNT(*) AS securities_count,
        COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) > 0) AS advancers,
        COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) < 0) AS decliners,
        COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) = 0) AS unchanged,
        CASE WHEN COUNT(*) = 0 THEN NULL
             ELSE COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) > 0)::numeric / COUNT(*)::numeric
        END AS positive_ratio,
        AVG(f.daily_return) AS avg_daily_return,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.daily_return) AS median_daily_return,
        SUM(f.turnover_lacs) AS total_turnover_lacs,
        AVG(f.volume_rel_20) AS avg_volume_rel_20,
        AVG(f.delivery_rel_20) AS avg_delivery_rel_20,
        COALESCE(s.breakout_count, 0) AS breakout_count,
        COALESCE(s.breakdown_count, 0) AS breakdown_count,
        COALESCE(s.accumulation_count, 0) AS accumulation_count,
        COALESCE(s.distribution_count, 0) AS distribution_count,
        COALESCE(s.event_count, 0) AS event_count,
        COALESCE(s.anomaly_count, 0) AS anomaly_count,
        COALESCE(s.risk_count, 0) AS risk_count,
        COUNT(*) FILTER (WHERE COALESCE(f.distance_to_52w_high, 1) <= 0.02) AS near_52w_high_count,
        COUNT(*) FILTER (WHERE COALESCE(f.distance_from_52w_low, 1) <= 0.02) AS near_52w_low_count,
        COUNT(*) FILTER (WHERE COALESCE(f.surveillance_non_default_flag_count, 0) > 0) AS surveillance_flagged_count,
        n.nifty_close,
        n.nifty_return,
        CASE
            WHEN AVG(COALESCE(f.daily_return, 0)) < -0.005
                 AND COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) < 0) > COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) > 0) * 1.5
                 AND COALESCE(s.breakdown_count, 0) >= COALESCE(s.breakout_count, 0)
            THEN 'risk_off'
            WHEN AVG(COALESCE(f.daily_return, 0)) > 0.005
                 AND COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) > 0) > COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) < 0) * 1.5
                 AND COALESCE(s.breakout_count, 0) >= COALESCE(s.breakdown_count, 0)
            THEN 'risk_on'
            WHEN COALESCE(s.anomaly_count, 0) > COUNT(*) * 0.08
                 OR COALESCE(s.risk_count, 0) > COUNT(*) * 0.05
            THEN 'stress'
            WHEN ABS(AVG(COALESCE(f.daily_return, 0))) < 0.002
                 AND ABS(
                     COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) > 0)
                     - COUNT(*) FILTER (WHERE COALESCE(f.daily_return, 0) < 0)
                 ) < COUNT(*) * 0.10
            THEN 'balanced'
            ELSE 'mixed'
        END AS market_regime
    FROM f
    LEFT JOIN sig s ON s.trade_date = f.trade_date
    LEFT JOIN nifty n ON n.trade_date = f.trade_date
    GROUP BY f.trade_date, s.breakout_count, s.breakdown_count, s.accumulation_count, s.distribution_count, s.event_count, s.anomaly_count, s.risk_count, n.nifty_close, n.nifty_return
    """
    execute(conn, sql, {"start_date": window.start_date})
    rows = fetch_value(conn, "SELECT COUNT(*) FROM nse_app.market_summary_daily WHERE trade_date >= %(start_date)s", {"start_date": window.start_date})
    return {"market_summary_rows_recent_window": int(rows or 0)}


def refresh_signal_performance(conn, window: RefreshWindow) -> dict[str, Any]:
    logger.info("Refreshing historical signal performance as of %s", window.max_trade_date)
    execute(
        conn,
        """
        DELETE FROM nse_app.signal_performance_summary
        WHERE as_of_date = %(as_of_date)s
        """,
        {"as_of_date": window.max_trade_date},
    )
    sql = """
    INSERT INTO nse_app.signal_performance_summary (
        as_of_date, analysis_type, signal_name, signal_direction, sample_size,
        hit_rate_1d, hit_rate_3d, hit_rate_5d, hit_rate_10d,
        avg_fwd_return_1d, avg_fwd_return_3d, avg_fwd_return_5d, avg_fwd_return_10d,
        median_fwd_return_5d
    )
    SELECT
        %(as_of_date)s AS as_of_date,
        analysis_type,
        signal_name,
        signal_direction,
        COUNT(*) FILTER (WHERE fwd_return_1d IS NOT NULL) AS sample_size,
        CASE
            WHEN signal_direction = 'bullish' THEN AVG(CASE WHEN fwd_return_1d > 0 THEN 1 ELSE 0 END::numeric)
            WHEN signal_direction = 'bearish' THEN AVG(CASE WHEN fwd_return_1d < 0 THEN 1 ELSE 0 END::numeric)
            ELSE NULL
        END AS hit_rate_1d,
        CASE
            WHEN signal_direction = 'bullish' THEN AVG(CASE WHEN fwd_return_3d > 0 THEN 1 ELSE 0 END::numeric)
            WHEN signal_direction = 'bearish' THEN AVG(CASE WHEN fwd_return_3d < 0 THEN 1 ELSE 0 END::numeric)
            ELSE NULL
        END AS hit_rate_3d,
        CASE
            WHEN signal_direction = 'bullish' THEN AVG(CASE WHEN fwd_return_5d > 0 THEN 1 ELSE 0 END::numeric)
            WHEN signal_direction = 'bearish' THEN AVG(CASE WHEN fwd_return_5d < 0 THEN 1 ELSE 0 END::numeric)
            ELSE NULL
        END AS hit_rate_5d,
        CASE
            WHEN signal_direction = 'bullish' THEN AVG(CASE WHEN fwd_return_10d > 0 THEN 1 ELSE 0 END::numeric)
            WHEN signal_direction = 'bearish' THEN AVG(CASE WHEN fwd_return_10d < 0 THEN 1 ELSE 0 END::numeric)
            ELSE NULL
        END AS hit_rate_10d,
        AVG(fwd_return_1d) AS avg_fwd_return_1d,
        AVG(fwd_return_3d) AS avg_fwd_return_3d,
        AVG(fwd_return_5d) AS avg_fwd_return_5d,
        AVG(fwd_return_10d) AS avg_fwd_return_10d,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fwd_return_5d) AS median_fwd_return_5d
    FROM nse_app.stock_analysis_signals_daily
    WHERE fwd_return_1d IS NOT NULL
    GROUP BY analysis_type, signal_name, signal_direction
    """
    execute(conn, sql, {"as_of_date": window.max_trade_date})
    rows = fetch_value(conn, "SELECT COUNT(*) FROM nse_app.signal_performance_summary WHERE as_of_date = %(as_of_date)s", {"as_of_date": window.max_trade_date})
    return {"signal_performance_rows": int(rows or 0), "performance_as_of_date": str(window.max_trade_date)}


def purge_old_analytics(conn, settings: Settings) -> dict[str, Any]:
    logger.info("Purging analytics tables using feature_retention_days=%s summary_retention_days=%s", settings.feature_retention_days, settings.summary_retention_days)
    execute(
        conn,
        """
        DELETE FROM nse_app.security_daily_features
        WHERE trade_date < CURRENT_DATE - (%(days)s::text || ' days')::interval
        """,
        {"days": settings.feature_retention_days},
    )
    execute(
        conn,
        """
        DELETE FROM nse_app.stock_analysis_signals_daily
        WHERE trade_date < CURRENT_DATE - (%(days)s::text || ' days')::interval
        """,
        {"days": settings.feature_retention_days},
    )
    execute(
        conn,
        """
        DELETE FROM nse_app.market_summary_daily
        WHERE trade_date < CURRENT_DATE - (%(days)s::text || ' days')::interval
        """,
        {"days": settings.summary_retention_days},
    )
    execute(
        conn,
        """
        DELETE FROM nse_app.signal_performance_summary
        WHERE as_of_date < CURRENT_DATE - (%(days)s::text || ' days')::interval
        """,
        {"days": settings.summary_retention_days},
    )
    execute(
        conn,
        """
        DELETE FROM nse_app.batch_run_audit
        WHERE generated_at < NOW() - (%(days)s::text || ' days')::interval
        """,
        {"days": settings.summary_retention_days},
    )
    execute(
        conn,
        """
        DELETE FROM nse_app.job_runs
        WHERE started_at < NOW() - (%(days)s::text || ' days')::interval
        """,
        {"days": settings.log_retention_days},
    )
    execute(
        conn,
        """
        DELETE FROM nse_app.quality_check_results
        WHERE checked_at < NOW() - (%(days)s::text || ' days')::interval
        """,
        {"days": settings.log_retention_days},
    )
    return {"purged": True}


def refresh_all_pipeline(conn, settings: Settings, job_run_id: int) -> dict[str, Any]:
    window = determine_refresh_window(conn, settings)
    metrics: dict[str, Any] = {
        "max_trade_date": str(window.max_trade_date),
        "rebuild_window_start": str(window.start_date),
        "base_window_start": str(window.base_start_date),
    }

    steps = [
        ("refresh_security_features", refresh_security_features),
        ("refresh_signals", refresh_signals),
        ("refresh_market_summary", refresh_market_summary),
        ("refresh_signal_performance", refresh_signal_performance),
        ("refresh_indicator_strategy_snapshots", lambda inner_conn, _window: refresh_indicator_strategy_snapshots(inner_conn, settings.indicator_strategy_registry_path, job_run_id)),
        ("refresh_backtesting_snapshots", lambda inner_conn, _window: refresh_backtesting_snapshots(inner_conn, job_run_id)),
    ]
    for i, (name, fn) in enumerate(steps, start=1):
        step_id = start_job_step(conn, job_run_id=job_run_id, step_name=name, step_order=i)
        try:
            step_metrics = fn(conn, window)
            metrics.update(step_metrics)
            finish_job_step(conn, step_id, "success", metrics=step_metrics)
        except Exception as exc:
            finish_job_step(conn, step_id, "failed", message=str(exc), metrics={"error": str(exc)})
            raise

    step_id = start_job_step(conn, job_run_id=job_run_id, step_name="purge_old_analytics", step_order=len(steps) + 1)
    try:
        step_metrics = purge_old_analytics(conn, settings)
        metrics.update(step_metrics)
        finish_job_step(conn, step_id, "success", metrics=step_metrics)
    except Exception as exc:
        finish_job_step(conn, step_id, "failed", message=str(exc), metrics={"error": str(exc)})
        raise

    return metrics
