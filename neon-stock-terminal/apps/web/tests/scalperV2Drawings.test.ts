import assert from "node:assert/strict";
import test from "node:test";
import {
  createScalperV2Drawing,
  drawingAnchorCount,
  drawingStorageKey,
  duplicateScalperV2Drawing,
  parseScalperV2Drawings,
} from "../src/pages/scalper-v2/scalperV2Drawings";
import { distanceToSegment } from "../src/pages/scalper-v2/ScalperV2DrawingPrimitive";

test("Scalper V2 drawing tools declare deterministic market anchors", () => {
  assert.equal(drawingAnchorCount("horizontal_line"), 1);
  assert.equal(drawingAnchorCount("horizontal_ray"), 1);
  assert.equal(drawingAnchorCount("trend_line"), 2);
  assert.equal(drawingAnchorCount("parallel_channel"), 3);
  assert.equal(drawingAnchorCount("long_position"), 3);
  assert.equal(drawingAnchorCount("select"), 0);
});

test("Scalper V2 drawings preserve time and price rather than pixels", () => {
  const drawing = createScalperV2Drawing({
    id: "d-1", tool: "trend_line", paneRole: "call", instrumentId: "NIFTY-CE-23450",
    anchors: [{ time: 1_789_005_600, price: 78.3 }, { time: 1_789_005_900, price: 82.15 }], now: "2026-09-10T12:00:00.000Z",
  });
  assert.deepEqual(drawing.anchors, [{ time: 1_789_005_600, price: 78.3 }, { time: 1_789_005_900, price: 82.15 }]);
  assert.equal("x" in drawing.anchors[0], false);
  assert.equal("y" in drawing.anchors[0], false);
  assert.equal(parseScalperV2Drawings(JSON.stringify([drawing]))[0].instrumentId, "NIFTY-CE-23450");
});

test("Scalper V2 drawing persistence rejects malformed records and scopes by symbol", () => {
  assert.deepEqual(parseScalperV2Drawings('[{"id":"bad","tool":"trend_line","anchors":[]}]'), []);
  assert.equal(drawingStorageKey("nifty"), "trading-analytics:scalper-v2:drawings:v1:default:NIFTY");
});

test("Scalper V2 drawing duplication uses an independent anchor array", () => {
  const original = createScalperV2Drawing({ id: "one", tool: "horizontal_line", paneRole: "underlying", instrumentId: "NIFTY", anchors: [{ time: 10, price: 100 }] });
  const copy = duplicateScalperV2Drawing(original, "two", "2026-09-10T12:00:00.000Z");
  copy.anchors[0].price = 101;
  assert.equal(original.anchors[0].price, 100);
  assert.equal(copy.locked, false);
});

test("Scalper V2 drawing hit tests distinguish a segment from a ray in CSS pixels", () => {
  const start = { x: 0, y: 0 }, end = { x: 10, y: 10 };
  assert.ok(Math.abs(distanceToSegment({ x: 5, y: 6 }, start, end) - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(distanceToSegment({ x: 12, y: 12 }, start, end) - Math.sqrt(8)) < 1e-12);
  assert.equal(distanceToSegment({ x: 12, y: 12 }, start, end, "ray"), 0);
  assert.equal(distanceToSegment({ x: 12, y: 12 }, start, end, "line"), 0);
  assert.equal(distanceToSegment({ x: 3, y: 4 }, start, start), 5);
});
