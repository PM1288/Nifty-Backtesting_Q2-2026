import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson, HttpError } from "../src/lib/httpClient";
test("JSON client decodes data and does not expose upstream errors", async () => {
 const original = globalThis.fetch;
 try {
  globalThis.fetch = async () => new Response('{"price":10}', { headers:{"content-type":"application/json"} });
  assert.deepEqual(await readJson('/data'),{price:10});
  globalThis.fetch = async () => new Response('database-password=secret',{status:500});
  await assert.rejects(readJson('/data'), e => e instanceof HttpError && e.status===500 && !e.message.includes('secret'));
  globalThis.fetch = async () => new Response('<html>Login</html>');
  await assert.rejects(readJson('/data'),/unexpected response/);
 } finally { globalThis.fetch=original; }
});
test("JSON client cancels stalled reads and preserves caller cancellation", async () => {
 const original=globalThis.fetch;
 globalThis.fetch = async (_url, init) => new Promise((_resolve,reject)=> {
  const s=init!.signal!;
  if(s.aborted)reject(s.reason);else s.addEventListener('abort',()=>reject(s.reason),{once:true});
 });
 try {
  await assert.rejects(readJson('/data',undefined,5),{name:'TimeoutError'});
  const controller=new AbortController();controller.abort();
  await assert.rejects(readJson('/data',controller.signal),{name:'AbortError'});
 }finally{globalThis.fetch=original;}
});
