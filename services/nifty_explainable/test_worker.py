"""Synthetic data below is test-only and is never persisted by the worker."""
import unittest
import numpy as np
import pandas as pd
from worker import (CONFIG, FEATURES, build_examples, features, explain_and_fit,
                    load, prospective_snapshot, recovery_snapshot, trade_quality_due)


def session_fixture():
    start = pd.Timestamp('2026-08-03T03:45:00Z')
    ts = pd.date_range(start, periods=375, freq='min')
    price = 24000 + np.arange(375) * .2
    bars = pd.DataFrame(dict(ts=ts, open=price, high=price+2, low=price-2,
                            close=price+.1, created_at=ts+pd.Timedelta(seconds=65), source='TEST_ONLY'))
    sessions = [dict(trade_date=start.date(), market_open_ts=start, market_close_ts=start+pd.Timedelta(minutes=375))]
    return bars, sessions, start+pd.Timedelta(days=1)


class ResearchTests(unittest.TestCase):
    def test_trade_quality_schedule_is_after_4pm_trading_day_and_durable(self):
        class Result:
            def __init__(self, value): self.value = value
            def fetchone(self): return self.value
        class ScheduleConnection:
            def __init__(self, trading=True, complete=False):
                self.values = [Result({"due": trading}), Result({"complete": complete})]
            def execute(self, *_args): return self.values.pop(0)
        before = pd.Timestamp("2026-09-10T15:59:00", tz="Asia/Kolkata")
        after = pd.Timestamp("2026-09-10T16:00:00", tz="Asia/Kolkata")
        self.assertFalse(trade_quality_due(ScheduleConnection(), before))
        self.assertTrue(trade_quality_due(ScheduleConnection(), after))
        self.assertFalse(trade_quality_due(ScheduleConnection(trading=False), after))
        self.assertFalse(trade_quality_due(ScheduleConnection(complete=True), after))

    def test_prospective_outcome_cannot_start_before_capture(self):
        b,s,now=session_fixture(); x=build_examples(b,s,now)[0][0]
        captured_at=pd.Timestamp(x['cutoff'])+pd.Timedelta(seconds=30)
        saved=prospective_snapshot(x,captured_at)
        self.assertGreater(pd.Timestamp(saved['cutoff']),captured_at)
        self.assertEqual(saved['planned_cutoff'],x['cutoff'])
        self.assertNotIn('labels',saved)
        self.assertIn('labels',x)
        with self.assertRaises(ValueError): prospective_snapshot(x,now)

    def test_missed_window_is_recovered_without_false_live_timestamp(self):
        b,s,now=session_fixture()
        planned=s[0]['market_open_ts']+pd.Timedelta(minutes=60,seconds=120)
        # Simulate a collector/network delay: input candles arrived after the
        # planned cutoff but are complete when the worker recovers.
        b.loc[b.ts<planned-pd.Timedelta(seconds=120),'created_at']=planned+pd.Timedelta(minutes=3)
        on_time=build_examples(b,s,now)[0]
        self.assertNotIn(planned,{pd.Timestamp(row['cutoff']) for row in on_time})
        saved,outcome,reason=recovery_snapshot(b,s[0],planned,now)
        self.assertIsNone(reason)
        self.assertEqual(saved['mode'],'RECOVERED_CAPTURE')
        self.assertFalse(saved['point_in_time_eligible'])
        self.assertEqual(pd.Timestamp(saved['planned_cutoff']),planned)
        self.assertGreater(pd.Timestamp(saved['captured_at']),planned)
        self.assertGreaterEqual(pd.Timestamp(outcome['labels']['available_at']),now)
        self.assertEqual(len(outcome['source_rows']),60)

    def test_recovery_waits_for_complete_input(self):
        b,s,now=session_fixture(); b=b.drop(index=20)
        planned=s[0]['market_open_ts']+pd.Timedelta(minutes=60,seconds=120)
        saved,outcome,reason=recovery_snapshot(b,s[0],planned,now)
        self.assertIsNone(saved); self.assertIsNone(outcome)
        self.assertEqual(reason,'RECOVERY_INPUT_INCOMPLETE')

    def test_empty_database_keeps_typed_columns(self):
        class Empty:
            def execute(self,*args): return self
            def fetchall(self): return []
        bars,sessions=load(Empty())
        self.assertTrue(bars.empty)
        self.assertIn('ts',bars.columns)
        self.assertEqual(build_examples(bars,sessions,pd.Timestamp.now(tz='UTC'))[1],[{'reason':'NO_NIFTY_MINUTES'}])

    def test_complete_hour_and_cutoff(self):
        b,s,now=session_fixture(); rows,bad=build_examples(b,s,now)
        self.assertEqual(len(rows),5); self.assertEqual(bad,[])
        for row in rows:
            self.assertLessEqual(pd.Timestamp(row['max_input_available_at']),pd.Timestamp(row['cutoff']))
            self.assertEqual(pd.Timestamp(row['window_end'])-pd.Timestamp(row['cutoff']),pd.Timedelta(minutes=60))
            self.assertEqual(list(row['features']),FEATURES)

    def test_future_does_not_change_features(self):
        b,s,now=session_fixture(); first=build_examples(b,s,now)[0][0]
        b.loc[b.ts>=pd.Timestamp(first['cutoff']),['open','high','low','close']] += 500
        changed=build_examples(b,s,now)[0][0]
        self.assertEqual(first['features'],changed['features'])
        self.assertNotEqual(first['labels'],changed['labels'])

    def test_late_missing_invalid_and_maturity(self):
        b,s,now=session_fixture()
        self.assertIsNone(features(b.iloc[:30],s[0]['market_open_ts']))
        missing=b.drop(index=20)
        self.assertEqual(build_examples(missing,s,now)[0],[])
        b.loc[20,'created_at']=now
        self.assertEqual(build_examples(b,s,now)[0],[])
        b,s,now=session_fixture(); b.loc[20,'close']=0
        self.assertEqual(build_examples(b,s,now)[0],[])
        b,s,now=session_fixture()
        rows,_=build_examples(b,s,s[0]['market_open_ts']+pd.Timedelta(minutes=70))
        self.assertIsNone(rows[0]['labels'])

    def test_insufficient_does_not_fit_or_fabricate(self):
        result=explain_and_fit([])
        self.assertEqual(result['state'],'DATA_INSUFFICIENT')
        self.assertEqual(result['predictions'],[])

    def test_chronological_models_and_shap_reconcile(self):
        rng=np.random.default_rng(42); rows=[]
        for day in range(25):
            for hour in range(5):
                cutoff=pd.Timestamp('2026-07-01T04:47Z')+pd.Timedelta(days=day,hours=hour)
                x=dict(zip(FEATURES,rng.normal(size=len(FEATURES))))
                x['minutes_from_open']=60*(hour+1)
                rows.append(dict(session=str(cutoff.date()),cutoff=str(cutoff),window_end=str(cutoff+pd.Timedelta(hours=1)),features=x,
                    labels=dict(direction=(day+hour)%3,range=float(20+abs(x['volatility_30'])*10),available_at=str(cutoff+pd.Timedelta(hours=1)))))
        r=explain_and_fit(rows)
        self.assertEqual(r['state'],'EXPLORATORY')
        self.assertEqual(r['test_count'],25)
        self.assertLess(r['shap_max_error'],1e-4)
        self.assertLess(r['range_shap_max_error'],1e-4)
        self.assertEqual(r['test_sessions'][0],'2026-07-21')
        for p in r['predictions']:
            self.assertAlmostEqual(sum(p['probabilities'].values()),1,places=5)
            self.assertEqual(len(p['explanation']['direction_contributions']),len(FEATURES))

if __name__=='__main__': unittest.main()
