const assert = require('node:assert/strict');
const workflow = require('./NIFTY50_Market_OIIS_WhatsApp_Low_Noise_v1.json');

const node = workflow.nodes.find((item) => item.name === 'Validate Deduplicate and Format');
const evaluate = new Function('$json', '$getWorkflowStaticData', node.parameters.jsCode);
const state = {};
const staticData = () => state;
const base = {
  event_id: 'evt-1',
  event_type: 'com.nifty50.market.open.snapshot.v1',
  trading_mode: 'PAPER',
  message: 'NIFTY 50 open check',
};

const first = evaluate({body: base}, staticData)[0].json;
assert.equal(first.send, true);
assert.equal(first.whatsapp_message, base.message);

const duplicate = evaluate({body: base}, staticData)[0].json;
assert.equal(duplicate.send, false);
assert.equal(duplicate.suppression_reason, 'DUPLICATE_EVENT');

const invalid = evaluate({body: {...base, event_id: 'evt-2', trading_mode: 'LIVE'}}, staticData)[0].json;
assert.equal(invalid.send, false);
assert.equal(invalid.suppression_reason, 'INVALID_CONTRACT');

const noMessage = evaluate({body: {...base, event_id: 'evt-3', message: ''}}, staticData)[0].json;
assert.equal(noMessage.send, false);

console.log('market digest n8n policy: PASS');
