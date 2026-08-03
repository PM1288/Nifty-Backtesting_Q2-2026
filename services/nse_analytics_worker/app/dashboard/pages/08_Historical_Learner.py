from __future__ import annotations

import streamlit as st

from app.dashboard.helpers import load_css, run_query

load_css()
st.title("Historical Learner")
st.caption("Which signals historically worked, how often, and with what forward-return profile.")

perf = run_query("""
    SELECT *
    FROM nse_app.vw_latest_signal_performance
    ORDER BY sample_size DESC, avg_fwd_return_5d DESC NULLS LAST
""")

leaders = run_query("""
    SELECT *
    FROM nse_app.vw_latest_signal_performance
    WHERE sample_size >= 20
    ORDER BY hit_rate_5d DESC NULLS LAST, avg_fwd_return_5d DESC NULLS LAST
    LIMIT 50
""")

laggards = run_query("""
    SELECT *
    FROM nse_app.vw_latest_signal_performance
    WHERE sample_size >= 20
    ORDER BY avg_fwd_return_5d ASC NULLS LAST
    LIMIT 50
""")

st.subheader("All signal performance")
st.dataframe(perf, use_container_width=True, hide_index=True)
st.subheader("Top historical signal buckets")
st.dataframe(leaders, use_container_width=True, hide_index=True)
st.subheader("Weak historical signal buckets")
st.dataframe(laggards, use_container_width=True, hide_index=True)
