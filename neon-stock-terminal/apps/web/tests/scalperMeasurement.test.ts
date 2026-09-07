import test from "node:test";
import assert from "node:assert/strict";
import {closeAt, measurePanes, scalperIndicators} from "../src/lib/scalperMeasurement";
const bars=(values:number[])=>values.map((close,i)=>({end:new Date(Date.UTC(2026,8,7,4,i*5)).toISOString(),close,closed:true}));
test("same timestamps, reverse selection, exact per-leg and combined PnL",()=>{
  const p=[{identity:{exchange:"NSE",tradingsymbol:"NIFTY"},bars:bars([24000,24010])},{identity:{exchange:"NFO",tradingsymbol:"NIFTYCE"},bars:bars([100,112])},{identity:{exchange:"NFO",tradingsymbol:"NIFTYPE"},bars:bars([100,95])}];
  const r=measurePanes(p,p[0].bars[1].end,p[0].bars[0].end,65);
  assert.deepEqual(r.rows.map(x=>x.delta),[10,12,-5]);assert.equal(r.combined,7);assert.equal(r.pnl,455);
  assert.equal(measurePanes(p,r.start,r.end,130).pnl,910);
});
test("missing or partial exact bar never substitutes, zero remains zero, invalid qty is missing",()=>{
  const b=bars([0,2]);assert.equal(closeAt(b,b[0].end),0);assert.equal(closeAt(b,"missing"),null);
  assert.equal(closeAt([{...b[0],closed:false}],b[0].end),null);
  const p=[{identity:{exchange:"NFO",tradingsymbol:"CE"},bars:b}];
  assert.equal(measurePanes(p,b[0].end,b[1].end,65).pnl,null);
  p.push({identity:{exchange:"NFO",tradingsymbol:"PE"},bars:b});
  for(const q of [0,-1,1.5,NaN,Infinity])assert.equal(measurePanes(p,b[0].end,b[1].end,q).pnl,null);
});
test("canonical rolling RSI boundaries, MACD SMA warmup and linear reference",()=>{
  const r=scalperIndicators(bars(Array.from({length:40},(_,i)=>100+i)));
  assert.equal(r[13].rsi,null);assert.equal(r[14].rsi,100);
  assert.equal(r[24].macd,null);assert.equal(r[25].macd,7);
  assert.equal(r[32].signal,null);assert.equal(r[33].signal,7);assert.equal(r[33].histogram,0);
  assert.equal(scalperIndicators(bars(Array(40).fill(100)))[39].rsi,100);
  assert.equal(scalperIndicators(bars(Array.from({length:40},(_,i)=>100-i)))[39].rsi,0);
});
test("partial bar resets indicator warmup and no future data affects earlier samples",()=>{
  const b=bars(Array.from({length:60},(_,i)=>100+i));b[40].closed=false;
  const r=scalperIndicators(b);assert.equal(r[40].rsi,null);assert.equal(r[41].macd,null);assert.equal(r[54].rsi,null);assert.equal(r[55].rsi,100);
  assert.deepEqual(scalperIndicators(b.slice(0,30)),r.slice(0,30));
});
