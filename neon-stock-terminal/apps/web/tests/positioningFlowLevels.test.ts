import assert from "node:assert/strict";
import test from "node:test";
import { buildStrikeFlowRows } from "../src/lib/positioningFlow";
import { buildProbableLevels, buildProbableZones, evaluateZoneOutcome, extractStructuralLevels } from "../src/lib/positioningFlowLevels";

const leg = (strike: number, option_type: "CE" | "PE", price: number, open: number, oi: number, baseline: number, volume: number) => ({
  strike, option_type, last_price: price, day_open: open, open_interest: oi, baseline_open_interest: baseline,
  total_traded_volume: volume, baseline_kind: "PREVIOUS_SESSION_FINAL",
  baseline_collected_at: "2026-09-10T03:45:00Z", exchange_feed_at: "2026-09-10T05:45:00Z",
  oi_layers: { state: "COMPARABLE", change: oi - baseline },
});

test("level model scores side-correct short build-up as a stronger wall feature", () => {
  const rows = buildStrikeFlowRows([
    leg(23_400, "CE", 90, 100, 200, 100, 100),
    leg(23_450, "CE", 110, 100, 200, 100, 100),
    leg(23_400, "PE", 80, 90, 220, 100, 120),
    leg(23_450, "PE", 100, 90, 220, 100, 120),
  ]);
  const levels = buildProbableLevels(rows, []);
  const ceShort = levels.find((level) => level.role === "Resistance" && level.strike === 23_400)!;
  const ceLong = levels.find((level) => level.role === "Resistance" && level.strike === 23_450)!;
  const peShort = levels.find((level) => level.role === "Support" && level.strike === 23_400)!;
  assert.equal(ceShort.buildState, "Building");
  assert.ok(ceShort.marketStrength > ceLong.marketStrength);
  assert.equal(peShort.buildState, "Building");
  assert.equal(ceShort.velocityPerHour, 50);
  assert.equal(ceShort.persistence, null);
  assert.equal(ceShort.deltaWeightState, "UNAVAILABLE");
});

test("probable zones merge adjacent strong strikes while keeping participant context separate", () => {
  const rows = buildStrikeFlowRows([
    leg(23_400, "CE", 90, 100, 200, 100, 100), leg(23_400, "PE", 80, 90, 220, 100, 120),
    leg(23_450, "CE", 80, 100, 300, 150, 180), leg(23_450, "PE", 70, 90, 320, 170, 200),
    leg(23_500, "CE", 70, 100, 400, 200, 240), leg(23_500, "PE", 60, 90, 420, 220, 250),
  ]);
  const zones = buildProbableZones(rows, [{ code: "DR", value: 23_500 }], [
    { client_type: "FII", options_proxy: -10, delta_options_proxy: 2 },
    { client_type: "Pro", options_proxy: 5, delta_options_proxy: 3 },
  ], 0);
  assert.ok(zones.some((zone) => zone.memberStrikes.length === 3));
  assert.ok(zones.every((zone) => zone.participantAlignment === "Mixed"));
  assert.ok(zones.some((zone) => zone.structuralConfluence.includes("DR")));
});

test("structural extraction is missing-safe and outcome rules distinguish reach reject and confirmed break", () => {
  assert.deepEqual(extractStructuralLevels([{ codeResistance: "DR", codeSupport: "DS", selected: { resistance: 105 }, support: { support: 95 } }]), [
    { code: "DR", value: 105 }, { code: "DS", value: 95 },
  ]);
  const resistance = { role: "Resistance" as const, zoneLow: 100, zoneHigh: 110 };
  assert.deepEqual(evaluateZoneOutcome(resistance, [
    { at: "09:30", high: 105, low: 99, close: 102 },
    { at: "09:35", high: 106, low: 94, close: 96 },
  ], 5), { reached: true, confirmedBreak: false, rejected: true, firstTouchAt: "09:30", confirmedBreakAt: null });
  assert.equal(evaluateZoneOutcome(resistance, [
    { at: "09:30", high: 112, low: 105, close: 111 },
    { at: "09:35", high: 115, low: 110, close: 113 },
  ], 5).confirmedBreak, true);
});
