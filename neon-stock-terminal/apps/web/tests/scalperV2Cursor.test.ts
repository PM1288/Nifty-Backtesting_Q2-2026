import test from "node:test";
import assert from "node:assert/strict";
import { ScalperV2CursorCoordinator, scalperV2CrosshairSyncAction } from "../src/lib/scalperV2Cursor";

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

test("Scalper V2 coordinator immediately fans physical time to receivers without echoing the origin", () => {
  const coordinator = new ScalperV2CursorCoordinator();
  const received: string[] = [];
  coordinator.subscribe("underlying", ({ time }) => received.push(`underlying:${time}`));
  coordinator.subscribe("call", ({ time }) => received.push(`call:${time}`));
  coordinator.subscribe("put", ({ time }) => received.push(`put:${time}`));

  coordinator.publish({ time: 1_789_722_300, source: "underlying" });
  assert.deepEqual(received, ["call:1789722300", "put:1789722300"]);
});

test("Scalper V2 coordinator forwards a global clear and cleans up subscriptions", () => {
  const coordinator = new ScalperV2CursorCoordinator();
  const received: Array<number | null> = [];
  const unsubscribe = coordinator.subscribe("call", ({ time }) => received.push(time));
  coordinator.publish({ time: null, source: "underlying" });
  unsubscribe();
  coordinator.publish({ time: 123, source: "underlying" });
  assert.deepEqual(received, [null]);
});
