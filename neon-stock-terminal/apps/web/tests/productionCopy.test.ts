import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const source = new URL("../src/", import.meta.url).pathname;
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : /\.tsx$/.test(entry.name) && !entry.name.includes('.stories.') ? [join(dir, entry.name)] : []);
}
test("production components do not contain reviewed prompt residue", () => {
 const forbidden = ["One short teaching note beginning with", "For demonstration purposes", "arbitrary browser-side code", "Collector retries are bounded", "This page is intentionally redundant"];
 for (const file of files(source)) {
  const text = readFileSync(file, "utf8");
  for (const phrase of forbidden) assert.ok(!text.includes(phrase), `${file}: ${phrase}`);
 }
});
test("route pages use the shell's single main landmark", () => {
 for (const file of files(join(source, 'pages'))) assert.doesNotMatch(readFileSync(file, 'utf8'), /<main[\s>]/, file);
});
