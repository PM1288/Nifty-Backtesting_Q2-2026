import { test } from "node:test";
import assert from "node:assert/strict";
import { asyncRoute } from "./asyncRoute";
test("Express boundary forwards pool rejection exactly once", async () => {
 const failure=Object.assign(new Error("private details"),{code:"P2024"});const errors:unknown[]=[];
 asyncRoute(async()=>{throw failure;})({} as any,{} as any,e=>errors.push(e));
 await new Promise(resolve=>setImmediate(resolve)); assert.deepEqual(errors,[failure]);
});
test("Express boundary preserves successful response",async()=>{
 let sent=false;const errors:unknown[]=[];
 asyncRoute(async()=>{sent=true;})({} as any,{} as any,e=>errors.push(e));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(sent,true);assert.equal(errors.length,0);
});
