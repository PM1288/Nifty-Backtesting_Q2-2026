import test from "node:test";
import assert from "node:assert/strict";
import { scalperV2CrosshairSyncAction } from "../src/lib/scalperV2Cursor";

test("Scalper V2 physical cursor origin remains unsuppressed while other panes receive it", () => {
  assert.equal(scalperV2CrosshairSyncAction({ paneId: "underlying", source: "underlying", hasCrosshair: true, mode: "hover" }), "ORIGIN_OWNS");
  assert.equal(scalperV2CrosshairSyncAction({ paneId: "call", source: "underlying", hasCrosshair: true, mode: "hover" }), "RECEIVE");
  assert.equal(scalperV2CrosshairSyncAction({ paneId: "put", source: "call", hasCrosshair: true, mode: "hover" }), "RECEIVE");
});

test("Scalper V2 clears every transient pane together but preserves a locked selection", () => {
  assert.equal(scalperV2CrosshairSyncAction({ paneId: "underlying", source: null, hasCrosshair: false, mode: "hover" }), "CLEAR");
  assert.equal(scalperV2CrosshairSyncAction({ paneId: "call", source: null, hasCrosshair: false, mode: "latest" }), "CLEAR");
  assert.equal(scalperV2CrosshairSyncAction({ paneId: "put", source: null, hasCrosshair: false, mode: "locked" }), "HOLD");
});
