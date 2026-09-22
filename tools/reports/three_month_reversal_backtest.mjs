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
  const favourable = direction === "BULL" ? Math.max(...slice.map((row) => row.high)) : Math.min(...slice.map((row) => row.low));
  const adverse = direction === "BULL" ? Math.min(...slice.map((row) => row.low)) : Math.max(...slice.map((row) => row.high));
  const targetIndex = slice.findIndex((row) => direction === "BULL" ? row.high >= entryPrice * 1.03 : row.low <= entryPrice * 0.97);
  const exitRow = targetIndex >= 0 ? slice[targetIndex] : slice.at(-1);
  return { return1: pct(closes[0]), return5: pct(closes[1]), return15: pct(closes[2]), maxFavourable15: pct(signedReturn(favourable)), maxDrawdown15: pct(signedReturn(adverse)), target3Date: targetIndex >= 0 ? slice[targetIndex].date : null, target3Sessions: targetIndex >= 0 ? targetIndex + 1 : null, exitDate: exitRow?.date ?? null, exitReason: targetIndex >= 0 ? "+3% target touched" : "15-session close", exitReturn: exitRow ? pct(signedReturn(targetIndex >= 0 ? (direction === "BULL" ? entryPrice * 1.03 : entryPrice * 0.97) : exitRow.close)) : null };
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
      trades.push({ symbol, direction, signalDate: rows[index].date, signalClose: rows[index].close, requestedEntryDate: rows[index].date, requestedEntryOpen: rows[index].open, requested, causalEntryDate: rows[causalIndex]?.date ?? null, causalEntryOpen: rows[causalIndex]?.open ?? null, causal, historyPass: result.history.map((pass, offset) => `M-${offset + 1}:${pass ? "PASS" : "FAIL"}`).join("|") });
    }
    priorQualified = qualified;
  }
}}

const mean = (values) => { const valid = values.filter((value) => value != null && Number.isFinite(value)); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; };
function summary(rows, field) { return { count: rows.length, return1: mean(rows.map((row) => row[field]?.return1)), return5: mean(rows.map((row) => row[field]?.return5)), return15: mean(rows.map((row) => row[field]?.return15)), maxFavourable15: mean(rows.map((row) => row[field]?.maxFavourable15)), maxDrawdown15: mean(rows.map((row) => row[field]?.maxDrawdown15)), hit3: rows.length ? rows.filter((row) => row[field]?.target3Date).length / rows.length * 100 : null }; }
const summaryRows = ["BULL", "BEAR"].flatMap((direction) => ["requested", "causal"].map((basis) => ({ direction, basis, ...summary(trades.filter((row) => row.direction === direction), basis) })));

function chartSvg(rows, marks, title) {
  const width = 1020, height = 165, pad = { left: 40, right: 10, top: 22, bottom: 22 }; if (!rows.length) return `<svg viewBox="0 0 ${width} ${height}"><text x="20" y="40">No observations</text></svg>`;
  const lows = rows.map((row) => row.low), highs = rows.map((row) => row.high), min = Math.min(...lows), max = Math.max(...highs), span = max - min || 1; const x = (index) => pad.left + index * (width - pad.left - pad.right) / Math.max(1, rows.length - 1), y = (value) => pad.top + (max - value) / span * (height - pad.top - pad.bottom); const ema9 = ema(rows.map((row) => row.close));
  const candles = rows.map((row, index) => `<line x1="${x(index)}" x2="${x(index)}" y1="${y(row.high)}" y2="${y(row.low)}" stroke="${row.close >= row.open ? "#15803d" : "#b91c1c"}"/><rect x="${x(index)-1.6}" y="${Math.min(y(row.open),y(row.close))}" width="3.2" height="${Math.max(1,Math.abs(y(row.open)-y(row.close)))}" fill="${row.close >= row.open ? "#22c55e" : "#ef4444"}"/>`).join("");
  const emaLine = ema9.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const markers = marks.map((mark) => { const markDate = mark.signalDate; const index = rows.findIndex((row) => row.date === markDate || (title === "Monthly" && monthKey(row.date) === monthKey(markDate)) || (title === "Weekly" && weekKey(row.date) === weekKey(markDate))); if (index < 0) return ""; return `<circle cx="${x(index)}" cy="${y(rows[index].close)}" r="4" fill="${mark.direction === "BULL" ? "#2563eb" : "#f59e0b"}" stroke="#111827"><title>${esc(markDate)} ${mark.direction}</title></circle>`; }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title} OHLC with EMA9"><text x="6" y="14" font-size="11" font-weight="700">${title} · OHLC + EMA9</text><text x="4" y="${y(max)+3}" font-size="8">${fmt(max)}</text><text x="4" y="${y(min)+3}" font-size="8">${fmt(min)}</text>${candles}<path d="${emaLine}" fill="none" stroke="#7c3aed" stroke-width="1.6"/>${markers}<line x1="${pad.left}" x2="${width-pad.right}" y1="${height-pad.bottom}" y2="${height-pad.bottom}" stroke="#94a3b8"/></svg>`;
}

const columns = ["symbol","direction","signalDate","signalClose","requestedEntryDate","requestedEntryOpen","causalEntryDate","causalEntryOpen","historyPass","requested.return1","requested.return5","requested.return15","requested.maxFavourable15","requested.maxDrawdown15","requested.target3Date","requested.target3Sessions","requested.exitDate","requested.exitReason","requested.exitReturn","causal.return1","causal.return5","causal.return15","causal.maxFavourable15","causal.maxDrawdown15","causal.target3Date","causal.target3Sessions","causal.exitDate","causal.exitReason","causal.exitReturn"];
const get = (row, key) => key.split(".").reduce((value, part) => value?.[part], row);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, "three_month_trades.csv"), [columns.map(csv).join(","), ...trades.map((row) => columns.map((key) => csv(get(row, key))).join(","))].join("\n"));

const summaryTable = summaryRows.map((row) => `<tr><td>${row.direction}</td><td>${row.basis === "requested" ? "Same-day open (look-ahead)" : "Next-day open (causal)"}</td><td>${row.count}</td><td>${fmt(row.return1)}%</td><td>${fmt(row.return5)}%</td><td>${fmt(row.return15)}%</td><td>${fmt(row.maxFavourable15)}%</td><td>${fmt(row.maxDrawdown15)}%</td><td>${fmt(row.hit3)}%</td></tr>`).join("");
const tradeRows = trades.map((row) => `<tr><td>${esc(row.symbol)}</td><td class="${row.direction.toLowerCase()}">${row.direction}</td><td>${row.signalDate}</td><td>${row.causalEntryDate ?? "—"}</td><td>${fmt(row.causalEntryOpen)}</td><td class="${(row.causal?.return1 ?? 0) >= 0 ? "positive" : "negative"}">${fmt(row.causal?.return1)}%</td><td>${fmt(row.causal?.return5)}%</td><td>${fmt(row.causal?.return15)}%</td><td>${fmt(row.causal?.maxFavourable15)}%</td><td>${fmt(row.causal?.maxDrawdown15)}%</td><td>${row.causal?.target3Sessions ?? "—"}</td></tr>`);
const tradePages = []; for (let index = 0; index < tradeRows.length; index += 34) tradePages.push(`<section class="page"><h2>Trade ledger · causal next-day-open basis</h2><table><thead><tr><th>Symbol</th><th>Side</th><th>Signal</th><th>Entry</th><th>Entry ₹</th><th>1D</th><th>5D</th><th>15D</th><th>15D MFE</th><th>15D MDD</th><th>Sessions to +3%</th></tr></thead><tbody>${tradeRows.slice(index,index+34).join("")}</tbody></table></section>`);
const stockPages = [...new Set(trades.map((row) => row.symbol))].sort().map((symbol) => { const rows = bySymbol.get(symbol), stockTrades = trades.filter((row) => row.symbol === symbol), recent = rows.filter((row) => row.date >= new Date(new Date(`${dataEnd}T00:00:00Z`).setUTCMonth(new Date(`${dataEnd}T00:00:00Z`).getUTCMonth()-12)).toISOString().slice(0,10)), weekly = aggregate(recent, (date) => weekKey(date)), monthly = aggregate(rows.filter((row) => row.date >= raw[0]?.trade_date), (date) => monthKey(date)).slice(-15); const mini = ["BULL", "BEAR"].map((direction) => { const result = summary(stockTrades.filter((row) => row.direction === direction), "causal"); return `<tr><td>${direction}</td><td>${result.count}</td><td>${fmt(result.return1)}%</td><td>${fmt(result.return5)}%</td><td>${fmt(result.return15)}%</td><td>${fmt(result.maxFavourable15)}%</td><td>${fmt(result.maxDrawdown15)}%</td><td>${fmt(result.hit3)}%</td></tr>`; }).join(""); return `<section class="page stock"><h2>${esc(symbol)} · ${stockTrades.length} fresh entry signal${stockTrades.length===1?"":"s"}</h2><table><thead><tr><th>Side</th><th>Entries</th><th>Mean 1D</th><th>Mean 5D</th><th>Mean 15D</th><th>Mean MFE</th><th>Mean MDD</th><th>Reached +3%</th></tr></thead><tbody>${mini}</tbody></table>${chartSvg(recent,stockTrades,"Daily")}${chartSvg(weekly,stockTrades,"Weekly")}${chartSvg(monthly,stockTrades,"Monthly")}<p class="note">Blue marker = BULL signal; amber marker = BEAR signal. Purple line = EMA9. Potential exit is a reporting scenario: first +3% touch, otherwise the 15th-session close; it is not a strategy-authored exit. Exact entry rows are in the ledger and CSV.</p></section>`; }).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{margin:0;font:9px Arial;color:#172033;background:#fff}.page{break-after:page;min-height:190mm;padding:3mm}h1{font-size:24px;margin:0 0 5px}h2{font-size:15px;margin:2px 0 7px}.lead{font-size:12px}.warning{padding:8px;border-left:4px solid #d97706;background:#fffbeb}.logic{display:grid;grid-template-columns:1fr 1fr;gap:10px}.logic div{border:1px solid #cbd5e1;border-radius:6px;padding:7px}.logic ol{margin:4px 0;padding-left:17px}.or{background:#eef2ff;padding:4px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{border:1px solid #cbd5e1;padding:3px 4px;text-align:right}th{background:#e2e8f0}th:first-child,td:first-child{text-align:left}.bull,.positive{color:#166534}.bear,.negative{color:#b91c1c}.summary td:nth-child(n+3){font-weight:700}.stock svg{display:block;width:100%;height:43mm;border:1px solid #e2e8f0;margin-top:3px}.note{color:#475569}.meta{display:flex;gap:15px;margin:8px 0}.pill{background:#e0e7ff;padding:3px 6px;border-radius:10px}</style></head><body>
<section class="page"><h1>3Month Bull/Bear Reversal Strategy · 12-Month Daily Backtest</h1><p class="lead">Evidence cutoff ${dataEnd} · evaluation window ${evaluationStart} to ${dataEnd} · ${bySymbol.size} retained symbols · ${trades.length} fresh qualification transitions.</p><p class="warning"><b>Execution-timing warning:</b> the daily close is required by the strategy, so entry at the same day open is not knowable at that open. The requested same-day-open scenario is retained and labelled look-ahead. The causal comparison enters at the next retained trading-day open.</p><div class="logic"><div><h2>BULL · all mandatory</h2><ol><li>Month close &gt; current month open</li><li>Month close &gt; M−1 open</li><li>Week close &gt; current week open</li><li>Week close &gt; W−1 open</li><li>Day close &gt; D−1 open</li><li>Day close &gt; day open</li></ol><p class="or"><b>ANY ONE:</b> M−1 OR M−2 OR M−3 close &lt; its open.</p><p><b>Live follow-on:</b> 1H close &gt; current and previous 1H open; 15m close &gt; current and previous 15m open.</p></div><div><h2>BEAR · exact inverse</h2><ol><li>Month close &lt; current month open</li><li>Month close &lt; M−1 open</li><li>Week close &lt; current week open</li><li>Week close &lt; W−1 open</li><li>Day close &lt; D−1 open</li><li>Day close &lt; day open</li></ol><p class="or"><b>ANY ONE:</b> M−1 OR M−2 OR M−3 close &gt; its open.</p><p><b>Live follow-on:</b> 1H close &lt; current and previous 1H open; 15m close &lt; current and previous 15m open.</p></div></div><h2>Scope and method</h2><p>Daily-only research evaluates the six higher-timeframe gates. It does not claim historical 1H/15m confirmation because the retained 1-minute store is intentionally short-lived. A signal is recorded only when qualification changes from false to true. Returns are direction-adjusted. Maximum favourable excursion and maximum drawdown use daily high/low over 15 sessions. +3% time is the first session whose high/low touches the directional target.</p><p>Source: strategy_eval.stock_daily_regime. Current-membership research can contain survivorship bias. Corporate-action quality follows the retained source. Missing horizons remain blank, never zero.</p></section>
<section class="page"><h2>Summary table</h2><table class="summary"><thead><tr><th>Direction</th><th>Entry basis</th><th>Signals</th><th>Mean 1D</th><th>Mean 5D</th><th>Mean 15D</th><th>Mean 15D MFE</th><th>Mean 15D MDD</th><th>Reached +3%</th></tr></thead><tbody>${summaryTable}</tbody></table><h2>Interpretation</h2><p>Green/positive means the move was favourable for the stated direction; red/negative means adverse. Results are descriptive and exclude fees, slippage, liquidity, overlapping-capital constraints and intraday confirmation.</p></section>${tradePages.join("")}${stockPages}</body></html>`;
await fs.writeFile(path.join(output, "three_month_backtest_report.html"), html);
await fs.writeFile(path.join(output, "README.md"), `# 3Month Bull/Bear reversal backtest\n\nGenerated: ${new Date().toISOString()}\n\nData: strategy_eval.stock_daily_regime, ${evaluationStart} through ${dataEnd}, ${bySymbol.size} retained symbols.\n\n- three_month_backtest_report.pdf: requested report.\n- three_month_trades.csv: complete signal ledger with requested look-ahead and causal next-day-open outcomes.\n- three_month_backtest_report.html: exact printable source.\n\nImportant: same-day-open entry uses a close-dependent condition and is look-ahead biased. Use causal next-day-open fields for an executable comparison. Daily-only evidence does not claim historical 1H/15m qualification.\n`);
const browser = await chromium.launch({ headless: true });
try { const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }); await page.setContent(html, { waitUntil: "load" }); await page.pdf({ path: path.join(output, "three_month_backtest_report.pdf"), format: "A4", landscape: true, printBackground: true, margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" } }); } finally { await browser.close(); }
await fs.writeFile(path.join(output, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), dataStart: raw[0]?.trade_date, evaluationStart, dataEnd, symbols: bySymbol.size, signals: trades.length, summary: summaryRows }, null, 2));
console.log(JSON.stringify({ output, dataEnd, symbols: bySymbol.size, signals: trades.length, summary: summaryRows }, null, 2));
