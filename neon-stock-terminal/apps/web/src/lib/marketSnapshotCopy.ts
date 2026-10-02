/** Display labels only; source values and unavailable markers remain unchanged. */
export function formatMarketSnapshot(text: string): string {
  const labels: Record<string, string> = {
    LAST: "Last", CHG: "Change", PREV_CLOSE: "Previous close", DAILY_RSI14: "Daily RSI (14)",
    INTRADAY_RSI14: "Intraday RSI (14)", VWAP_DEV_PCT: "VWAP deviation (%)",
    WEIGHTED_PARTICIPATION: "Weighted participation", TOP10_CONCENTRATION: "Top 10 concentration",
    FII_BUY_VALUE_CR: "FII buy (₹ crore)", FII_SELL_VALUE_CR: "FII sell (₹ crore)",
    FII_OPEN_INTEREST_VALUE_CR: "FII open interest (₹ crore)", D1_CHANGE_PCT_POINTS: "Daily change (pp)"
  };
  return text.replace(/\b([A-Z][A-Z0-9_]+)=/g, (_match, key: string) => {
    const label = labels[key] ?? key.split("_").map((part, i) =>
      ["FII", "OI", "PCR", "IV", "ATM", "RSI", "VWAP"].includes(part) ? part : i === 0 ? part[0] + part.slice(1).toLowerCase() : part.toLowerCase()
    ).join(" ");
    return ` · ${label}: `;
  }).replace(/^ · /, "");
}
