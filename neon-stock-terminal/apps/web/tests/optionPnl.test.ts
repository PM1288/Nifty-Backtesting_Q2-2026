import test from 'node:test';
import assert from 'node:assert/strict';
import {observationOptionPnl,optionPnl,scalperLink} from '../src/lib/optionPnl';
test('NSE option round trip reconciles calculator rates and rounding',()=>{
 const p=optionPnl(100,110,65)!;assert.equal(p.gross,650);assert.equal(p.stt,11);assert.equal(p.exchange,4.78);assert.equal(p.ipft,.07);assert.equal(p.gst,8.07);assert.equal(p.charges,63.93);assert.equal(p.net,586.07);
 assert.equal(optionPnl(100,90,65)!.gross,-650);
});
test('missing/invalid quantity and missing exit never fabricate PnL',()=>{
 for(const q of [null,undefined,'',0,-1,1.5,true])assert.equal(optionPnl(100,110,q),null);
 assert.equal(optionPnl(100,null,65),null);assert.equal(optionPnl(100,0,65)!.gross,-6500);
 assert.equal(optionPnl(100,100,65)!.gross,0);assert.ok(optionPnl(100,100,65)!.net<0);
});
test('Scalper link carries exact identities, expiry, strike, interval and session',()=>{
 const link=scalperLink({underlying_symbol:'AXISBANK',ce_symbol:'CE',pe_symbol:'PE',ce_token:'1',pe_token:'2',expiry:'2026-09-29',trade_date:'2026-09-09',strike:1240,interval_minutes:5})!;
 const p=new URLSearchParams(link.split('?')[1]);assert.equal(p.get('expectedPE'),'PE');assert.equal(p.get('symbol'),'AXISBANK');assert.equal(p.get('day'),'2026-09-09');assert.equal(p.get('chartExpiry'),'2026-09-29');assert.equal(p.get('interval'),'5');assert.equal(scalperLink({}),null);
});
test('Trade Log comparison uses one exact lot and keeps each horizon and leg independent',()=>{
 const row={
  ce_entry_open:100,pe_entry_open:80,ce_lot_size:65,pe_lot_size:65,
  outcome_evidence:{'15m':{maturity:'MATURE',ce:{endpoint:108,max:110,min:95},pe:{endpoint:75,max:84,min:70}}},
 };
 const ce=observationOptionPnl(row,'15m','ce');
 const pe=observationOptionPnl(row,'15m','pe');
 assert.equal(ce.quantity,65);assert.equal(ce.pnl?.gross,520);assert.equal(ce.evidence.max,110);
 assert.equal(pe.quantity,65);assert.equal(pe.pnl?.gross,-325);assert.equal(pe.evidence.min,70);
 assert.equal(observationOptionPnl({...row,pe_lot_size:null},'15m','pe').pnl,null);
 assert.equal(observationOptionPnl(row,'30m','ce').pnl,null);
});
