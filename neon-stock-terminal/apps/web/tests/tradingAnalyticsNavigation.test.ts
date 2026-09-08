import test from "node:test";
import assert from "node:assert/strict";
import {
  analyticsMainView,
  analyticsTabs,
} from "../src/lib/tradingAnalyticsNavigation";
test("IO navigation has seven primary workspaces", () =>
  assert.equal(Object.keys(analyticsTabs).length, 7));
test("all historical query aliases keep their owning workspace", () => {
  for (const alias of ["activity", "participants", "health"])
    assert.equal(analyticsMainView(alias), "morning");
  for (const alias of ["options", "smartapi", "oi"])
    assert.equal(analyticsMainView(alias), "oi");
});
test("invalid navigation defaults safely and canonical tabs round-trip", () => {
  assert.equal(analyticsMainView("invalid"), "morning");
  for (const key of Object.keys(analyticsTabs))
    assert.equal(analyticsMainView(key), key);
});
