#!/usr/bin/env node
// Ensayo local del despliegue a producción (docs/deploy.md, "Checklist de despliegue").
// Uso: pnpm verify:deploy
// 1. Base nueva (Postgres embebido en un puerto y carpeta temporales): migraciones + seed.
// 2. `next build` con NODE_ENV=production y las variables mínimas de producción.
// 3. Revisión de secretos en el código público.
// 4. `next start` y comprobaciones HTTP: páginas, cabeceras, SEO, crons con y sin
//    CRON_SECRET, rutas protegidas, sesión falsificada con la clave de desarrollo.
// 5. Preparación de las cuentas (Bloque 4): Turnstile (con las claves de prueba
//    de Cloudflare), copia S3 de respaldo, proyecto de Supabase de previews,
//    cron (Vercel Hobby y Supabase Cron), pnpm run doctor y variables documentadas.
// No usa servicios externos ni credenciales reales. Sale con código 1 si algo falla.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { SignJWT } from "jose";
import { diagnose } from "./lib/doctor-rules.mjs";
import { ROOT, connect, migrate, seed, startEmbedded } from "./lib/pg-local.mjs";
import { previewEnvFile } from "./lib/supabase-preview.mjs";

// Claves de prueba de Cloudflare Turnstile (públicas, siempre aprueban).
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const PG_PORT = 56000 + Math.floor(Math.random() * 1000);
const APP_PORT = 3300 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${APP_PORT}`;
const DIST = ".next-deploy";
const out = (m) => process.stdout.write(`${m}\n`);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  out(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function run(args, env, { quiet = true } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit" });
    let log = "";
    child.stdout?.on("data", (d) => (log += d));
    child.stderr?.on("data", (d) => (log += d));
    child.on("exit", (code) => resolve({ code, log }));
  });
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "provenpack-deploy-pg-"));
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "provenpack-deploy-storage-"));
let pg = null;
let server = null;
try {
  // 1. Base nueva
  out(`Base nueva en :${PG_PORT}…`);
  const started = await startEmbedded({ dataDir, port: PG_PORT, persistent: false });
  pg = started.pg;
  const sql = connect(started.url);
  const applied = await migrate(sql);
  await seed(sql, { adminEmail: "mark@provenpack.test" });
  const [{ n: tables }] = await sql`select count(*)::int as n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'`;
  const [{ n: noRls }] = await sql`select count(*)::int as n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
  check("Migraciones y seed en una base vacía", applied > 0, `${applied} migraciones, ${tables} tablas`);
  check("RLS activado en todas las tablas", noRls === 0, `${noRls} sin RLS`);
  const privateBuckets = (await sql`select id from storage.buckets where not public order by id`).map((b) => b.id);
  await sql.end({ timeout: 5 });

  // 1b. Preparación de las cuentas (sin red)
  const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/backup.yml"), "utf8");
  const copied = (workflow.match(/for b in ([a-z ]+); do/)?.[1] ?? "").trim().split(/\s+/).sort();
  check("Copia S3: el respaldo copia todos los buckets privados", JSON.stringify(copied) === JSON.stringify(privateBuckets), `copia [${copied.join(", ")}], privados [${privateBuckets.join(", ")}]`);
  const example = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  const workflowVars = [...new Set([...workflow.matchAll(/\$\{\{ (?:secrets|vars)\.([A-Z0-9_]+) \}\}/g)].map((m) => m[1]))];
  const undocumentedBackup = workflowVars.filter((v) => !example.includes(v));
  check("Copia S3 y respaldo: cada secreto de GitHub está documentado en .env.example", undocumentedBackup.length === 0, undocumentedBackup.join(", "));
  const internal = new Set(["NODE_ENV", "NEXT_RUNTIME", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "NEXT_DIST_DIR", "PROVENPACK_SCRIPT", "PG_DUMP", "BACKUP_DIR", "BACKUP_KEEP_DAYS", "LH_MIN", "LH_THROTTLING"]);
  const used = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(m?[jt]sx?)$/.test(entry.name)) for (const m of fs.readFileSync(path.join(ROOT, rel), "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
    }
  };
  for (const dir of ["app", "lib", "components", "config", "scripts"]) walk(dir);
  const undocumented = [...used].filter((v) => !internal.has(v) && !example.includes(v));
  check("Todas las variables que lee el código están en .env.example", undocumented.length === 0, undocumented.join(", "));

  const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const notDaily = (vercelConfig.crons ?? []).filter((c) => !/^\d{1,2} \d{1,2} \* \* \*$/.test(c.schedule));
  check("Cron: los de vercel.json corren una vez al día (límite de Vercel Hobby)", notDaily.length === 0, notDaily.map((c) => c.path).join(", "));
  check("Cron: /api/cron/notifications existe para Supabase Cron cada 15 minutos", (vercelConfig.crons ?? []).some((c) => c.path === "/api/cron/notifications"));
  const cronInstall = await run(["scripts/cron-install.mjs"], { ...process.env, DATABASE_URL: started.url, NEXT_PUBLIC_SITE_URL: "https://ejemplo.test", CRON_SECRET: "x".repeat(32) });
  check("Cron: pnpm cron:install se niega a correr contra una base que no es de Supabase", cronInstall.code === 1 && /no es un proyecto de Supabase/.test(cronInstall.log));

  const preview = await run(["scripts/supabase-preview.mjs"], { ...process.env, SUPABASE_ACCESS_TOKEN: "", PREVIEW_SITE_URL: "" });
  check("Supabase de previews: el script muestra el plan sin tocar nada", preview.code === 0 && /plan Free/.test(preview.log) && /--ejecutar/.test(preview.log));
  const previewEnv = previewEnvFile({ supabaseUrl: "https://abc.supabase.co", anonKey: "anon", serviceRoleKey: "service", transactionUrl: "postgres://u:p@h:6543/postgres", adminEmail: "mark@provenpack.test", siteUrl: "https://preview.vercel.app", authSecret: "a".repeat(43), cronSecret: "c".repeat(32) });
  check("Supabase de previews: .env.preview sin Resend, con pool 1 y sus propias claves", !/^RESEND_API_KEY=/m.test(previewEnv) && /^DB_POOL_MAX=1$/m.test(previewEnv) && /^AUTH_SECRET=a{43}$/m.test(previewEnv));

  const prodEnv = {
    NEXT_PUBLIC_SITE_URL: "https://provenpack.com", DATABASE_URL: "postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres", DB_POOL_MAX: "1",
    SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-key", AUTH_SECRET: "a".repeat(40), ADMIN_EMAIL: "mark@provenpack.com",
    CRON_SECRET: "c".repeat(32), RESEND_API_KEY: "re_123", MAIL_FROM: "ProvenPack <hola@provenpack.com>", FACTORY_EMAIL: "fabrica@example.com", NEXT_PUBLIC_WHATSAPP_NUMBER: "50761234567",
    NEXT_PUBLIC_CONTACT_EMAIL: "hola@provenpack.com", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAA", TURNSTILE_SECRET_KEY: "0x4BBBBBBB",
  };
  const prodErrors = diagnose(prodEnv, { production: true }).filter((d) => d.status === "error");
  const badErrors = diagnose({ ...prodEnv, RATE_LIMIT_FACTOR: "20", NEXT_PUBLIC_WHATSAPP_NUMBER: "50760000000" }, { production: true }).filter((d) => d.status === "error");
  check("pnpm run doctor: un entorno de producción completo pasa; variables de prueba y el número de ejemplo fallan", prodErrors.length === 0 && badErrors.length === 2, prodErrors.map((e) => e.service).join(", "));

  // 2. Build de producción
  const env = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: started.url,
    DB_POOL_MAX: "1",
    NEXT_DIST_DIR: DIST,
    STORAGE_LOCAL_DIR: storageDir,
    NEXT_PUBLIC_SITE_URL: BASE,
    AUTH_SECRET: randomBytes(32).toString("base64url"),
    CRON_SECRET: randomBytes(24).toString("base64url"),
    ADMIN_EMAIL: "mark@provenpack.test",
    FACTORY_EMAIL: "fabrica@provenpack.test",
  };
  for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "NEXT_PUBLIC_SENTRY_DSN", "RATE_LIMIT_FACTOR", "ALLOW_LOCAL_AUTH_LINKS"]) delete env[k];
  env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = TURNSTILE_TEST_SITE_KEY;
  env.TURNSTILE_SECRET_KEY = TURNSTILE_TEST_SECRET;
  out("Build de producción (1–3 minutos)…");
  const build = await run([nextBin, "build"], env);
  check("next build con NODE_ENV=production", build.code === 0, build.code === 0 ? "" : build.log.slice(-800));
  if (build.code !== 0) throw new Error("build");

  // 3. Secretos en el código público
  const scan = await run(["scripts/check-client-secrets.mjs", DIST], env);
  check("Sin secretos (ni AUTH_SECRET, CRON_SECRET ni la clave secreta de Turnstile) en el código público", scan.code === 0, scan.log.trim().split("\n").pop());
  const staticFiles = [];
  const collect = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) collect(full);
      else if (e.name.endsWith(".js")) staticFiles.push(full);
    }
  };
  collect(path.join(ROOT, DIST, "static"));
  check("Turnstile: la clave del sitio llega al navegador", staticFiles.some((file) => fs.readFileSync(file, "utf8").includes(TURNSTILE_TEST_SITE_KEY)));

  // 4. Servidor y comprobaciones HTTP
  server = spawn(process.execPath, [nextBin, "start", "-p", String(APP_PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    try {
      ready = (await fetch(`${BASE}/`, { redirect: "manual" })).status === 200;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  check("next start responde", ready);
  if (!ready) throw new Error("start");

  const home = await fetch(`${BASE}/`);
  const h = home.headers;
  check("Inicio 200 con CSP, HSTS, X-Frame-Options y nosniff", home.status === 200 && Boolean(h.get("content-security-policy")?.includes("frame-ancestors 'none'")) && Boolean(h.get("strict-transport-security")) && h.get("x-frame-options") === "DENY" && h.get("x-content-type-options") === "nosniff");
  check("Sin cabecera X-Powered-By", !h.get("x-powered-by"));
  const csp = h.get("content-security-policy") ?? "";
  check("Turnstile: la CSP permite el script y el iframe de Cloudflare", /script-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp) && /frame-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp));
  for (const route of ["/catalogo", "/galeria", "/cotizar", "/legal/privacidad", "/legal/terminos", "/admin/ingresar"]) {
    const r = await fetch(`${BASE}${route}`, { redirect: "manual" });
    check(`${route} responde 200`, r.status === 200, String(r.status));
  }
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  check("sitemap.xml usa NEXT_PUBLIC_SITE_URL", sitemap.includes(`<loc>${BASE}/`));
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  check("robots.txt bloquea /admin y /seguimiento", /Disallow: \/admin/.test(robots) && /Disallow: \/seguimiento/.test(robots));

  const admin = await fetch(`${BASE}/admin/solicitudes`, { redirect: "manual" });
  check("/admin sin sesión redirige al ingreso", [302, 303, 307, 308].includes(admin.status) && (admin.headers.get("location") ?? "").includes("/admin/ingresar"), `${admin.status}`);
  const forged = await new SignJWT({ email: "mark@provenpack.test", pur: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("00000000-0000-0000-0000-000000000001")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("dev-only-insecure-secret-change-me-0123456789"));
  const forgedRes = await fetch(`${BASE}/admin/solicitudes`, { redirect: "manual", headers: { cookie: `pp_session=${forged}` } });
  check("Una sesión firmada con la clave de desarrollo no entra", (forgedRes.headers.get("location") ?? "").includes("/admin/ingresar"), `${forgedRes.status}`);
  check("CSV de reportes sin sesión → 401", (await fetch(`${BASE}/api/reportes/pipeline`)).status === 401);
  check("Seguimiento con un enlace inventado → 404", (await fetch(`${BASE}/seguimiento/${"x".repeat(43)}`)).status === 404);
  check("Archivo privado con token falso → rechazado", (await fetch(`${BASE}/api/storage/object?t=falso`)).status >= 400);

  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  for (const cron of vercel.crons ?? []) {
    const denied = await fetch(`${BASE}${cron.path}`);
    const allowed = await fetch(`${BASE}${cron.path}`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    check(`Cron ${cron.path}: 401 sin secreto y 200 con CRON_SECRET`, denied.status === 401 && allowed.status === 200, `${denied.status}/${allowed.status}`);
  }
} catch (error) {
  if (!(error instanceof Error && ["build", "start"].includes(error.message))) check("Ensayo sin errores inesperados", false, String(error));
} finally {
  if (server) server.kill("SIGTERM");
  if (pg) await pg.stop().catch(() => {});
  // En Windows, Postgres puede tardar en soltar su carpeta: se reintenta y, si no, se deja en la carpeta temporal.
  for (const dir of [dataDir, storageDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    } catch {
      out(`(no se pudo borrar ${dir}; se puede borrar a mano)`);
    }
  }
}

const failed = results.filter((r) => !r.ok).length;
out(`\n${results.length - failed}/${results.length} comprobaciones en verde.`);
process.exit(failed ? 1 : 0);
