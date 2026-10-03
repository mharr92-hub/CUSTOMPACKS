#!/usr/bin/env node
// `pnpm run doctor` (pnpm tiene su propio "pnpm doctor"): qué variable o servicio falta y qué deja de funcionar sin él,
// en una pantalla. No usa la red ni la base: solo lee las variables.
// Uso:
//   pnpm run doctor                                   variables de .env.local / .env
//   pnpm run doctor --produccion                      exige lo necesario para producción
//   pnpm run doctor --env .env.production --produccion  revisa un archivo antes de pegarlo en Vercel
// Sale con código 1 si hay errores (✘). Detalle en docs/deploy.md.
import fs from "node:fs";
import path from "node:path";
import { diagnose, STATUS_ICON } from "./lib/doctor-rules.mjs";
import { ROOT, loadEnvFiles } from "./lib/pg-local.mjs";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
let env = process.env;
let source = ".env.local / .env / entorno";
if (envIndex >= 0) {
  const file = path.resolve(ROOT, args[envIndex + 1] ?? "");
  if (!fs.existsSync(file)) {
    process.stderr.write(`No existe ${file}\n`);
    process.exit(2);
  }
  const { parse } = await import("dotenv");
  env = parse(fs.readFileSync(file));
  source = path.relative(ROOT, file);
} else {
  await loadEnvFiles();
}
const production = args.includes("--produccion") || env.VERCEL_ENV === "production";

const findings = diagnose(env, { production });
const width = Math.max(...findings.map((f) => f.service.length)) + 2;
const out = (m) => process.stdout.write(`${m}\n`);
out(`ProvenPack · diagnóstico de ${production ? "producción" : "entorno local"} (${source})\n`);
for (const f of findings) {
  const line = `${STATUS_ICON[f.status]} ${f.service.padEnd(width)}${f.detail}`;
  out(f.impact && f.status !== "ok" ? `${line}\n${" ".repeat(width + 2)}→ ${f.impact}` : line);
}
const errors = findings.filter((f) => f.status === "error").length;
const warns = findings.filter((f) => f.status === "warn").length;
const missing = findings.filter((f) => f.status === "missing").length;
out(`\n${errors} errores, ${warns} avisos, ${missing} sin configurar. ✔ listo · ! revisar · · falta (opcional o simulado) · ✘ impide operar`);
if (!production) out("Para revisar lo que vas a pegar en Vercel: pnpm run doctor --env .env.production --produccion");
process.exit(errors ? 1 : 0);
