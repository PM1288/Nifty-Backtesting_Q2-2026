from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import plotly.express as px
import psycopg
import streamlit as st
from psycopg.rows import dict_row


@st.cache_resource
def get_conn():
    return psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)


@st.cache_data(ttl=300)
def run_query(sql: str) -> pd.DataFrame:
    conn = get_conn()
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    return pd.DataFrame(rows)


def load_css() -> None:
    css_path = Path(__file__).resolve().parent / "assets" / "styles.css"
    if css_path.exists():
        st.markdown(f"<style>{css_path.read_text(encoding='utf-8')}</style>", unsafe_allow_html=True)


def metric_card(label: str, value, help_text: str | None = None) -> None:
    html = f"""
    <div class="metric-card">
      <div class="metric-label">{label}</div>
      <div class="metric-value">{value}</div>
      {f'<div class="metric-help">{help_text}</div>' if help_text else ''}
    </div>
    """
    st.markdown(html, unsafe_allow_html=True)


def line_chart(df: pd.DataFrame, x: str, y: str, title: str, color: str | None = None):
    if df.empty:
        st.info("No data available for this chart.")
        return
    fig = px.line(df.sort_values(x), x=x, y=y, color=color, title=title)
    fig.update_layout(height=360, margin=dict(l=10, r=10, t=50, b=10))
    st.plotly_chart(fig, use_container_width=True)


def bar_chart(df: pd.DataFrame, x: str, y: str, title: str, color: str | None = None):
    if df.empty:
        st.info("No data available for this chart.")
        return
    fig = px.bar(df, x=x, y=y, color=color, title=title)
    fig.update_layout(height=360, margin=dict(l=10, r=10, t=50, b=10))
    st.plotly_chart(fig, use_container_width=True)
