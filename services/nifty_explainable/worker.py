"""Isolated, CPU-only research. Never imports execution or notification code."""
import argparse
import base64
import hashlib
import importlib.metadata
import json
import logging
import os
import pickle
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from trade_quality import run_trade_quality

LOG = logging.getLogger("nifty_context")
VERSION = "NIFTY_CONTEXT_EXPERIMENT_1"
FEATURES = ["return_5", "return_15", "return_30", "ema_distance", "ema_slope",
            "volatility_30", "range_30_pct", "session_location", "minutes_from_open"]
GROUPS = ["Price"] * 5 + ["Volatility"] * 2 + ["Price", "Session"]
CONFIG = {"version": VERSION, "threshold_log_return": .0015, "horizon_minutes": 60,
          "decision_minutes_after_open": [60, 120, 180, 240, 300], "availability_delay_seconds": 120,
          "holdout_sessions": 5, "minimum_sessions": 20, "background_rows": 100,
          "seed": 42, "features": FEATURES, "mode": "EXPLORATORY_REVISION_UNVERIFIED",
          "recovery_lookback_days": 15, "recovery_retry_seconds": 300,
          "hyperparameter_search": False,
          "direction": "DOWN if log return < -0.0015; UP if > +0.0015; SMALL otherwise",
          "range": "next 60 complete one-minute highs max minus lows min, in index points"}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def clean(value):
    return json.loads(json.dumps(value, default=lambda v: v.item() if isinstance(v, np.generic) else str(v), allow_nan=False))


def connect():
    return psycopg.connect(os.environ["PG_DSN"], row_factory=dict_row,
                           options="-c statement_timeout=60000 -c lock_timeout=5000")


def load(conn, days=180):
    bars = pd.DataFrame(conn.execute("""SELECT ts,open::float8,high::float8,low::float8,close::float8,
      created_at,source FROM public.bars_1m WHERE exchange='NSE' AND symbol_token='99926000'
      AND ts >= now()-(%s * interval '1 day') ORDER BY ts""", (days,)).fetchall(),
      columns=['ts','open','high','low','close','created_at','source'])
    sessions = conn.execute("""SELECT trade_date,market_open_ts,market_close_ts FROM public.trading_calendar
      WHERE is_trading_day AND trade_date >= current_date-180 AND trade_date <= current_date ORDER BY trade_date""").fetchall()
    return bars, sessions


def features(history, session_open):
    h = history.sort_values("ts")
    if len(h) < 31 or not np.isfinite(h[["open", "high", "low", "close"]].to_numpy()).all():
        return None
    if (h[["open", "high", "low", "close"]] <= 0).any().any() or (h.high < h[["open","close","low"]].max(axis=1)).any() or (h.low > h[["open","close"]].min(axis=1)).any() or not (h.ts.diff().dropna() == pd.Timedelta(minutes=1)).all():
        return None
    close = h.close.to_numpy()
    ema = float(close[:9].mean())
    previous = ema
    for p in close[9:]:
        previous, ema = ema, .2 * p + .8 * ema
    high, low = float(h.high.max()), float(h.low.min())
    return dict(zip(FEATURES, [*(float(np.log(close[-1] / close[-1 - n])) for n in (5, 15, 30)),
        float(close[-1] / ema - 1), float(ema / previous - 1),
        float(np.std(np.diff(np.log(close[-31:])))),
        float((h.high.tail(30).max() - h.low.tail(30).min()) / close[-1]),
        float((close[-1] - low) / (high - low)) if high > low else .5,
        float((h.ts.iloc[-1] + pd.Timedelta(minutes=1) - session_open).total_seconds() / 60)]))


def build_examples(bars, sessions, now):
    examples, rejected = [], []
    if bars.empty:
        return examples, [{"reason": "NO_NIFTY_MINUTES"}]
    bars = bars.copy()
    bars.ts = pd.to_datetime(bars.ts, utc=True)
    bars.created_at = pd.to_datetime(bars.created_at, utc=True)
    for session in sessions:
        start, end = pd.Timestamp(session["market_open_ts"]), pd.Timestamp(session["market_close_ts"])
        if end <= bars.ts.min():
            continue
        for offset in CONFIG["decision_minutes_after_open"]:
            anchor = start + pd.Timedelta(minutes=offset)
            cutoff = anchor + pd.Timedelta(seconds=CONFIG["availability_delay_seconds"])
            window_end = cutoff + pd.Timedelta(minutes=60)
            if window_end > end or cutoff > now:
                continue
            # Every input is complete and collected by this example's own cutoff.
            h = bars[(bars.ts >= start) & (bars.ts < anchor) & (bars.created_at <= cutoff)]
            x = features(h, start)
            if x is None or len(h) != offset:
                rejected.append({"cutoff": str(cutoff), "reason": "INCOMPLETE_OR_LATE_INPUT_MINUTES", "observed": len(h), "expected": offset})
                continue
            entry_rows = bars[bars.ts == cutoff]
            future = bars[(bars.ts >= cutoff) & (bars.ts < window_end)]
            y = None
            if len(entry_rows) == 1 and len(future) == 60 and window_end <= now and features(future, cutoff) is not None:
                reference = float(entry_rows.iloc[0].open)
                r = float(np.log(future.iloc[-1].close / reference))
                threshold = CONFIG['threshold_log_return']
                y = {"log_return": r, "direction": 2 if r > threshold else 0 if r < -threshold else 1,
                     "range": float(future.high.max() - future.low.min()), "reference": reference,
                     "available_at": str(max(window_end, future.created_at.max())),
                     "source_rows":clean(future.to_dict('records'))}
            examples.append({"cutoff": str(cutoff), "window_end": str(window_end), "session": str(session["trade_date"]),
                             "features": x, "labels": y, "max_input_event_time": str(h.ts.max() + pd.Timedelta(minutes=1)),
                             "max_input_available_at": str(h.created_at.max()), "source_digest": digest(h.to_dict("records")),
                             "source_rows": clean(h.to_dict("records")), "mode": CONFIG["mode"]})
    return examples, rejected


def explain_and_fit(examples):
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import log_loss, mean_absolute_error, mean_pinball_loss
    from sklearn.ensemble import GradientBoostingRegressor
    from xgboost import XGBClassifier
    import shap

    mature = [x for x in examples if x["labels"] is not None]
    days = sorted({x["session"] for x in mature})
    if len(days) < CONFIG["minimum_sessions"]:
        return {"state": "DATA_INSUFFICIENT", "reason": f"Need {CONFIG['minimum_sessions']} eligible sessions; have {len(days)}", "predictions": [], "models": []}
    test_days = days[-CONFIG["holdout_sessions"]:]
    test = [x for x in mature if x["session"] in test_days]
    first_test = pd.Timestamp(test[0]["cutoff"])
    train = [x for x in mature if x["session"] not in test_days and pd.Timestamp(x["window_end"]) < first_test
             and pd.Timestamp(x["labels"]["available_at"]) < first_test]
    X = lambda rows: np.array([[r["features"][f] for f in FEATURES] for r in rows])
    xt, xv = X(train), X(test)
    yt = np.array([x["labels"]["direction"] for x in train]); yv = np.array([x["labels"]["direction"] for x in test])
    if len(train) < 40 or len(set(yt)) != 3:
        return {"state": "DATA_INSUFFICIENT", "reason": "Need 40 training occasions and all three classes", "predictions": [], "models": []}
    logistic = make_pipeline(StandardScaler(), LogisticRegression(C=.5, max_iter=1000, random_state=42)).fit(xt, yt)
    tree = XGBClassifier(n_estimators=40, max_depth=2, learning_rate=.05, n_jobs=1,
                         objective="multi:softprob", num_class=3, random_state=42).fit(xt, yt)
    background = xt[np.linspace(0, len(xt)-1, min(len(xt), 100), dtype=int)]
    background_id = digest(background.tolist())
    linear_explainer = shap.LinearExplainer(logistic[-1],logistic[0].transform(background))
    lexp = linear_explainer(logistic[0].transform(xv))
    linear_error=float(np.max(np.abs(lexp.base_values+lexp.values.sum(axis=1)-logistic.decision_function(xv))))
    if linear_error>1e-4:
        raise ValueError('LINEAR_SHAP_RECONCILIATION_FAILED')
    explainer = shap.TreeExplainer(tree, data=background, feature_perturbation="interventional", model_output="raw")
    explanation = explainer(xv)
    margins = tree.predict(xv, output_margin=True)
    error = float(np.max(np.abs(explanation.base_values + explanation.values.sum(axis=1) - margins)))
    if error > 1e-4:
        raise ValueError("SHAP_RECONCILIATION_FAILED")
    range_models = {str(q): GradientBoostingRegressor(loss="quantile", alpha=q, n_estimators=40,
                     max_depth=2, random_state=42).fit(xt, [r["labels"]["range"] for r in train]) for q in (.1,.5,.9)}
    ranges = {q: model.predict(xv) for q, model in range_models.items()}
    range_explainer = shap.TreeExplainer(range_models["0.5"], data=background, feature_perturbation="interventional")
    rexp = range_explainer(xv)
    rerror = float(np.max(np.abs(rexp.base_values + rexp.values.sum(axis=1) - ranges["0.5"])))
    if rerror > 1e-4:
        raise ValueError("RANGE_SHAP_RECONCILIATION_FAILED")
    freq = np.bincount(yt, minlength=3) / len(yt)
    probs = {"frequency": np.tile(freq, (len(test), 1)), "logistic": logistic.predict_proba(xv), "xgboost": tree.predict_proba(xv)}
    metrics = {}
    for name, p in probs.items():
        metrics[name] = {"log_loss": float(log_loss(yv, p, labels=[0,1,2])),
                         "multiclass_brier": float(np.mean(np.sum((p-np.eye(3)[yv])**2, axis=1))),
                         "accuracy": float(np.mean(p.argmax(axis=1)==yv)),
                         "reliability": [{"class": label, "bins": [
                             {"lower": lo/5, "upper": (lo+1)/5, "count": int(mask.sum()),
                              "predicted": float(p[mask,k].mean()) if mask.any() else None,
                              "observed": float((yv[mask]==k).mean()) if mask.any() else None}
                             for lo in range(5) for mask in [(p[:,k]>=lo/5) & (p[:,k] < (lo+1)/5 if lo<4 else p[:,k]<=1)]]}
                             for k,label in enumerate(["DOWN","SMALL","UP"])]}
    actual_range = np.array([x["labels"]["range"] for x in test])
    baseline_range = np.array([np.median([r["labels"]["range"] for r in train if r["features"]["minutes_from_open"]==x["features"]["minutes_from_open"]] or [r["labels"]["range"] for r in train]) for x in test])
    metrics["range"] = {"baseline_mae": float(mean_absolute_error(actual_range, baseline_range)),
         "median_mae": float(mean_absolute_error(actual_range,ranges["0.5"])),
         "quantile_loss": {q: float(mean_pinball_loss(actual_range,p,alpha=float(q))) for q,p in ranges.items()},
         "interval_coverage": float(np.mean((actual_range>=ranges["0.1"]) & (actual_range<=ranges["0.9"]))),
         "crossing_count": int(np.sum((ranges["0.1"]>ranges["0.5"]) | (ranges["0.5"]>ranges["0.9"])))}
    predictions = []
    for i,x in enumerate(test):
        predictions.append({"cutoff": x["cutoff"], "window_end": x["window_end"], "mode": CONFIG["mode"],
            "probabilities": dict(zip(["DOWN","SMALL","UP"],probs["xgboost"][i].tolist())),
            "range_quantiles": {q: float(v[i]) for q,v in ranges.items()}, "actual": x["labels"],
            "features": x["features"], "explanation": {"direction_units": "raw class margin; NOT probability percentage points",
              "range_units": "index points", "background_id": background_id, "feature_names": FEATURES, "groups": GROUPS,
              "direction_base": explanation.base_values[i].tolist(), "direction_contributions": explanation.values[i].tolist(),
              "direction_output": margins[i].tolist(), "range_base": float(rexp.base_values[i]),
              "range_contributions": rexp.values[i].tolist(), "range_output": float(ranges["0.5"][i])}})
    return {"state": "EXPLORATORY", "reason": "Limited-history research; source revisions unverified; no live model approved",
            "train_count": len(train), "test_count": len(test), "train_sessions": len({x['session'] for x in train}),
            "test_sessions": test_days, "metrics": metrics, "shap_max_error": error, "range_shap_max_error": rerror,
            "linear_shap_max_error":linear_error,
            "models": [{"name": "logistic", "parameters": {"C": .5},
                        "coefficients":logistic[-1].coef_.tolist(),"intercepts":logistic[-1].intercept_.tolist(),
                        "scaler_mean":logistic[0].mean_.tolist(),"scaler_scale":logistic[0].scale_.tolist()},
                       {"name": "xgboost", "parameters": tree.get_params(), "serialized_json": tree.get_booster().save_raw(raw_format='json').decode()},
                       {"name": "range_quantiles", "parameters": {"n_estimators":40,"max_depth":2,"alphas":[.1,.5,.9]},
                        "artifact_format":"base64 Python pickle; trusted local artifacts only; never accept uploads",
                        "artifact":base64.b64encode(pickle.dumps(range_models,protocol=5)).decode()}],
            "background_id": background_id, "background": background.tolist(), "predictions": predictions}


def prospective_snapshot(example, now):
    if not 0 <= (now-pd.Timestamp(example['cutoff'])).total_seconds()<60:
        raise ValueError('MISSED_CAPTURE_WINDOW')
    x={k:v for k,v in example.items() if k!='labels'}
    x['planned_cutoff']=example['cutoff']
    # Never label an already-started candle as the entry of a later capture.
    cutoff=now.floor('min')+pd.Timedelta(minutes=1)
    x.update(cutoff=str(cutoff),window_end=str(cutoff+pd.Timedelta(minutes=60)),
             mode='PROSPECTIVE_CAPTURE',captured_at=str(now),
             point_in_time_eligible=True,availability_state='CAPTURED_ON_SCHEDULE')
    return x


def recovery_snapshot(bars, session, planned_cutoff, now):
    """Reconstruct a missed window without claiming it was captured on time."""
    now, planned = pd.Timestamp(now), pd.Timestamp(planned_cutoff)
    start, end = pd.Timestamp(session['market_open_ts']), pd.Timestamp(session['market_close_ts'])
    anchor = planned - pd.Timedelta(seconds=CONFIG['availability_delay_seconds'])
    expected = int((anchor-start).total_seconds()/60)
    if now < planned or expected not in CONFIG['decision_minutes_after_open']:
        return None, None, 'NOT_A_MISSED_PLANNED_WINDOW'
    available = bars.copy()
    available.ts = pd.to_datetime(available.ts, utc=True)
    available.created_at = pd.to_datetime(available.created_at, utc=True)
    h = available[(available.ts>=start)&(available.ts<anchor)&(available.created_at<=now)].sort_values('ts')
    xvalues = features(h,start)
    if xvalues is None or len(h)!=expected:
        return None, None, 'RECOVERY_INPUT_INCOMPLETE'
    window_end = planned+pd.Timedelta(minutes=CONFIG['horizon_minutes'])
    x = {'cutoff':str(planned),'window_end':str(window_end),'session':str(session['trade_date']),
         'features':xvalues,'max_input_event_time':str(h.ts.max()+pd.Timedelta(minutes=1)),
         'max_input_available_at':str(h.created_at.max()),'source_digest':digest(h.to_dict('records')),
         'source_rows':clean(h.to_dict('records')),'mode':'RECOVERED_CAPTURE',
         'planned_cutoff':str(planned),'captured_at':str(now),
         'recovery_delay_seconds':int((now-planned).total_seconds()),
         'point_in_time_eligible':False,
         'availability_state':'RECOVERED_AFTER_PLANNED_CUTOFF'}
    outcome = None
    future = available[(available.ts>=planned)&(available.ts<window_end)&(available.created_at<=now)].sort_values('ts')
    if window_end<=min(now,end) and len(future)==CONFIG['horizon_minutes'] and features(future,planned) is not None:
        reference=float(future.iloc[0].open); r=float(np.log(future.iloc[-1].close/reference)); threshold=CONFIG['threshold_log_return']
        labels={'log_return':r,'direction':2 if r>threshold else 0 if r< -threshold else 1,
                'range':float(future.high.max()-future.low.min()),'reference':reference,
                'available_at':str(max(now,window_end,future.created_at.max()))}
        outcome={'labels':labels,'source_rows':clean(future.to_dict('records')),
                 'availability_state':'RECOVERED_AFTER_PLANNED_CUTOFF'}
    return x,outcome,None


def experiment():
    started = time.monotonic()
    with connect() as conn:
        conn.execute(Path("schema.sql").read_text()); conn.commit()
        bars,sessions = load(conn)
        examples,rejected = build_examples(bars,sessions,pd.Timestamp.now(tz="UTC"))
        # Retain qualified prospective examples even after ordinary minute retention.
        saved=conn.execute("""SELECT s.id AS snapshot_id,s.evidence,o.evidence AS outcome FROM nifty_context.snapshots s
          JOIN nifty_context.outcomes o ON o.snapshot_id=s.id WHERE s.mode IN ('PROSPECTIVE_CAPTURE','RECOVERED_CAPTURE')
          AND s.cutoff>=now()-interval '730 days' ORDER BY s.cutoff""").fetchall()
        merged={x['cutoff']:x for x in examples}
        saved_snapshot_ids={}
        for row in saved:
            x=row['evidence']; x['labels']={**row['outcome']['labels'],'source_rows':row['outcome']['source_rows']}
            key=x.get('planned_cutoff',x['cutoff'])
            merged[key]=x
            saved_snapshot_ids[key]=row['snapshot_id']
        examples=sorted(merged.values(),key=lambda x:x['cutoff'])
        source_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        run_id = digest({"config":CONFIG,"code":source_hash,"commit":os.getenv('CODE_COMMIT','unknown'),"data":[x["source_digest"] for x in examples],"labels":[x["labels"] for x in examples]})
        if conn.execute("SELECT id FROM nifty_context.runs WHERE id=%s",(run_id,)).fetchone():
            LOG.info("experiment_exists run_id=%s",run_id); return
        result = explain_and_fit(examples)
        report = {"run_id":run_id, "config":CONFIG,"state":result["state"],"reason":result["reason"],
            "code_commit":os.getenv("CODE_COMMIT","unknown"), "worker_sha256":source_hash, "created_at":datetime.now(timezone.utc).isoformat(),
            "packages": {n:importlib.metadata.version(n) for n in ["shap","scikit-learn","xgboost-cpu","pandas","numpy"]},
            "coverage":{"raw_minutes":len(bars),"raw_sessions":len({str(r['ts'].date()) for r in bars.to_dict('records')}),
              "eligible_occasions":len(examples),"mature_occasions":sum(x['labels'] is not None for x in examples),"rejected":rejected},
            "session_coverage":[{"session":str(day),"minutes":len(group),
                 "eligible":sum(x['session']==str(day) for x in examples),
                 "mature":sum(x['session']==str(day) and x['labels'] is not None for x in examples)}
                for day,group in bars.groupby(pd.to_datetime(bars.ts,utc=True).dt.tz_convert('Asia/Kolkata').dt.date)],
            "gaps":["Historical OHLC revisions overwrite values without updating created_at; replay is exploratory",
              "OI/IV incremental models pending per-contract source-time and cohort audit",
              "Institutional historical availability unverified; excluded",
              "Exact-option profit model deferred pending executable quote coverage",
              "EMA9 quality model deferred pending sufficient independent V7 episodes",
              "No live prediction model approved; immutable prospective snapshots accumulate hourly"],
            "evaluation":{k:v for k,v in result.items() if k not in ['predictions','models','background']},
            "duration_seconds":round(time.monotonic()-started,3)}
        conn.execute("INSERT INTO nifty_context.runs VALUES(%s,now(),%s)",(run_id,Jsonb(clean(report))))
        for model in result.get("models",[]):
            conn.execute("INSERT INTO nifty_context.models VALUES(%s,%s,%s)",(run_id+model['name'],run_id,Jsonb(clean({**model,'background':result['background']}))))
        for x in examples:
            sid=saved_snapshot_ids.get(x.get('planned_cutoff',x['cutoff']),digest(x))
            conn.execute("INSERT INTO nifty_context.snapshots(id,cutoff,mode,evidence) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",(sid,x['cutoff'],x['mode'],Jsonb(clean(x))))
            conn.execute("INSERT INTO nifty_context.run_snapshots VALUES(%s,%s) ON CONFLICT DO NOTHING",(run_id,sid))
            for p in [p for p in result.get('predictions',[]) if p['cutoff']==x['cutoff']]:
                pid=digest({'run':run_id,'cutoff':x['cutoff']})
                exp=p.pop('explanation')
                p['range_model_id']=run_id+'range_quantiles'
                conn.execute("INSERT INTO nifty_context.predictions VALUES(%s,%s,%s,%s,%s,%s,%s)",(pid,run_id,sid,run_id+'xgboost',p['cutoff'],p['window_end'],Jsonb(clean(p))))
                conn.execute("INSERT INTO nifty_context.explanations VALUES(%s,%s)",(pid,Jsonb(clean(exp))))
        conn.execute("INSERT INTO nifty_context.evaluations VALUES(%s,%s)",(run_id,Jsonb(clean(report['evaluation']))))
        conn.commit()
        LOG.info("experiment_complete run_id=%s state=%s seconds=%.2f",run_id,result['state'],time.monotonic()-started)


_last_recovery_attempt = None
_last_trade_quality_date = None


def capture():
    global _last_recovery_attempt, _last_trade_quality_date
    now=pd.Timestamp.now(tz='UTC')
    with connect() as conn:
        sessions=conn.execute("""SELECT trade_date,market_open_ts,market_close_ts FROM public.trading_calendar
          WHERE is_trading_day AND trade_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date-%s
          AND trade_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY trade_date""",
          (CONFIG['recovery_lookback_days'],)).fetchall()
        offsets=CONFIG['decision_minutes_after_open']+[360,380]
        scheduled_tick=any(0 <= (now-(pd.Timestamp(s['market_open_ts'])+pd.Timedelta(minutes=m,seconds=120))).total_seconds() < 60
                           for s in sessions for m in offsets)
        existing={pd.Timestamp(r['planned_cutoff']) for r in conn.execute("""SELECT evidence->>'planned_cutoff' planned_cutoff
          FROM nifty_context.snapshots WHERE mode IN ('PROSPECTIVE_CAPTURE','RECOVERED_CAPTURE')
          AND evidence ? 'planned_cutoff' AND cutoff>=now()-(%s*interval '1 day')""",
          (CONFIG['recovery_lookback_days'],)).fetchall()}
        planned=[(s,pd.Timestamp(s['market_open_ts'])+pd.Timedelta(minutes=m,seconds=120))
                 for s in sessions for m in CONFIG['decision_minutes_after_open']
                 if pd.Timestamp(s['market_open_ts'])+pd.Timedelta(minutes=m,seconds=120)<=now]
        missing=[pair for pair in planned if pair[1] not in existing]
        pending_exists=conn.execute("""SELECT EXISTS(SELECT 1 FROM nifty_context.snapshots s
          WHERE mode IN ('PROSPECTIVE_CAPTURE','RECOVERED_CAPTURE')
          AND cutoff>=now()-(%s*interval '1 day')
          AND NOT EXISTS(SELECT 1 FROM nifty_context.outcomes o WHERE o.snapshot_id=s.id)) pending""",
          (CONFIG['recovery_lookback_days'],)).fetchone()['pending']
        recovery_due=bool(missing or pending_exists) and (_last_recovery_attempt is None or
          (now-_last_recovery_attempt).total_seconds()>=CONFIG['recovery_retry_seconds'])
        if not scheduled_tick and not recovery_due:
            return
        bars,_=load(conn,CONFIG['recovery_lookback_days'] if recovery_due else 1)
        local_day=now.tz_convert('Asia/Kolkata').date()
        today=[s for s in sessions if pd.Timestamp(s['market_open_ts']).tz_convert('Asia/Kolkata').date()==local_day]
        examples,rejected=build_examples(bars,today,now)
        for x in examples:
            # Never backdate a prospective snapshot. Capture only within 60s of its cutoff.
            if not 0 <= (now-pd.Timestamp(x['cutoff'])).total_seconds() < 60:
                continue
            x=prospective_snapshot(x,now)
            sid=digest({'version':VERSION,'cutoff':x['planned_cutoff'],'mode':x['mode']})
            conn.execute("INSERT INTO nifty_context.snapshots(id,cutoff,mode,evidence) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",(sid,x['cutoff'],x['mode'],Jsonb(clean(x))))
            LOG.info('snapshot_captured cutoff=%s',x['cutoff'])
        if recovery_due:
            _last_recovery_attempt=now
            recovered_count=recovered_outcomes=recovery_pending=0
            for session,planned_cutoff in missing:
                if (now-planned_cutoff).total_seconds()<60:
                    continue
                x,outcome,reason=recovery_snapshot(bars,session,planned_cutoff,now)
                if x is None:
                    recovery_pending+=1
                    LOG.debug('snapshot_recovery_pending cutoff=%s reason=%s',planned_cutoff,reason)
                    continue
                sid=digest({'version':VERSION,'cutoff':x['planned_cutoff'],'mode':x['mode']})
                conn.execute("INSERT INTO nifty_context.snapshots(id,cutoff,mode,evidence) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                             (sid,x['cutoff'],x['mode'],Jsonb(clean(x))))
                if outcome is not None:
                    conn.execute('INSERT INTO nifty_context.outcomes(snapshot_id,evidence) VALUES(%s,%s) ON CONFLICT DO NOTHING',
                                 (sid,Jsonb(clean(outcome))))
                    recovered_outcomes+=1
                recovered_count+=1
            if recovered_count or recovery_pending:
                LOG.info('snapshot_recovery_complete recovered=%s outcomes=%s pending=%s',
                         recovered_count,recovered_outcomes,recovery_pending)
        # Outcomes are separate insert-only records, never written back into inputs.
        pending=conn.execute("""SELECT id,evidence FROM nifty_context.snapshots s
          WHERE mode IN ('PROSPECTIVE_CAPTURE','RECOVERED_CAPTURE') AND cutoff>=now()-(%s*interval '1 day')
          AND NOT EXISTS(SELECT 1 FROM nifty_context.outcomes o WHERE o.snapshot_id=s.id)""",
          (CONFIG['recovery_lookback_days'],)).fetchall()
        for row in pending:
            x=row['evidence']; cutoff=pd.Timestamp(x['cutoff']); end=pd.Timestamp(x['window_end'])
            future=bars[(bars.ts>=cutoff)&(bars.ts<end)].sort_values('ts')
            if end>now or len(future)!=60 or features(future,cutoff) is None:
                continue
            reference=float(future.iloc[0].open); r=float(np.log(future.iloc[-1].close/reference)); threshold=CONFIG['threshold_log_return']
            labels={'log_return':r,'direction':2 if r>threshold else 0 if r< -threshold else 1,
                    'range':float(future.high.max()-future.low.min()),'reference':reference,'available_at':str(now)}
            conn.execute('INSERT INTO nifty_context.outcomes(snapshot_id,evidence) VALUES(%s,%s) ON CONFLICT DO NOTHING',
                         (row['id'],Jsonb(clean({'labels':labels,'source_rows':future.to_dict('records')}))))
        for item in rejected:
            if 0 <= (now-pd.Timestamp(item['cutoff'])).total_seconds()<60:
                LOG.info('snapshot_abstained cutoff=%s reason=%s',item['cutoff'],item['reason'])
        conn.commit()
        local_now = now.tz_convert('Asia/Kolkata')
        if local_now.hour >= 16 and _last_trade_quality_date != local_now.date():
            report = run_trade_quality(conn, os.getenv('CODE_COMMIT', 'unknown'))
            _last_trade_quality_date = local_now.date()
            LOG.info('trade_quality_complete state=%s run_id=%s', report['state'], report['run_id'])


if __name__=='__main__':
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')
    parser=argparse.ArgumentParser(); parser.add_argument('command',choices=['experiment','trade-experiment','capture','capture-loop'])
    args=parser.parse_args()
    with connect() as conn:
        conn.execute(Path('schema.sql').read_text()); conn.commit()
    if args.command=='experiment':
        experiment()
    elif args.command=='trade-experiment':
        with connect() as conn:
            report=run_trade_quality(conn,os.getenv('CODE_COMMIT','unknown'))
            LOG.info('trade_quality_complete state=%s run_id=%s',report['state'],report['run_id'])
    elif args.command=='capture':
        capture()
    else:
        LOG.info('capture_loop_started version=%s execution_enabled=false',VERSION)
        while True:
            if os.getenv('NIFTY_CONTEXT_ENABLED','true')=='true':
                try:
                    capture()
                    Path('/tmp/nifty-context-heartbeat').touch()
                except Exception as exc:
                    LOG.error('capture_failed type=%s',type(exc).__name__)
            else:
                Path('/tmp/nifty-context-heartbeat').touch()
            time.sleep(30)
