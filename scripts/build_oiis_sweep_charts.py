#!/usr/bin/env python3
"""Build detailed matplotlib comparison charts from completed OIIS sweep outputs."""
from __future__ import annotations
import argparse, json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

def read_csv_safe(path: Path) -> pd.DataFrame:
    try:
        return pd.read_csv(path)
    except (pd.errors.EmptyDataError, FileNotFoundError):
        return pd.DataFrame()

def main() -> None:
    p = argparse.ArgumentParser(); p.add_argument("--root", type=Path, required=True); args = p.parse_args()
    root = args.root; out = root / "comparison_charts"; out.mkdir(parents=True, exist_ok=True)
    rows = []
    for summary_path in sorted(root.glob("*/[0-9a-f-]*/summary.json")):
        summary = json.loads(summary_path.read_text()); combo = summary_path.parents[1].name
        trades_path = summary_path.parent / "trades.csv"
        trades = read_csv_safe(trades_path)
        pnl = pd.to_numeric(trades.get("after_tax_net_pnl", pd.Series(dtype=float)), errors="coerce").sum()
        rows.append({"combination": combo, "enterable": summary.get("enterable_count", 0), "trades": summary.get("trade_count", 0), "pnl": pnl, "pnl_per_trade": pnl / summary["trade_count"] if summary.get("trade_count") else 0, "h30_score": summary.get("h30_diagnostic_score", 0), "win_rate": summary.get("win_rate_pct") or 0, "dir": summary_path.parent})
    frame = pd.DataFrame(rows).sort_values("pnl", ascending=False); frame.to_csv(out / "threshold_comparison.csv", index=False)
    plt.style.use("seaborn-v0_8-whitegrid")
    fig, axes = plt.subplots(2, 2, figsize=(16, 11)); x = range(len(frame)); labels = frame.combination.tolist()
    axes[0,0].bar(x, frame.trades, color="#2563eb"); axes[0,0].set_title("Executed trades by threshold combination"); axes[0,0].set_ylabel("Trades")
    axes[0,1].bar(x, frame.pnl, color="#16a34a"); axes[0,1].set_title("After-tax realised P&L"); axes[0,1].set_ylabel("₹");
    axes[1,0].bar(x, frame.pnl_per_trade, color="#f59e0b"); axes[1,0].set_title("After-tax P&L per executed trade"); axes[1,0].set_ylabel("₹ / trade")
    axes[1,1].bar(x, frame.h30_score, color="#7c3aed"); axes[1,1].set_title("H30 diagnostic score"); axes[1,1].set_ylabel("Score")
    for ax in axes.flat: ax.set_xticks(list(x), labels, rotation=45, ha="right")
    fig.suptitle("OIIS O/X threshold sweep comparison (2016-01 to 2026-08)", fontsize=16); fig.tight_layout(); fig.savefig(out / "threshold_comparison.png", dpi=220); fig.savefig(out / "threshold_comparison.svg"); plt.close(fig)

    monthly = []
    for row in rows:
        trades_path = Path(row["dir"]) / "trades.csv"
        if not trades_path.exists(): continue
        t = read_csv_safe(trades_path)
        if t.empty or "entry_date" not in t: continue
        t["entry_month"] = pd.to_datetime(t["entry_date"], errors="coerce").dt.to_period("M").astype(str)
        grouped = t.groupby("entry_month", as_index=False).agg(pnl=("after_tax_net_pnl", "sum"), trades=("after_tax_net_pnl", "size")); grouped["combination"] = row["combination"]; monthly.append(grouped)
    monthly_frame = pd.concat(monthly, ignore_index=True) if monthly else pd.DataFrame(columns=["entry_month","pnl","trades","combination"]); monthly_frame.to_csv(out / "threshold_month_year_metrics.csv", index=False)
    for metric, ylabel, title, name in [("pnl", "After-tax P&L (₹)", "Monthly P&L by threshold combination", "monthly_pnl"), ("trades", "Executed trades", "Monthly trade count by threshold combination", "monthly_trade_count")]:
        fig, ax = plt.subplots(figsize=(18, 8));
        for combo, g in monthly_frame.groupby("combination"):
            g = g.sort_values("entry_month"); ax.plot(g.entry_month, g[metric], marker="o", linewidth=1.2, label=combo)
        ax.set_title(title); ax.set_xlabel("Entry month (YYYY-MM)"); ax.set_ylabel(ylabel); ax.tick_params(axis="x", rotation=70); ax.legend(ncol=3, fontsize=8); fig.tight_layout(); fig.savefig(out / f"{name}.png", dpi=220); fig.savefig(out / f"{name}.svg"); plt.close(fig)
    report = ["# OIIS threshold sweep chart review", "", "Charts are generated from each completed combination's `trades.csv`; periods are separate YYYY-MM buckets.", "", "| Combination | Trades | After-tax P&L | P&L/trade | H30 score |", "|---|---:|---:|---:|---:|"]
    report += [f"| {r.combination} | {int(r.trades)} | ₹{r.pnl:,.2f} | ₹{r.pnl_per_trade:,.2f} | {r.h30_score:.4f} |" for r in frame.itertuples()]
    (out / "README.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(out), "combinations": len(frame), "charts": 6}, indent=2))

if __name__ == "__main__": main()
