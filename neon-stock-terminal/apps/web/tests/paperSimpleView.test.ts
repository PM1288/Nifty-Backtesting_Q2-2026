import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaperSimpleCsv,
  buildPaperSimpleExcel,
  buildPaperSimpleRow,
  paperSimpleIstDateTime,
} from "../src/lib/paperSimpleView";

const trade = {
  trade_group_id: "pt-1",
  symbol: "PAYTM",
  side: "BUY",
  opened_at: "2026-08-25T04:00:00.000Z",
  average_entry_price: "1348.25",
  opened_quantity: "100",
  remaining_quantity: "100",
  evidence_ofactor: "7.1234",
  evidence_xfactor: "8.5678",
  intraday_session_high: "1360.50",
  intraday_session_low: "1330.00",
  intraday_max_drawdown: "-1825",
  hypothetical_carry_mark: "1358.25",
  open_unrealised_gross_pnl: "800",
};

test("simple paper row preserves canonical entry, factors and D0 extremes", () => {
  const row = buildPaperSimpleRow(trade, "One 97 Communications Ltd");
  assert.equal(row.stockName, "One 97 Communications Ltd");
  assert.equal(row.entryPrice, 1348.25);
  assert.equal(row.oFactor, 7.1234);
  assert.equal(row.dayHigh, 1360.5);
  assert.equal(row.dayLow, 1330);
  assert.equal(row.currentPnl, 1000);
  assert.equal(row.currentPnlBasis, "OPEN_ACTUAL_GROSS");
});

test("closed trades label current-price P/L as hypothetical rather than booked", () => {
  const row = buildPaperSimpleRow({ ...trade, remaining_quantity: "0", hypothetical_carry_pnl: "1000" });
  assert.equal(row.currentPnl, 1000);
  assert.equal(row.currentPnlBasis, "CURRENT_PATH_HYPOTHETICAL");
});

test("missing observations remain missing instead of becoming zero", () => {
  const row = buildPaperSimpleRow({ trade_group_id: "pt-2", symbol: "IDEA", opened_at: null });
  assert.equal(row.entryPrice, null);
  assert.equal(row.dayHigh, null);
  assert.equal(row.dayMaxDrawdown, null);
  assert.equal(row.currentPrice, null);
});

test("simple exports contain exactly the visible evidence fields", () => {
  const row = buildPaperSimpleRow(trade, "One 97 Communications Ltd");
  const csv = buildPaperSimpleCsv([row]);
  const excel = buildPaperSimpleExcel([row]);
  assert.match(csv, /"Stock Name","Symbol","Date bought at \(IST\)"/);
  assert.match(csv, /"One 97 Communications Ltd","PAYTM"/);
  assert.match(csv, /"7.12","8.57"/);
  assert.doesNotMatch(csv, /1825\.000000/);
  assert.match(excel, /<th>Current P\/L Basis<\/th>/);
  assert.match(excel, /<td>OPEN_ACTUAL_GROSS<\/td>/);
});

test("entry timestamp is split into stable IST date and time", () => {
  assert.deepEqual(paperSimpleIstDateTime("2026-08-25T04:00:00.000Z"), {
    date: "25 Aug 2026",
    time: "09:30:00",
  });
});
