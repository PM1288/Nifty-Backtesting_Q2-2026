export type PaperSimpleSource = Record<string, unknown>;

export type PaperSimpleRow = {
  tradeId: string;
  stockName: string;
  symbol: string;
  openedAt: string | null;
  entryPrice: number | null;
  oFactor: number | null;
  xFactor: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  dayMaxDrawdown: number | null;
  dayMaxDrawdownPct: number | null;
  currentPrice: number | null;
  currentPnl: number | null;
  currentPnlPct: number | null;
  currentPnlBasis: "OPEN_ACTUAL_GROSS" | "CURRENT_PATH_HYPOTHETICAL";
  trade: PaperSimpleSource;
};

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function paperSimpleIstDateTime(value: string | null): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return { date: "", time: "" };
  const date = parsed.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = parsed.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return { date, time };
}

export function buildPaperSimpleRow(trade: PaperSimpleSource, stockName?: string): PaperSimpleRow {
  const entryPrice = optionalNumber(trade.average_entry_price);
  const quantity = optionalNumber(trade.opened_quantity);
  const remainingQuantity = optionalNumber(trade.remaining_quantity) ?? 0;
  const currentPrice = optionalNumber(trade.hypothetical_carry_mark) ?? optionalNumber(trade.last_mark);
  const direction = String(trade.side).toUpperCase() === "SELL" ? -1 : 1;
  const derivedCurrentPnl = currentPrice != null && entryPrice != null && quantity != null
    ? direction * (currentPrice - entryPrice) * quantity
    : null;
  const currentPnl = remainingQuantity > 0
    ? derivedCurrentPnl ?? optionalNumber(trade.open_unrealised_gross_pnl)
    : optionalNumber(trade.hypothetical_carry_pnl) ?? derivedCurrentPnl;
  const entryNotional = entryPrice != null && quantity != null ? entryPrice * quantity : null;

  return {
    tradeId: String(trade.trade_group_id ?? ""),
    stockName: stockName || String(trade.symbol ?? ""),
    symbol: String(trade.symbol ?? ""),
    openedAt: trade.opened_at ? String(trade.opened_at) : null,
    entryPrice,
    oFactor: optionalNumber(trade.evidence_ofactor),
    xFactor: optionalNumber(trade.evidence_xfactor),
    dayHigh: optionalNumber(trade.intraday_session_high),
    dayLow: optionalNumber(trade.intraday_session_low),
    dayMaxDrawdown: optionalNumber(trade.intraday_max_drawdown),
    dayMaxDrawdownPct: entryNotional && entryNotional > 0 && trade.intraday_max_drawdown != null
      ? optionalNumber(trade.intraday_max_drawdown)! / entryNotional * 100
      : null,
    currentPrice,
    currentPnl,
    currentPnlPct: entryNotional && entryNotional > 0 && currentPnl != null ? currentPnl / entryNotional * 100 : null,
    currentPnlBasis: remainingQuantity > 0 ? "OPEN_ACTUAL_GROSS" : "CURRENT_PATH_HYPOTHETICAL",
    trade,
  };
}

export const PAPER_SIMPLE_EXPORT_COLUMNS = [
  "Stock Name",
  "Symbol",
  "Date bought at (IST)",
  "Time bought at (IST)",
  "Entry Strike Price",
  "O Factor",
  "X Factor",
  "Max Price (High) of Entry Day",
  "Low of Entry Day",
  "Max Drawdown That Day (INR)",
  "Max Drawdown That Day (%)",
  "Current Price",
  "Current P/L (INR)",
  "Current P/L (%)",
  "Current P/L Basis",
] as const;

function exportValues(row: PaperSimpleRow): Array<string | number | null> {
  const opened = paperSimpleIstDateTime(row.openedAt);
  const rounded = (value: number | null) => value == null ? null : Number(value.toFixed(2));
  return [
    row.stockName,
    row.symbol,
    opened.date,
    opened.time,
    rounded(row.entryPrice),
    rounded(row.oFactor),
    rounded(row.xFactor),
    rounded(row.dayHigh),
    rounded(row.dayLow),
    rounded(row.dayMaxDrawdown),
    rounded(row.dayMaxDrawdownPct),
    rounded(row.currentPrice),
    rounded(row.currentPnl),
    rounded(row.currentPnlPct),
    row.currentPnlBasis,
  ];
}

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildPaperSimpleCsv(rows: PaperSimpleRow[]): string {
  return [
    PAPER_SIMPLE_EXPORT_COLUMNS.map(csvCell).join(","),
    ...rows.map((row) => exportValues(row).map(csvCell).join(",")),
  ].join("\n");
}

function htmlCell(value: string | number | null, header = false): string {
  const tag = header ? "th" : "td";
  const escaped = String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return `<${tag}>${escaped}</${tag}>`;
}

export function buildPaperSimpleExcel(rows: PaperSimpleRow[]): string {
  const header = `<tr>${PAPER_SIMPLE_EXPORT_COLUMNS.map((value) => htmlCell(value, true)).join("")}</tr>`;
  const body = rows.map((row) => `<tr>${exportValues(row).map((value) => htmlCell(value)).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Paper Trading Simple View</title></head><body><table>${header}${body}</table></body></html>`;
}
