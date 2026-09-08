export const analyticsTabs = {
  morning: "Morning View",
  structure: "Market Structure",
  scalper: "Scalper",
  matrix: "1m · 5m · 15m",
  oi: "OI & PCR",
  stock: "Stock Activity",
  replay: "History",
} as const;
export function analyticsMainView(view: string) {
  if (["activity", "participants", "health"].includes(view)) return "morning";
  if (["options", "smartapi", "oi"].includes(view)) return "oi";
  return Object.hasOwn(analyticsTabs, view)
    ? (view as keyof typeof analyticsTabs)
    : "morning";
}
