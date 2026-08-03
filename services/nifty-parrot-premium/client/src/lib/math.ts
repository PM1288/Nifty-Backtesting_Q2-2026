export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
export function invLerp(a: number, b: number, v: number) {
  if (a === b) return 0;
  return (v - a) / (b - a);
}
export function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStringToSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
