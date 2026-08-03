import type { AnalyticsParams, AnalyticsValue, Primitive } from "./types";

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function isPrimitiveArray(value: AnalyticsValue): value is Primitive[] {
  return Array.isArray(value);
}

function sanitizeString(key: string, value: string) {
  if (/email/i.test(key)) return undefined;
  if (EMAIL_PATTERN.test(value)) return undefined;
  return value.trim().slice(0, 240);
}

function sanitizeValue(key: string, value: AnalyticsValue): Primitive | Primitive[] | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return sanitizeString(key, value);
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(4)) : undefined;
  if (typeof value === "boolean") return value;
  if (isPrimitiveArray(value)) {
    const cleaned = value
      .map((item) => sanitizeValue(key, item))
      .filter((item): item is Primitive => item !== undefined && !Array.isArray(item));
    return cleaned.length ? cleaned.slice(0, 10) : undefined;
  }
  return String(value).slice(0, 240);
}

export function sanitizeAnalyticsParams(params?: AnalyticsParams) {
  if (!params) return {};
  const output: AnalyticsParams = {};

  for (const [key, value] of Object.entries(params)) {
    const normalizedKey = key.trim().replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 60);
    if (!normalizedKey) continue;
    const cleaned = sanitizeValue(normalizedKey, value);
    if (cleaned !== undefined) {
      output[normalizedKey] = cleaned;
    }
  }

  return output;
}

export function safePagePath(pathname: string, search = "") {
  if (!search) return pathname;
  const params = new URLSearchParams(search);
  const safe = new URLSearchParams();
  for (const key of ["symbol", "surface", "section"]) {
    const value = params.get(key);
    if (value) safe.set(key, value.slice(0, 60));
  }
  const suffix = safe.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}
