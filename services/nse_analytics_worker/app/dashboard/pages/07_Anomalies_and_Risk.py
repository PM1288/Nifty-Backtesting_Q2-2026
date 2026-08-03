from __future__ import annotations

import streamlit as st

from app.dashboard.helpers import load_css, run_query, line_chart

load_css()
st.title("Anomalies & Risk")
st.caption("Outliers, surveillance overlays, margin pressure, and financed crowding.")

latest = run_query("""
    SELECT *
    FROM nse_app.stock_analysis_signals_daily
    WHERE trade_date = (SELECT MAX(trade_date) FROM nse_app.stock_analysis_signals_daily)
      AND analysis_type IN ('anomaly', 'risk')
    ORDER BY signal_strength DESC NULLS LAST, analysis_type, signal_name
    LIMIT 150
""")

history = run_query("""
    SELECT trade_date, analysis_type, signal_count
    FROM nse_app.vw_signal_counts_daily
    WHERE analysis_type IN ('anomaly', 'risk')
    ORDER BY trade_date DESC
    LIMIT 360
""")

line_chart(history, x="trade_date", y="signal_count", title="Anomaly and risk signal counts", color="analysis_type")
st.subheader("Latest anomaly and risk tags")
st.dataframe(latest, use_container_width=True, hide_index=True)
