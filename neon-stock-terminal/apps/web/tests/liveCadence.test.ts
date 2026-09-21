import assert from "node:assert/strict";
import test from "node:test";

import {
  SCALPER_PROGRESSION_REFRESH_MS,
  SCALPER_V2_OPTION_HISTORY_REFRESH_MS,
  SCALPER_V2_PRICE_REFRESH_MS,
} from "../src/lib/liveCadence";

test("live workstation cadences refresh prices aggressively without over-polling option history", () => {
  assert.equal(SCALPER_V2_PRICE_REFRESH_MS, 15_000);
  assert.equal(SCALPER_PROGRESSION_REFRESH_MS, 15_000);
  assert.equal(SCALPER_V2_OPTION_HISTORY_REFRESH_MS, 30_000);
});

