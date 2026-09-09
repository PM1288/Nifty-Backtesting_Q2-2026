"""Explainable V7 trade-quality research. Read-only inputs; additive outputs only."""
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
from pathlib import Path

import numpy as np
from psycopg.types.json import Jsonb


VERSION = "MANEESH_V7_GOOD_TRADE_SHAP_1"
RULE_VERSION = "FNO_PAIRED_EMA9_POSITION_BODY70_NEXT_OPEN_V7"
LABEL_POLICY = "GOOD_TRADE_NET_POSITIVE_EOD_ZERODHA_20260909_ONE_LOT"
CHARGE_POLICY = "ZERODHA_NSE_OPTIONS_CALCULATOR_20260909"
MINIMUM_SESSIONS = 20
MINIMUM_TRAINING_ROWS = 100
HOLDOUT_SESSIONS = 5
FEATURES = [
    "interval_minutes", "direction_call", "strike_distance_pct",
    "underlying_body_fraction", "option_body_fraction",
    "underlying_ema_distance_pct", "option_ema_distance_pct",
    "underlying_entry_gap_pct", "option_entry_gap_pct",
    "underlying_rsi14", "underlying_macd", "underlying_macd_signal9",
    "underlying_macd_histogram", "selected_rsi14", "selected_macd",
    "selected_macd_signal9", "selected_macd_histogram",
    "opposite_rsi14", "opposite_macd", "opposite_macd_signal9",
    "opposite_macd_histogram", "underlying_precursor_red_count",
    "option_precursor_red_count",
]
GROUPS = [
    "Session", "Direction", "Structure", "Setup", "Setup", "Price", "Option",
    "Price", "Option", "Underlying indicators", "Underlying indicators",
    "Underlying indicators", "Underlying indicators", "Selected option indicators",
    "Selected option indicators", "Selected option indicators",
    "Selected option indicators", "Opposite option indicators",
    "Opposite option indicators", "Opposite option indicators",
    "Opposite option indicators", "Candle context", "Candle context",
]
CONFIG = {
    "version": VERSION,
    "rule_version": RULE_VERSION,
    "label_policy": LABEL_POLICY,
    "charge_policy": CHARGE_POLICY,
    "outcome_horizon": "EOD endpoint of the exact selected option",
    "minimum_sessions": MINIMUM_SESSIONS,
    "minimum_training_rows": MINIMUM_TRAINING_ROWS,
    "holdout_sessions": HOLDOUT_SESSIONS,
    "features": FEATURES,
    "seed": 42,
    "execution_enabled": False,
}


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def _number(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = float(value)
        return result if np.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _money(value):
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _whole(value):
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def option_pnl(entry, exit_value, quantity):
    """Match the approved two-order NSE options calculator policy."""
    buy, sell, qty = _number(entry), _number(exit_value), _number(quantity)
    if buy is None or sell is None or qty is None or buy <= 0 or sell < 0 or qty <= 0 or int(qty) != qty:
        return None
    qty = int(qty)
    turnover = _money((buy + sell) * qty)
    brokerage = 40.0
    stt = _whole(_money(sell * qty * 0.0015))
    sebi = _money(turnover * 0.000001)
    exchange = _money(turnover * 0.0003503)
    ipft = _money(turnover * 0.000005)
    gst = _money((brokerage + sebi + exchange + ipft) * 0.18)
    stamp = _whole(_money(buy * qty * 0.00003))
    charges = _money(brokerage + stt + sebi + exchange + ipft + gst + stamp)
    gross = _money((sell - buy) * qty)
    return {
        "policy": CHARGE_POLICY, "entry": buy, "exit": sell, "quantity": qty,
        "gross": gross, "charges": charges, "net": _money(gross - charges),
        "brokerage": brokerage, "stt": stt, "sebi": sebi, "exchange": exchange,
        "ipft": ipft, "gst": gst, "stamp": stamp,
    }


def _indicator(evidence, key, field):
    value = (evidence or {}).get(key) or {}
    return _number(value.get(field))


def _pct_distance(value, reference):
    value, reference = _number(value), _number(reference)
    return None if value is None or reference in (None, 0) else (value / reference - 1) * 100


def build_trade_example(row):
    direction = row["direction"]
    selected_key, opposite_key = ("ce", "pe") if direction == "CALL" else ("pe", "ce")
    indicators = row.get("indicator_evidence") or {}
    conditions = row.get("condition_evidence") or {}
    outcomes = row.get("outcome_evidence") or {}
    eod = outcomes.get("eod") or {}
    selected_outcome = eod.get(selected_key) or {}
    selected_entry = row.get(f"{selected_key}_entry_open")
    selected_lot = row.get(f"{selected_key}_lot_size")
    pnl = option_pnl(selected_entry, selected_outcome.get("endpoint"), selected_lot)
    precursors = conditions.get("underlying_precursors") or []
    option_precursors = conditions.get("selected_option_precursors") or []
    feature_values = {
        "interval_minutes": _number(row.get("interval_minutes")),
        "direction_call": 1.0 if direction == "CALL" else 0.0,
        "strike_distance_pct": _pct_distance(row.get("strike"), row.get("underlying_entry_open")),
        "underlying_body_fraction": _number(row.get("underlying_body_fraction")),
        "option_body_fraction": _number(row.get("option_body_fraction")),
        "underlying_ema_distance_pct": _pct_distance(row.get("underlying_setup_close"), row.get("underlying_ema9")),
        "option_ema_distance_pct": _pct_distance(row.get("option_setup_close"), row.get("option_ema9")),
        "underlying_entry_gap_pct": _pct_distance(row.get("underlying_entry_open"), row.get("underlying_setup_close")),
        "option_entry_gap_pct": _pct_distance(row.get("option_entry_open"), row.get("option_setup_close")),
        "underlying_rsi14": _indicator(indicators, "underlying", "rsi14"),
        "underlying_macd": _indicator(indicators, "underlying", "macd"),
        "underlying_macd_signal9": _indicator(indicators, "underlying", "macd_signal9"),
        "underlying_macd_histogram": _indicator(indicators, "underlying", "macd_histogram"),
        "selected_rsi14": _indicator(indicators, selected_key, "rsi14"),
        "selected_macd": _indicator(indicators, selected_key, "macd"),
        "selected_macd_signal9": _indicator(indicators, selected_key, "macd_signal9"),
        "selected_macd_histogram": _indicator(indicators, selected_key, "macd_histogram"),
        "opposite_rsi14": _indicator(indicators, opposite_key, "rsi14"),
        "opposite_macd": _indicator(indicators, opposite_key, "macd"),
        "opposite_macd_signal9": _indicator(indicators, opposite_key, "macd_signal9"),
        "opposite_macd_histogram": _indicator(indicators, opposite_key, "macd_histogram"),
        "underlying_precursor_red_count": float(sum(x.get("colour") == "RED" for x in precursors)),
        "option_precursor_red_count": float(sum(x.get("colour") == "RED" for x in option_precursors)),
    }
    mature = row.get("outcome_state") == "MATURE_EOD" and eod.get("maturity") == "MATURE"
    return {
        "signal_key": row["signal_key"], "trade_date": row["trade_date"],
        "entry_end": str(row["entry_end"]), "symbol": row["underlying_symbol"],
        "direction": direction, "interval_minutes": row["interval_minutes"],
        "expiry": row["expiry"], "strike": _number(row.get("strike")),
        "selected_option": row.get(f"{selected_key}_symbol"),
        "opposite_option": row.get(f"{opposite_key}_symbol"),
        "lot_size": selected_lot, "lot_size_basis": "CURRENT_EXACT_CONTRACT_MASTER_NOT_HISTORICAL",
        "label_policy": LABEL_POLICY, "maturity": row.get("outcome_state"),
        "label": None if not mature or pnl is None else int(pnl["net"] > 0),
        "label_name": "GOOD_TRADE" if mature and pnl and pnl["net"] > 0 else "NON_POSITIVE" if mature and pnl else "UNAVAILABLE",
        "pnl": pnl, "features": feature_values,
        "indicators": indicators, "conditions": conditions, "outcomes": outcomes,
        "input_complete": all(feature_values[name] is not None for name in FEATURES),
        "source_note": "Quote-path research, not a booked or executable paper-trade result.",
    }


def load_trade_examples(conn):
    rows = conn.execute("""
      SELECT s.signal_key,s.trade_date::text,s.interval_minutes,s.entry_end,s.direction,
        s.underlying_symbol,s.expiry::text,s.strike::float8,s.underlying_setup_close::float8,
        s.underlying_ema9::float8,s.underlying_body_fraction::float8,s.underlying_entry_open::float8,
        s.option_setup_close::float8,s.option_ema9::float8,s.option_body_fraction::float8,
        s.option_entry_open::float8,o.ce_symbol,o.pe_symbol,o.ce_entry_open::float8,o.pe_entry_open::float8,
        o.condition_evidence,o.indicator_evidence,o.outcome_evidence,o.outcome_state,
        ce.lotsize::int ce_lot_size,pe.lotsize::int pe_lot_size
      FROM nse_ops.scalper_entry_signal s
      JOIN nse_ops.scalper_trade_observation o USING(signal_key)
      LEFT JOIN LATERAL (SELECT lotsize FROM instruments WHERE exchange='NFO'
        AND tradingsymbol=o.ce_symbol AND symbol_token=o.ce_token AND expiry=s.expiry
        ORDER BY updated_at DESC LIMIT 1) ce ON true
      LEFT JOIN LATERAL (SELECT lotsize FROM instruments WHERE exchange='NFO'
        AND tradingsymbol=o.pe_symbol AND symbol_token=o.pe_token AND expiry=s.expiry
        ORDER BY updated_at DESC LIMIT 1) pe ON true
      WHERE s.rule_version=%s ORDER BY s.trade_date,s.entry_end,s.underlying_symbol
    """, (RULE_VERSION,)).fetchall()
    return [build_trade_example(row) for row in rows]


def fit_trade_quality(examples):
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, brier_score_loss, log_loss
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from xgboost import XGBClassifier
    import shap

    complete = [x for x in examples if x["label"] is not None and x["input_complete"]]
    sessions = sorted({x["trade_date"] for x in complete})
    coverage = {name: sum(x["features"][name] is not None for x in examples) for name in FEATURES}
    base = {"predictions": [], "models": [], "feature_coverage": coverage,
            "model_eligible_rows": len(complete), "model_eligible_sessions": len(sessions)}
    if len(sessions) < MINIMUM_SESSIONS:
        return {**base, "state": "DATA_INSUFFICIENT",
                "reason": f"Need {MINIMUM_SESSIONS} complete independent sessions; have {len(sessions)}"}
    test_days = sessions[-HOLDOUT_SESSIONS:]
    train = [x for x in complete if x["trade_date"] not in test_days]
    test = [x for x in complete if x["trade_date"] in test_days]
    if len(train) < MINIMUM_TRAINING_ROWS or len({x["label"] for x in train}) < 2:
        return {**base, "state": "DATA_INSUFFICIENT",
                "reason": f"Need {MINIMUM_TRAINING_ROWS} training rows and both outcome classes"}
    X = lambda rows: np.array([[row["features"][name] for name in FEATURES] for row in rows])
    xt, xv = X(train), X(test)
    yt, yv = np.array([x["label"] for x in train]), np.array([x["label"] for x in test])
    linear = make_pipeline(StandardScaler(), LogisticRegression(C=.5, max_iter=1000, random_state=42)).fit(xt, yt)
    tree = XGBClassifier(n_estimators=60, max_depth=2, learning_rate=.05, n_jobs=1,
                         objective="binary:logistic", random_state=42).fit(xt, yt)
    background = xt[np.linspace(0, len(xt)-1, min(100, len(xt)), dtype=int)]
    explainer = shap.TreeExplainer(tree, data=background, feature_perturbation="interventional", model_output="raw")
    explanation = explainer(xv)
    margins = tree.predict(xv, output_margin=True)
    max_error = float(np.max(np.abs(explanation.base_values + explanation.values.sum(axis=1) - margins)))
    if max_error > 1e-4:
        raise ValueError("TRADE_QUALITY_SHAP_RECONCILIATION_FAILED")
    probability = tree.predict_proba(xv)[:, 1]
    baseline = np.repeat(float(yt.mean()), len(test))
    metrics = {}
    for name, probs in (("frequency", baseline), ("logistic", linear.predict_proba(xv)[:, 1]), ("xgboost", probability)):
        metrics[name] = {"log_loss": float(log_loss(yv, probs, labels=[0, 1])),
                         "brier": float(brier_score_loss(yv, probs)),
                         "accuracy": float(accuracy_score(yv, probs >= .5))}
    predictions = []
    for index, example in enumerate(test):
        predictions.append({"signal_key": example["signal_key"], "probability_good_trade": float(probability[index]),
            "actual_label": example["label"], "features": example["features"],
            "explanation": {"units": "raw binary log-odds margin; not probability percentage points",
                "base_value": float(explanation.base_values[index]), "output": float(margins[index]),
                "feature_names": FEATURES, "groups": GROUPS,
                "contributions": explanation.values[index].tolist()}})
    return {**base, "state": "EXPLORATORY", "reason": "Held-out research only; no execution use approved",
            "train_rows": len(train), "test_rows": len(test), "test_sessions": test_days,
            "metrics": metrics, "shap_max_error": max_error, "predictions": predictions,
            "models": [{"name": "logistic", "parameters": {"C": .5}},
                       {"name": "xgboost", "parameters": {"n_estimators": 60, "max_depth": 2, "learning_rate": .05}}]}


def run_trade_quality(conn, code_commit="unknown"):
    Path("schema.sql").read_text()  # Fail early if the packaged schema is missing.
    examples = load_trade_examples(conn)
    result = fit_trade_quality(examples)
    worker_sha256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    run_id = _digest({"config": CONFIG, "examples": examples, "code_commit": code_commit,
                      "worker_sha256": worker_sha256})
    report = {
        "run_id": run_id, "version": VERSION, "state": result["state"], "reason": result["reason"],
        "config": CONFIG, "code_commit": code_commit, "worker_sha256": worker_sha256,
        "execution_enabled": False,
        "coverage": {"observations": len(examples),
                     "mature": sum(x["label"] is not None for x in examples),
                     "good_trades": sum(x["label"] == 1 for x in examples),
                     "non_positive_trades": sum(x["label"] == 0 for x in examples),
                     "sessions": len({x["trade_date"] for x in examples}),
                     "model_eligible_rows": result["model_eligible_rows"],
                     "model_eligible_sessions": result["model_eligible_sessions"]},
        "feature_coverage": result["feature_coverage"],
        "evaluation": {k: v for k, v in result.items() if k not in ("predictions", "models", "feature_coverage")},
        "limitations": [
            "Good trade means quote-based EOD net P&L above zero for one lot; it is not booked P&L.",
            "Charges use the versioned current Zerodha NSE options calculator policy.",
            "Lot size is the current exact contract-master value and may not represent historical lot size.",
            "Only entry-time inputs are features; 15m, 30m and EOD paths are outcomes and never model inputs.",
            "Rows with missing indicators remain visible but are excluded from model fitting; missing is never zero.",
        ],
    }
    conn.execute("INSERT INTO nifty_context.trade_quality_runs(id,report) VALUES(%s,%s) ON CONFLICT DO NOTHING",
                 (run_id, Jsonb(report)))
    for example in examples:
        conn.execute("INSERT INTO nifty_context.trade_quality_examples(run_id,signal_key,evidence) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING",
                     (run_id, example["signal_key"], Jsonb(example)))
    for prediction in result["predictions"]:
        explanation = prediction.pop("explanation")
        conn.execute("INSERT INTO nifty_context.trade_quality_predictions(run_id,signal_key,result,explanation) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                     (run_id, prediction["signal_key"], Jsonb(prediction), Jsonb(explanation)))
    conn.commit()
    return report
