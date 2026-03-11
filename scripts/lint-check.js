const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = process.cwd();
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "hrms-next-sidebar"]);

function collectJsFiles(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collectJsFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
}

const jsFiles = [];
collectJsFiles(ROOT, jsFiles);
jsFiles.sort();

let hasError = false;
for (const file of jsFiles) {
  const rel = path.relative(ROOT, file);
  const res = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (res.status !== 0) {
    hasError = true;
    console.error(`Syntax check failed: ${rel}`);
  }
}

if (hasError) {
  process.exit(1);
}

console.log(`Syntax check passed for ${jsFiles.length} JavaScript files.`);
