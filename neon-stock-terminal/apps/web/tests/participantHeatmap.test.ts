import assert from "node:assert/strict";
import test from "node:test";
import {
  participantHeatmapExtent,
  participantHeatmapReading,
} from "../src/lib/participantHeatmap";

test("participant heatmap derives independent positive and negative extrema", () => {
  assert.deepEqual(
    participantHeatmapExtent([-100, 0, 50, 200, null, "unavailable"]),
    { maximumPositive: 200, maximumNegativeMagnitude: 100 },
  );
});

test("participant heatmap scales green and red magnitudes within a column", () => {
  const extent = participantHeatmapExtent([-100, -50, 50, 200]);
  assert.deepEqual(participantHeatmapReading(200, extent), {
    value: 200, tone: "positive", strength: 1,
  });
  assert.deepEqual(participantHeatmapReading(50, extent), {
    value: 50, tone: "positive", strength: 0.25,
  });
  assert.deepEqual(participantHeatmapReading(-100, extent), {
    value: -100, tone: "negative", strength: 1,
  });
  assert.deepEqual(participantHeatmapReading(-50, extent), {
    value: -50, tone: "negative", strength: 0.5,
  });
});

test("participant heatmap keeps zero and missing values distinct and neutral", () => {
  const extent = participantHeatmapExtent([0, "25", null]);
  assert.deepEqual(participantHeatmapReading(0, extent), {
    value: 0, tone: "neutral", strength: 0,
  });
  assert.deepEqual(participantHeatmapReading(null, extent), {
    value: null, tone: "missing", strength: 0,
  });
  assert.deepEqual(participantHeatmapReading("", extent), {
    value: null, tone: "missing", strength: 0,
  });
});
