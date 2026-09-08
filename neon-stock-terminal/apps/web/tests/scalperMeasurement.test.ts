import test from "node:test";
import assert from "node:assert/strict";
import {closeAt, openAt, measurePanes, scalperIndicators, exactPairPcr} from "../src/lib/scalperMeasurement";
const bars=(values:Array<number|{open:number;close:number}>)=>values.map((value,i)=>{const close=typeof value==="number"?value:value.close;const open=typeof value==="number"?value:value.open;return {end:new Date(Date.UTC(2026,8,7,4,i*5)).toISOString(),open,close,closed:true};});
test("same timestamps, reverse selection, A open/B close and exact combined PnL",()=>{
  const p=[{identity:{exchange:"NSE",tradingsymbol:"NIFTY"},bars:bars([{open:23990,close:24000},{open:24004,close:24010}])},{identity:{exchange:"NFO",tradingsymbol:"NIFTYCE"},bars:bars([{open:95,close:100},{open:105,close:112}])},{identity:{exchange:"NFO",tradingsymbol:"NIFTYPE"},bars:bars([{open:102,close:100},{open:99,close:95}])}];
  const r=measurePanes(p,p[0].bars[1].end,p[0].bars[0].end,65);
  assert.deepEqual(r.rows.map(x=>x.delta),[20,17,-7]);assert.equal(r.combined,10);assert.equal(r.pnl,650);
  assert.equal(measurePanes(p,r.start,r.end,130).pnl,1300);
});
test("missing or partial exact bar never substitutes, zero remains zero, invalid qty is missing",()=>{
  const b=bars([0,2]);assert.equal(openAt(b,b[0].end),0);assert.equal(closeAt(b,b[0].end),0);assert.equal(closeAt(b,"missing"),null);
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
test("selected-pair PCR uses only matching observed endpoints",()=>{
  const ce=[
    {event_time:"2026-09-08T03:50:00Z",current:100},
    {event_time:"2026-09-08T03:55:00Z",current:null},
    {event_time:"2026-09-08T04:00:00Z",current:200},
  ];
  const pe=[
    {event_time:"2026-09-08T03:50:00Z",current:50},
    {event_time:"2026-09-08T03:55:00Z",current:80},
    {event_time:"2026-09-08T04:00:00Z",current:100},
  ];
  assert.deepEqual(exactPairPcr(ce,pe),[
    {time:"2026-09-08T03:50:00Z",value:.5},
    {time:"2026-09-08T04:00:00Z",value:.5},
  ]);
});
