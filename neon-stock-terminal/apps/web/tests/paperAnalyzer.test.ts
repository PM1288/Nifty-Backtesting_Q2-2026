import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzerTrade, summarizeOutcomes, correlation, histogram, analyzerGroups, finite, analyzerCsv, densityPlotValue } from '../src/lib/paperAnalyzer';
import { roundChartData } from '../src/components/visual/chartPrecision';
const raw={trade_leg_id:'leg1',trade_group_id:'group1',symbol:'ABC',side:'BUY',strategy_id:'TEST',strategy_version:'1',opened_at:'2026-09-01T04:00:00Z',closed_at:'2026-09-01T08:00:00Z',average_entry_price:'100',opened_quantity:'10',remaining_quantity:'0',realised_pnl:'50',unrealised_pnl:'999',evidence_available_at:'2026-09-01T03:59:00Z',evidence_rsi14:'40',entry_book_quote_ts:'2026-09-01T03:59:30Z',entry_book_spread_bps:'2'};
test('closed net excludes open marks and derives exact entry-notional return',()=>{
 const row=analyzerTrade(raw,'closed');assert.equal(row.outcome,5);assert.equal(row.pnl,50);assert.equal(row.parameters.rsi,40);assert.equal(row.parameters.spread,2);assert.equal(row.day,'2026-09-01');assert.equal(row.hour,'09:00 IST');
 assert.equal(analyzerTrade({...raw,remaining_quantity:null},'closed').outcome,null);
 assert.equal(analyzerTrade({...raw,remaining_quantity:2},'closed').outcome,null);
 assert.equal(analyzerTrade({...raw,realised_pnl:null},'closed').outcome,null);
});
test('open gross uses only remaining quantity, not partial realised result',()=>{
 const row=analyzerTrade({...raw,remaining_quantity:2,unrealised_pnl:10,last_mark:105,last_mark_at:'2026-09-01T07:00:00Z'},'open');assert.equal(row.outcome,5);assert.equal(row.pnl,10);
 assert.equal(analyzerTrade({...raw,remaining_quantity:2,last_mark_at:null},'open').outcome,null);
});
test('future/missing entry evidence and invalid price evidence fail closed',()=>{
 const row=analyzerTrade({...raw,evidence_available_at:'2026-09-01T04:01:00Z',entry_book_quote_ts:'2026-09-01T04:01:00Z'},'closed');assert.equal(row.parameters.rsi,null);assert.equal(row.parameters.spread,null);
 assert.equal(analyzerTrade({...raw,evidence_available_at:null},'closed').parameters.rsi,null);
 assert.equal(analyzerTrade({...raw,evidence_audit:{status:'DATA_INVALID'}},'closed').outcome,null);
 assert.equal(finite(null),null);assert.equal(finite(''),null);assert.equal(finite(false),null);assert.equal(finite('0'),0);
});
test('EOD hypothetical requires available canonical EOD evidence',()=>{
 assert.equal(analyzerTrade({...raw,intraday_eod_complete:false,intraday_eod_return_pct:4},'eod').outcome,null);
 assert.equal(analyzerTrade({...raw,intraday_eod_complete:true,intraday_eod_pnl:40,intraday_eod_return_pct:4},'eod').outcome,4);
});
test('summary preserves losses, zero and missing without survivor-only win rate',()=>{
 const rows=[50,-20,0,null].map(pnl=>analyzerTrade({...raw,realised_pnl:pnl},'closed'));const s=summarizeOutcomes(rows);
 assert.equal(s.n,3);assert.equal(s.excluded,1);assert.equal(s.wins,1);assert.equal(s.losses,1);assert.equal(s.flat,1);assert.equal(s.mean,1);assert.equal(s.median,0);assert.equal(s.pnl,30);assert.equal(s.indication,'Too few outcomes');assert.ok(s.winLow!<s.winRate!&&s.winHigh!>s.winRate!);
 assert.equal(summarizeOutcomes([]).mean,null);
});
test('Pearson and tied-rank Spearman handle signs, constant and insufficient data',()=>{
 assert.equal(correlation([[1,3],[2,2],[3,1]]).pearson,-1);
 assert.equal(correlation([[1,1],[1,1],[2,2],[3,3]]).spearman,1);
 assert.equal(correlation([[1,1],[1,2],[1,3]]).pearson,null);
 assert.equal(correlation([[1,1],[2,2]]).pearson,null);
});
test('histogram includes the upper edge, integrates density to one and handles flat data',()=>{
 for(const values of [[-2,0,2],[3,3,3]]){const bins=histogram(values);assert.equal(bins.reduce((s,b)=>s+b.count,0),values.length);assert.ok(Math.abs(bins.reduce((s,b)=>s+b.density*(b.high-b.low),0)-1)<1e-10);}
 assert.deepEqual(histogram([]),[]);
});
test('small plotted densities survive the shared display precision adapter',()=>{
 const bins=histogram([-10000,0,10000]);
 const drawn=bins.map(b=>Number(roundChartData(densityPlotValue(b.density))));
 assert.ok(drawn.some(n=>n>0&&n<.005));
 assert.ok(Math.abs(drawn.reduce((sum,n,i)=>sum+n*(bins[i].high-bins[i].low),0)-1)<1e-10);
});
test('chronological split keeps entry days together; exports preserve exclusion reasons',()=>{
 const rows=[1,2,3,4].map(day=>analyzerTrade({...raw,opened_at:`2026-09-0${day}T04:00:00Z`},'closed'));
 const groups=analyzerGroups(rows,'direction','rsi');assert.equal(groups.rows[0].early.n,2);assert.equal(groups.rows[0].later.n,2);assert.equal(groups.cutoff,'2026-09-03');
 assert.ok(analyzerCsv([analyzerTrade({...raw,remaining_quantity:2},'closed')]).includes('Position not fully closed'));
 assert.ok(analyzerCsv([analyzerTrade({...raw,symbol:'=cmd'},'closed')]).includes("'=cmd"));
});
