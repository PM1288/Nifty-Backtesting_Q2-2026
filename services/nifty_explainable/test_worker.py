"""Synthetic data below is test-only and is never persisted by the worker."""
import unittest
import numpy as np
import pandas as pd
from worker import CONFIG, FEATURES, build_examples, features, explain_and_fit, load, prospective_snapshot


def session_fixture():
    start = pd.Timestamp('2026-08-03T03:45:00Z')
    ts = pd.date_range(start, periods=375, freq='min')
    price = 24000 + np.arange(375) * .2
    bars = pd.DataFrame(dict(ts=ts, open=price, high=price+2, low=price-2,
                            close=price+.1, created_at=ts+pd.Timedelta(seconds=65), source='TEST_ONLY'))
    sessions = [dict(trade_date=start.date(), market_open_ts=start, market_close_ts=start+pd.Timedelta(minutes=375))]
    return bars, sessions, start+pd.Timedelta(days=1)


class ResearchTests(unittest.TestCase):
    def test_prospective_outcome_cannot_start_before_capture(self):
        b,s,now=session_fixture(); x=build_examples(b,s,now)[0][0]
        captured_at=pd.Timestamp(x['cutoff'])+pd.Timedelta(seconds=30)
        saved=prospective_snapshot(x,captured_at)
        self.assertGreater(pd.Timestamp(saved['cutoff']),captured_at)
        self.assertEqual(saved['planned_cutoff'],x['cutoff'])
        self.assertNotIn('labels',saved)
        self.assertIn('labels',x)
        with self.assertRaises(ValueError): prospective_snapshot(x,now)

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
