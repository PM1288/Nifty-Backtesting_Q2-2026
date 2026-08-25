'use strict';

const fs = require('node:fs');
const path = require('node:path');

const input = fs.readFileSync(0, 'utf8');
const workflow = JSON.parse(input);
const sourcePath = path.join(__dirname, 'notification_policy_v3.js');
// n8n binds binary helpers on the Code node execution context. Strict mode
// makes top-level `this` undefined and breaks production CloudEvents payloads,
// which the Webhook node stores as binary for application/cloudevents+json.
const policySource = fs.readFileSync(sourcePath, 'utf8')
  .replace(/^'use strict';\s*/, '')
  .replace(
    /\nif \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*?\n\}\n?$/,
    '\n',
  );

const wrapper = `
async function readIncomingPayload() {
  const item = $input.first();
  let candidate = item?.json?.body ?? item?.json ?? {};
  if (item?.binary?.data) {
    const buffer = await this.helpers.getBinaryDataBuffer(0, 'data');
    const raw = buffer.toString('utf8').trim();
    if (raw) candidate = JSON.parse(raw);
  }
  if (typeof candidate === 'string') candidate = JSON.parse(candidate);
  if (candidate && typeof candidate.body === 'string') {
    const parsed = JSON.parse(candidate.body);
    if (parsed && typeof parsed === 'object') candidate = parsed;
  }
  return candidate && typeof candidate === 'object' ? candidate : {};
}

const incomingPayload = await readIncomingPayload.call(this);
let workflowState = {};
try { workflowState = $getWorkflowStaticData('global'); } catch { workflowState = {}; }
const formatted = formatNotification(incomingPayload, { state: workflowState });
return [{ json: formatted }];
`;

const codeNode = workflow.nodes.find((node) => node.name === 'Low-Noise Policy and Format');
if (!codeNode || codeNode.type !== 'n8n-nodes-base.code') {
  throw new Error('Active low-noise formatter node was not found.');
}
codeNode.parameters.jsCode = `${policySource}${wrapper}`;

const writable = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: { executionOrder: workflow.settings?.executionOrder || 'v1' },
};
process.stdout.write(JSON.stringify(writable));
