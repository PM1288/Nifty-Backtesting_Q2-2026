import assert from "node:assert/strict";
import test from "node:test";
import { paperEvidenceAudit } from "./paperEvidenceAudit";

test("zero lows are invalid, missing evidence is not zero", () => {
  assert.equal(paperEvidenceAudit({ lowest_price: "0" }).status, "DATA_INVALID");
  assert.equal(paperEvidenceAudit({ lowest_price: null }).status, "NOT_AUDITED");
});
test("a completed counter does not certify horizon coverage", () => {
  const row = { horizons: [{ status: "COMPLETED", horizon_sessions: 30 }] };
  assert.equal(paperEvidenceAudit(row).status, "UNVERIFIED");
  assert.equal(row.horizons[0].status, "COMPLETED");
});
test("open positions and target touches remain separate from completed execution", () => {
  const audit = paperEvidenceAudit({ remaining_quantity: "10", observation_status: "THIRTY_SESSION_COMPLETE" });
  assert.ok(audit.issues.includes("OPEN_AFTER_OBSERVATION_WINDOW"));
  assert.equal(audit.targetTouchIsExecution, false);
});
