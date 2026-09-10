import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyticsUnderlying,selectUnderlying} from './tradingAnalyticsUniverse';
import {loadSmartApiNifty,windowMaxPain} from './tradingAnalyticsSmartApi';
import {loadTradingAnalytics} from '../routes/tradingAnalytics';
import type {PrismaClient} from '@prisma/client';
const stock={symbol:'RELIANCE',label:'RELIANCE-EQ',token:'2885',kind:'STOCK',optionType:'OPTSTK'};
test('unknown stock never substitutes NIFTY',()=>{assert.throws(()=>selectUnderlying([], 'UNKNOWN'));assert.equal(selectUnderlying([stock],'RELIANCE').token,'2885');});
test('selected underlying lookup is symbol-scoped and keeps F&O eligibility',async()=>{
 const calls:{sql:string;args:unknown[]}[]=[];
 const selected=await analyticsUnderlying(async(_source,sql,...args)=>{calls.push({sql,args});return [stock];},'2026-09-10T09:00:00Z','RELIANCE');
  assert.equal(selected.token,'2885');
 assert.deepEqual(calls[0]?.args,['2026-09-10T09:00:00Z','RELIANCE']);
 assert.match(calls[0]?.sql??'',/s\.name=\$2/);
 assert.match(calls[0]?.sql??'',/o\.instrumenttype IN\('OPTIDX','OPTSTK'\)/);
});
test('stock spot options and Greeks use exact selected identity',async()=>{
 const calls:{source:string;args:unknown[]}[]=[];
 await loadSmartApiNifty(async(source,_sql,...args)=>{calls.push({source,args});return source==='smartapi_spot'?[{ltp:1400}]:source==='smartapi_expiries'?[{expiry:'2026-09-29'}]:[];},'2026-09-07T12:00:00Z',undefined,stock);
 assert.equal(calls.find(c=>c.source==='smartapi_spot')?.args[1],'2885');
 assert.deepEqual(calls.find(c=>c.source==='smartapi_contracts')?.args.slice(3),['RELIANCE','OPTSTK']);
 assert.deepEqual(calls.find(c=>c.source==='smartapi_greeks')?.args[2],['RELIANCE']);
});
test('daily selection scopes candles and archived chain without changing market report',async()=>{
 const calls:{sql:string;args:unknown[]}[]=[];
 const db={$queryRawUnsafe:async(sql:string,...args:unknown[])=>{calls.push({sql,args});return sql.includes('DISTINCT ON (s.name)')?[stock]:[];}} as unknown as PrismaClient;
 const data=await loadTradingAnalytics(db,'2026-09-07T12:00:00Z',undefined,undefined,undefined,undefined,'RELIANCE');
 assert.equal(data.underlying.symbol,'RELIANCE');assert.equal(data.liveOrdersEnabled,false);
 assert.ok(calls.some(c=>c.sql.includes('FROM public.bars_1d')&&c.args[1]==='2885'));
 assert.ok(calls.some(c=>c.sql.includes('SELECT DISTINCT expiry_date')&&c.args[1]==='RELIANCE'));
});
const legs=[100,110,120].flatMap(strike=>['CE','PE'].map(option_type=>({strike,option_type,lotsize:100,open_interest:10})));
test('indicative window minimum and common scaling are invariant',()=>{
 assert.deepEqual(windowMaxPain(legs).indicativeMaxPainStrikes,[110]);
 assert.deepEqual(windowMaxPain(legs.map(l=>({...l,open_interest:l.open_interest*100}))).indicativeMaxPainStrikes,[110]);
});
test('max pain unavailable for missing OI unequal lots incomplete pair or zero total',()=>{
 for(const invalid of [legs.map((l,i)=>({...l,open_interest:i?10:null})),legs.map((l,i)=>({...l,lotsize:i?100:200})),legs.slice(1),legs.map(l=>({...l,open_interest:0}))]) assert.deepEqual(windowMaxPain(invalid).indicativeMaxPainStrikes,[]);
});
test('missing FULL quotes uses one stock-chain cohort without inventing LTP',async()=>{
 const data=await loadSmartApiNifty(async(source,sql)=>{
  if(source==='smartapi_expiries')return [{expiry:'2026-09-29'}];
  if(source==='smartapi_stock_chain'){
   assert.ok(sql.includes('ts=(SELECT max(ts)'));
   return legs.map(l=>({...l,spot_price:110,last_price:null,indicative_midpoint:5,collected_at:'2026-09-07T10:00:00Z',exchange_feed_at:'2026-09-07T09:59:59Z'}));
  }return [];
 },'2026-09-07T12:00:00Z',undefined,stock);
 assert.equal(data.source,'smartapi_option_chain_snapshots');assert.equal(data.spot?.ltp,110);
 assert.equal(data.legs.length,6);assert.equal(data.legs[0].last_price,null);
 assert.deepEqual(data.metrics.indicativeMaxPainStrikes,[110]);assert.equal(data.metrics.oiPcr,1);
});
test('partial FULL quotes remain visible while metrics use a separate complete cohort',async()=>{
 const d=await loadSmartApiNifty(async source=>{
  if(source==='smartapi_spot')return [{ltp:110}];
  if(source==='smartapi_expiries')return [{expiry:'2026-09-29'}];
  if(source==='smartapi_contracts')return legs.map((l,i)=>({...l,last_price:9,open_interest:i?10:null}));
  if(source==='smartapi_stock_chain')return legs.map(l=>({...l,spot_price:null,last_price:null,collected_at:'2026-09-07T10:00:00Z'}));
  return [];
 },'2026-09-07T12:00:00Z',undefined,stock);
 assert.equal(d.source,'smartapi');assert.equal(d.legs[0].last_price,9);
 assert.equal(d.metrics.source,'smartapi_option_chain_snapshots');
 assert.equal(d.metrics.oiPcr,1);assert.equal(d.metricLegs[0].last_price,null);
});
