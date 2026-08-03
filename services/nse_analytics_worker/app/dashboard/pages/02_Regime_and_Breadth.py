from __future__ import annotations

import streamlit as st

from app.dashboard.helpers import load_css, run_query, line_chart, bar_chart

load_css()
st.title("Regime & Breadth")
st.caption("Participation and market-state diagnostics.")

history = run_query("""
    SELECT trade_date, market_regime, advancers, decliners, unchanged, positive_ratio, breakout_count, breakdown_count, total_turnover_lacs
    FROM nse_app.market_summary_daily
    ORDER BY trade_date DESC
    LIMIT 180
""")

if history.empty:
    st.warning("No market summary data available.")
else:
    c1, c2 = st.columns(2)
    with c1:
        line_chart(history, x="trade_date", y="positive_ratio", title="Positive participation ratio")
    with c2:
        line_chart(history, x="trade_date", y="total_turnover_lacs", title="Total turnover (lacs)")

    c3, c4 = st.columns(2)
    with c3:
        line_chart(history, x="trade_date", y="advancers", title="Advancers")
    with c4:
        line_chart(history, x="trade_date", y="decliners", title="Decliners")

    regime_counts = history["market_regime"].value_counts(dropna=False).reset_index()
    regime_counts.columns = ["market_regime", "days"]
    bar_chart(regime_counts, x="market_regime", y="days", title="Regime frequency")
