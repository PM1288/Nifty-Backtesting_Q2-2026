#!/usr/bin/env python3
"""Consolidate one RSI15/Daily40 batch into analysis-friendly artifacts."""
from __future__ import annotations

import argparse
import csv
import html
import json
from decimal import Decimal
from pathlib import Path


TABLES = ("trades.csv", "signals.csv", "skipped_signals.csv", "equity_curve.csv")


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-root", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--status-tsv", required=True, type=Path)
    parser.add_argument("--strategy", default="rsi15_daily40_intraday_v1")
    return parser.parse_args()


def read_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def merge_table(result_dirs: list[Path], filename: str, output: Path, strategy: str) -> int:
    fieldnames: list[str] = ["strategy", "symbol"]
    rows: list[dict[str, str]] = []
    for result_dir in result_dirs:
        source = result_dir / filename
        if not source.is_file() or source.stat().st_size == 0:
            continue
        with source.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for name in reader.fieldnames or []:
                if name not in fieldnames:
                    fieldnames.append(name)
            for row in reader:
                normalized = {key: "" if value is None else value for key, value in row.items()}
                normalized["strategy"] = strategy
                normalized["symbol"] = normalized.get("symbol") or result_dir.name.upper()
                rows.append(normalized)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def number(value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def render_report(summary: dict, symbols: list[dict]) -> str:
    ordered = sorted(symbols, key=lambda row: number(row["net_pnl"]), reverse=True)
    max_abs = max([abs(number(row["net_pnl"])) for row in ordered] or [Decimal("1")]) or Decimal("1")
    bars = []
    for row in ordered:
        pnl = number(row["net_pnl"])
        width = float(abs(pnl) / max_abs * 100)
        colour = "#16a34a" if pnl >= 0 else "#dc2626"
        bars.append(
            f'<div class="barrow"><span>{html.escape(row["symbol"])}</span>'
            f'<div class="track"><i style="width:{width:.2f}%;background:{colour}"></i></div>'
            f'<b style="color:{colour}">&#8377;{float(pnl):,.2f}</b></div>'
        )
    columns = ("symbol", "status", "trades", "win_rate_pct", "net_pnl", "maximum_drawdown_pct", "source")
    table_rows = "".join(
        "<tr>" + "".join(f"<td>{html.escape(str(row.get(column, '')))}</td>" for column in columns) + "</tr>"
        for row in ordered
    )
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>RSI15 Daily40 consolidated report</title><style>
body{{font-family:Inter,system-ui,sans-serif;background:#f1f5f9;color:#0f172a;margin:0}}main{{max-width:1250px;margin:auto;padding:32px}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}}.card,.panel{{background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px #cbd5e1}}.card b{{display:block;font-size:24px;margin-top:6px}}.panel{{margin-top:16px;overflow:auto}}.barrow{{display:grid;grid-template-columns:130px 1fr 130px;gap:12px;align-items:center;margin:7px 0}}.track{{height:13px;background:#e2e8f0;border-radius:8px;overflow:hidden}}.track i{{display:block;height:100%}}table{{border-collapse:collapse;width:100%;font-size:13px}}th,td{{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}}th{{background:#e2e8f0}}</style></head><body><main>
<h1>RSI15 / Daily40 — consolidated strategy report</h1><p>Every data row is tagged with strategy and symbol. Detailed analysis is in the consolidated CSV files in this folder.</p>
<section class="cards"><div class="card">Symbols<b>{summary['symbols_completed']}</b></div><div class="card">Trades<b>{summary['total_trades']}</b></div><div class="card">Net P&amp;L<b>&#8377;{float(number(summary['total_net_pnl'])):,.2f}</b></div><div class="card">Profitable symbols<b>{summary['profitable_symbols']}</b></div><div class="card">Failed symbols<b>{summary['symbols_failed']}</b></div></section>
<section class="panel"><h2>Net P&amp;L by symbol</h2>{''.join(bars)}</section>
<section class="panel"><h2>Symbol summary</h2><table><thead><tr>{''.join(f'<th>{c}</th>' for c in columns)}</tr></thead><tbody>{table_rows}</tbody></table></section>
<section class="panel"><h2>Files for analysis</h2><p><code>summary_by_symbol.csv</code>, <code>trades.csv</code>, <code>signals.csv</code>, <code>equity_curve.csv</code>, and <code>status.tsv</code>.</p><p>No live broker orders were created.</p></section>
</main></body></html>'''


def main() -> int:
    args = arguments()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    result_dirs = sorted(path for path in args.results_root.iterdir() if path.is_dir() and (path / "summary.json").is_file())
    summaries: list[dict] = []
    for result_dir in result_dirs:
        source = read_json(result_dir / "summary.json")
        metrics = source.get("metrics", {})
        summaries.append({
            "strategy": args.strategy,
            "symbol": str(source.get("symbol", result_dir.name)).upper(),
            "status": source.get("status", "UNKNOWN"),
            "validation_status": source.get("validation_status", "UNKNOWN"),
            "start": source.get("start", ""),
            "end": source.get("end", ""),
            "source": source.get("source", ""),
            "source_sha256": source.get("source_sha256", ""),
            "bars": source.get("evaluation_bars", 0),
            "trades": source.get("executed_trades", 0),
            "win_rate_pct": metrics.get("win_rate_pct", ""),
            "net_pnl": metrics.get("total_net_pnl", "0"),
            "maximum_drawdown_pct": metrics.get("maximum_drawdown_pct", ""),
            "target_500_hit_rate_pct": source.get("target_500_hit_rate_pct", ""),
        })
    summary_fields = list(summaries[0]) if summaries else ["strategy", "symbol", "status"]
    with (args.output_dir / "summary_by_symbol.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=summary_fields)
        writer.writeheader()
        writer.writerows(summaries)
    counts = {filename: merge_table(result_dirs, filename, args.output_dir / filename, args.strategy) for filename in TABLES}
    output_status = args.output_dir / "status.tsv"
    if args.status_tsv.resolve() != output_status.resolve():
        output_status.write_text(args.status_tsv.read_text(encoding="utf-8"), encoding="utf-8")
    with output_status.open(encoding="utf-8") as handle:
        status_rows = list(csv.DictReader(handle, delimiter="\t"))
    aggregate = {
        "strategy": args.strategy,
        "symbols_attempted": len(status_rows),
        "symbols_completed": len(summaries),
        "symbols_failed": sum(row.get("status") != "0" for row in status_rows),
        "total_trades": sum(int(row["trades"]) for row in summaries),
        "total_net_pnl": str(sum((number(row["net_pnl"]) for row in summaries), Decimal("0"))),
        "profitable_symbols": sum(number(row["net_pnl"]) > 0 for row in summaries),
        "row_counts": counts,
    }
    (args.output_dir / "summary.json").write_text(json.dumps(aggregate, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / "report.html").write_text(render_report(aggregate, summaries), encoding="utf-8")
    (args.output_dir / "README.md").write_text(
        "# Consolidated RSI15 / Daily40 results\n\n"
        "Open `report.html` first. Filter `summary_by_symbol.csv` by `symbol` for stock-level comparison. "
        "All row-level CSVs include `strategy` and `symbol` columns.\n",
        encoding="utf-8",
    )
    print(json.dumps(aggregate, indent=2))
    return 0 if aggregate["symbols_failed"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
