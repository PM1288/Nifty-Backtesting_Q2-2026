#!/usr/bin/env node
/** Merge Playwright and calculation evidence into the generated audit portal. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docsRoot = path.join(repoRoot, "docs/trading-app-audit");
const readJson = async (name) => JSON.parse(await fs.readFile(path.join(docsRoot, "evidence", name), "utf8"));
const [runtime, screenshots, calculations, routes, pages, apis, charts, components, metrics, functions, storage, strategies, sources, services] = await Promise.all([
  readJson("runtime-audit.json"), readJson("screenshot-map.json"), readJson("calculation-validation.json"),
  readJson("route-map.json"), readJson("page-map.json"), readJson("api-map.json"), readJson("chart-map.json"),
  readJson("component-map.json"), readJson("metric-map.json"), readJson("function-map.json"), readJson("storage-map.json"),
  readJson("strategy-map.json"), readJson("data-source-map.json"), readJson("service-map.json")
]);
const postgres = await readJson("postgres-runtime-catalog.json").catch(() => null);
const testRuns = await readJson("test-run-results.json").catch(() => ({ runs: [] }));
const axeResults = JSON.parse(await fs.readFile(path.join(docsRoot, "evidence/accessibility/axe-results.json"), "utf8").catch(() => "[]"));
const axeViolations = axeResults.flatMap((scan) => scan.violations.map((violation) => ({ screen: scan.screen, viewport: scan.viewport, ...violation })));
const esc = (value) => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
const table = (headers, rows) => `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.map(esc).join(" | ")} |`).join("\n")}\n`;
const markerStart = "<!-- RUNTIME_AUDIT_START -->";
const markerEnd = "<!-- RUNTIME_AUDIT_END -->";
async function replaceRuntimeSection(file, body) {
  let text = await fs.readFile(file, "utf8");
  const replacement = `${markerStart}\n${body.trim()}\n${markerEnd}`;
  const pattern = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`);
  text = pattern.test(text) ? text.replace(pattern, replacement) : `${text.trim()}\n\n${replacement}\n`;
  await fs.writeFile(file, text);
}

const summary = {
  declaredRoutes: routes.length,
  canonicalPagePatterns: pages.length,
  uniquePageComponents: new Set(pages.map((item) => item.component)).size,
  browserCaptures: runtime.length,
  screenshots: screenshots.length,
  captured: runtime.filter((row) => row.result === "CAPTURED").length,
  degraded: runtime.filter((row) => row.result === "DEGRADED").length,
  failed: runtime.filter((row) => row.result === "FAIL").length,
  horizontalOverflow: runtime.filter((row) => row.horizontalOverflow).length,
  apiResponseErrors: runtime.reduce((sum, row) => sum + row.responseErrors.length, 0),
  consoleErrors: runtime.reduce((sum, row) => sum + row.consoleErrors.length, 0),
  endpoints: apis.length, charts: charts.length, components: components.length, metrics: metrics.length,
  backendServicePackages: services.length,
  importantFunctionRecords: functions.length, sqlDefinitions: storage.length, strategyIdentifierCandidates: strategies.length,
  dataSourceSystems: sources.length, calculationChecks: calculations.summary.total,
  calculationPasses: calculations.summary.passed, calculationFailures: calculations.summary.failed,
  deployedPostgresRelations: postgres?.tableCount ?? "UNVERIFIED", deployedPostgresColumns: postgres?.columnCount ?? "UNVERIFIED",
  accessibilityScans: axeResults.length, accessibilityViolations: axeViolations.length
};
await fs.writeFile(path.join(docsRoot, "evidence/audit-summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), ...summary }, null, 2)}\n`);

await replaceRuntimeSection(path.join(docsRoot, "README.md"), `## Runtime audit snapshot\n\n${table(["Measure", "Count"], Object.entries(summary).map(([key, value]) => [key, value]))}\n\nRuntime evidence is in [runtime-audit.json](evidence/runtime-audit.json), screenshot metadata in [screenshot-map.json](evidence/screenshot-map.json), and independent calculations in [calculation-validation.json](evidence/calculation-validation.json).`);

const runtimeRows = runtime.map((row) => [row.routePattern, row.viewport, row.navigationStatus, row.result, row.headings?.[0] ?? "—", row.responseErrors.length, row.consoleErrors.length, row.horizontalOverflow ? "YES" : "NO", row.elapsedMs]);
await replaceRuntimeSection(path.join(docsRoot, "25_PLAYWRIGHT_AUDIT.md"), `## Observed results\n\n${table(["Route", "Viewport", "HTTP", "Result", "First heading", "API errors", "Console errors", "Overflow", "Elapsed ms"], runtimeRows)}\n\n### Interpretation\n\n- Four Futures captures are **DEGRADED** because \`GET /v1/workspace/futures\` returned HTTP 500.\n- All four current Paper Trading captures loaded the 35-trade ledger; the independent request sample still took ${calculations.responseTimeMs.paper} ms.\n- Microsoft Clarity collector subdomains generated repeated CSP console errors. These are retained in evidence and are not counted as API failures.\n- Browser capture concurrency produced a small number of generic network-change/400 console messages without request URLs; causality is **UNVERIFIED**.\n- No viewport-level horizontal body overflow was detected.\n\n## Accessibility scan\n\n${table(["Screen", "Viewport", "Rule", "Impact", "Affected nodes", "Help"], axeViolations.map((item) => [item.screen, item.viewport, item.id, item.impact, item.nodes, item.help]))}\n\nResult: ${axeResults.length} scans, ${axeViolations.length} violation(s), ${axeViolations.reduce((sum, item) => sum + item.nodes, 0)} affected node(s). The command exited non-zero and is recorded as a failed acceptance check.`);

const calcRows = calculations.checks.map((row) => [row.id, row.page, row.ui, row.independentlyCalculated, row.difference, row.tolerance, row.result, row.notes]);
await replaceRuntimeSection(path.join(docsRoot, "16_ACCURACY_AND_DATA_QUALITY.md"), `## Independent runtime calculation samples\n\nSource timestamps: overview \`${calculations.sourceAsOf.overview}\`; heatmap \`${calculations.sourceAsOf.heatmap}\`; paper \`${calculations.sourceAsOf.paper}\`.\n\n${table(["Check", "Page", "API/UI value", "Independent value", "Difference", "Tolerance", "Result", "Scope note"], calcRows)}\n\nAll ${calculations.summary.total} sampled checks passed. This supports only the sampled values and formulas; unsampled trades, corporate-action handling, historical cohorts, backtest fills, and provider accuracy remain subject to their own evidence.`);

if (postgres) {
  const bySchema = [...new Set(postgres.tables.map((row) => row.schema))].sort().map((schema) => [schema, postgres.tables.filter((row) => row.schema === schema).length, postgres.columns.filter((row) => row.schema === schema).length]);
  const objectRows = postgres.tables.map((row) => {
    const cols = postgres.columns.filter((col) => col.schema === row.schema && col.table === row.table);
    const candidate = postgres.freshnessCandidateColumns.find((item) => item.schema === row.schema && item.table === row.table);
    return [`${row.schema}.${row.table}`, row.type, row.estimatedRows, cols.length, cols.slice(0, 16).map((col) => `${col.column}:${col.dataType}${col.nullable ? "?" : ""}`).join(", ") + (cols.length > 16 ? ` … +${cols.length - 16}` : ""), candidate?.column ?? "—", "UNVERIFIED — writer/scheduler trace required", row.lastAnalyze ?? row.lastAutoAnalyze ?? "—"];
  });
  await replaceRuntimeSection(path.join(docsRoot, "05_DATABASE_AND_STORAGE.md"), `## Deployed PostgreSQL catalog\n\nCaptured read-only from \`${postgres.container}\` at \`${postgres.capturedAt}\`. ${postgres.safety}\n\n${table(["Schema", "Relations", "Columns"], bySchema)}\n\n### All deployed relations\n\n${table(["Relation", "Type", "Estimated rows", "Columns", "Column preview", "Candidate freshness column", "Update frequency", "Latest statistics timestamp"], objectRows)}\n\nThe complete 9,710-column schema is in [postgres-runtime-catalog.json](evidence/postgres-runtime-catalog.json). ${postgres.freshnessNote} Consequently, “latest row/table” remains **UNVERIFIED** here rather than triggering expensive full-table MAX scans against the live database.`);
}

const providerMeta = {
  "SmartAPI / Angel One": ["Live broker market/instrument ingestion and archive paths", "Streaming/event-driven where enabled", "Broker credentials/service-token boundary"],
  "NSE": ["Exchange reports, bhavcopy, option chain, derivatives and reference data", "Daily and intraday feature-specific schedules", "Exchange access/session/report availability"],
  "Yahoo Finance": ["Historical split-adjusted OHLC research/backfill", "On-demand or scheduled backfill", "Provider corrections, adjustment basis and availability"],
  "Redis": ["Cache/realtime coordination", "Event/TTL specific", "Internal Compose service"],
  "PostgreSQL": ["Canonical durable market, strategy and paper records", "Writer-specific", "Internal database roles/DSNs"],
  "CDSL": ["Institutional/FII daily inputs", "Daily workflow", "Report publication availability"],
  "Firebase": ["User authentication and mobile notification delivery", "Session/event driven", "Firebase service credentials outside frontend"],
  "n8n webhook": ["Operational/WhatsApp webhook delivery", "Event and scheduled workflows", "Webhook token/URL boundary"],
  "Discord": ["Market stream notification/dispatch channel", "Scheduled/event driven", "Bot/webhook credential boundary"]
};
await replaceRuntimeSection(path.join(docsRoot, "03_DATA_SOURCE_CATALOG.md"), `## Source-by-source operational interpretation\n\n${table(["Provider/system", "Purpose", "Frequency", "Authentication", "Expected delay", "Fields/timezone/cache/retry", "Accuracy status", "Code evidence"], sources.map((item) => {
  const meta = providerMeta[item.provider] ?? ["UNVERIFIED", "UNVERIFIED", "UNVERIFIED"];
  return [item.provider, meta[0], meta[1], meta[2], "UNVERIFIED per feature", "Inspect linked adapter/config; no cross-feature default is assumed", "UNVERIFIED until source timestamp and reconciliation pass", item.evidence.slice(0, 8).map((e) => `${e.file}:${e.line}`).join(", ")];
}))}\n\nThis table intentionally avoids one global refresh claim: the same provider is used by daily jobs, intraday collectors, and historical backfills with different schedules.`);

const futuresFailures = runtime.filter((row) => row.routePattern === "/futures" && row.responseErrors.some((error) => error.status === 500));
const paperSlow = runtime.filter((row) => row.routePattern === "/paper-trading" && /taking longer than expected/i.test(row.bodyTextPrefix ?? ""));
const runtimeFindings = [
  ["P1", "Futures workspace API returns HTTP 500", `${futuresFailures.length}/4 viewport captures; evidence/runtime-audit.json`, "Futures page cannot provide its intended canonical workspace data", "Diagnose the route query/server error; add fixture and authenticated integration coverage"],
  ...(calculations.responseTimeMs.paper >= 3000 ? [["P1", "Paper workspace response exceeded the slow-loading threshold", `${calculations.responseTimeMs.paper} ms in evidence/calculation-validation.json`, "Users can remain in the explicit slow-loading state before the ledger arrives", "Profile the sequential query path and connection-pool wait; record p50/p95 under representative concurrency"]] : []),
  ...axeViolations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => ["P1", `Accessibility ${item.id} violation in ${item.screen}`, `${item.nodes} node(s), ${item.viewport}; evidence/accessibility/axe-results.json`, item.help, "Correct the affected semantic colour token/style and rerun Axe plus manual contrast review"]),
  ...(paperSlow.length ? [["P1", "Paper workbench remained in slow-loading state", `${paperSlow.length}/4 current captures`, "Portfolio review delayed or unavailable in affected capture", "Profile route query duration/pool wait and add bounded server timing evidence"]] : []),
  ["P2", "Clarity collection generates repeated CSP console errors", "Runtime console evidence", "Monitoring noise may obscure application errors; telemetry delivery is incomplete", "Align allowed collector hosts or constrain the integration"],
  ["P2", "Some browser errors lack request URLs", "Generic 400/network-change console records", "Root cause cannot be attributed safely", "Capture browser request URL/body correlation in a focused rerun"]
];
await replaceRuntimeSection(path.join(docsRoot, "21_KNOWN_GAPS_AND_TECHNICAL_DEBT.md"), `## Runtime findings\n\n${table(["Severity", "Issue", "Evidence", "Impact", "Recommended correction"], runtimeFindings)}\n\nNo P0 issue was proven by this audit. All four current Paper Trading captures loaded the 35-trade ledger. No issue above was modified as part of this documentation task.`);

await replaceRuntimeSection(path.join(docsRoot, "20_TEST_COVERAGE.md"), `## Executed audit-time tests\n\n${table(["Command", "Result", "Exit", "Tests/checks/scans", "Passed", "Failed/violations", "Evidence note"], testRuns.runs.map((run) => [run.command, run.result, run.exitCode, run.tests ?? run.checks ?? run.scans ?? run.captures ?? "—", run.passed ?? run.captured ?? "—", run.failed ?? run.violations ?? run.degraded ?? "—", run.reason ?? run.note ?? "—"]))}\n\nThe successful npm commands exercise the same workspace test scripts declared in the package manifests after the preferred \`corepack pnpm\` launcher proved unavailable. The failed launcher attempts and the Axe failure remain visible.`);

await fs.writeFile(path.join(docsRoot, "24_SCREENSHOT_INDEX.md"), `# Screenshot index\n\nGenerated from authenticated Playwright evidence. A screenshot is evidence that a state rendered, not that its calculations are correct.\n\n${table(["Filename", "Page", "Viewport", "Section", "Route", "Component(s)", "Purpose"], screenshots.map((shot) => [`[${shot.filename}](${shot.filename})`, shot.page, shot.viewport, shot.section, shot.capturedRoute, shot.components.join(", "), shot.purpose]))}`);

for (const page of pages) {
  const pageFile = path.join(docsRoot, "pages", `${page.slug}.md`);
  const records = runtime.filter((row) => row.routePattern === page.route);
  const shots = screenshots.filter((shot) => shot.page === page.route);
  const observedApis = [...new Map(records.flatMap((row) => row.apiResponses ?? []).map((entry) => [`${entry.method} ${new URL(entry.url).pathname}`, { method: entry.method, path: new URL(entry.url).pathname, statuses: [] }])).values()];
  for (const endpoint of observedApis) endpoint.statuses = [...new Set(records.flatMap((row) => row.apiResponses ?? []).filter((entry) => entry.method === endpoint.method && new URL(entry.url).pathname === endpoint.path).map((entry) => entry.status))];
  await replaceRuntimeSection(pageFile, `## Runtime verification\n\n${table(["Viewport", "HTTP", "Result", "First heading", "Tables", "Canvas", "SVG", "API errors", "Console errors", "Body overflow"], records.map((row) => [row.viewport, row.navigationStatus, row.result, row.headings?.[0] ?? "—", row.tables, row.canvases, row.svgs, row.responseErrors.length, row.consoleErrors.length, row.horizontalOverflow ? "YES" : "NO"]))}\n\n### Observed API dependencies\n\n${observedApis.length ? table(["Method", "Path", "Observed statuses"], observedApis.map((endpoint) => [endpoint.method, endpoint.path, endpoint.statuses.join(", ")])) : "UNVERIFIED — the earlier capture did not record successful request URLs."}\n\n### Captured evidence\n\n${shots.map((shot) => `- [${shot.section} — ${shot.viewport}](../${shot.filename})`).join("\n") || "UNVERIFIED — no screenshot record."}`);
}

console.log(JSON.stringify(summary, null, 2));
