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

test("rejected route completes HTTP response through the error middleware", async () => {
 const { default: express } = await import("express");
 const app=express();let errors=0;
 app.get("/failure",asyncRoute(async()=>{throw new Error("fixture storage outage");}));
 app.use((_error: unknown,_req: import("express").Request,res: import("express").Response,_next: import("express").NextFunction)=>{if(res.headersSent)return _next(_error);errors++;res.status(503).json({error:"Temporarily unavailable"});});
 const server=app.listen(0,"127.0.0.1");
 await new Promise<void>(resolve=>server.once("listening",resolve));
 try {
  const address=server.address() as import("node:net").AddressInfo;
  const response=await fetch(`http://127.0.0.1:${address.port}/failure`);
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"Temporarily unavailable"});assert.equal(errors,1);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
