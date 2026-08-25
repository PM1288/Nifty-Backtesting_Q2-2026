import test from "node:test";
import assert from "node:assert/strict";
import { isPaperExecutionClosed } from "../src/lib/paperAtlas";

test("reward pain bubble closure uses remaining execution quantity", () => {
  assert.equal(isPaperExecutionClosed(0), true);
  assert.equal(isPaperExecutionClosed("0"), true);
  assert.equal(isPaperExecutionClosed(-1), true);
  assert.equal(isPaperExecutionClosed(1), false);
  assert.equal(isPaperExecutionClosed(undefined), false);
});
