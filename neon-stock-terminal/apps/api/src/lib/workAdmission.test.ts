import {test} from "node:test";import assert from "node:assert/strict";import {WorkAdmission} from "./workAdmission";
test("bounds concurrent work and retains FIFO",async()=>{
 const gate=new WorkAdmission(1,3,1000);let active=0,max=0;const order:number[]=[];
 await Promise.all([1,2,3].map(n=>gate.run(async()=>{active++;max=Math.max(max,active);order.push(n);await new Promise(r=>setImmediate(r));active--;})));
 assert.equal(max,1);assert.deepEqual(order,[1,2,3]);
});
test("overflow fails without running work; failure frees slot",async()=>{
 const gate=new WorkAdmission(1,0,100);let release!:()=>void;const pending=gate.run(()=>new Promise<void>(r=>release=r));
 await assert.rejects(gate.run(async()=>{assert.fail("must not run")}),{code:"ANALYSIS_BUSY"});release();await pending;
 await assert.rejects(gate.run(async()=>{throw new Error("failure")}));assert.equal(await gate.run(async()=>42),42);
});
test("expired queued work is never started",async()=>{
 const gate=new WorkAdmission(1,2,5);let release!:()=>void;const pending=gate.run(()=>new Promise<void>(r=>release=r));
 await assert.rejects(gate.run(async()=>{assert.fail("expired work ran")}),{code:"ANALYSIS_BUSY"});release();await pending;
 assert.equal(await gate.run(async()=>7),7);
});
