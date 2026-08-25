import assert from "node:assert/strict";
import test from "node:test";
import { currentIstTradeDate } from "./oiisLive";

test("OIIS trade date rolls over at midnight in Asia/Kolkata", () => {
  assert.equal(
    currentIstTradeDate(new Date("2026-08-12T18:29:59.999Z")),
    "2026-08-12",
  );
  assert.equal(
    currentIstTradeDate(new Date("2026-08-12T18:30:00.000Z")),
    "2026-08-13",
  );
});
