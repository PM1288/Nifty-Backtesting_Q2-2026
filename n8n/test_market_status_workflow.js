const assert = require('node:assert/strict');
const fs = require('node:fs');
const workflow = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'Market_Status_Outgoing_WhatsApp_v1.json')));
const node = workflow.nodes.find((item) => item.name === 'Validate and Format Whitelisted Event');
const evaluate = new Function('$json','$getWorkflowStaticData',node.parameters.jsCode);
const open = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../examples/market_status/market-open-positive.json')));
const state = {}; const staticData = () => state;
const test = evaluate({body:{...open,delivery_test_only:true}},staticData)[0].json;
assert.equal(test.send,false); assert.equal(test.suppression_reason,'TEST_ONLY'); assert.match(test.preview,/NIFTY 50/);
assert.ok(test.preview.length < 1200);
const sendable = evaluate({body:open},staticData)[0].json;
assert.equal(sendable.send,true);
assert.equal(state.seen[open.event_id],undefined,'formatter must not mark delivery before the gateway succeeds');
assert.throws(() => evaluate({body:{...open,event_type:'com.papertrading.trade.accepted.v1'}},staticData),/UNSUPPORTED/);
for (const file of ['market-movers.json','oiis-long-only.json','oiis-short-only.json','oiis-both-directions.json','market-close-final.json']) {
  const input=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../examples/market_status',file)));
  const output=evaluate({body:{...input,delivery_test_only:true}},staticData)[0].json;
  assert.equal(output.send,false); assert.ok(output.preview.length<=1800);
}
const exported=fs.readFileSync(require('node:path').join(__dirname,'Market_Status_Outgoing_WhatsApp_v1.json'),'utf8');
assert.ok(!exported.includes('PAPER_TRADE_')); assert.ok(!exported.match(/[A-Fa-f0-9]{48,}/));
console.log('market status n8n workflow: PASS');
