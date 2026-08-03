from __future__ import annotations

import streamlit as st

from app.dashboard.helpers import load_css, run_query, line_chart

load_css()
st.title("Events & Flows")
st.caption("Bulk/block, short selling, announcements, board meetings, and corporate actions.")

latest = run_query("""
    SELECT *
    FROM nse_app.stock_analysis_signals_daily
    WHERE trade_date = (SELECT MAX(trade_date) FROM nse_app.stock_analysis_signals_daily)
      AND analysis_type = 'event_flow'
    ORDER BY signal_strength DESC NULLS LAST, signal_name
    LIMIT 150
""")

history = run_query("""
    SELECT trade_date, signal_count
    FROM nse_app.vw_signal_counts_daily
    WHERE analysis_type = 'event_flow'
    ORDER BY trade_date DESC
    LIMIT 180
""")

raw_counts = run_query("""
    WITH x AS (
        SELECT trade_date, 'bulk' AS source_name, COUNT(*) AS rows FROM nse.fact_bulk_deals GROUP BY 1,2
        UNION ALL
        SELECT trade_date, 'block' AS source_name, COUNT(*) AS rows FROM nse.fact_block_deals GROUP BY 1,2
        UNION ALL
        SELECT trade_date, 'short_selling' AS source_name, COUNT(*) AS rows FROM nse.fact_short_selling GROUP BY 1,2
    )
    SELECT *
    FROM x
    ORDER BY trade_date DESC
    LIMIT 180
""")

line_chart(history, x="trade_date", y="signal_count", title="Event-flow signal count")
st.subheader("Latest event and flow tags")
st.dataframe(latest, use_container_width=True, hide_index=True)
st.subheader("Underlying raw event volumes")
st.dataframe(raw_counts, use_container_width=True, hide_index=True)
