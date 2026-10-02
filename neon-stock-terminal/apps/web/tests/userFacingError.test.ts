import { test } from "node:test";
import assert from "node:assert/strict";
import { userFacingError } from "../src/lib/userFacingError";
test("read errors never expose diagnostics", () => {
 for (const value of [new Error("SQL SELECT password"), "API 500: private payload", { message: "stack trace" }, null]) {
  assert.equal(userFacingError(value), "We couldn’t load this data. Try again.");
 }
});
test("authentication failures have actionable copy", () => {
 assert.equal(userFacingError({status:401}), "Your session has expired. Sign in again.");
 assert.equal(userFacingError({status:403}), "You don’t have access to this data.");
 assert.equal(userFacingError(new Error(), "Trade details unavailable."), "Trade details unavailable.");
});
