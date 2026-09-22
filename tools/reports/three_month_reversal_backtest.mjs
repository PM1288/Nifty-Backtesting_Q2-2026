#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "../playwright/node_modules/playwright/index.mjs";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const stamp = process.env.THREE_MONTH_REPORT_STAMP ?? new Date().toISOString().slice(0, 10).replaceAll("-", "");
const output = path.resolve(process.env.THREE_MONTH_REPORT_OUTPUT ?? path.join(root, "platform/nifty_stratlab/outputs", `three_month_reversal_${stamp}`));
const postgresContainer = process.env.THREE_MONTH_POSTGRES_CONTAINER ?? "trading-stack-novius2-postgres-1";

const sql = `COPY (
  SELECT yahoo_symbol,trade_date,open_price,high_price,low_price,close_price
  FROM strategy_eval.stock_daily_regime
  WHERE trade_date >= (SELECT max(trade_date) FROM strategy_eval.stock_daily_regime) - INTERVAL '14 months'
    AND open_price IS NOT NULL AND high_price IS NOT NULL AND low_price IS NOT NULL AND close_price IS NOT NULL
  ORDER BY yahoo_symbol,trade_date
) TO STDOUT WITH CSV HEADER`;
const csvText = execFileSync("docker", ["exec", "-i", postgresContainer, "sh", "-lc", 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input: `${sql};\n`, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });

function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) { const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true; else if (ch === ',') { row.push(cell); cell = ""; } else if (ch === '\n') { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.filter((values) => values.length === header.length).map((values) => Object.fromEntries(header.map((key, index) => [key, values[index]])));
}
const raw = parseCsv(csvText);
const bySymbol = new Map();
for (const item of raw) {
  const symbol = item.yahoo_symbol.replace(/\.NS$/, "");
  const row = { symbol, date: item.trade_date, open: Number(item.open_price), high: Number(item.high_price), low: Number(item.low_price), close: Number(item.close_price) };
  const rows = bySymbol.get(symbol) ?? []; rows.push(row); bySymbol.set(symbol, rows);
}
const allDates = raw.map((row) => row.trade_date).sort();
const dataEnd = allDates.at(-1);
const start = new Date(`${dataEnd}T00:00:00Z`); start.setUTCFullYear(start.getUTCFullYear() - 1);
const evaluationStart = start.toISOString().slice(0, 10);
const monthKey = (date) => date.slice(0, 7);
const weekKey = (date) => { const value = new Date(`${date}T00:00:00Z`); const day = (value.getUTCDay() + 6) % 7; value.setUTCDate(value.getUTCDate() - day); return value.toISOString().slice(0, 10); };
const pct = (value) => value == null || !Number.isFinite(value) ? null : value * 100;
const fmt = (value, digits = 2) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function ema(values, length = 9) { let last = null; const alpha = 2 / (length + 1); return values.map((value) => { last = last == null ? value : alpha * value + (1 - alpha) * last; return last; }); }
function aggregate(rows, keyFn) { const map = new Map(); for (const row of rows) { const key = keyFn(row.date), current = map.get(key); if (!current) map.set(key, { ...row, date: key }); else { current.high = Math.max(current.high, row.high); current.low = Math.min(current.low, row.low); current.close = row.close; } } return [...map.values()]; }
function outcome(rows, index, direction, entryPrice) {
  const slice = rows.slice(index, index + 15); if (!slice.length || !entryPrice) return null;
  const signedReturn = (price) => direction === "BULL" ? price / entryPrice - 1 : entryPrice / price - 1;
  const closes = [0, 4, 14].map((offset) => slice[offset] ? signedReturn(slice[offset].close) : null);
  const adverse = direction === "BULL" ? Math.min(...slice.map((row) => row.low)) : Math.max(...slice.map((row) => row.high));
  return { return1: pct(closes[0]), return5: pct(closes[1]), return15: pct(closes[2]), drawdown15: Math.min(0, pct(signedReturn(adverse))) };
}
function buildEvaluationContext(rows) {
  const months = new Map(), weeks = new Map();
  for (const row of rows) {
    for (const [key, map] of [[monthKey(row.date), months], [weekKey(row.date), weeks]]) {
      const value = map.get(key) ?? { open: row.open, close: row.close };
      value.close = row.close; map.set(key, value);
    }
  }
  const monthKeys = [...months.keys()].sort(), weekKeys = [...weeks.keys()].sort();
  return { months, weeks, monthIndex: new Map(monthKeys.map((key, index) => [key, index])), weekIndex: new Map(weekKeys.map((key, index) => [key, index])), monthKeys, weekKeys };
}
function evaluate(rows, index, direction, context) {
  const current = rows[index]; const op = direction === "BULL" ? (a, b) => a > b : (a, b) => a < b; const historyOp = direction === "BULL" ? (a, b) => a < b : (a, b) => a > b;
  const month = monthKey(current.date), week = weekKey(current.date);
  const monthIndex = context.monthIndex.get(month), weekIndex = context.weekIndex.get(week);
  const previousMonths = monthIndex == null ? [] : context.monthKeys.slice(Math.max(0, monthIndex - 3), monthIndex).reverse();
  const previousMonthRows = previousMonths.map((key) => context.months.get(key));
  const previousWeek = weekIndex == null || weekIndex < 1 ? null : context.weeks.get(context.weekKeys[weekIndex - 1]);
  const prevDay = rows[index - 1];
  if (previousMonthRows.length < 3 || previousMonthRows.some((value) => !value) || !previousWeek || !prevDay) return null;
  const references = { monthOpen: context.months.get(month).open, previousMonthOpen: previousMonthRows[0].open, weekOpen: context.weeks.get(week).open, previousWeekOpen: previousWeek.open, previousDayOpen: prevDay.open, dayOpen: current.open };
  const gates = [op(current.close, references.monthOpen), op(current.close, references.previousMonthOpen), op(current.close, references.weekOpen), op(current.close, references.previousWeekOpen), op(current.close, references.previousDayOpen), op(current.close, references.dayOpen)];
  const history = previousMonthRows.map((monthForPeriod) => historyOp(monthForPeriod.close, monthForPeriod.open));
  return { pass: gates.every(Boolean) && history.some(Boolean), gates, history, references };
}

const trades = [];
for (const [symbol, rows] of bySymbol) { const context = buildEvaluationContext(rows); for (const direction of ["BULL", "BEAR"]) {
  let priorQualified = false;
  for (let index = 0; index < rows.length; index += 1) {
    const result = evaluate(rows, index, direction, context); const qualified = result?.pass === true;
    if (rows[index].date < evaluationStart) { priorQualified = qualified; continue; }
    if (qualified && !priorQualified) {
      const requested = outcome(rows, index, direction, rows[index].open);
      const causalIndex = index + 1; const causal = rows[causalIndex] ? outcome(rows, causalIndex, direction, rows[causalIndex].open) : null;
      trades.push({
        symbol,
        direction,
        signalDate: rows[index].date,
        signalOpen: rows[index].open,
        signalClose: rows[index].close,
        requestedEntryDate: rows[index].date,
        requestedEntryOpen: rows[index].open,
        requested,
        causalEntryDate: rows[causalIndex]?.date ?? null,
        causalEntryOpen: rows[causalIndex]?.open ?? null,
        causal,
        mandatoryGates: result.gates.map((pass, offset) => `G${offset + 1}:${pass ? "PASS" : "FAIL"}`).join("|"),
        historyPass: result.history.map((pass, offset) => `M-${offset + 1}:${pass ? "PASS" : "FAIL"}`).join("|"),
        references: result.references,
      });
    }
    priorQualified = qualified;
  }
}}

const invalidSignals = trades.filter((trade) => !trade.mandatoryGates.split("|").every((value) => value.endsWith(":PASS")) || !trade.historyPass.includes(":PASS"));
if (invalidSignals.length) throw new Error(`Strategy validation failed for ${invalidSignals.length} signal(s).`);

const mean = (values) => { const valid = values.filter((value) => value != null && Number.isFinite(value)); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; };
const extrema = (values, mode) => { const valid = values.filter((value) => value != null && Number.isFinite(value)); return valid.length ? Math[mode](...valid) : null; };
function summary(rows, field) {
  const return15 = rows.map((row) => row[field]?.return15);
  const drawdowns = rows.map((row) => row[field]?.drawdown15);
  return {
    count: rows.length,
    average1: mean(rows.map((row) => row[field]?.return1)),
    average5: mean(rows.map((row) => row[field]?.return5)),
    average15: mean(return15),
    maximum15: extrema(return15, "max"),
    minimum15: extrema(return15, "min"),
    drawdown15: extrema(drawdowns, "min"),
  };
}
const summaryRows = ["BULL", "BEAR"].flatMap((direction) => ["requested", "causal"].map((basis) => ({ direction, basis, ...summary(trades.filter((row) => row.direction === direction), basis) })));

function chartSvg(rows, marks, title, width, height) {
  const pad = { left: 58, right: 12, top: 26, bottom: 30 };
  if (!rows.length) return `<svg viewBox="0 0 ${width} ${height}"><text x="20" y="40">No observations</text></svg>`;
  const rawMin = Math.min(...rows.map((row) => row.low));
  const rawMax = Math.max(...rows.map((row) => row.high));
  const rawSpan = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.01, 1);
  const min = rawMin - rawSpan * 0.04;
  const max = rawMax + rawSpan * 0.04;
  const span = max - min;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const step = plotWidth / Math.max(1, rows.length);
  const bodyWidth = Math.min(18, Math.max(2.2, step * 0.68));
  const x = (index) => pad.left + step * (index + 0.5);
  const y = (value) => pad.top + (max - value) / span * plotHeight;
  const ema9 = ema(rows.map((row) => row.close));
  const yTicks = Array.from({ length: 5 }, (_, index) => max - index * span / 4);
  const yGrid = yTicks.map((value) => `<line x1="${pad.left}" x2="${width-pad.right}" y1="${y(value)}" y2="${y(value)}" stroke="#e5e7eb" stroke-width="1"/><text x="${pad.left-7}" y="${y(value)+4}" text-anchor="end" font-size="10" fill="#475569">${fmt(value)}</text>`).join("");
  const tickCount = Math.min(7, rows.length);
  const tickIndexes = [...new Set(Array.from({ length: tickCount }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(1, tickCount - 1))))];
  const xTicks = tickIndexes.map((index) => `<line x1="${x(index)}" x2="${x(index)}" y1="${pad.top}" y2="${height-pad.bottom}" stroke="#f1f5f9"/><text x="${x(index)}" y="${height-9}" text-anchor="middle" font-size="10" fill="#475569">${esc(rows[index].date)}</text>`).join("");
  const candles = rows.map((row, index) => {
    const rising = row.close >= row.open;
    const colour = rising ? "#16a34a" : "#dc2626";
    const top = Math.min(y(row.open), y(row.close));
    const bodyHeight = Math.max(1.4, Math.abs(y(row.open) - y(row.close)));
    return `<line x1="${x(index)}" x2="${x(index)}" y1="${y(row.high)}" y2="${y(row.low)}" stroke="${colour}" stroke-width="1.15"/><rect x="${x(index)-bodyWidth/2}" y="${top}" width="${bodyWidth}" height="${bodyHeight}" fill="${rising ? "#22c55e" : "#ef4444"}" stroke="${colour}" stroke-width="0.7"/>`;
  }).join("");
  const emaLine = ema9.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const plotted = new Set();
  const markers = marks.map((mark) => {
    const markDate = mark.signalDate;
    const index = rows.findIndex((row) => row.date === markDate || (title === "Monthly" && monthKey(row.date) === monthKey(markDate)) || (title === "Weekly" && weekKey(row.date) === weekKey(markDate)));
    const key = `${index}:${mark.direction}`;
    if (index < 0 || plotted.has(key)) return "";
    plotted.add(key);
    const markerY = mark.direction === "BULL" ? y(rows[index].low) + 10 : y(rows[index].high) - 10;
    const colour = mark.direction === "BULL" ? "#2563eb" : "#facc15";
    const points = mark.direction === "BULL"
      ? `${x(index)},${markerY-7} ${x(index)-6},${markerY+4} ${x(index)+6},${markerY+4}`
      : `${x(index)},${markerY+7} ${x(index)-6},${markerY-4} ${x(index)+6},${markerY-4}`;
    return `<polygon points="${points}" fill="${colour}" stroke="#0f172a" stroke-width="1.1"><title>${esc(markDate)} ${mark.direction} qualification</title></polygon>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title} candlestick chart with EMA9 and Bull Bear qualification markers"><rect x="${pad.left}" y="${pad.top}" width="${plotWidth}" height="${plotHeight}" fill="#ffffff" stroke="#cbd5e1"/>${yGrid}${xTicks}${candles}<path d="${emaLine}" fill="none" stroke="#7c3aed" stroke-width="2"/>${markers}<text x="${pad.left}" y="17" font-size="13" font-weight="700" fill="#0f172a">${title} candles</text><text x="${width-pad.right}" y="17" text-anchor="end" font-size="10" fill="#64748b">EMA9</text></svg>`;
}

const columns = [
  "symbol", "direction", "signalDate", "signalOpen", "signalClose",
  "mandatoryGates", "historyPass",
  "references.monthOpen", "references.previousMonthOpen", "references.weekOpen",
  "references.previousWeekOpen", "references.previousDayOpen", "references.dayOpen",
  "requestedEntryDate", "requestedEntryOpen", "requested.return1",
  "requested.return5", "requested.return15", "requested.drawdown15",
  "causalEntryDate", "causalEntryOpen", "causal.return1", "causal.return5",
  "causal.return15", "causal.drawdown15",
];
const get = (row, key) => key.split(".").reduce((value, part) => value?.[part], row);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, "three_month_trades.csv"), [columns.map(csv).join(","), ...trades.map((row) => columns.map((key) => csv(get(row, key))).join(","))].join("\n"));

const summaryTable = summaryRows.map((row) => `<tr><td class="${row.direction.toLowerCase()}">${row.direction}</td><td>${row.basis === "requested" ? "Signal-day open · look-ahead" : "Next-day open · causal"}</td><td>${row.count}</td><td>${fmt(row.average1)}%</td><td>${fmt(row.average5)}%</td><td>${fmt(row.average15)}%</td><td>${fmt(row.maximum15)}%</td><td>${fmt(row.minimum15)}%</td><td>${fmt(row.drawdown15)}%</td></tr>`).join("");
const legend = `<div class="legend"><span><i class="bull-marker"></i><b>BLUE ▲ = BULL qualification</b></span><span><i class="bear-marker"></i><b>YELLOW ▼ = BEAR qualification</b></span><span><i class="ema-marker"></i>EMA9</span><span><i class="up-marker"></i>Rising candle</span><span><i class="down-marker"></i>Falling candle</span></div>`;
const chartStart = new Date(`${dataEnd}T00:00:00Z`); chartStart.setUTCFullYear(chartStart.getUTCFullYear() - 1);
const chartStartDate = chartStart.toISOString().slice(0, 10);
const stockPages = [...new Set(trades.map((row) => row.symbol))].sort().map((symbol) => {
  const rows = bySymbol.get(symbol);
  const stockTrades = trades.filter((row) => row.symbol === symbol);
  const recent = rows.filter((row) => row.date >= chartStartDate);
  const weekly = aggregate(recent, (date) => weekKey(date));
  const monthly = aggregate(rows, (date) => monthKey(date)).slice(-15);
  const mini = ["BULL", "BEAR"].map((direction) => {
    const result = summary(stockTrades.filter((row) => row.direction === direction), "causal");
    return `<tr><td class="${direction.toLowerCase()}">${direction}</td><td>${result.count}</td><td>${fmt(result.average1)}%</td><td>${fmt(result.average5)}%</td><td>${fmt(result.average15)}%</td><td>${fmt(result.maximum15)}%</td><td>${fmt(result.minimum15)}%</td><td>${fmt(result.drawdown15)}%</td></tr>`;
  }).join("");
  return `<section class="page stock"><header class="stock-head"><h2>${esc(symbol)}</h2><span>${stockTrades.length} fresh qualification${stockTrades.length===1?"":"s"}</span></header>${legend}<table class="stock-summary"><thead><tr><th>Direction</th><th>Signals</th><th>Avg 1D</th><th>Avg 5D</th><th>Avg 15D</th><th>Max 15D</th><th>Min 15D</th><th>Worst drawdown</th></tr></thead><tbody>${mini}</tbody></table><div class="chart-grid"><div class="daily-chart">${chartSvg(recent,stockTrades,"Daily",1200,360)}</div><div>${chartSvg(weekly,stockTrades,"Weekly",590,285)}</div><div>${chartSvg(monthly,stockTrades,"Monthly",590,285)}</div></div><p class="note">Percentages are direction-adjusted from the causal next-session open. Detailed signal arithmetic and every trade row are in the CSV, not duplicated in this PDF.</p></section>`;
}).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:5mm}*{box-sizing:border-box}body{margin:0;font:9px Arial;color:#172033;background:#fff}.page{break-after:page;height:198mm;overflow:hidden;padding:2mm}h1{font-size:24px;margin:0 0 5px}h2{font-size:15px;margin:1px 0 5px}.lead{font-size:12px}.warning{padding:7px;border-left:4px solid #d97706;background:#fffbeb}.logic{display:grid;grid-template-columns:1fr 1fr;gap:8px}.logic div{border:1px solid #cbd5e1;border-radius:5px;padding:6px}.logic ol{margin:3px 0;padding-left:17px}.or{background:#eef2ff;padding:4px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{border:1px solid #cbd5e1;padding:3px 4px;text-align:right}th{background:#e2e8f0}th:first-child,td:first-child{text-align:left}.bull{color:#1d4ed8;font-weight:800}.bear{color:#854d0e;font-weight:800}.summary td:nth-child(n+3){font-weight:700}.stock-head{height:8mm;display:flex;align-items:center;gap:12px}.stock-head h2{font-size:18px;margin:0}.stock-head span{color:#475569}.legend{height:8mm;display:flex;align-items:center;gap:18px;border:1px solid #cbd5e1;background:#f8fafc;padding:3px 8px}.legend span{display:flex;align-items:center;gap:5px}.legend i{display:inline-block}.bull-marker{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:11px solid #2563eb}.bear-marker{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:11px solid #facc15;filter:drop-shadow(0 0 .4px #0f172a)}.ema-marker{width:20px;border-top:3px solid #7c3aed}.up-marker,.down-marker{width:9px;height:9px}.up-marker{background:#22c55e}.down-marker{background:#ef4444}.stock-summary{height:12mm;margin-top:2px}.chart-grid{height:155mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:88mm 67mm;gap:2mm;margin-top:2mm}.chart-grid>div{min-width:0;min-height:0}.chart-grid .daily-chart{grid-column:1 / -1}.stock svg{display:block;width:100%;height:100%;border:0}.note{height:6mm;margin:1mm 0 0;color:#475569}.method-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.method-grid>div{border:1px solid #cbd5e1;padding:7px}.summary-wrap{margin-top:8px}</style></head><body>
<section class="page"><h1>3Month Bull/Bear Reversal Strategy · 12-Month Daily Backtest</h1><p class="lead">Evidence cutoff ${dataEnd} · evaluation window ${evaluationStart} to ${dataEnd} · ${bySymbol.size} retained symbols · ${trades.length} fresh qualification transitions.</p><p class="warning"><b>Execution-timing warning:</b> the daily close is required by the strategy, so entry at the same day open is not knowable at that open. The requested same-day-open scenario is retained and labelled look-ahead. The causal comparison enters at the next retained trading-day open.</p><div class="logic"><div><h2>BULL · all mandatory</h2><ol><li>Month close &gt; current month open</li><li>Month close &gt; M−1 open</li><li>Week close &gt; current week open</li><li>Week close &gt; W−1 open</li><li>Day close &gt; D−1 open</li><li>Day close &gt; day open</li></ol><p class="or"><b>ANY ONE:</b> M−1 OR M−2 OR M−3 close &lt; its open.</p><p><b>Live follow-on:</b> 1H close &gt; current and previous 1H open; 15m close &gt; current and previous 15m open.</p></div><div><h2>BEAR · exact inverse</h2><ol><li>Month close &lt; current month open</li><li>Month close &lt; M−1 open</li><li>Week close &lt; current week open</li><li>Week close &lt; W−1 open</li><li>Day close &lt; D−1 open</li><li>Day close &lt; day open</li></ol><p class="or"><b>ANY ONE:</b> M−1 OR M−2 OR M−3 close &gt; its open.</p><p><b>Live follow-on:</b> 1H close &lt; current and previous 1H open; 15m close &lt; current and previous 15m open.</p></div></div><h2>Scope and method</h2><p>Daily backtest evidence applies the six Monthly/Weekly/Daily gates plus the M−1/M−2/M−3 OR group exactly as shown. It does not claim historical 1H/15m confirmation because year-long intraday evidence is not retained. A signal is recorded only on a false-to-true qualification transition. The PDF reports average 1/5/15-session return, maximum and minimum 15-session close return, and worst 15-session drawdown. Complete signal rows and gate arithmetic are in the CSV.</p><p>Source: strategy_eval.stock_daily_regime. Current-membership research can contain survivorship bias. Corporate-action quality follows the retained source. Missing horizons remain blank, never zero.</p><h2>Results summary</h2>${legend}<div class="summary-wrap"><table class="summary"><thead><tr><th>Direction</th><th>Entry basis</th><th>Signals</th><th>Avg 1D</th><th>Avg 5D</th><th>Avg 15D</th><th>Max 15D</th><th>Min 15D</th><th>Worst drawdown</th></tr></thead><tbody>${summaryTable}</tbody></table></div><div class="method-grid"><div><h2>What the colours mean</h2><p><b style="color:#1d4ed8">BLUE upward marker</b> is a fresh Bull qualification. <b style="color:#854d0e">YELLOW downward marker</b> is a fresh Bear qualification. Purple is EMA9. Green/red are rising/falling candles only.</p></div><div><h2>How to read the percentages</h2><p>All returns are direction-adjusted: a falling price is favourable for Bear. Max/Min are the best/worst 15-session close returns across signals. Worst drawdown is the most adverse observed daily high/low path from entry.</p></div></div><p><b>No trades table in this PDF.</b> Complete trade rows, entries, gate results and reference prices are in <b>three_month_trades.csv</b>.</p></section>${stockPages}</body></html>`;
await fs.writeFile(path.join(output, "three_month_backtest_report.html"), html);
await fs.writeFile(path.join(output, "README.md"), `# 3Month Bull/Bear reversal backtest\n\nGenerated: ${new Date().toISOString()}\n\nData: strategy_eval.stock_daily_regime, ${evaluationStart} through ${dataEnd}, ${bySymbol.size} retained symbols.\n\n- three_month_backtest_report.pdf: summary plus one full-page visual review per stock; no duplicated trade ledger.\n- three_month_trades.csv: complete signal ledger, exact gate evidence, references, requested look-ahead outcome and causal next-day-open outcome.\n- three_month_backtest_report.html: exact printable source.\n\nChart legend: BLUE upward marker = Bull qualification; YELLOW downward marker = Bear qualification; PURPLE = EMA9; GREEN/RED = rising/falling candle.\n\nImportant: same-day-open entry uses a close-dependent condition and is look-ahead biased. Use causal next-day-open fields for an executable comparison. Daily-only evidence does not claim historical 1H/15m qualification.\n`);
const browser = await chromium.launch({ headless: true });
try { const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }); await page.setContent(html, { waitUntil: "load" }); await page.pdf({ path: path.join(output, "three_month_backtest_report.pdf"), format: "A4", landscape: true, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } }); } finally { await browser.close(); }
const reportSummary = { generatedAt: new Date().toISOString(), dataStart: raw[0]?.trade_date, evaluationStart, dataEnd, symbols: bySymbol.size, signals: trades.length, strategyValidation: { invalidSignals: invalidSignals.length, mandatoryGateCount: 6, historyRule: "ANY_ONE_OF_M1_M2_M3", historicalIntradayIncluded: false }, summary: summaryRows };
await fs.writeFile(path.join(output, "summary.json"), JSON.stringify(reportSummary, null, 2));
console.log(JSON.stringify({ output, dataEnd, symbols: bySymbol.size, signals: trades.length, strategyValidation: reportSummary.strategyValidation, summary: summaryRows }, null, 2));
