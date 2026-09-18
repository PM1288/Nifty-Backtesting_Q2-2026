type Row = Record<string, any>;
const xml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]!));
const scalar = (value: unknown) => typeof value === "object" && value != null ? JSON.stringify(value) : value;
const safeText = (value: unknown) => /^[=+\-@\t\r]/.test(String(value ?? "")) ? `'${value}` : String(value ?? "");
export function researchTables(report: Row) {
  return [
    { name: "Verified horizons", rows: report.source.flatMap((trade: Row) => trade.verified.horizons.map((horizon: Row) => ({ trade_leg_id: trade.trade_leg_id, symbol: trade.symbol, side: trade.side, opened_at: trade.opened_at, ...horizon }))) },
    { name: "Target evidence", rows: report.source.flatMap((trade: Row) => trade.verified.opportunities.map((item: Row) => ({ trade_leg_id: trade.trade_leg_id, symbol: trade.symbol, ...item }))) },
    { name: "Capital summaries", rows: report.cohorts.flatMap((cohort: Row) => cohort.scenarios.map(({ positions, equity_events, decisions, ...scenario }: Row) => ({ cohort: cohort.id, ...scenario }))) },
    { name: "Replay positions", rows: report.cohorts.flatMap((cohort: Row) => cohort.scenarios.flatMap((scenario: Row) => scenario.positions.map((item: Row) => ({ cohort: cohort.id, allocation: scenario.allocation, ...item })))) },
    { name: "Equity events", rows: report.cohorts.flatMap((cohort: Row) => cohort.scenarios.flatMap((scenario: Row) => scenario.equity_events.map((item: Row) => ({ cohort: cohort.id, allocation: scenario.allocation, ...item })))) },
    { name: "Admission decisions", rows: report.cohorts.flatMap((cohort: Row) => cohort.scenarios.flatMap((scenario: Row) => scenario.decisions.map((item: Row) => ({ cohort: cohort.id, allocation: scenario.allocation, ...item })))) },
    { name: "Monthly evidence", rows: report.source.map((trade: Row) => ({ trade_leg_id: trade.trade_leg_id, symbol: trade.symbol, opened_at: trade.opened_at, retrospective: trade.monthly, recorded_before_entry: trade.monthly_known })) },
    { name: "Execution journey", rows: report.journeys },
    { name: "Source records", rows: report.source },
    { name: "Monthly source", rows: report.monthly_candidates },
    { name: "Shadow target summaries", rows: report.cohorts.flatMap((cohort: Row) => (cohort.shadow_targets ?? []).flatMap((target: Row) => target.scenarios.map(({ positions, equity_events, decisions, ...scenario }: Row) => ({ cohort: cohort.id, lifecycle: target.lifecycle, target_pct: target.target_pct, basis: target.basis, ...scenario })))) },
    { name: "Methodology", rows: report.limitations.map((detail: string) => ({ detail, as_of: report.as_of, parameters: report.parameters })) },
  ] as Array<{ name: string; rows: Row[] }>;
}
export function researchCsv(report: Row, tableName = "Verified horizons") {
  const rows = researchTables(report).find((table) => table.name === tableName)?.rows ?? [];
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const field = (value: unknown) => `"${(typeof value === "number" ? String(value) : safeText(scalar(value))).replace(/"/g, '""')}"`;
  return "\uFEFF" + [columns.map(field).join(","), ...rows.map((row) => columns.map((key) => field(row[key])).join(","))].join("\r\n");
}
/** Genuine SpreadsheetML workbook, clearly exported as .xml, not a fake .xlsx. */
export function researchExcel(report: Row) {
  const sheets = researchTables(report).map((sheet) => {
    const columns = [...new Set(sheet.rows.flatMap((row) => Object.keys(row)))];
    const header = `<Row>${columns.map((key) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(key)}</Data></Cell>`).join("")}</Row>`;
    const rows = sheet.rows.map((row) => `<Row>${columns.map((key) => { const value = row[key]; const number = typeof value === "number" && Number.isFinite(value); return `<Cell ss:StyleID="${number ? value < 0 ? "Negative" : "Number" : "Text"}"><Data ss:Type="${number ? "Number" : "String"}">${xml(scalar(value))}</Data></Cell>`; }).join("")}</Row>`).join("");
    return `<Worksheet ss:Name="${xml(sheet.name)}"><Table>${columns.map(() => '<Column ss:Width="135"/>').join("")}${header}${rows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions>${columns.length ? `<AutoFilter xmlns="urn:schemas-microsoft-com:office:excel" x:Range="R1C1:R${sheet.rows.length + 1}C${columns.length}"/>` : ""}</Worksheet>`;
  }).join("");
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles><Style ss:ID="Default"><Font ss:FontName="Calibri" ss:Size="11"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#244062" ss:Pattern="Solid"/><Alignment ss:WrapText="1"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="#,##0.00"/></Style><Style ss:ID="Negative"><Font ss:Color="#B91C1C"/><NumberFormat ss:Format="#,##0.00"/></Style><Style ss:ID="Text"><Alignment ss:WrapText="1"/></Style></Styles>${sheets}</Workbook>`;
}
export function researchMarkdown(report: Row) {
  const summaries = report.cohorts.flatMap((cohort: Row) => cohort.scenarios.map((item: Row) => `| ${cohort.label} | ${item.allocation} | ${item.taken} | ${item.skipped} | ${item.ending_equity.toFixed(2)} | ${item.return_pct.toFixed(2)}% | ${item.max_sampled_drawdown.toFixed(2)} |`));
  return `# OIIS verified evidence and ₹4 lakh replay\n\nAs of: ${report.as_of}\nGenerated: ${report.generated_at}\n\n## Capital replay\n\n| Cohort | Allocation INR | Taken | Skipped | Equity INR | Return | Sampled drawdown INR |\n|---|---:|---:|---:|---:|---:|---:|\n${summaries.join("\n")}\n\n## Parameters\n\n${JSON.stringify(report.parameters)}\n\n## Methodology and limitations\n\n${report.limitations.map((item: string) => `- ${item}`).join("\n")}\n\n## Monthly exclusions\n\n${report.source.filter((trade: Row) => !trade.monthly_known.included).map((trade: Row) => `- ${trade.symbol} / ${trade.trade_leg_id}: ${trade.monthly_known.reason}; retrospective: ${trade.monthly.reason}`).join("\n")}\n\nRecorded orders, source observations and booked P&L are unchanged. Alternative targets are independent opportunity evidence, not additive profits. Full records are in the JSON and workbook exports.\n`;
}
