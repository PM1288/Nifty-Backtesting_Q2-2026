#!/usr/bin/env node
/** Structural validation for generated documentation and evidence. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docsRoot = path.join(repoRoot, "docs/trading-app-audit");
async function walk(dir) {
  const rows = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...await walk(full)); else rows.push(full);
  }
  return rows;
}
const files = await walk(docsRoot);
const markdown = files.filter((file) => file.endsWith(".md"));
const jsonFiles = files.filter((file) => file.endsWith(".json"));
const mermaid = files.filter((file) => file.endsWith(".mmd"));
const failures = [];
for (const file of jsonFiles) {
  try { JSON.parse(await fs.readFile(file, "utf8")); } catch (error) { failures.push({ type: "INVALID_JSON", file, message: String(error) }); }
}
for (const file of mermaid) {
  const text = await fs.readFile(file, "utf8");
  if (!/^(?:flowchart|sequenceDiagram|graph|stateDiagram)/.test(text.trim())) failures.push({ type: "INVALID_MERMAID_HEADER", file });
}
for (const file of markdown) {
  const text = await fs.readFile(file, "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split("#")[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const targetPath = target.startsWith("/") ? target : path.resolve(path.dirname(file), target);
    try { await fs.access(targetPath); } catch { failures.push({ type: "BROKEN_LINK", file, target }); }
  }
}
const pageMap = JSON.parse(await fs.readFile(path.join(docsRoot, "evidence/page-map.json"), "utf8"));
const runtime = JSON.parse(await fs.readFile(path.join(docsRoot, "evidence/runtime-audit.json"), "utf8"));
for (const page of pageMap) {
  for (const viewport of ["1920x1080", "1440x900", "1024x768", "390x844"]) {
    if (!runtime.some((row) => row.routePattern === page.route && row.viewport === viewport)) failures.push({ type: "MISSING_RUNTIME_CAPTURE", route: page.route, viewport });
  }
}
const result = { markdownFiles: markdown.length, jsonFiles: jsonFiles.length, mermaidFiles: mermaid.length, totalFiles: files.length, failures };
await fs.writeFile(path.join(docsRoot, "evidence/documentation-validation.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, failures: failures.length }, null, 2));
if (failures.length) process.exitCode = 1;
