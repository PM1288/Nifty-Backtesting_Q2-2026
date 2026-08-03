DROP VIEW IF EXISTS stock_level_institutional_signals CASCADE;
DROP VIEW IF EXISTS participant_positioning_summary CASCADE;
DROP VIEW IF EXISTS quarterly_holding_changes CASCADE;
DROP VIEW IF EXISTS daily_institutional_flow_summary CASCADE;

CREATE VIEW daily_institutional_flow_summary AS
SELECT
    market_date AS date,
    SUM(CASE WHEN exchange_scope = 'nse_only' AND lower(participant_type) LIKE '%fii%' THEN buy_value ELSE 0 END) AS nse_only_fii_buy,
    SUM(CASE WHEN exchange_scope = 'nse_only' AND lower(participant_type) LIKE '%fii%' THEN sell_value ELSE 0 END) AS nse_only_fii_sell,
    SUM(CASE WHEN exchange_scope = 'nse_only' AND lower(participant_type) LIKE '%fii%' THEN net_value ELSE 0 END) AS nse_only_fii_net,
    SUM(CASE WHEN exchange_scope = 'combined' AND lower(participant_type) LIKE '%fii%' THEN buy_value ELSE 0 END) AS combined_fii_buy,
    SUM(CASE WHEN exchange_scope = 'combined' AND lower(participant_type) LIKE '%fii%' THEN sell_value ELSE 0 END) AS combined_fii_sell,
    SUM(CASE WHEN exchange_scope = 'combined' AND lower(participant_type) LIKE '%fii%' THEN net_value ELSE 0 END) AS combined_fii_net,
    SUM(CASE WHEN exchange_scope = 'nse_only' AND lower(participant_type) LIKE '%dii%' THEN buy_value ELSE 0 END) AS nse_only_dii_buy,
    SUM(CASE WHEN exchange_scope = 'nse_only' AND lower(participant_type) LIKE '%dii%' THEN sell_value ELSE 0 END) AS nse_only_dii_sell,
    SUM(CASE WHEN exchange_scope = 'nse_only' AND lower(participant_type) LIKE '%dii%' THEN net_value ELSE 0 END) AS nse_only_dii_net,
    SUM(CASE WHEN exchange_scope = 'combined' AND lower(participant_type) LIKE '%dii%' THEN buy_value ELSE 0 END) AS combined_dii_buy,
    SUM(CASE WHEN exchange_scope = 'combined' AND lower(participant_type) LIKE '%dii%' THEN sell_value ELSE 0 END) AS combined_dii_sell,
    SUM(CASE WHEN exchange_scope = 'combined' AND lower(participant_type) LIKE '%dii%' THEN net_value ELSE 0 END) AS combined_dii_net
FROM normalized_nse_fii_dii
GROUP BY 1;

CREATE VIEW quarterly_holding_changes AS
WITH holdings AS (
    SELECT
        symbol,
        as_on_date,
        MAX(CASE WHEN lower(category) LIKE '%foreign%' OR lower(category) LIKE '%fii%' THEN percent_hold END) AS fii_pct,
        MAX(CASE WHEN lower(category) LIKE '%domestic%' OR lower(category) LIKE '%dii%' OR lower(category) LIKE '%mutual%' THEN percent_hold END) AS dii_pct,
        MAX(CASE WHEN lower(category) LIKE '%promoter%' THEN percent_hold END) AS promoter_pct,
        MAX(CASE WHEN lower(category) LIKE '%public%' THEN percent_hold END) AS public_pct
    FROM normalized_nse_shareholding
    GROUP BY 1, 2
)
SELECT
    symbol,
    as_on_date,
    fii_pct,
    dii_pct,
    promoter_pct,
    public_pct,
    fii_pct - LAG(fii_pct) OVER (PARTITION BY symbol ORDER BY as_on_date) AS change_vs_prev_quarter_fii_pct,
    dii_pct - LAG(dii_pct) OVER (PARTITION BY symbol ORDER BY as_on_date) AS change_vs_prev_quarter_dii_pct,
    promoter_pct - LAG(promoter_pct) OVER (PARTITION BY symbol ORDER BY as_on_date) AS change_vs_prev_quarter_promoter_pct,
    public_pct - LAG(public_pct) OVER (PARTITION BY symbol ORDER BY as_on_date) AS change_vs_prev_quarter_public_pct
FROM holdings;

CREATE VIEW participant_positioning_summary AS
SELECT
    market_date AS date,
    client_type,
    SUM(CASE WHEN lower(instrument_type) LIKE '%future%index%' THEN COALESCE(open_interest_long, buy_contracts, 0) ELSE 0 END) AS futures_index_long,
    SUM(CASE WHEN lower(instrument_type) LIKE '%future%index%' THEN COALESCE(open_interest_short, sell_contracts, 0) ELSE 0 END) AS futures_index_short,
    SUM(CASE WHEN lower(instrument_type) LIKE '%future%stock%' THEN COALESCE(open_interest_long, buy_contracts, 0) ELSE 0 END) AS futures_stock_long,
    SUM(CASE WHEN lower(instrument_type) LIKE '%future%stock%' THEN COALESCE(open_interest_short, sell_contracts, 0) ELSE 0 END) AS futures_stock_short,
    SUM(call_long) AS options_index_call_long,
    SUM(call_short) AS options_index_call_short,
    SUM(put_long) AS options_index_put_long,
    SUM(put_short) AS options_index_put_short,
    SUM(COALESCE(open_interest_long, buy_contracts, 0) - COALESCE(open_interest_short, sell_contracts, 0)) AS net_bias
FROM normalized_nse_derivatives_participants
GROUP BY 1, 2;

CREATE VIEW stock_level_institutional_signals AS
WITH deals AS (
    SELECT
        market_date,
        symbol,
        MAX(CASE WHEN deal_kind = 'bulk' THEN 1 ELSE 0 END) AS bulk_deal_flag,
        MAX(CASE WHEN deal_kind = 'block' THEN 1 ELSE 0 END) AS block_deal_flag
    FROM normalized_nse_bulk_block
    GROUP BY 1, 2
),
holding_latest AS (
    SELECT
        b.market_date,
        b.symbol,
        (
            SELECT q.change_vs_prev_quarter_fii_pct
            FROM quarterly_holding_changes q
            WHERE q.symbol = b.symbol
              AND q.as_on_date <= b.market_date
            ORDER BY q.as_on_date DESC
            LIMIT 1
        ) AS quarterly_fii_holding_change_pct,
        (
            SELECT q.change_vs_prev_quarter_dii_pct
            FROM quarterly_holding_changes q
            WHERE q.symbol = b.symbol
              AND q.as_on_date <= b.market_date
            ORDER BY q.as_on_date DESC
            LIMIT 1
        ) AS quarterly_dii_holding_change_pct
    FROM normalized_nse_cm_bhavcopy b
),
positioning AS (
    SELECT
        date,
        AVG(net_bias) AS derivative_participant_bias
    FROM participant_positioning_summary
    GROUP BY 1
)
SELECT
    b.market_date AS date,
    b.symbol,
    b.close,
    b.volume,
    b.delivery_pct,
    COALESCE(d.bulk_deal_flag, 0) AS bulk_deal_flag,
    COALESCE(d.block_deal_flag, 0) AS block_deal_flag,
    h.quarterly_fii_holding_change_pct,
    h.quarterly_dii_holding_change_pct,
    p.derivative_participant_bias,
    (
        COALESCE(CAST(d.bulk_deal_flag AS DOUBLE PRECISION), 0) * 1.5
        + COALESCE(CAST(d.block_deal_flag AS DOUBLE PRECISION), 0) * 2.0
        + COALESCE(h.quarterly_fii_holding_change_pct, 0) * 1.2
        + COALESCE(h.quarterly_dii_holding_change_pct, 0) * 0.8
        + COALESCE(b.delivery_pct, 0) * 0.05
        + COALESCE(p.derivative_participant_bias, 0) * 0.01
    ) AS institution_signal_score,
    TRIM(BOTH ';' FROM CONCAT(
        CASE WHEN COALESCE(d.bulk_deal_flag, 0) = 1 THEN 'bulk_deal;' ELSE '' END,
        CASE WHEN COALESCE(d.block_deal_flag, 0) = 1 THEN 'block_deal;' ELSE '' END,
        CASE WHEN COALESCE(h.quarterly_fii_holding_change_pct, 0) <> 0 THEN 'quarterly_fii_change;' ELSE '' END,
        CASE WHEN COALESCE(h.quarterly_dii_holding_change_pct, 0) <> 0 THEN 'quarterly_dii_change;' ELSE '' END,
        CASE WHEN COALESCE(p.derivative_participant_bias, 0) <> 0 THEN 'participant_positioning;' ELSE '' END
    )) AS explainability_notes
FROM normalized_nse_cm_bhavcopy b
LEFT JOIN deals d
    ON d.market_date = b.market_date
   AND d.symbol = b.symbol
LEFT JOIN holding_latest h
    ON h.market_date = b.market_date
   AND h.symbol = b.symbol
LEFT JOIN positioning p
    ON p.date = b.market_date;
