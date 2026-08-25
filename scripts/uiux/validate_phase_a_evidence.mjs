import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const docs = path.join(root, "docs/uiux");
const routeManifest = JSON.parse(await fs.readFile(path.join(docs, "route-visual-preservation-manifest.json"), "utf8"));
const fieldManifest = JSON.parse(await fs.readFile(path.join(docs, "field-preservation-manifest.json"), "utf8"));
const failures = [];

if (routeManifest.summary.canonicalRoutes !== 56) failures.push(`expected 56 canonical routes, found ${routeManifest.summary.canonicalRoutes}`);
if (routeManifest.summary.backlogItems !== 198) failures.push(`expected 198 backlog items, found ${routeManifest.summary.backlogItems}`);
if (routeManifest.routes.length !== routeManifest.summary.canonicalRoutes) failures.push("route summary does not match route records");
if (new Set(routeManifest.routes.map((item) => item.route)).size !== routeManifest.routes.length) failures.push("duplicate canonical routes");
if (routeManifest.routes.some((item) => item.route === "*")) failures.push("wildcard error route classified as a canonical page");
if (fieldManifest.routes.length !== 56) failures.push(`expected 56 field route records, found ${fieldManifest.routes.length}`);
const paper = fieldManifest.routes.find((item) => item.route === "/paper-trading");
if (!paper) failures.push("paper-trading field record missing");
else if ((paper.paperTradingCanonicalFields ?? []).length !== 37) failures.push("paper-trading canonical 37-field inventory missing");
for (const file of ["README.md", "implementation-plan.md", "open-source-licence-manifest.md", "duplication-and-consolidation-baseline.json"]) {
  try { await fs.access(path.join(docs, file)); } catch { failures.push(`${file} missing`); }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, canonicalRoutes: 56, backlogItems: 198, paperFields: 37 }, null, 2));
