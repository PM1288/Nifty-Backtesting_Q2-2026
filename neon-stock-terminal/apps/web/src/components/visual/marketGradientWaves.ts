export type MarketWaveTone = "positive" | "neutral" | "negative";

export const MARKET_WAVE_NEUTRAL_BAND_PCT = 0.2;

export type MarketWaveProfile = {
  tone: MarketWaveTone;
  label: string;
  canvas: string;
  wash: string;
  waveOne: string;
  waveTwo: string;
  waveThree: string;
  accent: string;
  magnitude: number;
  brilliance: number;
  rsi: number | null;
  rsiMomentum: number;
  driftSeconds: number;
  flowOneSeconds: number;
  flowTwoSeconds: number;
  flowThreeSeconds: number;
};

type MarketWavePalette = Pick<MarketWaveProfile, "label" | "canvas" | "wash" | "waveOne" | "waveTwo" | "waveThree" | "accent">;

const PROFILES: Record<MarketWaveTone, MarketWavePalette> = {
  positive: {
    label: "NIFTY positive above +0.20%",
    canvas: "#f2fbf7",
    wash: "rgba(34, 197, 94, 0.13)",
    waveOne: "rgba(11, 122, 83, 0.34)",
    waveTwo: "rgba(16, 185, 129, 0.25)",
    waveThree: "rgba(45, 212, 191, 0.18)",
    accent: "rgba(11, 122, 83, 0.11)",
  },
  neutral: {
    label: "NIFTY neutral between -0.20% and +0.20%",
    canvas: "#fffaf0",
    wash: "rgba(245, 183, 42, 0.14)",
    waveOne: "rgba(166, 102, 0, 0.31)",
    waveTwo: "rgba(234, 179, 8, 0.25)",
    waveThree: "rgba(251, 191, 36, 0.18)",
    accent: "rgba(198, 138, 11, 0.11)",
  },
  negative: {
    label: "NIFTY negative below -0.20%",
    canvas: "#fff5f6",
    wash: "rgba(239, 68, 68, 0.12)",
    waveOne: "rgba(194, 56, 74, 0.33)",
    waveTwo: "rgba(239, 68, 68, 0.24)",
    waveThree: "rgba(244, 114, 182, 0.17)",
    accent: "rgba(194, 56, 74, 0.10)",
  },
};

export function marketWaveTone(changePct: number | null | undefined): MarketWaveTone {
  if (!Number.isFinite(changePct)) return "neutral";
  if (Number(changePct) > MARKET_WAVE_NEUTRAL_BAND_PCT) return "positive";
  if (Number(changePct) < -MARKET_WAVE_NEUTRAL_BAND_PCT) return "negative";
  return "neutral";
}

export function marketWaveProfile(changePct: number | null | undefined): MarketWaveProfile {
  const tone = marketWaveTone(changePct);
  return marketWaveDynamics(tone, changePct, null);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function marketWaveDynamics(tone: MarketWaveTone, changePct: number | null | undefined, inputRsi: number | null | undefined): MarketWaveProfile {
  const magnitude = Number.isFinite(changePct) ? Math.abs(Number(changePct)) : 0;
  const brilliance = clamp(magnitude / 2, 0, 1);
  const rsi = Number.isFinite(inputRsi) ? clamp(Number(inputRsi), 0, 100) : null;
  const rsiMomentum = rsi == null ? 0 : Math.abs(rsi - 50) / 50;
  const driftSeconds = 28 - rsiMomentum * 16;
  return { tone, ...PROFILES[tone], magnitude, brilliance, rsi, rsiMomentum, driftSeconds, flowOneSeconds: driftSeconds * 0.82, flowTwoSeconds: driftSeconds * 1.05, flowThreeSeconds: driftSeconds * 1.25 };
}

export function marketWaveProfileWithRsi(changePct: number | null | undefined, rsi: number | null | undefined): MarketWaveProfile {
  return marketWaveDynamics(marketWaveTone(changePct), changePct, rsi);
}
