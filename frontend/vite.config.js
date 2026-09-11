import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync } from "fs";

const root = dirname(fileURLToPath(import.meta.url));

// Experimental / scratch pages we don't want in the production bundle.
const EXCLUDED = new Set(["probe-reg.html", "probe2-realflow.html"]);

// Build a multi-page input map. Without this, `vite build` only emits index.html
// and every other page (dashboards, logins, and the per-clinic landing template
// files under /clinic-templates) would be missing from production builds.
function htmlInputs() {
  const inputs = {};

  // Root-level pages.
  for (const file of readdirSync(root)) {
    if (file.endsWith(".html") && !EXCLUDED.has(file)) {
      inputs[file.replace(/\.html$/, "")] = resolve(root, file);
    }
  }

  // Per-clinic landing TEMPLATES. Keys keep the subfolder so the emitted files
  // land at dist/clinic-templates/<name>.html, matching what the loader
  // (clinicHomePage.html) redirects to.
  const tplDir = resolve(root, "clinic-templates");
  for (const file of readdirSync(tplDir)) {
    if (file.endsWith(".html")) {
      inputs[`clinic-templates/${file.replace(/\.html$/, "")}`] = resolve(tplDir, file);
    }
  }

  return inputs;
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: htmlInputs(),
    },
  },
});
