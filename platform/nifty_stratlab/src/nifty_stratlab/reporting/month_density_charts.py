"""Deterministic matplotlib H30 month-density evidence charts."""
from __future__ import annotations

import hashlib
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _jitter(values: pd.Series, width: float = .22) -> np.ndarray:
    return np.asarray([(int(hashlib.sha256(str(v).encode()).hexdigest()[:8], 16) / 0xffffffff * 2 - 1) * width for v in values])


def _density(month: np.ndarray, values: np.ndarray, bins: int = 24) -> tuple[np.ndarray, np.ndarray]:
    if not len(values): return np.array([]), np.array([], dtype=int)
    lo, hi = float(values.min()), float(values.max())
    if lo == hi: lo, hi = lo - .5, hi + .5
    edges = np.linspace(lo - 1e-6, hi + 1e-6, bins + 1)
    cell = list(zip(month.astype(int), np.clip(np.searchsorted(edges, values, side="right") - 1, 0, bins - 1)))
    counts = {key: cell.count(key) for key in set(cell)}
    local = np.asarray([counts[key] for key in cell])
    return 28 + 190 * np.sqrt(local / local.max()), local


def _plot(data: pd.DataFrame, series: list[tuple[str, str, str]], title: str, ylabel: str, stem: Path) -> pd.DataFrame:
    fig, ax = plt.subplots(figsize=(11, 6))
    exported = []
    markers = ["o", "^"]
    for index, (column, label, colour) in enumerate(series):
        subset = data[["entry_path_id", "entry_date", column, "coverage_status"]].copy()
        subset["entry_period"] = pd.to_datetime(subset["entry_date"], errors="coerce").dt.to_period("M").astype(str)
        censored = int((subset["coverage_status"] != "MATURE_H30_COMPLETE").sum())
        subset[column] = pd.to_numeric(subset[column], errors="coerce")
        subset = subset.dropna(subset=[column])
        if subset.empty: continue
        periods = sorted(subset["entry_period"].dropna().unique())
        period_index = {period: index for index, period in enumerate(periods)}
        m, y = subset["entry_period"].map(period_index).to_numpy(float), subset[column].to_numpy(float)
        sizes, counts = _density(m, y)
        subset["density_count"], subset["bubble_size"] = counts, sizes
        subset["x_jittered"], subset["chart_series"] = m + _jitter(subset.entry_path_id.astype(str) + label), label
        exported.append(subset.rename(columns={column: "upside_pct"}))
        ax.scatter(subset.x_jittered, y, s=sizes, alpha=.45, marker=markers[index], color=colour,
                   label=f"{label} (n={len(subset)}, censored={censored})")
        med = subset.groupby("entry_period")[column].median().reindex(periods)
        ax.plot(range(len(periods)), med, marker=markers[index], color=colour, linewidth=1.4)
    if not exported: ax.text(.5, .5, "No eligible observations", ha="center", transform=ax.transAxes)
    ax.axhline(0, color="#64748b", linewidth=.8)
    if exported:
        periods = sorted(pd.concat(exported)["entry_period"].dropna().unique())
        ax.set_xticks(range(len(periods)), periods, rotation=60, ha="right")
        ax.set_xlim(-.5, len(periods) - .5)
    ax.set_xlabel("Entry month (YYYY-MM)"); ax.set_ylabel(ylabel); ax.set_title(title); ax.grid(alpha=.18)
    if exported: ax.legend()
    fig.text(.5, .01, "Opportunity evidence only - not realised P&L or an execution exit.", ha="center", fontsize=8)
    fig.tight_layout(rect=(0, .035, 1, 1)); fig.savefig(stem.with_suffix(".png"), dpi=180); fig.savefig(stem.with_suffix(".svg")); plt.close(fig)
    return pd.concat(exported, ignore_index=True) if exported else pd.DataFrame()


def render_strategy_charts(frame: pd.DataFrame, strategy_id: str, out_dir: Path) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    p1 = out_dir / f"strategy_{strategy_id}_01_intraday_month_density"
    p2 = out_dir / f"strategy_{strategy_id}_02_swing_long_month_density"
    d1 = _plot(frame, [("intraday_max_net_upside_pct", "Intraday", "#2563eb")], f"{strategy_id}: intraday opportunity by entry month", "Maximum net opportunity (%)", p1)
    d2 = _plot(frame, [("swing_d5_max_close_after_tax_upside_pct", "D+5 max close", "#f59e0b"), ("h30_max_close_after_tax_upside_pct", "H30 max close", "#10b981")], f"{strategy_id}: D+5 and H30 opportunity", "After-tax-reserve opportunity (%)", p2)
    source = out_dir / f"strategy_{strategy_id}_month_density_data.csv"
    pd.concat([d1.assign(chart="INTRADAY"), d2.assign(chart="SWING_LONG")], ignore_index=True).to_csv(source, index=False)
    return {"intraday_png": p1.with_suffix(".png"), "intraday_svg": p1.with_suffix(".svg"), "swing_long_png": p2.with_suffix(".png"), "swing_long_svg": p2.with_suffix(".svg"), "chart_data_csv": source}
