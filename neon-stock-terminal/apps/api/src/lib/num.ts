import type { Decimal } from "@prisma/client/runtime/library";

export function toNumber(x: unknown): number {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  if (typeof x === "bigint") return Number(x);
  if (typeof x === "string") return Number(x);
  // Prisma Decimal
  const maybe = x as Decimal & { toNumber?: () => number; toString?: () => string };
  if (typeof maybe.toNumber === "function") return maybe.toNumber();
  if (typeof maybe.toString === "function") return Number(maybe.toString());
  return Number(x as any);
}

export function toSafeVolume(x: unknown): number | string | null {
  if (x == null) return null;
  if (typeof x === "bigint") {
    const n = Number(x);
    if (Number.isSafeInteger(n)) return n;
    return x.toString();
  }
  if (typeof x === "number") return Number.isSafeInteger(x) ? x : String(x);
  if (typeof x === "string") return x;
  return null;
}
