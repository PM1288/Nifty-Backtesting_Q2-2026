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
  const references = {
    monthOpen: context.months.get(month).open,
    monthClose: current.close,
    previousMonthOpen: previousMonthRows[0].open,
    previousMonthClose: previousMonthRows[0].close,
    twoMonthsAgoOpen: previousMonthRows[1].open,
    twoMonthsAgoClose: previousMonthRows[1].close,
    threeMonthsAgoOpen: previousMonthRows[2].open,
    threeMonthsAgoClose: previousMonthRows[2].close,
    weekOpen: context.weeks.get(week).open,
    weekClose: current.close,
    previousWeekOpen: previousWeek.open,
    previousWeekClose: previousWeek.close,
    previousDayOpen: prevDay.open,
    previousDayClose: prevDay.close,
    dayOpen: current.open,
    dayHigh: current.high,
    dayLow: current.low,
    dayClose: current.close,
  };
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
const directionsBySymbolDate = new Map();
for (const trade of trades) {
  const key = `${trade.symbol}|${trade.signalDate}`;
  const directions = directionsBySymbolDate.get(key) ?? new Set();
  directions.add(trade.direction);
  directionsBySymbolDate.set(key, directions);
}
const oppositeSameDateSignals = [...directionsBySymbolDate.values()].filter((directions) => directions.size > 1).length;
if (oppositeSameDateSignals) throw new Error(`Strategy validation failed: ${oppositeSameDateSignals} stock/date pair(s) emitted both Bull and Bear.`);
const directionsBySymbolMonth = new Map();
for (const trade of trades) {
  const key = `${trade.symbol}|${monthKey(trade.signalDate)}`;
  const directions = directionsBySymbolMonth.get(key) ?? new Set();
  directions.add(trade.direction);
  directionsBySymbolMonth.set(key, directions);
}
const intramonthDirectionChanges = [...directionsBySymbolMonth.values()].filter((directions) => directions.size > 1).length;

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

function periodSegments(rows, keyFn) {
  const segments = [];
  for (let index = 0; index < rows.length; index += 1) {
    const key = keyFn(rows[index].date);
    const current = segments.at(-1);
    if (!current || current.key !== key) segments.push({ key, start: index, end: index, open: rows[index].open, close: rows[index].close });
    else { current.end = index; current.close = rows[index].close; }
  }
  return segments;
}

function markerEvidence(mark) {
  const r = mark.references;
  const op = mark.direction === "BULL" ? ">" : "<";
  const historyOp = mark.direction === "BULL" ? "<" : ">";
  return [
    `${mark.signalDate} ${mark.direction}`,
    `M C ${fmt(r.monthClose)} ${op} M O ${fmt(r.monthOpen)}`,
    `M C ${fmt(r.monthClose)} ${op} M-1 O ${fmt(r.previousMonthOpen)}`,
    `W C ${fmt(r.weekClose)} ${op} W O ${fmt(r.weekOpen)}`,
    `W C ${fmt(r.weekClose)} ${op} W-1 O ${fmt(r.previousWeekOpen)}`,
    `D C ${fmt(r.dayClose)} ${op} D-1 O ${fmt(r.previousDayOpen)}`,
    `D C ${fmt(r.dayClose)} ${op} D O ${fmt(r.dayOpen)}`,
    `OR: M-1 C ${fmt(r.previousMonthClose)} ${historyOp} O ${fmt(r.previousMonthOpen)}; M-2 C ${fmt(r.twoMonthsAgoClose)} ${historyOp} O ${fmt(r.twoMonthsAgoOpen)}; M-3 C ${fmt(r.threeMonthsAgoClose)} ${historyOp} O ${fmt(r.threeMonthsAgoOpen)}`,
  ].join(" | ");
}

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
  const boundaryX = (index) => pad.left + step * index;
  const y = (value) => pad.top + (max - value) / span * plotHeight;
  const ema9 = ema(rows.map((row) => row.close));
  const yTicks = Array.from({ length: 5 }, (_, index) => max - index * span / 4);
  const yGrid = yTicks.map((value) => `<line x1="${pad.left}" x2="${width-pad.right}" y1="${y(value)}" y2="${y(value)}" stroke="#e5e7eb" stroke-width="1"/><text x="${pad.left-7}" y="${y(value)+4}" text-anchor="end" font-size="10" fill="#475569">${fmt(value)}</text>`).join("");
  const tickCount = Math.min(7, rows.length);
  const tickIndexes = [...new Set(Array.from({ length: tickCount }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(1, tickCount - 1))))];
  const xTicks = tickIndexes.map((index) => `<line x1="${x(index)}" x2="${x(index)}" y1="${pad.top}" y2="${height-pad.bottom}" stroke="#f1f5f9"/><text x="${x(index)}" y="${height-9}" text-anchor="middle" font-size="10" fill="#475569">${esc(rows[index].date)}</text>`).join("");
  const dailyPeriods = title === "Daily" ? (() => {
    const months = periodSegments(rows, monthKey);
    const weeks = periodSegments(rows, weekKey);
    const monthBoundaries = [...months.map((segment) => segment.start), rows.length].map((index) => `<line x1="${boundaryX(index)}" x2="${boundaryX(index)}" y1="${pad.top}" y2="${height-pad.bottom}" stroke="#1d4ed8" stroke-width="1" stroke-dasharray="5 3" opacity=".65"/>`).join("");
    const weekBoundaries = weeks.map((segment) => `<line x1="${boundaryX(segment.start)}" x2="${boundaryX(segment.start)}" y1="${pad.top}" y2="${height-pad.bottom}" stroke="#0f766e" stroke-width=".7" stroke-dasharray="1.5 3" opacity=".45"/>`).join("");
    const monthLevels = months.map((segment) => `<g><line x1="${boundaryX(segment.start)}" x2="${boundaryX(segment.end + 1)}" y1="${y(segment.open)}" y2="${y(segment.open)}" stroke="#2563eb" stroke-width="1.35"/><line x1="${boundaryX(segment.start)}" x2="${boundaryX(segment.end + 1)}" y1="${y(segment.close)}" y2="${y(segment.close)}" stroke="#2563eb" stroke-width="1" stroke-dasharray="4 2" opacity=".75"/><title>${esc(segment.key)} month open ${fmt(segment.open)}; final close ${fmt(segment.close)} (retrospective)</title></g>`).join("");
    const weekLevels = weeks.map((segment) => `<g><line x1="${boundaryX(segment.start)}" x2="${boundaryX(segment.end + 1)}" y1="${y(segment.open)}" y2="${y(segment.open)}" stroke="#0f766e" stroke-width=".85"/><line x1="${boundaryX(segment.start)}" x2="${boundaryX(segment.end + 1)}" y1="${y(segment.close)}" y2="${y(segment.close)}" stroke="#0f766e" stroke-width=".75" stroke-dasharray="2 2" opacity=".65"/><title>Week ${esc(segment.key)} open ${fmt(segment.open)}; final close ${fmt(segment.close)} (retrospective)</title></g>`).join("");
    const monthLabels = months.map((segment) => `<text x="${boundaryX(segment.start)+2}" y="${pad.top+10}" font-size="7.5" fill="#1d4ed8">M ${esc(segment.key.slice(5))}</text>`).join("");
    return `${weekBoundaries}${monthBoundaries}${weekLevels}${monthLevels}${monthLabels}`;
  })() : "";
  const candles = rows.map((row, index) => {
    const rising = row.close >= row.open;
    const colour = rising ? "#16a34a" : "#dc2626";
    const top = Math.min(y(row.open), y(row.close));
    const bodyHeight = Math.max(1.4, Math.abs(y(row.open) - y(row.close)));
    return `<line x1="${x(index)}" x2="${x(index)}" y1="${y(row.high)}" y2="${y(row.low)}" stroke="${colour}" stroke-width="1.15"/><rect x="${x(index)-bodyWidth/2}" y="${top}" width="${bodyWidth}" height="${bodyHeight}" fill="${rising ? "#22c55e" : "#ef4444"}" stroke="${colour}" stroke-width="0.7"/>`;
  }).join("");
  const emaLine = ema9.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const groupedMarks = new Map();
  for (const mark of marks) {
    const markDate = mark.signalDate;
    const index = rows.findIndex((row) => row.date === markDate || (title === "Monthly" && monthKey(row.date) === monthKey(markDate)) || (title === "Weekly" && weekKey(row.date) === weekKey(markDate)));
    const key = `${index}:${mark.direction}`;
    if (index < 0) continue;
    const group = groupedMarks.get(key) ?? { index, direction: mark.direction, marks: [] };
    group.marks.push(mark); groupedMarks.set(key, group);
  }
  const markers = [...groupedMarks.values()].map((group) => {
    const { index, direction } = group;
    const markerY = direction === "BULL" ? y(rows[index].low) + 10 : y(rows[index].high) - 10;
    const colour = direction === "BULL" ? "#2563eb" : "#facc15";
    const points = direction === "BULL"
      ? `${x(index)},${markerY-7} ${x(index)-6},${markerY+4} ${x(index)+6},${markerY+4}`
      : `${x(index)},${markerY+7} ${x(index)-6},${markerY-4} ${x(index)+6},${markerY-4}`;
    const count = group.marks.length;
    const countLabel = count > 1 ? `<text x="${x(index)+8}" y="${markerY+3}" font-size="8" font-weight="700" fill="#0f172a">×${count}</text>` : "";
    const details = group.marks.map(markerEvidence).join(" || ");
    return `<g><polygon points="${points}" fill="${colour}" stroke="#0f172a" stroke-width="1.1"/><title>${esc(details)}</title>${countLabel}</g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title} candlestick chart with EMA9 and Bull Bear qualification markers"><rect x="${pad.left}" y="${pad.top}" width="${plotWidth}" height="${plotHeight}" fill="#ffffff" stroke="#cbd5e1"/>${yGrid}${xTicks}${dailyPeriods}${candles}<path d="${emaLine}" fill="none" stroke="#7c3aed" stroke-width="2"/>${markers}<text x="${pad.left}" y="17" font-size="13" font-weight="700" fill="#0f172a">${title} candles</text><text x="${width-pad.right}" y="17" text-anchor="end" font-size="10" fill="#64748b">EMA9${title === "Daily" ? " · M/W open + final-close overlays" : " · period-level qualification markers"}</text></svg>`;
}

const columns = [
  "symbol", "direction", "signalDate", "signalOpen", "signalClose",
  "mandatoryGates", "historyPass",
  "references.monthOpen", "references.monthClose", "references.previousMonthOpen", "references.previousMonthClose",
  "references.twoMonthsAgoOpen", "references.twoMonthsAgoClose", "references.threeMonthsAgoOpen", "references.threeMonthsAgoClose",
  "references.weekOpen", "references.weekClose", "references.previousWeekOpen", "references.previousWeekClose",
  "references.previousDayOpen", "references.previousDayClose", "references.dayOpen", "references.dayHigh", "references.dayLow", "references.dayClose",
  "requestedEntryDate", "requestedEntryOpen", "requested.return1",
  "requested.return5", "requested.return15", "requested.drawdown15",
  "causalEntryDate", "causalEntryOpen", "causal.return1", "causal.return5",
  "causal.return15", "causal.drawdown15",
];
const get = (row, key) => key.split(".").reduce((value, part) => value?.[part], row);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, "three_month_trades.csv"), [columns.map(csv).join(","), ...trades.map((row) => columns.map((key) => csv(get(row, key))).join(","))].join("\n"));

const summaryTable = summaryRows.map((row) => `<tr><td class="${row.direction.toLowerCase()}">${row.direction}</td><td>${row.basis === "requested" ? "Signal-day open · look-ahead" : "Next-day open · causal"}</td><td>${row.count}</td><td>${fmt(row.average1)}%</td><td>${fmt(row.average5)}%</td><td>${fmt(row.average15)}%</td><td>${fmt(row.maximum15)}%</td><td>${fmt(row.minimum15)}%</td><td>${fmt(row.drawdown15)}%</td></tr>`).join("");
const legend = `<div class="legend"><span><i class="bull-marker"></i><b>BLUE ▲ BULL</b></span><span><i class="bear-marker"></i><b>YELLOW ▼ BEAR</b></span><span><i class="ema-marker"></i>EMA9</span><span><i class="month-open-marker"></i>M open</span><span><i class="month-close-marker"></i>M final close</span><span><i class="week-open-marker"></i>W open</span><span><i class="week-close-marker"></i>W final close</span><span><i class="boundary-marker"></i>M/W boundary</span></div>`;
const chartStart = new Date(`${dataEnd}T00:00:00Z`); chartStart.setUTCFullYear(chartStart.getUTCFullYear() - 1);
const chartStartDate = chartStart.toISOString().slice(0, 10);
const tradeRowsPerPage = 14;
let stockTradePageCount = 0;

function passGlyph(value) { return value ? "✓" : "✕"; }
function gateCell(left, operator, right, passed) {
  return `<span class="gate-value">${fmt(left)} ${operator} ${fmt(right)}</span><b class="${passed ? "pass" : "fail"}">${passGlyph(passed)}</b>`;
}
function stockSummaryRows(stockTrades) {
  return ["BULL", "BEAR"].map((direction) => {
    const result = summary(stockTrades.filter((row) => row.direction === direction), "causal");
    return `<tr><td class="${direction.toLowerCase()}">${direction}</td><td>${result.count}</td><td>${fmt(result.average1)}%</td><td>${fmt(result.average5)}%</td><td>${fmt(result.average15)}%</td><td>${fmt(result.maximum15)}%</td><td>${fmt(result.minimum15)}%</td><td>${fmt(result.drawdown15)}%</td></tr>`;
  }).join("");
}
function stockTradeEvidencePages(symbol, stockTrades, mini) {
  const pages = [];
  for (let offset = 0; offset < stockTrades.length; offset += tradeRowsPerPage) {
    const pageRows = stockTrades.slice(offset, offset + tradeRowsPerPage);
    const pageNumber = pages.length + 1;
    const pageCount = Math.ceil(stockTrades.length / tradeRowsPerPage);
    const outcomes = pageRows.map((trade, index) => `<tr><td>${offset + index + 1}</td><td>${esc(trade.signalDate)}</td><td class="${trade.direction.toLowerCase()}">${trade.direction}</td><td>${fmt(trade.signalOpen)}</td><td>${esc(trade.causalEntryDate ?? "—")} · ${fmt(trade.causalEntryOpen)}</td><td>${fmt(trade.causal?.return1)}%</td><td>${fmt(trade.causal?.return5)}%</td><td>${fmt(trade.causal?.return15)}%</td><td>${fmt(trade.causal?.drawdown15)}%</td></tr>`).join("");
    const conditions = pageRows.map((trade) => {
      const gates = trade.mandatoryGates.split("|").map((value) => value.endsWith(":PASS"));
      const history = trade.historyPass.split("|").map((value) => value.endsWith(":PASS"));
      const op = trade.direction === "BULL" ? ">" : "<";
      const historyOp = trade.direction === "BULL" ? "<" : ">";
      const r = trade.references;
      return `<tr><td>${esc(trade.signalDate)}<br><b class="${trade.direction.toLowerCase()}">${trade.direction}</b></td><td>${gateCell(r.monthClose,op,r.monthOpen,gates[0])}</td><td>${gateCell(r.monthClose,op,r.previousMonthOpen,gates[1])}</td><td>${gateCell(r.weekClose,op,r.weekOpen,gates[2])}</td><td>${gateCell(r.weekClose,op,r.previousWeekOpen,gates[3])}</td><td>${gateCell(r.dayClose,op,r.dayOpen,gates[5])}</td><td>${gateCell(r.dayClose,op,r.previousDayOpen,gates[4])}</td><td>${gateCell(r.previousMonthClose,historyOp,r.previousMonthOpen,history[0])}</td><td>${gateCell(r.twoMonthsAgoClose,historyOp,r.twoMonthsAgoOpen,history[1])}</td><td>${gateCell(r.threeMonthsAgoClose,historyOp,r.threeMonthsAgoOpen,history[2])}</td><td class="${history.some(Boolean) ? "pass" : "fail"}">${passGlyph(history.some(Boolean))}<br>${history.map((passed,index) => `M-${index+1}${passed ? "✓" : "✕"}`).join(" ")}</td></tr>`;
    }).join("");
    pages.push(`<section class="page trade-page"><header class="trade-head"><div><h2>${esc(symbol)} · stock-wise trade evidence</h2><span>Rows ${offset + 1}–${offset + pageRows.length} of ${stockTrades.length}</span></div><b>Page ${pageNumber}/${pageCount}</b></header><table class="stock-summary compact-summary"><thead><tr><th>Direction</th><th>Signals</th><th>Avg 1D</th><th>Avg 5D</th><th>Avg 15D</th><th>Max 15D</th><th>Min 15D</th><th>Worst drawdown</th></tr></thead><tbody>${mini}</tbody></table><h3>Entry and causal outcome</h3><table class="trade-outcomes"><thead><tr><th>#</th><th>Signal date</th><th>Direction</th><th>Signal-day open<br><small>look-ahead</small></th><th>Next-day entry<br><small>causal</small></th><th>1D</th><th>5D</th><th>15D</th><th>15D drawdown</th></tr></thead><tbody>${outcomes}</tbody></table><h3>Exact qualification arithmetic</h3><table class="trade-conditions"><thead><tr><th>Signal</th><th>M C vs M O</th><th>M C vs M−1 O</th><th>W C vs W O</th><th>W C vs W−1 O</th><th>D C vs D O</th><th>D C vs D−1 O</th><th>M−1 C vs O</th><th>M−2 C vs O</th><th>M−3 C vs O</th><th>OR group</th></tr></thead><tbody>${conditions}</tbody></table><p class="trade-note">All six mandatory gates must pass. The historical gate passes when any one of M−1, M−2 or M−3 satisfies the direction-specific reversal condition. Values are exact retained daily evidence; missing outcomes remain unavailable.</p></section>`);
  }
  stockTradePageCount += pages.length;
  return pages.join("");
}
const stockSections = [...new Set(trades.map((row) => row.symbol))].sort().map((symbol) => {
  const rows = bySymbol.get(symbol);
  const stockTrades = trades.filter((row) => row.symbol === symbol);
  const recent = rows.filter((row) => row.date >= chartStartDate);
  const weekly = aggregate(recent, (date) => weekKey(date));
  const monthly = aggregate(rows, (date) => monthKey(date)).slice(-15);
  const mini = stockSummaryRows(stockTrades);
  const chartPage = `<section class="page stock"><header class="stock-head"><h2>${esc(symbol)}</h2><span>${stockTrades.length} fresh qualification${stockTrades.length===1?"":"s"}</span></header>${legend}<table class="stock-summary"><thead><tr><th>Direction</th><th>Signals</th><th>Avg 1D</th><th>Avg 5D</th><th>Avg 15D</th><th>Max 15D</th><th>Min 15D</th><th>Worst drawdown</th></tr></thead><tbody>${mini}</tbody></table><div class="chart-grid"><div class="daily-chart">${chartSvg(recent,stockTrades,"Daily",1200,360)}</div><div>${chartSvg(weekly,stockTrades,"Weekly",590,285)}</div><div>${chartSvg(monthly,stockTrades,"Monthly",590,285)}</div></div><p class="note">Daily triangles retain exact qualification dates. Weekly/Monthly triangles aggregate those dated events onto their containing period; ×N is the number of dated events and never labels the candle itself Bull/Bear. Daily blue/teal overlays show period open and retrospective final close, with dotted week and dashed month boundaries. The following page(s) contain every stock trade entry and exact condition arithmetic.</p></section>`;
  return `${chartPage}${stockTradeEvidencePages(symbol, stockTrades, mini)}`;
});
const stockPages = stockSections.join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:5mm}*{box-sizing:border-box}body{margin:0;font:9px Arial;color:#172033;background:#fff}.page{break-after:page;height:198mm;overflow:hidden;padding:2mm}h1{font-size:24px;margin:0 0 5px}h2{font-size:15px;margin:1px 0 5px}h3{font-size:11px;margin:5px 0 3px}.lead{font-size:12px}.warning{padding:7px;border-left:4px solid #d97706;background:#fffbeb}.logic{display:grid;grid-template-columns:1fr 1fr;gap:8px}.logic div{border:1px solid #cbd5e1;border-radius:5px;padding:6px}.logic ol{margin:3px 0;padding-left:17px}.or{background:#eef2ff;padding:4px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{border:1px solid #cbd5e1;padding:3px 4px;text-align:right}th{background:#e2e8f0}th:first-child,td:first-child{text-align:left}.bull{color:#1d4ed8;font-weight:800}.bear{color:#854d0e;font-weight:800}.pass{color:#15803d;font-weight:800}.fail{color:#b91c1c;font-weight:800}.summary td:nth-child(n+3){font-weight:700}.stock-head{height:8mm;display:flex;align-items:center;gap:12px}.stock-head h2{font-size:18px;margin:0}.stock-head span{color:#475569}.legend{height:8mm;display:flex;align-items:center;gap:10px;border:1px solid #cbd5e1;background:#f8fafc;padding:3px 7px;white-space:nowrap}.legend span{display:flex;align-items:center;gap:4px}.legend i{display:inline-block}.bull-marker{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:11px solid #2563eb}.bear-marker{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:11px solid #facc15;filter:drop-shadow(0 0 .4px #0f172a)}.ema-marker{width:18px;border-top:3px solid #7c3aed}.month-open-marker{width:18px;border-top:2px solid #2563eb}.month-close-marker{width:18px;border-top:2px dashed #2563eb}.week-open-marker{width:18px;border-top:2px solid #0f766e}.week-close-marker{width:18px;border-top:2px dotted #0f766e}.boundary-marker{height:11px;border-left:2px dashed #475569}.stock-summary{height:12mm;margin-top:2px}.chart-grid{height:155mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:88mm 67mm;gap:2mm;margin-top:2mm}.chart-grid>div{min-width:0;min-height:0}.chart-grid .daily-chart{grid-column:1 / -1}.stock svg{display:block;width:100%;height:100%;border:0}.note{height:6mm;margin:1mm 0 0;color:#475569}.method-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.method-grid>div{border:1px solid #cbd5e1;padding:7px}.summary-wrap{margin-top:8px}.trade-head{display:flex;justify-content:space-between;align-items:center;height:11mm;border-bottom:2px solid #334155}.trade-head h2{font-size:18px;margin:0}.trade-head span{color:#475569}.trade-head>b{font-size:12px}.compact-summary{height:11mm;margin:2mm 0}.trade-page table{table-layout:fixed}.trade-outcomes{font-size:7.2px}.trade-conditions{font-size:6.2px;line-height:1.12}.trade-conditions th,.trade-conditions td{padding:2px 2px;text-align:center;vertical-align:middle}.trade-conditions th:first-child,.trade-conditions td:first-child{width:12mm}.trade-conditions .gate-value{display:block;white-space:nowrap}.trade-conditions b{display:block;font-size:8px}.trade-note{margin:3px 0;color:#475569;font-size:7px}</style></head><body>
<section class="page"><h1>3Month Bull/Bear Reversal Strategy · 12-Month Daily Backtest</h1><p class="lead">Evidence cutoff ${dataEnd} · evaluation window ${evaluationStart} to ${dataEnd} · ${bySymbol.size} retained symbols · ${trades.length} fresh qualification transitions.</p><p class="warning"><b>Direction timing:</b> Bull and Bear are mutually exclusive for the same stock/date. Daily markers retain exact dates. Weekly and Monthly triangles aggregate those dated qualifications into their containing period; ×N is an event count and never classifies the whole candle Bull or Bear.</p><p class="warning"><b>Execution-timing warning:</b> the daily close is required by the strategy, so entry at the same day open is not knowable at that open. The requested same-day-open scenario is retained and labelled look-ahead. The causal comparison enters at the next retained trading-day open.</p><div class="logic"><div><h2>BULL · all mandatory</h2><ol><li>Month close &gt; current month open</li><li>Month close &gt; M−1 open</li><li>Week close &gt; current week open</li><li>Week close &gt; W−1 open</li><li>Day close &gt; D−1 open</li><li>Day close &gt; day open</li></ol><p class="or"><b>ANY ONE:</b> M−1 OR M−2 OR M−3 close &lt; its open.</p><p><b>Live follow-on:</b> 1H close &gt; current and previous 1H open; 15m close &gt; current and previous 15m open.</p></div><div><h2>BEAR · exact inverse</h2><ol><li>Month close &lt; current month open</li><li>Month close &lt; M−1 open</li><li>Week close &lt; current week open</li><li>Week close &lt; W−1 open</li><li>Day close &lt; D−1 open</li><li>Day close &lt; day open</li></ol><p class="or"><b>ANY ONE:</b> M−1 OR M−2 OR M−3 close &gt; its open.</p><p><b>Live follow-on:</b> 1H close &lt; current and previous 1H open; 15m close &lt; current and previous 15m open.</p></div></div><h2>Scope and method</h2><p>Daily backtest evidence applies the six Monthly/Weekly/Daily gates plus the M−1/M−2/M−3 OR group exactly as shown. It does not claim historical 1H/15m confirmation because year-long intraday evidence is not retained. A signal is recorded only on a false-to-true qualification transition. Daily charts show month/week start boundaries, open levels and retrospective period-final closes. The PDF reports overall and stock-wise summaries. Every stock chart is immediately followed by paginated entry and condition tables; the CSV retains the complete machine-readable ledger.</p><p>Source: strategy_eval.stock_daily_regime. Current-membership research can contain survivorship bias. Corporate-action quality follows the retained source. Missing horizons remain blank, never zero.</p><h2>Results summary</h2>${legend}<div class="summary-wrap"><table class="summary"><thead><tr><th>Direction</th><th>Entry basis</th><th>Signals</th><th>Avg 1D</th><th>Avg 5D</th><th>Avg 15D</th><th>Max 15D</th><th>Min 15D</th><th>Worst drawdown</th></tr></thead><tbody>${summaryTable}</tbody></table></div><div class="method-grid"><div><h2>What the colours mean</h2><p><b style="color:#1d4ed8">BLUE upward marker</b> is Bull qualification. <b style="color:#854d0e">YELLOW downward marker</b> is Bear qualification. Daily markers are exact-date; Weekly/Monthly markers are period aggregates. Purple is EMA9. Green/red are rising/falling candles only.</p></div><div><h2>How to read the percentages</h2><p>All returns are direction-adjusted: a falling price is favourable for Bear. Max/Min are the best/worst 15-session close returns across signals. Worst drawdown is the most adverse observed daily high/low path from entry.</p></div></div><p><b>Stock tables:</b> after every chart page, the report lists each signal, both entry bases, causal outcomes, all six mandatory equations and M−1/M−2/M−3 open-close OR evidence.</p></section>${stockPages}</body></html>`;
await fs.writeFile(path.join(output, "three_month_backtest_report.html"), html);
await fs.writeFile(path.join(output, "README.md"), `# 3Month Bull/Bear reversal backtest\n\nGenerated: ${new Date().toISOString()}\n\nData: strategy_eval.stock_daily_regime, ${evaluationStart} through ${dataEnd}, ${bySymbol.size} retained symbols.\n\n- three_month_backtest_report.pdf: overall summary plus one chart page and one or more stock-wise trade-evidence pages per stock.\n- three_month_trades.csv: complete signal ledger, exact gate evidence, all Monthly/Weekly/Daily OHLC references, requested look-ahead outcome and causal next-day-open outcome.\n- three_month_backtest_report.html: exact printable source.\n\nEvery stock trade table includes both entry bases, causal 1D/5D/15D and drawdown outcomes, all six mandatory equations, M−1/M−2/M−3 open-close values and individual/group pass states. Chart legend: BLUE upward marker = Bull qualification; YELLOW downward marker = Bear qualification; PURPLE = EMA9; GREEN/RED = rising/falling candle. Daily markers retain exact dates. Weekly/Monthly markers aggregate dated events into the containing candle and ×N is the event count, not a candle-direction classification. Daily blue/teal overlays are Monthly/Weekly open and retrospective final close; dashed/dotted vertical lines are period boundaries.\n\nImportant: same-day-open entry uses a close-dependent condition and is look-ahead biased. Use causal next-day-open fields for an executable comparison. Daily-only evidence does not claim historical 1H/15m qualification.\n`);
const browser = await chromium.launch({ headless: true });
const pdfChunkRoot = await fs.mkdtemp(path.join("/tmp", "three-month-pdf-chunks-"));
const pdfParts = [];
const bodyStart = html.indexOf("<body>") + "<body>".length;
const stockStart = html.indexOf('<section class="page stock">');
const documentHead = html.slice(0, bodyStart);
const summaryPage = html.slice(bodyStart, stockStart);
const documentFor = (body) => `${documentHead}${body}</body></html>`;
async function renderPdfPart(body, name) {
  const target = path.join(pdfChunkRoot, name);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    page.setDefaultTimeout(300_000);
    await page.setContent(documentFor(body), { waitUntil: "domcontentloaded", timeout: 300_000 });
    await page.pdf({ path: target, format: "A4", landscape: true, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" }, timeout: 300_000 });
  } finally { await page.close(); }
  pdfParts.push(target);
}
try {
  await renderPdfPart(summaryPage, "0000-summary.pdf");
  const stocksPerPdfPart = 8;
  for (let index = 0; index < stockSections.length; index += stocksPerPdfPart) {
    await renderPdfPart(stockSections.slice(index, index + stocksPerPdfPart).join(""), `${String(index / stocksPerPdfPart + 1).padStart(4, "0")}-stocks.pdf`);
  }
} finally { await browser.close(); }
execFileSync("pdfunite", [...pdfParts, path.join(output, "three_month_backtest_report.pdf")], { stdio: "inherit" });
await fs.rm(pdfChunkRoot, { recursive: true, force: true });
const reportSummary = { generatedAt: new Date().toISOString(), dataStart: raw[0]?.trade_date, evaluationStart, dataEnd, symbols: bySymbol.size, signals: trades.length, strategyValidation: { invalidSignals: invalidSignals.length, oppositeSameDateSignals, intramonthDirectionChanges, mandatoryGateCount: 6, historyRule: "ANY_ONE_OF_M1_M2_M3", historicalIntradayIncluded: false }, reportPages: { overall: 1, stockCharts: bySymbol.size, stockTradeEvidence: stockTradePageCount, expectedTotal: 1 + bySymbol.size + stockTradePageCount, tradeRowsPerPage }, summary: summaryRows };
await fs.writeFile(path.join(output, "summary.json"), JSON.stringify(reportSummary, null, 2));
console.log(JSON.stringify({ output, dataEnd, symbols: bySymbol.size, signals: trades.length, strategyValidation: reportSummary.strategyValidation, summary: summaryRows }, null, 2));
