#!/usr/bin/env node
// `pnpm supabase:preview`: prepara el proyecto de Supabase **Free** para los
// previews de Vercel (docs/deploy.md, "Previews"). Por defecto solo muestra el
// plan y no toca nada; con --ejecutar lo hace de verdad.
//
// Necesita (en .env.local o el entorno):
//   SUPABASE_ACCESS_TOKEN   token personal (supabase.com → Account → Access Tokens; gratis)
//   SUPABASE_ORG            organización (slug) si tienes más de una
//   PREVIEW_SITE_URL        URL estable de los previews, p. ej. https://custompacks-git-main-<equipo>.vercel.app
//   ADMIN_EMAIL             tu correo (admin del proyecto de previews)
// Opcionales: SUPABASE_PREVIEW_REF (usar un proyecto ya creado), SUPABASE_REGION.
//
// Seguridad: si la organización no está en el plan Free, se detiene (un
// proyecto en una organización de pago genera cobros). Nunca carga
// RESEND_API_KEY ni datos de producción.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadEnvFiles } from "./lib/pg-local.mjs";
import { API, DEFAULT_NAME, DEFAULT_REGION, poolerUrls, previewAuthConfig, previewEnvFile, previewPlan } from "./lib/supabase-preview.mjs";

const out = (m) => process.stdout.write(`${m}\n`);
const fail = (m) => {
  process.stderr.write(`[previews] ${m}\n`);
  process.exit(1);
};

await loadEnvFiles();
const execute = process.argv.includes("--ejecutar");
const env = process.env;
const name = DEFAULT_NAME;
const region = env.SUPABASE_REGION || DEFAULT_REGION;
const reuseRef = env.SUPABASE_PREVIEW_REF?.trim() || "";

out(`Proyecto de Supabase para los previews (${execute ? "EJECUCIÓN" : "prueba: no se cambia nada"})\n`);
previewPlan({ name, region, org: env.SUPABASE_ORG, reuseRef }).forEach((step, i) => out(`${i + 1}. ${step}`));
const missing = ["SUPABASE_ACCESS_TOKEN", "PREVIEW_SITE_URL", "ADMIN_EMAIL"].filter((k) => !env[k]?.trim());
if (!execute) {
  out(`\n${missing.length ? `Para ejecutarlo faltan: ${missing.join(", ")}.` : "Variables completas."} Cuando quieras hacerlo: pnpm supabase:preview --ejecutar`);
  process.exit(0);
}
if (missing.length) fail(`Faltan ${missing.join(", ")}.`);
if (!/^https:\/\//.test(env.PREVIEW_SITE_URL)) fail("PREVIEW_SITE_URL debe empezar con https://");

const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" };
async function api(method, route, body) {
  const res = await fetch(`${API}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) fail(`${method} ${route}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// 1. Organización en Free
const orgs = await api("GET", "/organizations");
const orgSlug = env.SUPABASE_ORG?.trim() || (orgs.length === 1 ? orgs[0].id : "");
if (!orgSlug) fail(`Tienes ${orgs.length} organizaciones: indica cuál en SUPABASE_ORG (${orgs.map((o) => o.id).join(", ")}).`);
const org = await api("GET", `/organizations/${orgSlug}`);
if ((org.plan ?? "").toLowerCase() !== "free") fail(`La organización ${orgSlug} está en el plan "${org.plan}". Crea los previews en una organización Free para no generar cobros.`);

// 2. Proyecto
const dbPassword = randomBytes(18).toString("base64url");
let ref = reuseRef;
if (!ref) {
  const created = await api("POST", "/projects", { name, organization_id: orgSlug, region, db_pass: dbPassword });
  ref = created.id ?? created.ref;
  out(`Proyecto creado: ${ref}`);
} else {
  out(`Usando ${ref}: escribe su clave de base en SUPABASE_PREVIEW_DB_PASSWORD si no la cambiaste aquí.`);
}
const password = reuseRef ? env.SUPABASE_PREVIEW_DB_PASSWORD || fail("Con SUPABASE_PREVIEW_REF hace falta SUPABASE_PREVIEW_DB_PASSWORD.") : dbPassword;

// 3. Esperar
for (let i = 0; i < 60; i++) {
  const p = await api("GET", `/projects/${ref}`);
  if (p.status === "ACTIVE_HEALTHY") break;
  if (i === 59) fail(`El proyecto sigue en ${p.status}. Vuelve a correr con SUPABASE_PREVIEW_REF=${ref}.`);
  await new Promise((r) => setTimeout(r, 10_000));
}

// 4. Claves y pooler
const keys = await api("GET", `/projects/${ref}/api-keys`);
const anonKey = keys.find((k) => k.name === "anon")?.api_key;
const serviceRoleKey = keys.find((k) => k.name === "service_role")?.api_key;
if (!anonKey || !serviceRoleKey) fail("No se encontraron las claves anon y service_role.");
const { transactionUrl, sessionUrl } = poolerUrls(await api("GET", `/projects/${ref}/config/database/pooler`), password);

// 5. Migraciones y seed (un proyecto recién creado está vacío: sin respaldo previo)
for (const command of ["migrate", "seed"]) {
  const run = spawnSync(process.execPath, ["scripts/db.mjs", command, ...(command === "migrate" && !reuseRef ? ["--sin-respaldo"] : [])], { cwd: ROOT, stdio: "inherit", env: { ...env, DATABASE_URL: sessionUrl, ADMIN_EMAIL: env.ADMIN_EMAIL } });
  if (run.status !== 0) fail(`pnpm db:${command} falló contra el proyecto de previews.`);
}

// 6. Auth
const site = env.PREVIEW_SITE_URL.replace(/\/$/, "");
await api("PATCH", `/projects/${ref}/config/auth`, previewAuthConfig({ siteUrl: site, redirectPatterns: [`${site}/auth/confirm`, "https://*.vercel.app/auth/confirm"] }));

// 7. Variables para Vercel Preview
const file = path.join(ROOT, ".env.preview");
fs.writeFileSync(
  file,
  previewEnvFile({
    supabaseUrl: `https://${ref}.supabase.co`,
    anonKey,
    serviceRoleKey,
    transactionUrl,
    adminEmail: env.ADMIN_EMAIL,
    siteUrl: site,
    authSecret: randomBytes(32).toString("base64url"),
    cronSecret: randomBytes(24).toString("base64url"),
  }),
);
out(`\nListo. Pega ${path.relative(ROOT, file)} en Vercel → Settings → Environment Variables → Preview (botón "Import .env").`);
out(`Revisa el archivo con: pnpm run doctor --env ${path.relative(ROOT, file)}`);
