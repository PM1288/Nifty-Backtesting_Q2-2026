from __future__ import annotations

import streamlit as st

from app.dashboard.helpers import load_css, run_query, line_chart

load_css()
st.title("Delivery & Conviction")
st.caption("Accumulation, distribution, and speculative participation.")

latest = run_query("""
    SELECT *
    FROM nse_app.stock_analysis_signals_daily
    WHERE trade_date = (SELECT MAX(trade_date) FROM nse_app.stock_analysis_signals_daily)
      AND analysis_type = 'delivery_conviction'
    ORDER BY signal_strength DESC NULLS LAST
    LIMIT 100
""")

perf = run_query("""
    SELECT *
    FROM nse_app.vw_latest_signal_performance
    WHERE analysis_type = 'delivery_conviction'
    ORDER BY sample_size DESC, avg_fwd_return_5d DESC NULLS LAST
""")

history = run_query("""
    SELECT trade_date, signal_count
    FROM nse_app.vw_signal_counts_daily
    WHERE analysis_type = 'delivery_conviction'
    ORDER BY trade_date DESC
    LIMIT 180
""")

line_chart(history, x="trade_date", y="signal_count", title="Delivery-conviction signal count")
st.subheader("Latest conviction tags")
st.dataframe(latest, use_container_width=True, hide_index=True)
st.subheader("Historical signal performance")
st.dataframe(perf, use_container_width=True, hide_index=True)
