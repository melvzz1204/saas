import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync, cpSync, existsSync } from "fs";

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

// Classic (non-module) `<script src="/src/...">` tags are NOT processed or
// bundled by Vite — it only rewrites `<script type="module">`. The classic
// scripts (apiBase.js, toast.js, nav.js, dashboardUI.js, the page controllers,
// paymongoCheckout.js, ...) deliberately run in the global scope and rely on
// classic load order, so they can't just be converted to modules. The dev
// server serves them straight from src/, but a production build never copies
// src/ into dist/ — so every one of those URLs 404s once deployed.
//
// Mirror the referenced source folders into dist/src/ after the bundle is
// written so the original /src/... paths resolve in production. None of these
// files use ES import/export, so they run correctly as raw classic scripts.
function copyClassicSources() {
  const FOLDERS = ["src/util", "src/pages", "src/components"];
  return {
    name: "copy-classic-sources",
    apply: "build",
    closeBundle() {
      for (const rel of FOLDERS) {
        const from = resolve(root, rel);
        if (!existsSync(from)) continue;
        cpSync(from, resolve(root, "dist", rel), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [copyClassicSources()],
  build: {
    rollupOptions: {
      input: htmlInputs(),
    },
  },
});
