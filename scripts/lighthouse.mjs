#!/usr/bin/env node
// Auditoría Lighthouse móvil. Uso:
//   node scripts/lighthouse.mjs <baseUrl> <ruta> [ruta…]
// Falla (exit 1) si rendimiento, SEO o accesibilidad quedan por debajo de LH_MIN (90).
// Usa el Chromium de Playwright; no necesita Chrome instalado.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const [base, ...paths] = process.argv.slice(2);
if (!base || paths.length === 0) {
  process.stderr.write("uso: node scripts/lighthouse.mjs <baseUrl> <ruta> [ruta…]\n");
  process.exit(2);
}
const MIN = Number(process.env.LH_MIN ?? 90);
const outDir = path.resolve(".data/lighthouse");
fs.mkdirSync(outDir, { recursive: true });

const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ["--headless=new", "--no-sandbox"],
});
let failed = false;
try {
  for (const p of paths) {
    const url = new URL(p, base).toString();
    const result = await lighthouse(url, {
      port: chrome.port,
      output: ["html", "json"],
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    });
    if (!result) throw new Error(`sin resultado para ${url}`);
    const { lhr, report } = result;
    const file = path.join(outDir, `${p.replace(/[^a-z0-9]+/gi, "_") || "home"}.html`);
    fs.writeFileSync(file, Array.isArray(report) ? report[0] : report);
    if (Array.isArray(report) && report[1]) fs.writeFileSync(file.replace(/.html$/, ".json"), report[1]);
    const scores = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)]));
    const lcp = lhr.audits["largest-contentful-paint"]?.displayValue;
    const cls = lhr.audits["cumulative-layout-shift"]?.displayValue;
    const tbt = lhr.audits["total-blocking-time"]?.displayValue;
    process.stdout.write(`${p}  ${JSON.stringify(scores)}  LCP ${lcp}  TBT ${tbt}  CLS ${cls}\n`);
    for (const key of ["performance", "seo", "accessibility"]) {
      if ((scores[key] ?? 0) < MIN) {
        failed = true;
        const audits = Object.values(lhr.audits)
          .filter((a) => a.score !== null && a.score < 0.9 && lhr.categories[key]?.auditRefs.some((r) => r.id === a.id && r.weight > 0))
          .map((a) => `    - ${a.id}: ${a.displayValue ?? a.title}`);
        process.stdout.write(`  ✗ ${key} ${scores[key]} < ${MIN}\n${audits.join("\n")}\n`);
      }
    }
  }
} finally {
  // En Windows chrome-launcher a veces no puede borrar su carpeta temporal: no es un fallo de la auditoría.
  try {
    await chrome.kill();
  } catch {
    // ignorar
  }
}
process.exit(failed ? 1 : 0);
