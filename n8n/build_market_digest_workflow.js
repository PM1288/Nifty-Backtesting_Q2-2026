const fs = require('node:fs');
const path = require('node:path');

const policy = String.raw`const input = $json.body ?? $json;
const allowed = new Set([
  'com.nifty50.market.open.snapshot.v1',
  'com.nifty50.market.movers.snapshot.v1',
  'com.nifty50.market.close.summary.v1',
  'com.nifty50.oiis.leaders.changed.v1',
]);
const eventId = String(input.event_id || '').trim();
const eventType = String(input.event_type || '').trim();
const message = String(input.message || '').trim();
const mode = String(input.trading_mode || '').toUpperCase();
if (!eventId || !allowed.has(eventType) || mode !== 'PAPER' || !message || message.length > 1800) {
  return [{json: {send: false, suppression_reason: 'INVALID_CONTRACT', event_id: eventId || null}}];
}
const state = $getWorkflowStaticData('global');
const now = Date.now();
const ttl = 48 * 60 * 60 * 1000;
state.seen = state.seen || {};
for (const [id, at] of Object.entries(state.seen)) if (now - Number(at) > ttl) delete state.seen[id];
if (state.seen[eventId]) {
  return [{json: {send: false, suppression_reason: 'DUPLICATE_EVENT', event_id: eventId}}];
}
if (input.delivery?.test_only === true) {
  return [{json: {send: false, suppression_reason: 'TEST_ONLY', event_id: eventId, preview: message}}];
}
state.seen[eventId] = now;
return [{json: {send: true, event_id: eventId, event_type: eventType, whatsapp_message: message}}];`;

const workflow = {
  name: 'NIFTY50-Market-OIIS-WhatsApp-Low-Noise-v1',
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'nifty50-market-digest',
        authentication: 'basicAuth',
        responseMode: 'lastNode',
        options: {},
      },
      id: 'e05adfad-9020-43c8-a985-30ccb53ad0f1',
      name: 'Market Digest Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [-540, 0],
      webhookId: 'f120698a-dbf1-49f5-a2d8-da5f9251826a',
      credentials: {httpBasicAuth: {id: 'X0SPl7CSY4TSsM9w', name: 'admin-admin'}},
    },
    {
      parameters: {jsCode: policy},
      id: '197e104c-e581-4128-b692-f3434bc7089b',
      name: 'Validate Deduplicate and Format',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-300, 0],
    },
    {
      parameters: {conditions: {options: {caseSensitive: true, typeValidation: 'strict'}, conditions: [
        {id: '3c4d8a3c-b2a3-4e64-97fc-cf9192a15baa', leftValue: '={{ $json.send }}', rightValue: true, operator: {type: 'boolean', operation: 'true', singleValue: true}},
      ], combinator: 'and'}, options: {}},
      id: 'c0fe8491-89cd-4f6d-8706-fd188847290d',
      name: 'Send Message?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [-60, 0],
    },
    {
      parameters: {
        method: 'POST',
        url: "={{ $vars.PAPER_TRADE_WHATSAPP_GATEWAY_URL || 'https://wweb.noviusrailtech.com/webhook/send' }}",
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        bodyParameters: {parameters: [
          {name: 'chatId', value: '={{ $vars.PAPER_TRADE_WHATSAPP_CHAT_ID }}'},
          {name: 'message', value: '={{ $json.whatsapp_message }}'},
        ]},
        options: {timeout: 15000},
      },
      id: '7134ea4b-69aa-4621-aa98-c21c5050da38',
      name: 'Send Clean WhatsApp Message',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [200, -80],
      credentials: {httpHeaderAuth: {id: '4TUsrIdFaa5JvBIB', name: 'Paper WhatsApp Gateway - X-API-Token'}},
    },
    {
      parameters: {},
      id: 'dce637df-eefc-4242-aa7b-e863904c4e56',
      name: 'Suppressed - No Outbound Request',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [200, 80],
    },
  ],
  connections: {
    'Market Digest Webhook': {main: [[{node: 'Validate Deduplicate and Format', type: 'main', index: 0}]]},
    'Validate Deduplicate and Format': {main: [[{node: 'Send Message?', type: 'main', index: 0}]]},
    'Send Message?': {main: [
      [{node: 'Send Clean WhatsApp Message', type: 'main', index: 0}],
      [{node: 'Suppressed - No Outbound Request', type: 'main', index: 0}],
    ]},
  },
  pinData: {},
  settings: {executionOrder: 'v1'},
  active: false,
  versionId: 'f86e57fb-99a5-4c0a-a6d3-948a85b78022',
  meta: {templateCredsSetupCompleted: false},
  tags: [],
};

const destination = path.join(__dirname, 'NIFTY50_Market_OIIS_WhatsApp_Low_Noise_v1.json');
fs.writeFileSync(destination, `${JSON.stringify(workflow, null, 2)}\n`, {mode: 0o644});
console.log(destination);
