import test from "node:test";
import assert from "node:assert/strict";
import { aggregateOi, oiLayers, oiTimeChanges, participantComparison, sessionAlignedOi } from "./tradingAnalyticsOi";

test("OI layers retain current, addition and hollow reduction without double counting",()=>{
  assert.deepEqual(oiLayers(100,130),{state:"COMPARABLE",baseline:100,current:130,retained:100,added:30,removed:0,change:30,changePct:30});
  assert.deepEqual(oiLayers(100,80),{state:"COMPARABLE",baseline:100,current:80,retained:80,added:0,removed:20,change:-20,changePct:-20});
  assert.equal(oiLayers(null,80).state,"CURRENT_ONLY_BASELINE_UNAVAILABLE");
  assert.equal(oiLayers(0,40).changePct,null);
});

test("aggregate OI recomposes from cohort totals",()=>{
  const result=aggregateOi([{contractId:"A",baseline_open_interest:100,open_interest:130},{contractId:"B",baseline_open_interest:100,open_interest:70}]);
  assert.equal(result.baseline,200); assert.equal(result.current,200); assert.equal(result.change,0);
  assert.equal(result.grossAdded,30); assert.equal(result.grossRemoved,30);
});

test("interval and cumulative OI are endpoint differences",()=>{
  const result=oiTimeChanges([115,110,130].map((oi,i)=>({event_time:`2026-09-08T0${i+4}:00:00Z`,oi})),100);
  assert.deepEqual(result.map(row=>row.interval_change),[null,-5,20]);
  assert.deepEqual(result.map(row=>row.cumulative_change),[15,10,30]);
});

test("session OI uses at-or-before interval endpoint and leaves missing endpoint null",()=>{
  const sessions=[{market_open_ts:"2026-09-08T03:45:00Z",market_close_ts:"2026-09-08T04:00:00Z"}];
  const result=sessionAlignedOi([{event_time:"2026-09-08T03:49:59Z",collected_at:"2026-09-08T03:50:01Z",oi:100}],sessions,5,"2026-09-08T04:00:00Z");
  assert.equal(result.length,3); assert.equal(result[0].current,100); assert.equal(result[1].current,null);
});

test("session OI never carries a prior-session quote into today's opening bin",()=>{
  const sessions=[{market_open_ts:"2026-09-08T03:45:00Z",market_close_ts:"2026-09-08T03:50:00Z"}];
  const result=sessionAlignedOi([{event_time:"2026-09-07T10:00:00Z",collected_at:"2026-09-07T10:00:01Z",oi:999}],sessions,5,"2026-09-08T03:50:00Z");
  assert.equal(result.length,1);
  assert.equal(result[0].current,null);
  assert.equal((result[0] as Record<string, unknown>).state,"MISSING_ENDPOINT");
});

test("session OI preserves exact interval-boundary ownership without carrying it forward",()=>{
  const sessions=[{market_open_ts:"2026-09-08T03:45:00Z",market_close_ts:"2026-09-08T04:00:00Z"}];
  const result=sessionAlignedOi([
    {event_time:"2026-09-08T03:45:00Z",collected_at:"2026-09-08T03:45:01Z",oi:90},
    {event_time:"2026-09-08T03:50:00Z",collected_at:"2026-09-08T03:50:01Z",oi:100},
    {event_time:"2026-09-08T03:54:59Z",collected_at:"2026-09-08T03:55:01Z",oi:110},
  ],sessions,5,"2026-09-08T04:00:00Z");
  assert.deepEqual(result.map(row=>row.current),[100,110,null]);
  assert.deepEqual(result.map(row=>row.interval_change),[null,10,null]);
});

test("participant comparison keeps current net separate from previous-report change",()=>{
  const result=participantComparison([{client_type:"FII",trade_date:"2026-09-08",net_futures:-40,options_proxy:20,futures_long_pct:30}],[{client_type:"FII",trade_date:"2026-09-07",net_futures:-60,options_proxy:25,futures_long_pct:28}])[0];
  assert.equal(result.net_futures,-40); assert.equal(result.delta_net_futures,20); assert.equal(result.delta_options_proxy,-5); assert.equal(result.futures_long_pct_change_pp,2);
});
