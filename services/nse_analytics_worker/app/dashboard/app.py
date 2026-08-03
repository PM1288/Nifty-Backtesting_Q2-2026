from __future__ import annotations

import os

import streamlit as st

from app.dashboard.helpers import load_css, run_query, metric_card, line_chart

st.set_page_config(
    page_title=os.environ.get("APP_TITLE", "NSE Market Learning Dashboard"),
    page_icon="📈",
    layout="wide",
)

load_css()

st.title(os.environ.get("APP_TITLE", "NSE Market Learning Dashboard"))
st.caption("Overview of market state, signal engine outputs, and historical learner rollups.")

summary = run_query("SELECT * FROM nse_app.vw_latest_market_summary")
history = run_query("""
    SELECT trade_date, avg_daily_return, positive_ratio, breakout_count, anomaly_count, risk_count, market_regime
    FROM nse_app.market_summary_daily
    ORDER BY trade_date DESC
    LIMIT 120
""")
watchlist = run_query("""
    SELECT *
    FROM nse_app.vw_latest_watchlist
    LIMIT 25
""")

if summary.empty:
    st.warning("No analytics rows found yet. Run `python -m app.cli refresh-all` first.")
else:
    row = summary.iloc[0]
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    with c1:
        metric_card("As of date", row["trade_date"])
    with c2:
        metric_card("Market regime", row["market_regime"])
    with c3:
        metric_card("Advancers", int(row["advancers"]) if row["advancers"] is not None else 0)
    with c4:
        metric_card("Decliners", int(row["decliners"]) if row["decliners"] is not None else 0)
    with c5:
        metric_card("Breakout count", int(row["breakout_count"]) if row["breakout_count"] is not None else 0)
    with c6:
        metric_card("Anomaly count", int(row["anomaly_count"]) if row["anomaly_count"] is not None else 0)

    left, right = st.columns([1.3, 1])
    with left:
        line_chart(history, x="trade_date", y="avg_daily_return", title="Average daily return history")
    with right:
        line_chart(history, x="trade_date", y="positive_ratio", title="Positive participation ratio")

    st.subheader("Current watchlist")
    st.dataframe(watchlist, use_container_width=True, hide_index=True)
