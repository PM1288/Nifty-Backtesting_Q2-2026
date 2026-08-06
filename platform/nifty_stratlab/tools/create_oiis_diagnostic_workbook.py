#!/usr/bin/env python3
"""Create a review workbook explaining OIIS trade frequency and outcomes."""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()
    root = args.run_dir
    out = args.output or root / "oiis_diagnostic_review.xlsx"
    summary = json.loads((root / "summary.json").read_text())

    decisions = pd.read_csv(root / "decisions.csv")
    trades = pd.read_csv(root / "trades.csv")
    targets = pd.read_csv(root / "target_events.csv")
    adverse = pd.read_csv(root / "adverse_events.csv")
    regimes = pd.read_csv(root / "regime_performance.csv")

    gate_counter: Counter[str] = Counter()
    gate_by_code: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for code, raw in zip(decisions["decision_code"], decisions["hard_gates"]):
        try:
            gates = json.loads(raw) if isinstance(raw, str) else []
        except json.JSONDecodeError:
            gates = []
        for gate in gates:
            gate_counter[gate] += 1
            gate_by_code[code][gate] += 1

    gate_rows = [{"gate": k, "decision_rows": v, "percent_of_all_decisions": round(100*v/len(decisions), 4)}
                 for k, v in gate_counter.most_common()]
    gate_df = pd.DataFrame(gate_rows)
    if gate_df.empty:
        gate_df = pd.DataFrame(columns=["gate", "decision_rows", "percent_of_all_decisions"])

    code_df = decisions.groupby("decision_code", dropna=False).size().rename("decision_rows").reset_index()
    code_df["percent_of_all_decisions"] = (100 * code_df.decision_rows / len(decisions)).round(4)
    code_df = code_df.sort_values("decision_rows", ascending=False)

    symbol_df = decisions.groupby("symbol").agg(
        decisions=("symbol", "size"),
        enterable=("decision_code", lambda s: int(s.isin(["ENTERABLE_TIER_A", "ENTERABLE_TIER_B"]).sum())),
    ).reset_index()
    if not trades.empty:
        trade_counts = trades.groupby("symbol").size().rename("accepted_paths").reset_index()
        symbol_df = symbol_df.merge(trade_counts, on="symbol", how="left")
    symbol_df["accepted_paths"] = symbol_df.get("accepted_paths", 0).fillna(0).astype(int)
    symbol_df["enterable_to_decision_pct"] = (100 * symbol_df.enterable / symbol_df.decisions).round(4)
    symbol_df = symbol_df.sort_values(["enterable", "decisions"], ascending=False)

    parsed = decisions["evidence"].map(lambda x: json.loads(x) if isinstance(x, str) else {})
    near = pd.DataFrame({
        "symbol": decisions.symbol,
        "trade_date": decisions.trade_date,
        "decision_code": decisions.decision_code,
        "ofactor_long": decisions.ofactor_long,
        "xfactor_score": decisions.xfactor_score,
        "directional_edge": decisions.directional_edge,
        "setup_state": decisions.setup_state,
        "selected_direction": decisions.selected_direction,
        "distance_to_ofactor_74": (decisions.ofactor_long - 74).round(4),
        "distance_to_xfactor_76": (decisions.xfactor_score - 76).round(4),
    })
    near = near[(near.ofactor_long >= 60) & (near.ofactor_long < 74) | (near.xfactor_score >= 60) & (near.xfactor_score < 76)]
    near = near.sort_values(["ofactor_long", "xfactor_score"], ascending=False).head(1000)

    coverage = pd.DataFrame({
        "metric": ["decision rows", "enterable signals", "accepted paths", "missing minute symbols", "accepted rate from decisions", "accepted rate from enterable"],
        "value": [len(decisions), int(decisions.decision_code.isin(["ENTERABLE_TIER_A", "ENTERABLE_TIER_B"]).sum()), len(trades), ", ".join(pd.read_csv(root / "missing_minute_symbols.csv").iloc[:, 0].astype(str)), round(100*len(decisions[decisions.decision_code.isin(["ENTERABLE_TIER_A", "ENTERABLE_TIER_B"])])/len(decisions), 4), round(100*len(trades)/max(1, int(decisions.decision_code.isin(["ENTERABLE_TIER_A", "ENTERABLE_TIER_B"]).sum())), 2)],
    })
    method = pd.DataFrame({"item": ["Interpretation", "Entry gates", "Exit behavior", "D+5 ladder", "Data warning", "Conclusion"], "detail": [
        "Low trade frequency is measured at the entry decision stage, before minute execution.",
        "OFactor minimum 74; XFactor tiers; valid setup/trigger; reward-risk minimum 1.5; liquidity and data gates.",
        "No stop-loss, indicator exit, timeout or forced exit. Execution sells at I030 on D0 or S100 after D0.",
        "Every accepted entry independently records I030/I050/I070, S100/S200/S500 and all six adverse levels through D+5.",
        "M&M and MAXHEALTH have missing minute CSVs; their enterable signals are not fabricated as trades.",
        "The low count is consistent with the configured strict research gates. Review near-threshold rows before relaxing any rule.",
    ]})

    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        pd.DataFrame([summary]).T.reset_index().rename(columns={"index": "metric", 0: "value"}).to_excel(writer, sheet_name="Summary", index=False)
        coverage.to_excel(writer, sheet_name="Coverage", index=False)
        method.to_excel(writer, sheet_name="Methodology", index=False)
        code_df.to_excel(writer, sheet_name="DecisionCodes", index=False)
        gate_df.to_excel(writer, sheet_name="GateFailures", index=False)
        symbol_df.to_excel(writer, sheet_name="SymbolFrequency", index=False)
        near.to_excel(writer, sheet_name="NearThreshold", index=False)
        trades.to_excel(writer, sheet_name="Trades", index=False)
        targets.to_excel(writer, sheet_name="RewardLadder", index=False)
        adverse.to_excel(writer, sheet_name="AdverseLadder", index=False)
        regimes.to_excel(writer, sheet_name="RegimePerformance", index=False)
        for ws in writer.book.worksheets:
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
            for column in ws.columns:
                width = min(42, max(12, max(len(str(cell.value or "")) for cell in column) + 2))
                ws.column_dimensions[column[0].column_letter].width = width
    print(out)


if __name__ == "__main__":
    main()
