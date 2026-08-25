'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [templatePath, outputPath] = process.argv.slice(2);
if (!templatePath || !outputPath) {
  console.error('Usage: node build_workflow_v3.js <workflow-template.json> <output.json>');
  process.exit(2);
}

const sourcePath = path.join(__dirname, 'notification_policy_v3.js');
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

const workflow = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
const codeNode = workflow.nodes.find((node) =>
  node.type === 'n8n-nodes-base.code' &&
  ['Format WhatsApp Message', 'Normalise and Format', 'Policy and Format'].includes(node.name)
);
if (!codeNode) throw new Error('No supported formatter Code node found in workflow template.');

const webhookNode = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');
if (!webhookNode) throw new Error('No Webhook node found in workflow template.');
if (process.env.N8N_WEBHOOK_PATH) webhookNode.parameters.path = process.env.N8N_WEBHOOK_PATH;
// Wait for the policy/delivery path before acknowledging. This closes the
// static-data dedupe race and lets the backend outbox observe gateway failures.
webhookNode.parameters.responseMode = 'lastNode';

codeNode.name = 'Low-Noise Policy and Format';
codeNode.parameters.jsCode = `${policySource}${wrapper}`;

for (const [sourceName, connection] of Object.entries(workflow.connections || {})) {
  for (const output of connection.main || []) {
    for (const target of output || []) {
      if (target.node === 'Format WhatsApp Message' || target.node === 'Normalise and Format') {
        target.node = codeNode.name;
      }
    }
  }
  if (sourceName === 'Format WhatsApp Message' || sourceName === 'Normalise and Format') {
    workflow.connections[codeNode.name] = connection;
    delete workflow.connections[sourceName];
  }
}

const removedNodes = new Set(
  workflow.nodes
    .filter((node) => node.type === 'n8n-nodes-base.httpRequest' && node.disabled === true)
    .map((node) => node.name),
);
workflow.nodes = workflow.nodes.filter((node) => !removedNodes.has(node.name));
for (const connection of Object.values(workflow.connections || {})) {
  for (const output of connection.main || []) {
    for (let index = output.length - 1; index >= 0; index -= 1) {
      if (removedNodes.has(output[index].node)) output.splice(index, 1);
    }
  }
}
for (const name of removedNodes) delete workflow.connections[name];

const sendNode = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.httpRequest' && node.disabled !== true);
if (!sendNode) throw new Error('No enabled outbound HTTP Request node found.');

const headerCredentialId = process.env.N8N_HEADER_AUTH_CREDENTIAL_ID;
const headerCredentialName = process.env.N8N_HEADER_AUTH_CREDENTIAL_NAME || 'Paper WhatsApp Gateway - X-API-Token';
if (headerCredentialId) {
  const inlineHeaders = sendNode.parameters?.headerParameters?.parameters || [];
  const remainingHeaders = inlineHeaders.filter((header) => String(header.name).toLowerCase() !== 'x-api-token');
  if (remainingHeaders.length) sendNode.parameters.headerParameters = { parameters: remainingHeaders };
  else delete sendNode.parameters.headerParameters;
  sendNode.parameters.authentication = 'genericCredentialType';
  sendNode.parameters.genericAuthType = 'httpHeaderAuth';
  sendNode.credentials = {
    ...(sendNode.credentials || {}),
    httpHeaderAuth: { id: headerCredentialId, name: headerCredentialName },
  };
}

const ifNode = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{
        id: 'paper-trade-send-actionable',
        leftValue: '={{ $json.send }}',
        rightValue: '',
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  },
  id: 'paper-trade-send-actionable',
  name: 'Send Actionable?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [560, 0],
};
const suppressedNode = {
  parameters: {},
  id: 'paper-trade-suppressed',
  name: 'Suppressed - No Outbound Request',
  type: 'n8n-nodes-base.noOp',
  typeVersion: 1,
  position: [800, 160],
};
workflow.nodes = workflow.nodes.filter((node) => ![ifNode.name, suppressedNode.name].includes(node.name));
workflow.nodes.push(ifNode, suppressedNode);

workflow.connections = {
  [webhookNode.name]: { main: [[{ node: codeNode.name, type: 'main', index: 0 }]] },
  [codeNode.name]: { main: [[{ node: ifNode.name, type: 'main', index: 0 }]] },
  [ifNode.name]: {
    main: [
      [{ node: sendNode.name, type: 'main', index: 0 }],
      [{ node: suppressedNode.name, type: 'main', index: 0 }],
    ],
  },
};

workflow.name = 'Paper-Trade-Outgoing-Low-Noise-v3';
// The public API accepts only writable workflow settings. Fields such as
// binaryMode can appear in GET responses but are rejected on PUT.
workflow.settings = { executionOrder: 'v1' };

const apiSafe = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: workflow.settings,
};
fs.writeFileSync(outputPath, `${JSON.stringify(apiSafe, null, 2)}\n`, { mode: 0o600 });
console.log(`Built ${outputPath} with ${apiSafe.nodes.length} nodes.`);
