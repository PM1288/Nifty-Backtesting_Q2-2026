import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const sourceRoots = [
  path.join(repoRoot, "neon-stock-terminal", "apps"),
  path.join(repoRoot, "services")
];

const textExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html"]);
const bannedPatterns = [
  { label: "getUserMedia", pattern: /\bgetUserMedia\b/ },
  { label: "mediaDevices", pattern: /\bmediaDevices\b/ },
  { label: "enumerateDevices", pattern: /\benumerateDevices\b/ },
  { label: "facingMode", pattern: /\bfacingMode\b/ },
  { label: "navigator.permissions", pattern: /\bnavigator\.permissions\b/ },
  { label: "webcam", pattern: /\bwebcam\b/i },
  { label: "video capture", pattern: /\bvideo\s+capture\b/i },
  { label: "video input", pattern: /\bvideo\s+input\b/i }
];

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "output",
  ".turbo",
  ".next"
]);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (textExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  const violations = [];

  for (const root of sourceRoots) {
    const files = await walk(root);
    for (const file of files) {
      const content = await fs.readFile(file, "utf8");
      for (const { label, pattern } of bannedPatterns) {
        if (pattern.test(content)) {
          violations.push({
            file: path.relative(repoRoot, file),
            label
          });
        }
      }
    }
  }

  const canonicalNginxPath = path.join(repoRoot, "compose", "nginx", "nginx.conf");
  const nginxConfig = await fs.readFile(canonicalNginxPath, "utf8");
  const hasCameraDeny =
    nginxConfig.includes('Permissions-Policy "camera=()') ||
    nginxConfig.includes("Permissions-Policy 'camera=()");

  if (!hasCameraDeny) {
    violations.push({
      file: path.relative(repoRoot, canonicalNginxPath),
      label: "missing camera=() deny policy"
    });
  }

  if (violations.length) {
    console.error("Camera guardrail failed:");
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.label}`);
    }
    process.exit(1);
  }

  console.log("Camera guardrail passed: no camera APIs detected and nginx still denies camera by policy.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
