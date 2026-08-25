const fs = require('fs');
const path = require('path');

const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, 'NSE_Daily_Ingest_WhatsApp_v1.json'), 'utf8'));
const names = new Set(workflow.nodes.map((node) => node.name));
for (const required of ['NSE Ingest Webhook', 'Validate and Format Missing Files', 'Send NSE Data Alert', 'Record Delivered Alert']) {
  if (!names.has(required)) throw new Error(`missing node: ${required}`);
}
const webhook = workflow.nodes.find((node) => node.name === 'NSE Ingest Webhook');
if (webhook.parameters.path !== 'codex-nse-daily-ingest-v1') throw new Error('wrong webhook path');
if (webhook.parameters.authentication !== 'basicAuth') throw new Error('webhook must use Basic Auth');
const source = JSON.stringify(workflow);
for (const forbidden of ['codex-paper-trade', 'PAPER_TRADE_', 'eyJhbGciOi']) {
  if (source.includes(forbidden)) throw new Error(`forbidden value in workflow: ${forbidden}`);
}
if (!source.includes('nse.daily.files.missing.v1')) throw new Error('missing event whitelist');
if (!source.includes('Data operations alert · no trade was created')) throw new Error('missing safety footer');
console.log('nse daily ingest n8n workflow: PASS');
