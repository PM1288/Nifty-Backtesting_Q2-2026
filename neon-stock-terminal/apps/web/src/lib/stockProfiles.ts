import { useEffect, useMemo, useState } from "react";

export type StockProfile = {
  symbol: string; name: string; isin: string; sector: string; capBucket: "Large Cap" | "Mid Cap" | "Small Cap";
  nifty50: boolean; nifty100: boolean; nifty200: boolean; largeMidcap250: boolean; nifty500: boolean; fno: boolean;
  memberships: string[]; logoUrl: string;
};
type Payload = { asOf: string; source: string; records: StockProfile[] };
export type StockProfileFilters = { universe: string; capBucket: string; sector: string };

let cached: Payload | null = null;
let pending: Promise<Payload> | null = null;
function load() {
  if (cached) return Promise.resolve(cached);
  pending ??= fetch("/n50/stock-profiles.json").then((response) => {
    if (!response.ok) throw new Error(`Stock profiles ${response.status}`);
    return response.json() as Promise<Payload>;
  }).then((value) => (cached = value));
  return pending;
}
export function useStockProfiles() {
  const [payload, setPayload] = useState<Payload | null>(cached);
  useEffect(() => { let active = true; void load().then((value) => { if (active) setPayload(value); }).catch(() => undefined); return () => { active = false; }; }, []);
  return payload;
}
export function profileMap(payload: Payload | null) {
  return new Map((payload?.records ?? []).map((profile) => [profile.symbol.toUpperCase(), profile]));
}
export function matchesStockProfile(profile: StockProfile | undefined, filters: StockProfileFilters) {
  if (!profile) return filters.universe === "ALL" && filters.capBucket === "ALL" && filters.sector === "ALL";
  const universe = filters.universe === "ALL" || (filters.universe === "FNO" && profile.fno) ||
    (filters.universe === "NIFTY50" && profile.nifty50) || (filters.universe === "NIFTY100" && profile.nifty100) ||
    (filters.universe === "NIFTY250" && profile.largeMidcap250) || (filters.universe === "NIFTY500" && profile.nifty500);
  return universe && (filters.capBucket === "ALL" || profile.capBucket === filters.capBucket) &&
    (filters.sector === "ALL" || profile.sector === filters.sector);
}
export function useProfileIndex() {
  const payload = useStockProfiles();
  return useMemo(() => ({ payload, bySymbol: profileMap(payload) }), [payload]);
}
