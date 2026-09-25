#!/usr/bin/env node
// Peso del JavaScript que descarga una página (gzip), medido en un navegador real.
// Uso: node scripts/bundle-size.mjs <baseUrl> <ruta> [límite en kB, por defecto 250]
// Suma los scripts propios que pide la página al cargar (sin analítica externa)
// y comprime cada uno con gzip nivel 9 para no depender del servidor.
import zlib from "node:zlib";
import { chromium } from "@playwright/test";

const [base, route = "/cotizar", limitArg] = process.argv.slice(2);
if (!base) {
  process.stderr.write("uso: node scripts/bundle-size.mjs <baseUrl> <ruta> [límiteKB]\n");
  process.exit(2);
}
const LIMIT_KB = Number(limitArg ?? 250);
const url = new URL(route, base);

const browser = await chromium.launch();
const page = await browser.newPage();
const scripts = new Map();
page.on("response", async (response) => {
  const req = response.request();
  if (req.resourceType() !== "script" || new URL(req.url()).origin !== url.origin) return;
  try {
    scripts.set(req.url(), await response.body());
  } catch {
    // respuesta sin cuerpo (redirección o caché)
  }
});
await page.goto(url.toString(), { waitUntil: "networkidle" });
await browser.close();

let raw = 0;
let gz = 0;
const rows = [];
for (const [src, body] of scripts) {
  const size = zlib.gzipSync(body, { level: 9 }).length;
  raw += body.length;
  gz += size;
  rows.push([size, new URL(src).pathname]);
}
rows.sort((a, b) => b[0] - a[0]);
const kb = (n) => (n / 1024).toFixed(1);
for (const [size, path] of rows.slice(0, 8)) process.stdout.write(`  ${kb(size).padStart(7)} kB  ${path}\n`);
process.stdout.write(`${url.pathname}: ${scripts.size} scripts, ${kb(raw)} kB sin comprimir, ${kb(gz)} kB gzip (límite ${LIMIT_KB} kB)\n`);
process.exit(gz / 1024 > LIMIT_KB ? 1 : 0);
