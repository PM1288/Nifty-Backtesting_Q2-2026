from __future__ import annotations

import streamlit as st

from app.dashboard.helpers import load_css, run_query, metric_card, line_chart

load_css()
st.title("Overview")

summary = run_query("SELECT * FROM nse_app.vw_latest_market_summary")
watchlist = run_query("SELECT * FROM nse_app.vw_latest_watchlist LIMIT 40")
history = run_query("""
    SELECT trade_date, avg_daily_return, positive_ratio, breakout_count, breakdown_count, anomaly_count, risk_count
    FROM nse_app.market_summary_daily
    ORDER BY trade_date DESC
    LIMIT 180
""")

if summary.empty:
    st.warning("No analytics data available.")
else:
    row = summary.iloc[0]
    cols = st.columns(5)
    pairs = [
        ("Market regime", row["market_regime"]),
        ("Securities", int(row["securities_count"]) if row["securities_count"] is not None else 0),
        ("Advancers", int(row["advancers"]) if row["advancers"] is not None else 0),
        ("Decliners", int(row["decliners"]) if row["decliners"] is not None else 0),
        ("Positive ratio", f'{float(row["positive_ratio"]):.2%}' if row["positive_ratio"] is not None else "NA"),
    ]
    for col, (label, value) in zip(cols, pairs):
        with col:
            metric_card(label, value)

    line_chart(history, x="trade_date", y="avg_daily_return", title="Average daily return")
    line_chart(history, x="trade_date", y="breakout_count", title="Breakout count")
    st.subheader("Latest consolidated watchlist")
    st.dataframe(watchlist, use_container_width=True, hide_index=True)
