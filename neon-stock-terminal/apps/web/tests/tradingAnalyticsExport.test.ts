import {test} from "node:test";
import assert from "node:assert/strict";
import {evidenceCsv} from "../src/lib/tradingAnalyticsExport";
test("research CSV preserves hidden fields, exact money, zero and missing",()=>{const csv=evidenceCsv([{price:"-122.86",count:0,missing:null,provenance:"first,source"},{price:"1.00",extra:"hidden"}]);assert.ok(csv.includes('"-122.86","0",""'));assert.ok(csv.includes('"extra"'));assert.ok(csv.includes('"first,source"'));assert.ok(csv.includes('"hidden"'));});
test("CSV quotes and spreadsheet formula protection",()=>{const csv=evidenceCsv([{source:'=HYPERLINK("unsafe")',status:"NO TRADE"}]);assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('""unsafe""'));});
