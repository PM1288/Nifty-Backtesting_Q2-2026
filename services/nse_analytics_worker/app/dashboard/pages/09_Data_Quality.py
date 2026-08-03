from __future__ import annotations

import streamlit as st

from app.dashboard.helpers import load_css, run_query

load_css()
st.title("Data Quality & Jobs")
st.caption("Checks, recent runs, and step-level execution details.")

checks = run_query("""
    SELECT *
    FROM nse_app.quality_check_results
    ORDER BY checked_at DESC
    LIMIT 200
""")

runs = run_query("""
    SELECT *
    FROM nse_app.job_runs
    ORDER BY started_at DESC
    LIMIT 50
""")

steps = run_query("""
    SELECT *
    FROM nse_app.job_steps
    ORDER BY started_at DESC
    LIMIT 200
""")

st.subheader("Recent quality checks")
st.dataframe(checks, use_container_width=True, hide_index=True)
st.subheader("Recent job runs")
st.dataframe(runs, use_container_width=True, hide_index=True)
st.subheader("Recent job steps")
st.dataframe(steps, use_container_width=True, hide_index=True)
