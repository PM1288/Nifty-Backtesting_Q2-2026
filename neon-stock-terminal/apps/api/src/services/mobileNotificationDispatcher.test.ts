import assert from "node:assert/strict";
import test from "node:test";
import { buildPaperMobileEvent } from "./mobileNotificationDispatcher";

const base = {
  event_id: "f37065d1-329c-4c65-bdcf-5acb6786dffa",
  aggregate_id: "bf01bbcb-1ddc-4468-a0bd-cf954a01d61a",
  event_time: "2026-08-17T04:33:03.036Z"
};

test("paper position opened maps to the complete all-string mobile contract", () => {
  const event = buildPaperMobileEvent({
    ...base,
    event_type: "com.papertrading.trade_leg.opened.v1",
    payload: { data: { symbol: "BAJAJ-AUTO", side: "BUY", quantity: "75", entry_price: "11712", notification: { title: "PAPER POSITION OPENED", facts: ["BAJAJ-AUTO · BUY · 75 units @ ₹11712"] } } }
  });
  assert.ok(event);
  assert.equal(event.type, "paper_trade_opened");
  assert.equal(event.trade_mode, "PAPER");
  assert.equal(event.side, "LONG");
  assert.equal(event.route, `/paper-trades/${base.aggregate_id}`);
  assert.ok(Object.values(event).every((value) => typeof value === "string"));
});

test("analytical target hit remains explicitly PAPER and direction aware", () => {
  const event = buildPaperMobileEvent({
    ...base,
    event_type: "com.papertrading.target_track.closed.v1",
    payload: { data: { symbol: "IREDA", side: "SELL", quantity: "4525", newly_closed_target_tracks: [{ target_pct: 0.01 }], notification: { title: "ANALYTICAL TARGET HIT", facts: ["IREDA · SELL · 4525 units", "Targets reached: 1%"] } } }
  });
  assert.ok(event);
  assert.equal(event.type, "paper_target_hit");
  assert.equal(event.side, "SHORT");
  assert.equal(event.channel_id, "paper_target_hit_v2");
  assert.match(event.tts_text, /Paper target reached/);
  assert.match(event.title, /PAPER 1% TARGET HIT/);
  assert.match(event.body, /Qty 4,525/);
  assert.doesNotMatch(event.body, /0 units/);
});

test("non-user-facing pipeline events are not dispatched", () => {
  assert.equal(buildPaperMobileEvent({ ...base, event_type: "com.papertrading.trade_group.pending_entry.v1", payload: { data: {} } }), null);
});
