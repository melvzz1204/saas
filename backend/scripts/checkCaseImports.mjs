// TEMPORARY diagnostic script — scans all relative imports under src/
// for (a) missing files and (b) case-mismatched paths (Windows-only bugs
// that break on Linux/Render because the FS is case-sensitive).
// Usage: node scripts/checkCaseImports.mjs
import fs from "fs";
import path from "path";

const ROOT = path.resolve("src");
const missing = [];
const mismatches = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js")) checkFile(full);
  }
}

function checkFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const re =
    /(?:import\s+[^'"]+?\s+from\s*|import\s*|require\s*\()\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue; // external package / builtin
    const fromDir = path.dirname(file);
    const target = path.resolve(fromDir, spec);
    if (!fs.existsSync(target)) {
      missing.push(
        `${file}\n    import "${spec}" -> ${target}  (FILE DOES NOT EXIST)`,
      );
      continue;
    }
    // Case-sensitivity check: walk each path segment against the real dir listing
    const rel = path.relative(fromDir, target);
    const parts = rel.split(path.sep);
    let current = fromDir;
    for (const part of parts) {
      let entries;
      try {
        entries = fs.readdirSync(current);
      } catch {
        missing.push(`${file}\n    import "${spec}" -> cannot list ${current}`);
        break;
      }
      const exact = entries.find((e) => e === part);
      if (!exact) {
        const fuzzy = entries.find(
          (e) => e.toLowerCase() === part.toLowerCase(),
        );
        const found = fuzzy || "(not found)";
        mismatches.push(
          `${file}\n    import "${spec}" -> segment "${part}" does not match on-disk "${found}"`,
        );
        break;
      }
      current = path.join(current, exact);
    }
  }
}

walk(ROOT);

console.log("===== MISSING FILES =====");
console.log(missing.length ? missing.join("\n") : "none");
console.log("\n===== CASE MISMATCHES =====");
console.log(mismatches.length ? mismatches.join("\n") : "none");
