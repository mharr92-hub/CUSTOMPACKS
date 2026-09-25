#!/usr/bin/env node
// Revisa que el código que baja al navegador no lleve secretos (OWASP A02/A05).
// Uso, después de `pnpm build`:  node scripts/check-client-secrets.mjs [distDir]
// Busca en los .js/.css/.html públicos del build:
//   - los nombres de las variables secretas del servidor;
//   - sus valores, si están definidos en el entorno (8 caracteres o más);
//   - la clave de desarrollo de sesiones y cadenas típicas de credenciales.
// Sale con código 1 si encuentra algo.
import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.argv[2] ?? process.env.NEXT_DIST_DIR ?? ".next");
const roots = [path.join(distDir, "static"), path.join(distDir, "server", "app")];

const SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "RESEND_API_KEY",
  "AUTH_SECRET",
  "CRON_SECRET",
  "TURNSTILE_SECRET_KEY",
  "SENTRY_AUTH_TOKEN",
];
const needles = [
  ...SECRET_NAMES.map((name) => ({ label: `nombre ${name}`, value: name })),
  ...SECRET_NAMES.flatMap((name) => {
    const value = process.env[name]?.trim();
    return value && value.length >= 8 ? [{ label: `valor de ${name}`, value }] : [];
  }),
  { label: "clave de sesión de desarrollo", value: "dev-only-insecure-secret" },
  { label: "cadena de conexión a Postgres", value: "postgres://" },
  { label: "clave de Resend", value: "re_" + "live" },
];

/** Archivos que llegan al navegador: estáticos y HTML/RSC prerenderizados. */
function* publicFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* publicFiles(full);
    else if (dir.includes(`${path.sep}static`) ? /\.(js|css|json)$/.test(entry.name) : /\.(html|rsc)$/.test(entry.name)) yield full;
  }
}

if (!fs.existsSync(path.join(distDir, "static"))) {
  process.stderr.write(`No hay build en ${distDir}. Corre primero \`pnpm build\`.\n`);
  process.exit(2);
}

let files = 0;
const findings = [];
for (const root of roots) {
  for (const file of publicFiles(root)) {
    files += 1;
    const text = fs.readFileSync(file, "utf8");
    for (const n of needles) if (text.includes(n.value)) findings.push(`${path.relative(distDir, file)}: ${n.label}`);
  }
}

if (findings.length) {
  process.stderr.write(`Secretos en archivos públicos del build:\n${findings.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Sin secretos en ${files} archivos públicos del build (${needles.length} patrones revisados).\n`);
