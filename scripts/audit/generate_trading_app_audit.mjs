#!/usr/bin/env node
/**
 * Non-invasive source inventory generator for docs/trading-app-audit.
 *
 * This script reads repository sources only. It deliberately avoids importing
 * application modules, connecting to PostgreSQL, or evaluating configuration.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptFile), "../..");
const appRoot = path.join(repoRoot, "neon-stock-terminal");
const outRoot = path.join(repoRoot, "docs/trading-app-audit");

const excluded = new Set([".git", "node_modules", ".pytest_cache", ".ruff_cache", ".hypothesis", "dist", "build", "coverage", "output", "outputs", "artifacts"]);
const textExt = new Set([".ts", ".tsx", ".js", ".mjs", ".py", ".go", ".sql", ".css", ".scss", ".json", ".yaml", ".yml", ".toml", ".md"]);

async function walk(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full));
    else if (textExt.has(path.extname(entry.name))) result.push(full);
  }
  return result;
}

const files = await walk(repoRoot);
const rel = (file) => path.relative(repoRoot, file).replaceAll(path.sep, "/");
const source = new Map();
for (const file of files) {
  try { source.set(rel(file), await fs.readFile(file, "utf8")); } catch { /* binary/malformed files are ignored */ }
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const slugify = (value) => value.toLowerCase().replace(/:[a-zA-Z0-9_]+/g, "param").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "home";
const link = (file, line) => `${path.join(repoRoot, file).replaceAll(path.sep, "/")}${line ? `#L${line}` : ""}`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const mdEscape = (value) => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
const table = (headers, rows) => {
  if (!rows.length) return "_No records discovered._\n";
  return `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.map(mdEscape).join(" | ")} |`).join("\n")}\n`;
};

await Promise.all([
  "pages", "components", "charts", "functions", "api", "data-lineage", "evidence", "diagrams",
  "screenshots/desktop", "screenshots/tablet", "screenshots/mobile", "screenshots/charts",
  "screenshots/sections", "screenshots/modals", "screenshots/hover-states", "screenshots/loading-states", "screenshots/errors"
].map((dir) => fs.mkdir(path.join(outRoot, dir), { recursive: true })));

// Routes and page/component resolution.
const appFile = "neon-stock-terminal/apps/web/src/App.tsx";
const appText = source.get(appFile) ?? "";
const routeRecords = [];
for (const match of appText.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<([^\s/>]+)([^>]*)\/>\}\s*\/>/g)) {
  const [, route, component, attrs] = match;
  const redirect = component === "Navigate";
  const target = redirect ? (attrs.match(/to="([^"]+)"/)?.[1] ?? null) : null;
  routeRecords.push({ route, component, redirect, target, line: lineOf(appText, match.index), sourceFile: appFile });
}
const canonicalRoutes = routeRecords.filter((item) => !item.redirect && item.route !== "*" && !item.route.includes("/*"));

const tsxFiles = [...source.keys()].filter((file) => file.startsWith("neon-stock-terminal/apps/web/src/") && file.endsWith(".tsx"));
function resolveComponent(component) {
  if (component === "LandingPage") return "neon-stock-terminal/apps/web/src/pages/LandingPage.tsx";
  if (component === "NotFoundPage") return "neon-stock-terminal/apps/web/src/pages/NotFoundPage.tsx";
  const lazyImport = new RegExp(`const\\s+${component}\\s*=\\s*lazy[\\s\\S]{0,500}?import\\(["']([^"']+)["']\\)`).exec(appText)?.[1];
  if (lazyImport) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(appFile), `${lazyImport}.tsx`));
    if (source.has(resolved)) return resolved;
  }
  const candidates = tsxFiles.filter((file) => new RegExp(`(?:function|const|class)\\s+${component}\\b|export\\s+\\{?\\s*${component}\\b`).test(source.get(file) ?? ""));
  return candidates.sort((a, b) => (a.includes("/pages/") ? -1 : 1) - (b.includes("/pages/") ? -1 : 1))[0] ?? null;
}

const apiClientFile = "neon-stock-terminal/apps/web/src/lib/api.ts";
const apiClientText = source.get(apiClientFile) ?? "";
function pageApiDependencies(pageFile) {
  if (!pageFile) return [];
  const text = source.get(pageFile) ?? "";
  const identifiers = new Set([...text.matchAll(/\b(fetch[A-Z][A-Za-z0-9_]*|create[A-Z][A-Za-z0-9_]*|post[A-Z][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));
  const deps = [];
  const directPaths = [...new Set([
    ...[...text.matchAll(/["'`]((?:\/api)?\/v1\/[^"'`$? )]+)/g)].map((m) => m[1]),
    ...[...text.matchAll(/(?:\$\{[^}]+\})?(\/v1\/[A-Za-z0-9_/:.${}-]+)/g)].map((m) => m[1])
  ])];
  if (directPaths.length) deps.push({ clientFunction: "direct fetch/path reference", endpoints: directPaths, file: pageFile, line: 1 });
  for (const id of identifiers) {
    const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${id}\\b|export\\s+const\\s+${id}\\b`, "g");
    const found = re.exec(apiClientText);
    if (!found) continue;
    const block = apiClientText.slice(found.index, found.index + 1400);
    const paths = [...block.matchAll(/["'`]((?:\/api)?\/v1\/[^"'`$? )]+)/g)].map((m) => m[1]);
    deps.push({ clientFunction: id, endpoints: [...new Set(paths)], file: apiClientFile, line: lineOf(apiClientText, found.index) });
  }
  return deps;
}

const pageMap = canonicalRoutes.map((route) => {
  const sourceFile = resolveComponent(route.component);
  return { ...route, sourceFile, slug: slugify(route.route), apiDependencies: pageApiDependencies(sourceFile) };
});

// Backend endpoints: Express/FastAPI and straightforward Go registrations.
const apiMap = [];
for (const [file, text] of source) {
  if (!(/(?:apps\/api\/src\/routes|services\/)/.test(file))) continue;
  for (const match of text.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)) {
    apiMap.push({ method: match[1].toUpperCase(), path: match[2], file, line: lineOf(text, match.index), framework: file.endsWith(".py") ? "FastAPI/Flask-style" : "Express" });
  }
  for (const match of text.matchAll(/@app\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g)) {
    apiMap.push({ method: match[1].toUpperCase(), path: match[2], file, line: lineOf(text, match.index), framework: "FastAPI" });
  }
}
apiMap.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
for (const endpoint of apiMap) {
  const text = source.get(endpoint.file) ?? "";
  const lines = text.split("\n");
  const snippet = lines.slice(Math.max(0, endpoint.line - 1), endpoint.line + 110).join("\n");
  endpoint.pathParameters = [...endpoint.path.matchAll(/(?::|\{)([A-Za-z0-9_]+)\}?/g)].map((m) => m[1]);
  endpoint.queryParameters = [...new Set([...snippet.matchAll(/req\.query\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))];
  endpoint.bodyUsed = /req\.body/.test(snippet);
  endpoint.databaseObjects = [...new Set([...snippet.matchAll(/\b(?:from|join|update|into)\s+([A-Za-z_][A-Za-z0-9_.]*)/ig)].map((m) => m[1]).filter((name) => name.includes(".")))];
  endpoint.authentication = endpoint.file.includes("neon-stock-terminal/apps/api/")
    ? endpoint.path.startsWith("/v1/") ? "Authenticated by global /v1 guard" : endpoint.path.startsWith("/internal/") ? "Internal route guard/rate limiter; inspect handler" : "Route-specific/public boundary; inspect handler"
    : "Service-local boundary; external reachability UNVERIFIED";
  const consumerNeedle = endpoint.path.replace(/:\w+|\{\w+\}/g, "");
  endpoint.frontendConsumers = consumerNeedle.length > 3 ? [...source.entries()].filter(([file, value]) => file.includes("apps/web/src/") && value.includes(consumerNeedle)).map(([file]) => file).slice(0, 30) : [];
  endpoint.responseContract = /response_model\s*=\s*([A-Za-z0-9_]+)/.exec(snippet)?.[1] ?? (/\.json\(/.test(snippet) ? "Inline/TypeScript response; inspect handler and web type" : "UNVERIFIED");
}

// Important functions, not framework boilerplate.
const importantWords = /(calculate|compute|derive|aggregate|score|signal|strategy|trade|order|position|portfolio|pnl|profit|loss|drawdown|mfe|mae|risk|heatmap|indicator|rsi|will|macd|atr|vwap|option|expiry|market|snapshot|refresh|ingest|transform|normalize|validate|auth|session|webhook|dispatch|reconcile|simulate|backtest|fill|price)/i;
const functionMap = [];
for (const [file, text] of source) {
  if (!/\.(ts|tsx|js|mjs|py|go)$/.test(file) || file.includes(".test.") || file.includes("/tests/")) continue;
  const patterns = file.endsWith(".py")
    ? [/^(\s*)(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^\n]*)/gm]
    : file.endsWith(".go")
      ? [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^\n]*)/gm]
      : [/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^\n]*)/g, /(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(([^\n]*)=>/g];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const name = file.endsWith(".py") ? match[2] : match[1];
      if (!importantWords.test(name)) continue;
      functionMap.push({ name, file, line: lineOf(text, match.index), language: path.extname(file).slice(1), signature: match[0].trim().slice(0, 240) });
    }
  }
}

// React components.
const componentMap = [];
for (const file of tsxFiles) {
  const text = source.get(file) ?? "";
  const names = new Set();
  for (const match of text.matchAll(/(?:export\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)) names.add(match[1]);
  for (const match of text.matchAll(/(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*(?::[^=]+)?=/g)) names.add(match[1]);
  for (const name of names) {
    const idx = text.search(new RegExp(`(?:function|const)\\s+${name}\\b`));
    const usedBy = pageMap.filter((page) => page.sourceFile === file || (page.sourceFile && (source.get(page.sourceFile) ?? "").includes(name))).map((page) => page.route);
    componentMap.push({ name, file, line: lineOf(text, Math.max(0, idx)), usedBy, cssModules: [...text.matchAll(/import\s+\w+\s+from\s+["']([^"']+\.module\.css)["']/g)].map((m) => m[1]) });
  }
}
const componentDocName = (component) => `${slugify(component.name)}--${crypto.createHash("sha1").update(component.file).digest("hex").slice(0, 8)}.md`;

// Headline metric evidence. A record is included only when a metric-like
// component carries a label/title and value prop; ordinary form labels are excluded.
const metricMap = [];
for (const file of tsxFiles) {
  const text = source.get(file) ?? "";
  for (const match of text.matchAll(/<([A-Z][A-Za-z0-9_]*(?:Metric|Kpi|KPI|Stat|Tile|Card)[A-Za-z0-9_]*)\b([^>]{0,1200})>/gs)) {
    const [, renderer, attrs] = match;
    const label = /(?:label|title|heading)\s*=\s*(?:["'`]([^"'`]+)["'`]|\{["'`]([^"'`]+)["'`]\})/.exec(attrs);
    const value = /value\s*=\s*(\{[^}]{1,300}\}|["'`][^"'`]{1,200}["'`])/.exec(attrs);
    if (!label || !value) continue;
    metricMap.push({
      metricId: slugify(`${file}-${label[1] ?? label[2]}`), label: label[1] ?? label[2], renderer,
      valueExpression: value[1].slice(0, 300), file, line: lineOf(text, match.index),
      pages: pageMap.filter((page) => page.sourceFile === file || (page.sourceFile && (source.get(page.sourceFile) ?? "").includes(renderer))).map((page) => page.route),
      calculationStatus: "Trace value expression through props/selectors/API; UNVERIFIED until independently reconciled"
    });
  }
}

// Chart/visual surfaces are source-backed; titles can be dynamic and are retained as expressions where needed.
const chartMap = [];
for (const file of tsxFiles) {
  const text = source.get(file) ?? "";
  if (!/(EChartSurface|echarts|<svg|Heatmap|Chart|Surface|Plot|Sparkline|Calendar)/.test(text)) continue;
  const componentNames = componentMap.filter((c) => c.file === file).map((c) => c.name);
  const titles = [...text.matchAll(/(?:title|heading|aria-label)\s*=\s*(?:\{|)["'`]([^"'`]{3,100})/g)].map((m) => m[1]);
  const apiPaths = [...text.matchAll(/["'`]((?:\/api)?\/v1\/[^"'`$? )]+)/g)].map((m) => m[1]);
  chartMap.push({ chartId: slugify(file.replace(/^.*\/src\//, "").replace(/\.[^.]+$/, "")), file, components: componentNames, library: /EChartSurface|echarts/.test(text) ? "Apache ECharts 6" : /<svg/.test(text) ? "Custom SVG/React" : "CSS/DOM visualisation", titles: [...new Set(titles)], apiPaths: [...new Set(apiPaths)], pages: pageMap.filter((p) => p.sourceFile === file || (p.sourceFile && componentNames.some((name) => (source.get(p.sourceFile) ?? "").includes(name)))).map((p) => p.route) });
}

// SQL storage objects.
const storageMap = [];
for (const [file, text] of source) {
  if (!file.endsWith(".sql")) continue;
  for (const match of text.matchAll(/create\s+(?:or\s+replace\s+)?(table|materialized\s+view|view)\s+(?:if\s+not\s+exists\s+)?([A-Za-z0-9_."]+)/ig)) {
    storageMap.push({ type: match[1].toUpperCase(), name: match[2].replaceAll('"', ""), file, line: lineOf(text, match.index) });
  }
}

// Strategy identifiers and config provenance.
const strategyMap = [];
const strategySeen = new Set();
for (const [file, text] of source) {
  if (!/(strategy|oiis|rolling|backtest|options)/i.test(file)) continue;
  for (const match of text.matchAll(/["']([a-z][a-z0-9_]*(?:strategy|bullish|bearish|oiis|monthly|option)[a-z0-9_]*)["']/g)) {
    const id = match[1];
    if (id.length < 5 || id.length > 100 || strategySeen.has(id)) continue;
    strategySeen.add(id);
    strategyMap.push({ id, file, line: lineOf(text, match.index) });
  }
}

// External/data-provider references. Presence is evidence of integration code, not proof of current runtime use.
const providerRules = [
  ["SmartAPI / Angel One", /smartapi|smart_api|angel one|angelone/i], ["NSE", /nseindia|nse_|NSE/i],
  ["Yahoo Finance", /yahoo finance|query1\.finance\.yahoo|yfinance/i], ["Redis", /redis/i],
  ["PostgreSQL", /postgres|pg\.|prisma/i], ["CDSL", /cdsl/i], ["Firebase", /firebase/i],
  ["n8n webhook", /n8n|webhook/i], ["Discord", /discord/i]
];
const dataSourceMap = providerRules.map(([provider, pattern]) => ({
  provider,
  evidence: [...source.entries()].filter(([file, text]) => !file.endsWith(".md") && pattern.test(text)).slice(0, 80).map(([file, text]) => ({ file, line: lineOf(text, Math.max(0, text.search(pattern))) })),
  runtimeStatus: "UNVERIFIED unless separately identified in the runtime audit"
}));

const cssMap = [];
for (const [file, text] of source) {
  if (!file.endsWith(".css")) continue;
  const classes = [...text.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)\s*[{,:]/g)].map((m) => m[1]);
  const tokens = [...text.matchAll(/--([A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]);
  cssMap.push({ file, classCount: new Set(classes).size, classes: [...new Set(classes)].slice(0, 250), tokens: [...new Set(tokens)] });
}

const testMap = [...source.keys()].filter((file) => /(?:\.test\.|\/tests\/|playwright.*\.mjs$)/.test(file)).map((file) => ({ file, framework: file.includes("playwright") ? "Playwright" : file.endsWith(".py") ? "pytest" : file.endsWith(".go") ? "Go test" : "Node test runner" }));

const serviceNames = [...new Set([...source.keys()].map((file) => /^services\/([^/]+)\//.exec(file)?.[1]).filter(Boolean))].sort();
const serviceMap = serviceNames.map((name) => {
  const owned = [...source.keys()].filter((file) => file.startsWith(`services/${name}/`));
  const extensions = new Set(owned.map((file) => path.extname(file)));
  return {
    name, root: `services/${name}`,
    languages: [...new Set([extensions.has(".py") ? "Python" : null, extensions.has(".ts") || extensions.has(".js") ? "TypeScript/JavaScript" : null, extensions.has(".go") ? "Go" : null].filter(Boolean))],
    sourceFiles: owned.length,
    endpoints: apiMap.filter((endpoint) => endpoint.file.startsWith(`services/${name}/`)).map((endpoint) => `${endpoint.method} ${endpoint.path}`),
    tests: testMap.filter((test) => test.file.startsWith(`services/${name}/`)).map((test) => test.file),
    packageEvidence: owned.filter((file) => /(?:pyproject\.toml|requirements.*\.txt|package\.json|Dockerfile)$/.test(file))
  };
});

const mockTerms = [];
for (const [file, text] of source) {
  if (file.endsWith(".md") || /(?:\.test\.|\/tests\/|\/samples\/|\/examples\/)/.test(file)) continue;
  for (const term of ["mock", "dummy", "fake", "sample", "demo", "placeholder", "Math.random", "TODO", "FIXME", "TEMP", "localhost"]) {
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx >= 0) mockTerms.push({ term, file, line: lineOf(text, idx), classification: "REQUIRES_MANUAL_REVIEW" });
  }
}

const manifest = [];
for (const [file, text] of source) manifest.push({ file, bytes: Buffer.byteLength(text), sha256: crypto.createHash("sha256").update(text).digest("hex") });

const evidence = { routeMap: routeRecords, pageMap, apiMap, chartMap, componentMap, metricMap, functionMap, dataSourceMap, storageMap, strategyMap, serviceMap, cssMap, testMap, mockTerms, manifest };
for (const [name, value] of Object.entries({
  "route-map.json": routeRecords, "page-map.json": pageMap, "api-map.json": apiMap,
  "chart-map.json": chartMap, "component-map.json": componentMap, "metric-map.json": metricMap, "function-map.json": functionMap,
  "data-source-map.json": dataSourceMap, "storage-map.json": storageMap, "strategy-map.json": strategyMap, "service-map.json": serviceMap,
  "css-map.json": cssMap, "test-map.json": testMap, "mock-placeholder-map.json": mockTerms,
  "source-manifest.json": manifest
})) await fs.writeFile(path.join(outRoot, "evidence", name), json(value));

const generatedAt = new Date().toISOString();
const sourceNote = `> Evidence basis: static source inspection generated ${generatedAt}. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.`;

// Page dossiers.
for (const page of pageMap) {
  const pageText = page.sourceFile ? (source.get(page.sourceFile) ?? "") : "";
  const headings = [...pageText.matchAll(/<h[1-4][^>]*>(?:\{[^}]+\}|)([^<{]{2,100})/g)].map((m) => m[1].trim()).filter(Boolean);
  const childComponents = [...pageText.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1]).filter((name) => name !== page.component);
  const cssImports = [...pageText.matchAll(/import\s+\w+\s+from\s+["']([^"']+\.css)["']/g)].map((m) => m[1]);
  const screenshotBase = page.slug;
  const body = `# ${page.component}\n\n${sourceNote}\n\n## Page overview\n\n| Field | Evidence |\n| --- | --- |\n| Route | \`${page.route}\` |\n| Main component | \`${page.component}\` |\n| Source | ${page.sourceFile ? `[${page.sourceFile}](${link(page.sourceFile)})` : "UNVERIFIED"} |\n| Authentication | All \`/v1\` gateway routes are protected by the global auth guard; public shell access may display the authentication gate. |\n| URL parameters | ${page.route.includes(":") ? page.route.match(/:[A-Za-z0-9_]+/g)?.join(", ") : "None declared in the route pattern"} |\n| API client dependencies | ${page.apiDependencies.flatMap((d) => d.endpoints).map((v) => `\`${v}\``).join(", ") || "No direct client endpoint statically resolved; inspect imported hooks and child components."} |\n| CSS modules/styles | ${cssImports.map((v) => `\`${v}\``).join(", ") || "Shared/global styles or child-component modules"} |\n\n## Purpose and decisions supported\n\nThe component name, rendered headings, controls, API dependencies, and screenshots below are the authoritative evidence for this page. Business interpretation is recorded only where source labels and calculation code support it. Any intent not stated in code is **UNVERIFIED**.\n\n## Visual structure\n\n\`\`\`text\n${page.component}\n${headings.slice(0, 30).map((h) => `├── ${h}`).join("\n") || "└── Structure is composed dynamically; inspect the component and screenshot."}\n\`\`\`\n\n## Component hierarchy\n\n${table(["Child component", "Evidence"], [...new Set(childComponents)].slice(0, 80).map((name) => [name, `Referenced by ${page.sourceFile ?? "UNVERIFIED"}`]))}\n\n## API and data flow\n\n${table(["Frontend function", "Endpoint(s)", "Evidence"], page.apiDependencies.map((d) => [d.clientFunction, d.endpoints.map((v) => `\`${v}\``).join(", ") || "Resolved dynamically", `[source](${link(d.file, d.line)})`]))}\n\nThe canonical trace is: route → page component → imported hook/API client → authenticated gateway endpoint → route handler/service query → PostgreSQL or provider adapter → response/view model → component. Exact endpoint implementations are indexed in [API catalog](../04_API_CATALOG.md).\n\n## Loading, empty and error behaviour\n\nInspect conditional branches in [the page source](${page.sourceFile ? link(page.sourceFile) : "../14_FRONTEND_COMPONENT_MAP.md"}). Runtime captures record console errors, failed requests, page headings, overflow, and authenticated state. A missing screenshot or absent runtime record is **UNVERIFIED**, not a pass.\n\n## Responsive and styling behaviour\n\nCSS is controlled by ${cssImports.map((v) => `\`${v}\``).join(", ") || "shared design-system and global styles"}. Viewport evidence is linked below.\n\n## Screenshots\n\n- [1920×1080](../screenshots/desktop/${screenshotBase}__1920x1080__full.png)\n- [1440×900](../screenshots/desktop/${screenshotBase}__1440x900__full.png)\n- [1024×768](../screenshots/tablet/${screenshotBase}__1024x768__full.png)\n- [390×844](../screenshots/mobile/${screenshotBase}__390x844__full.png)\n\n## Accuracy and limitations\n\nNo value is classified as accurate merely because it renders. See [Accuracy and data quality](../16_ACCURACY_AND_DATA_QUALITY.md), [metric catalog](../08_METRIC_AND_CALCULATION_CATALOG.md), and runtime request evidence in \`evidence/runtime-audit.json\`.\n`;
  await fs.writeFile(path.join(outRoot, "pages", `${page.slug}.md`), body);
}

// Component dossiers. Component names can repeat across modules, so the source
// path hash prevents one dossier from silently overwriting another.
for (const entry of await fs.readdir(path.join(outRoot, "components"), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".md")) await fs.unlink(path.join(outRoot, "components", entry.name));
}
for (const component of componentMap) {
  const body = `# ${component.name}\n\n${sourceNote}\n\n| Field | Evidence |\n| --- | --- |\n| Source | [${component.file}](${link(component.file, component.line)}) |\n| Used by routes | ${component.usedBy.map((v) => `\`${v}\``).join(", ") || "Indirect/shared use; search import graph"} |\n| CSS modules | ${component.cssModules.map((v) => `\`${v}\``).join(", ") || "None directly imported"} |\n\n## Responsibilities\n\nRead the linked implementation for props, hooks, state, child components, conditional rendering, events, API calls, and responsive branches. The structured component map preserves the direct source evidence; intent that cannot be inferred safely is **UNVERIFIED**.\n`;
  await fs.writeFile(path.join(outRoot, "components", componentDocName(component)), body);
}

// Chart dossiers.
for (const chart of chartMap) {
  const body = `# ${chart.chartId}\n\n${sourceNote}\n\n## Identity\n\n| Field | Value |\n| --- | --- |\n| Source | [${chart.file}](${link(chart.file)}) |\n| Components | ${chart.components.map((v) => `\`${v}\``).join(", ") || "Inline visual"} |\n| Library | ${chart.library} |\n| Pages | ${chart.pages.map((v) => `\`${v}\``).join(", ") || "Indirect/shared"} |\n| Titles found | ${chart.titles.join("; ") || "Dynamic/none statically resolved"} |\n| Direct API paths | ${chart.apiPaths.map((v) => `\`${v}\``).join(", ") || "Supplied through props/hooks"} |\n\n## Business meaning and interpretation\n\nThe visible title, axes, series encodings, and surrounding copy in the linked source define what the chart says. It is descriptive/diagnostic unless the source explicitly identifies a predictive model. Do not infer executable returns from MFE, simulated, hypothetical, or interpolated surfaces.\n\n## Configuration and data input\n\nInspect the linked option/series construction for axes, tooltips, legends, thresholds, null handling, timezone, colour, and precision. Where data arrives by props, follow the parent component through [component-map.json](../evidence/component-map.json).\n\n## Accuracy considerations\n\nValidate population, eligibility, as-of timestamp, missing-value handling, session boundaries, adjusted/unadjusted price basis, and interpolation before using the visual for decisions. Runtime and independent-calculation evidence is catalogued centrally.\n`;
  await fs.writeFile(path.join(outRoot, "charts", `${chart.chartId}.md`), body);
}

const routeTable = table(["Route", "Type", "Component/target", "Source"], routeRecords.map((r) => [r.route, r.redirect ? "Redirect/alias" : r.route === "*" ? "Fallback" : "Page", r.redirect ? r.target : r.component, `[App.tsx:${r.line}](${link(appFile, r.line)})`]));
const apiTable = table(["Method", "Path", "Auth", "Parameters/body", "Response", "Storage", "Frontend consumer", "Implementation"], apiMap.map((a) => [
  a.method, `\`${a.path}\``, a.authentication,
  [...a.pathParameters.map((v) => `path:${v}`), ...a.queryParameters.map((v) => `query:${v}`), ...(a.bodyUsed ? ["body:yes"] : [])].join(", ") || "None statically resolved",
  a.responseContract, a.databaseObjects.join(", ") || "Service/provider/dynamic or none",
  a.frontendConsumers.join(", ") || "Internal/external/no direct literal consumer",
  `[${a.file}:${a.line}](${link(a.file, a.line)})`
]));
const storageTable = table(["Object", "Type", "Definition"], storageMap.map((s) => [s.name, s.type, `[${s.file}:${s.line}](${link(s.file, s.line)})`]));
const chartTable = table(["Chart ID", "Library", "Page(s)", "Source"], chartMap.map((c) => [`[${c.chartId}](charts/${c.chartId}.md)`, c.library, c.pages.join(", ") || "Shared/indirect", `[${c.file}](${link(c.file)})`]));
const componentTable = table(["Component", "Routes", "Source"], componentMap.map((c) => [`[${c.name}](components/${componentDocName(c)})`, c.usedBy.join(", ") || "Shared/indirect", `[${c.file}:${c.line}](${link(c.file, c.line)})`]));

const masterDocs = {
  "README.md": `# Trading Application — Complete Technical Documentation\n\n${sourceNote}\n\nThis audit is the source-backed portal for the NIFTY 50 Trader application. It separates **code-verified**, **runtime-verified**, and **UNVERIFIED** claims. It does not change trading calculations or production behaviour.\n\n## Inventory snapshot\n\n- ${routeRecords.length} route declarations (${canonicalRoutes.length} non-redirect page patterns)\n- ${apiMap.length} discovered Express/FastAPI endpoint declarations\n- ${componentMap.length} React components\n- ${metricMap.length} source-identifiable metric cards/KPIs\n- ${chartMap.length} chart/visual source modules\n- ${functionMap.length} important calculation/trading/data function records\n- ${storageMap.length} SQL object definitions across migrations\n- ${strategyMap.length} candidate strategy identifiers requiring human classification\n- ${testMap.length} test/audit files\n\n## Start here\n\n- [Executive overview](00_EXECUTIVE_OVERVIEW.md)\n- [Application architecture](01_APPLICATION_ARCHITECTURE.md)\n- [Routes and pages](02_ROUTE_AND_PAGE_INDEX.md)\n- [APIs](04_API_CATALOG.md)\n- [Data lineage](06_DATA_LINEAGE.md)\n- [Charts](07_CHART_AND_VISUALIZATION_CATALOG.md)\n- [Paper trading](10_PAPER_TRADING_ENGINE.md)\n- [Accuracy](16_ACCURACY_AND_DATA_QUALITY.md)\n- [Known gaps](21_KNOWN_GAPS_AND_TECHNICAL_DEBT.md)\n- [Traceability](22_END_TO_END_TRACEABILITY.md)\n- [Screenshots](24_SCREENSHOT_INDEX.md)\n- [Repository-specific extension guides](27_EXTENSION_GUIDES.md)\n\n## Pages\n\n${pageMap.map((p) => `- [\`${p.route}\`](pages/${p.slug}.md) — \`${p.component}\``).join("\n")}\n\n## How to trace any number\n\n1. Locate the visible label in the relevant page/component source with \`rg\`.\n2. Identify its prop, selector, hook, or local calculation.\n3. Follow the imported API-client function in \`apps/web/src/lib/api.ts\` or the imported service.\n4. Match the HTTP path in [api-map.json](evidence/api-map.json).\n5. Inspect the route handler and every query/service/helper it calls.\n6. Resolve SQL objects through [storage-map.json](evidence/storage-map.json).\n7. Resolve provider adapters through [data-source-map.json](evidence/data-source-map.json).\n8. Recompute from raw inputs without adopting UI fallbacks.\n9. Compare timestamp, timezone, precision, eligibility, gross/net, and capital basis.\n10. If any link cannot be proven, mark the value **UNVERIFIED**.\n`,
  "00_EXECUTIVE_OVERVIEW.md": `# Executive overview\n\n${sourceNote}\n\nThe application is a polyglot, containerised trading-research platform. The user-facing React/Vite workstation and Express gateway sit in \`neon-stock-terminal\`; Go commands and collectors provide SmartAPI/market ingestion and legacy calculations; Python services implement paper trading, OIIS, rolling-monthly, derivatives, institutional-flow, and NSE report workflows; PostgreSQL is the durable analytical and trading store; Redis and WebSocket/polling paths support refresh and realtime delivery.\n\nThe running deployment is separate at \`/home/novius2/trading-stack\`; this versioned repository is its source mirror. Runtime state must therefore be checked against image/container identity before treating source inspection as deployment proof.\n\n## Audit boundaries\n\n- Production business logic, CSS, schemas, and data were not modified.\n- Static evidence is reproducible with \`node scripts/audit/generate_trading_app_audit.mjs\`.\n- Runtime evidence is captured by the documentation Playwright harness.\n- Secrets are never copied into this documentation.\n- A rendered page is not evidence that its calculation is correct.\n`,
  "01_APPLICATION_ARCHITECTURE.md": `# Application architecture\n\n${sourceNote}\n\n## Technology inventory\n\n| Layer | Technology | Evidence |\n| --- | --- | --- |\n| Web UI | React 18, TypeScript, Vite 5 | \`neon-stock-terminal/apps/web/package.json\` |\n| Query/state | TanStack React Query plus React context/local state | \`apps/web/src/lib/hooks.ts\`, component hooks |\n| Charts | Apache ECharts 6 and custom SVG/DOM visuals | web package and visual components |\n| Gateway API | Express 4, TypeScript, Zod | \`apps/api/package.json\` |\n| ORM/store | Prisma plus direct PostgreSQL SQL | API package, SQL migrations, service adapters |\n| Realtime/cache | WebSocket and Redis | \`apps/api/src/ws/stream.ts\`, Redis dependency |\n| Core collector | Go | root \`go.mod\`, \`cmd/collector\`, \`internal/*\` |\n| Strategy/services | Python/FastAPI workers | \`services/*/pyproject.toml\` and source |\n| Deployment | Docker Compose/Nginx | \`compose/*\`, \`docker-compose.yml\` |\n| Tests | Node test runner, pytest, Go test, Playwright | source test inventory |\n\n## Service/package inventory\n\n${table(["Service", "Languages", "Source files", "Declared endpoints", "Tests", "Package evidence"], serviceMap.map((service) => [service.name, service.languages.join(", ") || "Config/SQL only", service.sourceFiles, service.endpoints.length, service.tests.length, service.packageEvidence.join(", ") || "—"]))}\n\n## Deployment boundary\n\nThe versioned source is this repository. The live Compose integration directory is \`/home/novius2/trading-stack\`. Drift is possible; screenshot/runtime evidence records the observed deployment, while file links resolve to the versioned source.\n\nSee [application-architecture.mmd](diagrams/application-architecture.mmd).\n`,
  "02_ROUTE_AND_PAGE_INDEX.md": `# Route and page index\n\n${sourceNote}\n\n${routeTable}\n\nRoutes that redirect are preserved as deep-link compatibility aliases. Parameterized routes require representative IDs/symbols for runtime capture; where none can be safely discovered, screenshot status is **UNVERIFIED**.\n`,
  "03_DATA_SOURCE_CATALOG.md": `# Data source catalog\n\n${sourceNote}\n\n${table(["Provider/system", "Code evidence count", "Runtime status"], dataSourceMap.map((d) => [d.provider, d.evidence.length, d.runtimeStatus]))}\n\nA provider keyword in source proves an integration surface exists; it does not prove the route currently uses it or that credentials/data are healthy. Follow each evidence entry in [data-source-map.json](evidence/data-source-map.json), then confirm with runtime source timestamps and service health.\n`,
  "04_API_CATALOG.md": `# API catalog\n\n${sourceNote}\n\nThe Express gateway globally applies \`Cache-Control: no-store\` and an authentication guard to \`/v1\` before registering analytical routes. Health, auth, selected public OIIS, and internal routes have separate boundaries. Service-local APIs may only be reachable through Compose networking/Nginx.\n\n${apiTable}\n\nDetailed machine-readable evidence: [api-map.json](evidence/api-map.json). Request/response schemas must be read from handler Zod models, TypeScript response types, FastAPI models, and OpenAPI documents; an endpoint without an explicit schema remains **UNVERIFIED** at the contract level.\n`,
  "05_DATABASE_AND_STORAGE.md": `# Database and storage\n\n${sourceNote}\n\nRepository rules identify PostgreSQL \`public.bars_1m\` and \`public.instruments\` as canonical market inputs for universal paper trading, while paper records live in the \`paper_trading\` schema. Other strategy and analytics schemas are defined by additive migrations below. Runtime update frequency cannot be inferred from DDL alone and is documented from workers/schedulers separately.\n\n${storageTable}\n\nBrowser storage, Redis keys, generated files, and service-specific stores are enumerated in the state/cache catalogs. Existing schema documentation is linked rather than overwritten.\n`,
  "06_DATA_LINEAGE.md": `# Data lineage\n\n${sourceNote}\n\n## Canonical UI path\n\n\`Route → React page → child component → hook/API client → authenticated gateway → route handler → service/query → PostgreSQL/provider → transformation/view model → chart/table/KPI\`\n\n## Evidence rules\n\n- A frontend endpoint reference is matched to the backend declaration in \`api-map.json\`.\n- SQL object names are matched to migrations in \`storage-map.json\`.\n- External-source references are evidence of adapters, not proof of current freshness.\n- Calculations performed directly in route handlers are catalogued as gateway-owned; Python/Go service calculations remain service-owned.\n- Values crossing paper actual/observed/hypothetical/simulated lanes must never be combined without an explicit bridge.\n\nSee the page dossiers and [data-lineage.mmd](diagrams/data-lineage.mmd).\n`,
  "07_CHART_AND_VISUALIZATION_CATALOG.md": `# Chart and visualization catalog\n\n${sourceNote}\n\n${chartTable}\n\nEach linked dossier identifies the source module, rendering library, pages, discovered titles, API references, interpretation boundary, and accuracy checks. Dynamic series/axes must be inspected in the linked option builder; they are not guessed by this generator.\n`,
  "08_METRIC_AND_CALCULATION_CATALOG.md": `# Metric and calculation catalog\n\n${sourceNote}\n\n## Core formulas requiring independent reconciliation\n\n| Metric | Formula/basis | Primary implementation evidence |\n| --- | --- | --- |\n| Percentage change | \((current - reference) / reference × 100\) when reference is non-zero | Heatmap/overview route helpers and view models |\n| Long unrealised P&L | \((mark - average entry) × open quantity\) before costs unless explicitly net | Paper workspace/service |\n| Short unrealised P&L | \((average entry - mark) × open quantity\) before costs unless explicitly net | Paper workspace/service |\n| Realised P&L | Direction-normalised exit less entry, quantity-weighted, then costs/tax where policy applies | Paper service ledger/economics |\n| MFE | Maximum direction-normalised favourable return/value within eligible observation window | Paper monitor/workspace |\n| MAE | Maximum direction-normalised adverse return/value within eligible observation window | Paper monitor/workspace |\n| Drawdown | Decline from prior running equity peak; verify absolute versus percentage basis | Backtesting/paper simulation services |\n| RSI | Implementation-specific Wilder/rolling convention; inspect indicator function and warm-up | Go/Python analytics functions |\n| ATR | True range aggregation with implementation-specific smoothing | Strategy/analytics functions |\n\n## Source-identifiable KPI/card records\n\n${table(["Metric label", "Renderer", "Value expression", "Page(s)", "Evidence"], metricMap.map((m) => [m.label, m.renderer, `\`${m.valueExpression}\``, m.pages.join(", ") || "Shared/indirect", `[${m.file}:${m.line}](${link(m.file, m.line)})`]))}\n\n## Evidence inventory\n\nSee [metric-map.json](evidence/metric-map.json) and [function-map.json](evidence/function-map.json). Every displayed metric still requires page-specific field mapping, denominator, eligibility, timestamp, gross/net basis, capital basis, precision, and missing-value behaviour. If any is absent, it is **UNVERIFIED**.\n`,
  "09_STRATEGY_ENGINE.md": `# Strategy engine\n\n${sourceNote}\n\nThe repository contains several independent strategy families rather than one engine: OIIS live selection, monthly/rolling variants, long options, NIFTY weekly options, F&O volatility signals, Go strategy commands, and backtesting-lab definitions. Their IDs must not be conflated merely because they share UI navigation.\n\n${table(["Candidate ID", "First code evidence"], strategyMap.slice(0, 300).map((s) => [s.id, `[${s.file}:${s.line}](${link(s.file, s.line)})`]))}\n\nThe list is intentionally labelled “candidate IDs”: static string extraction also finds scenario and schema identifiers. Human classification is required before calling any identifier an executable strategy. Entry timing, bar-close knowledge, fill timing, costs, warm-up, and look-ahead protection must be verified in the linked implementation and tests.\n\n## Add a new strategy in this repository\n\n1. Define a stable ID/version and point-in-time input contract in the owning service.\n2. Add entry/exit calculations and deterministic tests, including missing sessions and next-bar timing.\n3. Add additive PostgreSQL migrations for durable inputs/results when required.\n4. Register the service API in the Express gateway rather than exposing an internal container directly.\n5. Add typed web response models and API client functions.\n6. Register the route under Strategy without coupling it to OIIS or Paper Trading unless explicitly authorised.\n7. Add Playwright and reconciliation fixtures.\n8. Update OpenAPI and this audit evidence.\n`,
  "10_PAPER_TRADING_ENGINE.md": `# Paper trading engine\n\n${sourceNote}\n\n## Boundary\n\nUniversal paper execution is owned by \`services/paper_trading\`; the workbench aggregation is exposed by \`apps/api/src/routes/workspace.ts\`; the main UI is \`PaperTradingCommandCenter\`. Repository policy identifies \`public.bars_1m\` and \`public.instruments\` as canonical market inputs and the \`paper_trading\` schema as durable paper storage.\n\n## Primary flow\n\n\`trade intent → validation/idempotency → trade group/legs → paper fill/position events → monitoring → target/horizon observations → webhook/outbox → workspace aggregation → Evidence Workbench\`\n\n## Accounting separation\n\n- Actual execution, booked realised, and open marked values are ledger/execution concepts.\n- Intraday/swing/5D/30D MFE/MAE and target hits are observations.\n- Never-closed, stop-loss, fixed-capital, and scenario results are hypothetical/simulated.\n- The UI must not make these additive unless the backend explicitly supplies a compatible reconciliation.\n\n## Persistence and restart\n\nPaper records are PostgreSQL-backed, not browser-only. Worker restart should therefore preserve trades, while in-flight polling/retry timing may change. Verify exact idempotency and lease behaviour in service tests and scheduler/worker code.\n\n## Endpoint evidence\n\n${table(["Method", "Path", "Implementation"], apiMap.filter((a) => /paper|trade-quality|trade-groups|trade-intents|accounts|strategies/.test(a.path)).map((a) => [a.method, a.path, `[${a.file}:${a.line}](${link(a.file, a.line)})`]))}\n\nSee [paper-trading-flow.mmd](diagrams/paper-trading-flow.mmd) and the page dossier.\n`,
  "11_MARKET_DATA_PIPELINE.md": `# Market data pipeline\n\n${sourceNote}\n\nThe repository contains SmartAPI collector/WebSocket/archive code, PostgreSQL minute bars/instruments, NSE report ingestion, an NSE option-chain watcher, Yahoo historical adapters, and a market-data gateway. Which source wins is feature-specific.\n\n1. Collector/provider adapter receives ticks, bars, option-chain, or reports.\n2. Validation normalises symbol/time/session fields.\n3. Durable records are written to PostgreSQL or report artifacts.\n4. Analytical workers materialise snapshots/signals.\n5. Gateway routes query canonical tables/services.\n6. React Query polling or WebSocket updates the UI.\n\nSession-window suppression and unchanged-snapshot handling must be verified per collector. Corporate-action adjustment is provider/dataset-specific; never combine Yahoo split-adjusted OHLC with raw execution prices without labelling the basis.\n`,
  "12_HEATMAP_ENGINE.md": `# Heatmap engine\n\n${sourceNote}\n\nPrimary heatmap routes are \`/heatmap/change\`, \`/heatmap/rsi\`, and \`/heatmap/will\`; the Home board also renders a stock/sector canvas. Dedicated APIs are \`/v1/change-heatmap\`, \`/v1/rsi-surface\`, and \`/v1/will-surface\`.\n\nThe exact universe, previous-close source, latest price source, sector grouping, tile sizing, semantic scale, missing-state rules, and click behaviour are defined in the corresponding backend route and React visual component. See their chart dossiers and route files. A tile is not assumed live unless its source timestamp/freshness state confirms it.\n\nSample mathematical reconciliation is recorded in the Playwright/runtime audit and [accuracy catalog](16_ACCURACY_AND_DATA_QUALITY.md).\n`,
  "13_STATE_MANAGEMENT.md": `# State management\n\n${sourceNote}\n\n- TanStack React Query owns most server-state fetch, refresh, cache, and invalidation behaviour.\n- React context owns cross-cutting locale, shortcut, shell/auth, and navigation concerns.\n- Component-local React state owns filters, selected rows, chart modes, drawers, and forms unless URL-synchronised.\n- WebSocket state is maintained by hooks in \`apps/web/src/lib/hooks.ts\`.\n- Saved view/local storage use must be confirmed from each feature; absence of a persistence call means state is session-only.\n\nThe default hook refresh intervals range from 10 seconds to five minutes, with page-specific 20/30/60-second polling and 4-second polling for active backtest runs. This creates independent freshness clocks; the displayed source timestamp is more authoritative than request cadence.\n`,
  "14_FRONTEND_COMPONENT_MAP.md": `# Frontend component map\n\n${sourceNote}\n\n${componentTable}\n`,
  "15_CSS_AND_DESIGN_SYSTEM.md": `# CSS and design system\n\n${sourceNote}\n\nThe web application uses CSS modules plus global token and trading-v2 styles. Typography packages include Inter Variable, Hind, IBM Plex Mono, and Noto Sans Devanagari. Shared UI primitives and chrome are in \`apps/web/src/components/ui\`, \`components/chrome\`, and \`design-system\`.\n\n${table(["Stylesheet", "Classes", "Tokens"], cssMap.map((c) => [`[${c.file}](${link(c.file)})`, c.classCount, c.tokens.join(", ") || "—"]))}\n\nPositive/negative colour classes must be audited with their text/icon labels; colour alone is not treated as sufficient state evidence. Responsive behaviour is verified from viewport screenshots rather than inferred solely from media queries.\n`,
  "16_ACCURACY_AND_DATA_QUALITY.md": `# Accuracy and data quality\n\n${sourceNote}\n\n## Confidence rubric\n\n- **HIGH CONFIDENCE**: canonical source, explicit timestamp, deterministic formula, independent sample reconciliation, and tested missing/stale handling.\n- **MEDIUM CONFIDENCE**: source and formula traced, but independent reconciliation or point-in-time completeness is incomplete.\n- **LOW CONFIDENCE**: fallback/interpolation/current-universe bias/material missing history may affect results.\n- **UNVERIFIED**: a required source, timestamp, formula, or runtime state could not be proven.\n\n## Known evidence-backed risks\n\n1. Historical current-universe strategy analyses can contain survivorship bias without point-in-time universe membership.\n2. Yahoo split-adjusted research OHLC and raw broker/exchange execution values have different price bases.\n3. Multiple refresh intervals mean request freshness and data freshness are not equivalent.\n4. Any UI fallback that converts null/missing to zero can misstate neutrality; occurrences require manual review.\n5. MFE is an observed extreme, not necessarily an executable fill.\n6. Same-bar conditions must not be paired with an earlier open fill; strategy-specific timing tests are required.\n\n## Sample validation table\n\nRuntime calculation samples are written by the audit to \`evidence/calculation-validation.json\`. Until populated, the result is **UNVERIFIED**, not PASS.\n`,
  "17_REFRESH_CACHE_AND_REALTIME.md": `# Refresh, cache and realtime\n\n${sourceNote}\n\nThe web layer combines React Query polling, page-owned intervals, prefetch, and WebSocket streaming. The Express gateway applies \`Cache-Control: no-store\` to authenticated \`/v1\` responses, while server-side snapshot registry materialisation has its own freshness windows. Redis supports shared state/streaming infrastructure.\n\nPoll cadence is not source cadence. Every page should expose the source \`asOf\`/trade timestamp and stale state independently of transport health. Browser backgrounding, WebSocket reconnect, missed sequence recovery, and duplicate snapshot suppression require feature-specific verification.\n`,
  "18_ERROR_HANDLING.md": `# Error handling\n\n${sourceNote}\n\nThe shared API client throws \`API <status>: <body>\`, emits an authentication-required browser event on 401/403, and records analytics errors/slow requests. Pages vary in whether they show an error surface, retain previous React Query data, or render an empty state.\n\nRuntime evidence records console errors and failed \`/v1\`/auth requests per route. A caught error that renders zero or an empty chart without an explicit unavailable state is a data-trust defect and must be classified in known gaps.\n`,
  "19_SECURITY_AND_AUTH.md": `# Security and authentication\n\n${sourceNote}\n\nThe gateway uses session authentication, CSRF endpoints for state-changing web calls, rate limiting on login/feedback, Helmet, CORS configuration, and a global guard for \`/v1\`. Admin/control-plane checks must be verified both in UI and backend handlers; client-only hiding is not authorization.\n\nNo secret values are reproduced here. Repository scans must distinguish example variable names from committed credentials. Runtime audit uses an existing authorised development-login path and never bypasses the auth guard.\n`,
  "20_TEST_COVERAGE.md": `# Test coverage\n\n${sourceNote}\n\nNo coverage percentage is claimed because coverage instrumentation was not run.\n\n${table(["Test file", "Framework"], testMap.map((t) => [`[${t.file}](${link(t.file)})`, t.framework]))}\n\nMissing-test priorities are documented in [recommended test cases](26_RECOMMENDED_TEST_CASES.md).\n`,
  "21_KNOWN_GAPS_AND_TECHNICAL_DEBT.md": `# Known gaps and technical debt\n\n${sourceNote}\n\nThis file is intentionally conservative. Automated keyword hits are leads, not defects. They are available in [mock-placeholder-map.json](evidence/mock-placeholder-map.json).\n\n| Severity | Finding | Evidence | Impact | Recommended verification/correction |\n| --- | --- | --- | --- | --- |\n| P1 | Versioned source and live integration directory can drift | Repository rule and separate live Compose path | Documentation may describe code not currently deployed | Record image identity and runtime screenshots with every audit |\n| P1 | Point-in-time universe membership is not proven for all retrospective strategy results | Existing strategy evidence/caveat | Survivorship bias can inflate or alter historical candidates | Add dated constituent membership and rerun cohorts |\n| P1 | Source-price adjustment basis varies by feature | Yahoo adjusted research plus raw market/execution sources | Cross-feature price comparisons may be inconsistent | Expose price basis and corporate-action handling per metric |\n| P2 | Endpoint response contracts are not uniformly represented in one OpenAPI source | Express, FastAPI, and service-local specs | Contract drift and incomplete client validation | Generate/validate a merged, versioned contract |\n| P2 | Polling cadences are distributed across shared hooks and pages | Hook/page intervals | Inconsistent load and freshness semantics | Centralise cadence policy while retaining source timestamps |\n\nAdditional P0/P1 findings are appended only when runtime or independent calculations provide direct evidence.\n`,
  "22_END_TO_END_TRACEABILITY.md": `# End-to-end traceability\n\n${sourceNote}\n\n${table(["Page", "UI component", "Frontend API", "Backend evidence", "Storage/provider", "Screenshot"], pageMap.map((p) => [p.route, p.component, p.apiDependencies.flatMap((d) => d.endpoints).join(", ") || "Imported child/hook", p.apiDependencies.flatMap((d) => d.endpoints).map((ep) => apiMap.find((a) => a.path === ep)?.file).filter(Boolean).join(", ") || "Trace manually", "See endpoint query and data-source map", `screenshots/*/${p.slug}__*__full.png`]))}\n`,
  "23_GLOSSARY.md": `# Glossary\n\n${sourceNote}\n\n| Term | Repository-specific meaning |\n| --- | --- |\n| D0 | Entry trading session; not necessarily calendar day zero after timestamp conversion |\n| D+5 / five-session | Five eligible trading sessions, not five calendar days |\n| D+30 / thirty-session | Thirty eligible trading sessions unless a feature explicitly states calendar days |\n| MFE | Maximum favourable excursion in the stated direction/window |\n| MAE | Maximum adverse excursion in the stated direction/window |\n| Booked | Governed execution result persisted as realised |\n| Open actual | Current marked result on remaining execution quantity |\n| Observed | Analytical path/target evidence; not automatically booked |\n| Hypothetical | Counterfactual outcome under a stated rule |\n| Simulated | Portfolio/capital model result |\n| OIIS | Independent strategy family using opportunity/institutional/execution evidence as defined by its policy |\n| Freshness | Age of the underlying source value, distinct from transport connectivity |\n`,
  "24_SCREENSHOT_INDEX.md": `# Screenshot index\n\n${sourceNote}\n\nThe authoritative index is generated after capture at [screenshot-map.json](evidence/screenshot-map.json). Expected full-page captures are linked from every page dossier. Runtime failures remain in \`runtime-audit.json\` and are never relabelled as screenshots.\n`,
  "25_PLAYWRIGHT_AUDIT.md": `# Playwright audit\n\n${sourceNote}\n\nRun from repository root:\n\n\`\`\`bash\nPLAYWRIGHT_ORIGIN=http://127.0.0.1:19090 \\\nPLAYWRIGHT_ADMIN_PASSWORD_FILE=/home/novius2/trading-stack/.env \\\nnode tests/documentation-audit/capture-all-pages.mjs\n\`\`\`\n\nThe script uses the existing authorised dev-login endpoint, captures all canonical static routes at 1920×1080, 1440×900, 1024×768, and 390×844, records response status, console errors, failed API requests, title/headings, overflow, and screenshot paths. Parameterized routes are resolved from deterministic representative defaults or marked **UNVERIFIED**.\n`,
  "26_RECOMMENDED_TEST_CASES.md": `# Recommended test cases\n\n${sourceNote}\n\n## P0/P1 calculation reconciliation\n\n1. Long/short realised and unrealised P&L with partial exits, charges, and stale marks.\n2. Intraday target ordering and impossibility checks (higher threshold cannot precede a lower threshold for the same continuous price path without missing-data evidence).\n3. Swing/5D/30D inclusion and freeze boundaries using exchange sessions.\n4. MFE/MAE from raw bars for long and short trades.\n5. Paper idempotency for duplicate intent/command delivery.\n6. Same-bar versus next-bar strategy execution to prevent look-ahead.\n7. Corporate-action adjusted historical calculations.\n8. Heatmap percentage change against canonical previous close/current mark.\n9. Backtest equity/drawdown/trade reconciliation.\n10. Direct API authorization and role enforcement.\n\n## UI/realtime\n\nTest every canonical route for authenticated loading, explicit stale/missing/error states, no body overflow, keyboard access, 200% zoom, WebSocket reconnect, polling cleanup, and focus stability.\n`
};

for (const [name, contents] of Object.entries(masterDocs)) await fs.writeFile(path.join(outRoot, name), contents);

const functionGroups = [
  ["frontend-functions.md", (f) => f.file.includes("apps/web/")],
  ["backend-functions.md", (f) => f.file.includes("apps/api/") || f.file.includes("services/")],
  ["strategy-functions.md", (f) => /strategy|oiis|rolling|backtest|option/i.test(f.file)],
  ["trading-functions.md", (f) => /paper|trade|order|position|portfolio/i.test(f.file + f.name)],
  ["calculation-functions.md", (f) => /calculate|compute|derive|aggregate|score|pnl|mfe|mae|drawdown|indicator|rsi|atr|vwap/i.test(f.name)]
];
for (const [name, predicate] of functionGroups) {
  const rows = functionMap.filter(predicate);
  await fs.writeFile(path.join(outRoot, "functions", name), `# ${name.replace(/\.md$/, "").replaceAll("-", " ")}\n\n${sourceNote}\n\n${table(["Function", "Language", "Signature", "Evidence"], rows.map((f) => [f.name, f.language, `\`${f.signature}\``, `[${f.file}:${f.line}](${link(f.file, f.line)})`]))}\n\nFor each function, inspect callers/callees with \`rg\`, then record inputs, outputs, side effects, error handling, tests, and accuracy assumptions before modification. This inventory deliberately excludes trivial generated/framework functions.\n`);
}

await fs.writeFile(path.join(outRoot, "api/endpoints.md"), `# Endpoint evidence\n\n${sourceNote}\n\n${apiTable}`);
await fs.writeFile(path.join(outRoot, "api/websocket-streams.md"), `# WebSocket and stream evidence\n\n${sourceNote}\n\nThe canonical browser WebSocket hook is in \`neon-stock-terminal/apps/web/src/lib/hooks.ts\`; the gateway server is \`apps/api/src/ws/stream.ts\`. Authentication, origin validation, subscription parsing, snapshot delivery, heartbeats, and reconnect logic must be read together. Additional Discord and market-provider streams are separate operational channels.\n`);
await fs.writeFile(path.join(outRoot, "api/external-providers.md"), `# External providers\n\n${sourceNote}\n\n${table(["Provider", "Evidence"], dataSourceMap.map((d) => [d.provider, d.evidence.slice(0, 20).map((e) => `[${e.file}:${e.line}](${link(e.file, e.line)})`).join("<br>") || "No code evidence"]))}`);

const diagrams = {
  "application-architecture.mmd": `flowchart TB\n  Browser[Authenticated React/Vite browser] --> Nginx[N50 Nginx base-path gateway]\n  Nginx --> API[Express TypeScript API]\n  API --> PG[(PostgreSQL 16)]\n  API --> Redis[(Redis)]\n  API --> Paper[Paper Trading FastAPI/workers]\n  API --> OIIS[OIIS Live service]\n  API --> Monthly[Monthly and Rolling service]\n  API --> Deriv[Derivatives services]\n  Collector[Go SmartAPI collector] --> PG\n  NSE[NSE ingestors and option watcher] --> PG\n  Yahoo[Yahoo historical adapter] --> PG\n  Paper --> PG\n  API --> WS[WebSocket stream]\n  WS --> Browser\n`,
  "frontend-backend-flow.mmd": `sequenceDiagram\n  participant U as User\n  participant W as React page\n  participant Q as Query/API client\n  participant G as Express gateway\n  participant D as PostgreSQL/service\n  U->>W: Open route or select control\n  W->>Q: Fetch typed view model\n  Q->>G: Authenticated HTTP request\n  G->>D: Query or service call\n  D-->>G: Canonical rows/result\n  G-->>Q: JSON plus timestamps/state\n  Q-->>W: Cached server state\n  W-->>U: KPI, chart, table, or explicit error\n`,
  "market-data-flow.mmd": `flowchart LR\n  Providers[SmartAPI NSE Yahoo reports] --> Adapters[Collectors and provider adapters]\n  Adapters --> Validate[Symbol session timestamp validation]\n  Validate --> Store[(PostgreSQL and artifacts)]\n  Store --> Workers[Analytics and strategy workers]\n  Workers --> Snapshots[Snapshots and API view models]\n  Snapshots --> UI[Charts tables heatmaps]\n`,
  "paper-trading-flow.mmd": `flowchart LR\n  Strategy[Authorised strategy/manual intent] --> Validate[Validate idempotency and PAPER boundary]\n  Validate --> Group[Trade group and legs]\n  Group --> Fill[Paper fill simulation]\n  Fill --> Ledger[(Paper ledger)]\n  Ledger --> Monitor[Target and horizon monitor]\n  Monitor --> Events[Events webhook outbox]\n  Ledger --> Workspace[Paper workspace aggregation]\n  Monitor --> Workspace\n  Workspace --> UI[Evidence Workbench]\n`,
  "strategy-flow.mmd": `flowchart LR\n  Inputs[Point-in-time market inputs] --> Gates[Versioned strategy gates]\n  Gates --> Signal[Timestamped signal]\n  Signal --> Entry[Permitted next/same-bar entry rule]\n  Entry --> Path[MFE MAE targets exits]\n  Path --> Results[Backtest or live evidence]\n  Results --> API[Strategy API]\n  API --> UI[Strategy dashboard]\n`,
  "data-lineage.mmd": `flowchart TB\n  Visible[Visible number] --> Component[React component prop/state]\n  Component --> Client[Hook/API client]\n  Client --> Endpoint[Authenticated endpoint]\n  Endpoint --> Helper[Handler/service/calculation]\n  Helper --> Store[(Table/view/file)]\n  Store --> Provider[Exchange broker or historical provider]\n  Helper --> Visible\n`,
  "chart-rendering-flow.mmd": `flowchart LR\n  API[Typed API response] --> Adapter[Page view model/series builder]\n  Adapter --> Options[ECharts option or SVG props]\n  Options --> Chart[Rendered chart]\n  Chart --> Tooltip[Tooltip/selection]\n  Chart --> Inspector[Table or detail inspector]\n`,
  "authentication-flow.mmd": `sequenceDiagram\n  participant B as Browser\n  participant A as Auth routes\n  participant S as Session store\n  participant V as Protected v1 route\n  B->>A: Login token or authorised dev login\n  A->>S: Validate and create session\n  A-->>B: Secure session cookie\n  B->>V: Request with credentials\n  V->>S: Authenticate and authorize\n  V-->>B: Data or 401/403\n`
};
for (const [name, contents] of Object.entries(diagrams)) await fs.writeFile(path.join(outRoot, "diagrams", name), contents);

console.log(JSON.stringify({ outRoot, generatedAt, routes: routeRecords.length, canonicalPages: pageMap.length, endpoints: apiMap.length, backendServices: serviceMap.length, components: componentMap.length, metrics: metricMap.length, charts: chartMap.length, functions: functionMap.length, storageObjects: storageMap.length, strategies: strategyMap.length, tests: testMap.length }, null, 2));
