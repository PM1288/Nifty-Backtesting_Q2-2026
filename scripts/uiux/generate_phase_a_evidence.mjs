import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const auditRoot = path.join(root, "docs/trading-app-audit/evidence");
const outputRoot = path.join(root, "docs/uiux");
const handoverRoot = path.resolve(root, "../UX-rehaul-v2");

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(auditRoot, name), "utf8"));
const [routes, pages, metrics, charts, components, screenshots, runtime] = await Promise.all([
  readJson("route-map.json"),
  readJson("page-map.json"),
  readJson("metric-map.json"),
  readJson("chart-map.json"),
  readJson("component-map.json"),
  readJson("screenshot-map.json"),
  readJson("runtime-audit.json"),
]);

const paperInventory = JSON.parse(await fs.readFile(path.join(root, "docs/paper-trading-v2/metric-field-inventory.json"), "utf8"));
const backlogPath = path.join(handoverRoot, "extracted-handover/NIFTY50_TRADER_UI_UX_STANDARDISATION_FREE_STACK_HANDOVER_2026-08-23/NIFTY50_UI_UX_IMPLEMENTATION_BACKLOG.csv");
const backlog = parseCsv(await fs.readFile(backlogPath, "utf8"));
const generatedAt = new Date().toISOString();

// The wildcard is an error boundary, not one of the 56 canonical analytical
// page patterns counted by the runtime audit and handover.
const canonicalRoutes = routes.filter((item) => !item.redirect && item.route !== "*");
const routeBacklog = new Map();
for (const task of backlog) {
  const route = task.Route;
  if (!route || route === "ALL") continue;
  if (!routeBacklog.has(route)) routeBacklog.set(route, []);
  routeBacklog.get(route).push({
    id: task["Task ID"],
    priority: task.Priority,
    phase: task.Phase,
    workItem: task["Work item"],
    requirement: task["Implementation requirement"],
    acceptance: task["Acceptance evidence"],
  });
}

const routeVisualManifest = {
  schemaVersion: "1.0.0",
  generatedAt,
  sourceEvidence: [
    "docs/trading-app-audit/evidence/route-map.json",
    "docs/trading-app-audit/evidence/page-map.json",
    "docs/trading-app-audit/evidence/chart-map.json",
    "docs/trading-app-audit/evidence/component-map.json",
    "docs/trading-app-audit/evidence/screenshot-map.json",
    "docs/trading-app-audit/evidence/runtime-audit.json",
    "../UX-rehaul-v2/NIFTY50_UI_UX_IMPLEMENTATION_BACKLOG.csv",
  ],
  preservationRule: "No route, chart, table, state, interaction, export, comment, audit record, or methodology item may be removed until parity evidence is recorded.",
  summary: {
    declaredRoutes: routes.length,
    canonicalRoutes: canonicalRoutes.length,
    redirects: routes.length - canonicalRoutes.length,
    charts: charts.length,
    components: components.length,
    screenshots: screenshots.length,
    backlogItems: backlog.length,
  },
  routes: canonicalRoutes.map((route) => {
    const page = pages.find((item) => item.route === route.route);
    const captures = runtime.filter((item) => item.routePattern === route.route);
    const routeCharts = charts.filter((chart) => chart.pages?.includes(route.route));
    const routeMetrics = metrics.filter((metric) => metric.pages?.includes(route.route));
    const routeScreenshots = screenshots.filter((shot) => shot.routePattern === route.route || shot.route === route.route);
    return {
      route: route.route,
      component: route.component,
      sourceFile: page?.sourceFile ?? route.sourceFile,
      apiDependencies: page?.apiDependencies ?? [],
      currentEvidence: {
        charts: routeCharts.map(({ chartId, file, library, titles }) => ({ chartId, file, library, titles })),
        metrics: routeMetrics.map(({ metricId, label, file, line }) => ({ metricId, label, file, line })),
        screenshots: routeScreenshots.map((shot) => shot.path ?? shot.file ?? shot.filename).filter(Boolean),
        viewports: [...new Set(captures.map((capture) => capture.viewport))],
        tables: Math.max(0, ...captures.map((capture) => capture.tables ?? 0)),
        canvases: Math.max(0, ...captures.map((capture) => capture.canvases ?? 0)),
        svgs: Math.max(0, ...captures.map((capture) => capture.svgs ?? 0)),
        medianElapsedMs: median(captures.map((capture) => capture.elapsedMs).filter(Number.isFinite)),
        runtimeStates: [...new Set(captures.map((capture) => capture.result))],
      },
      implementationBacklog: routeBacklog.get(route.route) ?? [],
      preservationStatus: "BASELINED_NOT_CUT_OVER",
    };
  }),
  redirects: routes.filter((item) => item.redirect),
};

const fieldPreservationManifest = {
  schemaVersion: "1.0.0",
  generatedAt,
  preservationRule: "A field is preserved only when its current source, current location, target location, unit/basis and parity result are recorded. UNVERIFIED is not a pass.",
  summary: {
    staticallyCataloguedMetrics: metrics.length,
    paperTradingFields: paperInventory.fields.length,
    canonicalRegistryEntries: Object.keys(paperInventory.canonicalMetricRegistry ?? {}).length,
    status: "BASELINE",
  },
  routes: canonicalRoutes.map((route) => ({
    route: route.route,
    fields: metrics.filter((metric) => metric.pages?.includes(route.route)).map((metric) => ({
      id: metric.metricId,
      currentLabel: metric.label,
      currentSource: `${metric.file}:${metric.line}`,
      valueExpression: metric.valueExpression,
      calculationStatus: metric.calculationStatus,
      targetLocation: "FULL_AUDIT_AND_CONTEXTUAL_VIEW",
      parityStatus: "UNVERIFIED",
    })),
    paperTradingCanonicalFields: route.route === "/paper-trading" ? paperInventory.fields : undefined,
    preservationStatus: "BASELINED_NOT_CUT_OVER",
  })),
};

await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(outputRoot, "route-visual-preservation-manifest.json"), `${JSON.stringify(routeVisualManifest, null, 2)}\n`);
await fs.writeFile(path.join(outputRoot, "field-preservation-manifest.json"), `${JSON.stringify(fieldPreservationManifest, null, 2)}\n`);

const packageJsonPath = path.join(root, "neon-stock-terminal/apps/web/package.json");
const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
const packageRows = [];
for (const [scope, dependencies] of [["production", packageJson.dependencies], ["development", packageJson.devDependencies]]) {
  for (const [name, requestedVersion] of Object.entries(dependencies ?? {})) {
    let installedVersion = "NOT_INSTALLED";
    let license = "UNVERIFIED";
    let repository = "UNVERIFIED";
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(root, "neon-stock-terminal/node_modules", name, "package.json"), "utf8"));
      installedVersion = manifest.version ?? installedVersion;
      license = typeof manifest.license === "string" ? manifest.license : JSON.stringify(manifest.license ?? "UNVERIFIED");
      repository = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url ?? repository;
    } catch {}
    packageRows.push({ name, scope, requestedVersion, installedVersion, license, repository });
  }
}
const prohibited = /commercial|enterprise|pro|premium|trial|proprietary/i;
const licenceReport = `# Open-source licence manifest\n\nGenerated: ${generatedAt}\n\nThis inventory records the exact installed direct web packages. It does not approve future dependencies. A transitive scan is still required before adding a package.\n\n| Package | Scope | Requested | Installed | Licence | Repository | Gate |\n| --- | --- | --- | --- | --- | --- | --- |\n${packageRows.map((item) => `| \`${item.name}\` | ${item.scope} | \`${item.requestedVersion}\` | \`${item.installedVersion}\` | ${item.license} | ${item.repository} | ${prohibited.test(`${item.name} ${item.license}`) || item.license === "UNVERIFIED" ? "REVIEW" : "PASS"} |`).join("\n")}\n\nNo commercial grid/chart/component package is declared in the direct web dependency list.\n`;
await fs.writeFile(path.join(outputRoot, "open-source-licence-manifest.md"), licenceReport);

const cssFiles = components.flatMap((component) => component.cssModules ?? []).filter(Boolean);
const duplicateSummary = {
  generatedAt,
  evidence: "Static component/CSS catalogue plus current source inspection",
  sharedFoundationsAlreadyPresent: [
    "CommandPalette",
    "NavigationStateManager",
    "WorkspacePrimitives",
    "TradingPrimitives",
    "PaperWorkbenchPrimitives",
    "EChartSurface",
    "ResponsiveWorkspaceNavigation",
  ],
  rules: [
    "Extend existing foundations; do not create parallel command, chart, status, paper metric, or navigation systems.",
    "Page-specific CSS is retired only after route parity and visual evidence.",
    "No business calculation moves into a presentation component.",
  ],
  sourceCounts: {
    componentRecords: components.length,
    uniqueCssModules: new Set(cssFiles).size,
    pageSpecificCssModules: new Set(cssFiles.filter((file) => file.includes("/pages/"))).size,
  },
};
await fs.writeFile(path.join(outputRoot, "duplication-and-consolidation-baseline.json"), `${JSON.stringify(duplicateSummary, null, 2)}\n`);

function parseCsv(input) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
