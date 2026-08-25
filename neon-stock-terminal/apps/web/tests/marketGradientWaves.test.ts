import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKET_WAVE_NEUTRAL_BAND_PCT,
  marketWaveProfile,
  marketWaveProfileWithRsi,
  marketWaveTone,
} from "../src/components/visual/marketGradientWaves";
import {
  MARKET_RSI_PARTICLE_COUNT,
  marketRsiParticleColour,
  marketRsiParticleProfile,
  marketRsiParticleSpeed,
} from "../src/components/visual/marketRsiParticles";

test("market wave thresholds use an inclusive plus/minus 0.20 percent neutral band", () => {
  assert.equal(MARKET_WAVE_NEUTRAL_BAND_PCT, 0.2);
  assert.equal(marketWaveTone(0.2), "neutral");
  assert.equal(marketWaveTone(-0.2), "neutral");
  assert.equal(marketWaveTone(0), "neutral");
  assert.equal(marketWaveTone(0.200001), "positive");
  assert.equal(marketWaveTone(-0.200001), "negative");
});

test("larger absolute NIFTY moves produce greater bounded colour brilliance", () => {
  assert.equal(marketWaveProfileWithRsi(0, 50).brilliance, 0);
  assert.equal(marketWaveProfileWithRsi(1, 50).brilliance, 0.5);
  assert.equal(marketWaveProfileWithRsi(-2, 50).brilliance, 1);
  assert.equal(marketWaveProfileWithRsi(8, 50).brilliance, 1);
});

test("RSI extremes accelerate waves symmetrically while missing RSI stays calm", () => {
  const calm = marketWaveProfileWithRsi(0.8, 50);
  const overbought = marketWaveProfileWithRsi(0.8, 80);
  const oversold = marketWaveProfileWithRsi(-0.8, 20);
  const missing = marketWaveProfileWithRsi(0.8, null);
  assert.equal(calm.driftSeconds, 28);
  assert.equal(missing.driftSeconds, 28);
  assert.ok(overbought.driftSeconds < calm.driftSeconds);
  assert.equal(overbought.driftSeconds, oversold.driftSeconds);
  assert.equal(overbought.rsiMomentum, 0.6);
});

test("missing and invalid NIFTY values use the honest neutral fallback", () => {
  assert.equal(marketWaveTone(null), "neutral");
  assert.equal(marketWaveTone(undefined), "neutral");
  assert.equal(marketWaveTone(Number.NaN), "neutral");
});

test("each market direction has a distinct light-theme wave palette", () => {
  const positive = marketWaveProfile(0.21);
  const neutral = marketWaveProfile(0.2);
  const negative = marketWaveProfile(-0.21);
  assert.notEqual(positive.canvas, neutral.canvas);
  assert.notEqual(neutral.canvas, negative.canvas);
  assert.notEqual(positive.waveOne, negative.waveOne);
  assert.match(positive.label, /positive/i);
  assert.match(neutral.label, /neutral/i);
  assert.match(negative.label, /negative/i);
});

test("RSI particle speed follows the requested asymmetric linear scale", () => {
  assert.equal(MARKET_RSI_PARTICLE_COUNT, 400);
  assert.equal(marketRsiParticleSpeed(20), 1.8);
  assert.equal(marketRsiParticleSpeed(30), 1.3);
  assert.equal(marketRsiParticleSpeed(40), 0.8);
  assert.equal(marketRsiParticleSpeed(60), 1.3);
  assert.equal(marketRsiParticleSpeed(80), 1.8);
  assert.equal(marketRsiParticleSpeed(100), 1.8);
});

test("RSI particle colour uses red, yellow and green anchor points", () => {
  assert.equal(marketRsiParticleColour(30), "#c2384a");
  assert.equal(marketRsiParticleColour(45), "#c68a0b");
  assert.equal(marketRsiParticleColour(70), "#0b7a53");
  assert.equal(marketRsiParticleProfile(null).tone, "unavailable");
  assert.equal(marketRsiParticleProfile(null).speed, 0.8);
});
