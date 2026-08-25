export const MARKET_RSI_PARTICLE_COUNT = 400;

export type MarketRsiParticleProfile = {
  rsi: number | null;
  speed: number;
  colour: string;
  tone: "oversold" | "transition" | "balanced" | "constructive" | "overbought" | "unavailable";
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolate(start: number, end: number, progress: number): number {
  return Math.round(start + (end - start) * progress);
}

function colourBetween(from: [number, number, number], to: [number, number, number], progress: number): string {
  const value = [
    interpolate(from[0], to[0], progress),
    interpolate(from[1], to[1], progress),
    interpolate(from[2], to[2], progress),
  ];
  return `#${value.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function marketRsiParticleSpeed(inputRsi: number | null | undefined): number {
  if (!Number.isFinite(inputRsi)) return 0.8;
  const rsi = clamp(Number(inputRsi), 0, 100);
  if (rsi <= 20 || rsi >= 80) return 1.8;
  if (rsi < 40) return 1.8 - ((rsi - 20) / 20);
  return 0.8 + ((rsi - 40) / 40);
}

export function marketRsiParticleColour(inputRsi: number | null | undefined): string {
  if (!Number.isFinite(inputRsi)) return "#52647a";
  const rsi = clamp(Number(inputRsi), 0, 100);
  const red: [number, number, number] = [194, 56, 74];
  const yellow: [number, number, number] = [198, 138, 11];
  const green: [number, number, number] = [11, 122, 83];
  if (rsi <= 30) return "#c2384a";
  if (rsi < 45) return colourBetween(red, yellow, (rsi - 30) / 15);
  if (rsi === 45) return "#c68a0b";
  if (rsi < 70) return colourBetween(yellow, green, (rsi - 45) / 25);
  return "#0b7a53";
}

export function marketRsiParticleProfile(inputRsi: number | null | undefined): MarketRsiParticleProfile {
  const rsi = Number.isFinite(inputRsi) ? clamp(Number(inputRsi), 0, 100) : null;
  const tone = rsi == null ? "unavailable"
    : rsi <= 30 ? "oversold"
      : rsi < 45 ? "transition"
        : rsi === 45 ? "balanced"
          : rsi < 70 ? "constructive"
            : "overbought";
  return { rsi, speed: marketRsiParticleSpeed(rsi), colour: marketRsiParticleColour(rsi), tone };
}

