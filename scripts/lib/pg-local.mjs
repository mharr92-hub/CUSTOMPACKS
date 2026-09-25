// Utilidades para el Postgres local (sustituye a `supabase start`, que requiere
// Docker). Usa binarios reales de Postgres 17 vía `embedded-postgres` y aplica
// un "shim" con los esquemas/roles/funciones de Supabase que usan las
// migraciones (auth.uid(), roles anon/authenticated/service_role, storage).
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LOCAL_PORT = 54322;
export const LOCAL_URL = `postgres://postgres:postgres@localhost:${LOCAL_PORT}/postgres`;
const SHIM_FILE = path.join(ROOT, "supabase", "local", "supabase-shim.sql");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SEED_FILE = path.join(ROOT, "supabase", "seed.sql");

/** true si hay algo escuchando en el puerto. */
export function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/**
 * Arranca Postgres embebido. Si `persistent` es false los datos se borran al
 * detenerlo (tests).
 * @param {{ dataDir: string, port: number, persistent?: boolean, quiet?: boolean }} opts
 */
export async function startEmbedded({ dataDir, port, persistent = true, quiet = true }) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent,
    onLog: quiet ? () => {} : (m) => process.stdout.write(`[pg] ${m}`),
    onError: (m) => process.stderr.write(`[pg] ${m instanceof Error ? m.message : String(m)}\n`),
    // UTF8 como Supabase (en Windows initdb tomaría WIN1252 de la configuración regional).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-c", "timezone=UTC", "-c", "log_min_messages=warning"],
  });
  const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();
  return { pg, fresh, url: `postgres://postgres:postgres@localhost:${port}/postgres` };
}

/** @param {string} url */
export function connect(url) {
  return postgres(url, { max: 1, onnotice: () => {} });
}

/** Aplica el shim de Supabase (idempotente). */
export async function applyShim(sql) {
  await sql.unsafe(fs.readFileSync(SHIM_FILE, "utf8"));
}

export function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/);
      return { version, name, file: path.join(MIGRATIONS_DIR, file) };
    });
}

/**
 * Aplica migraciones pendientes y las registra en
 * supabase_migrations.schema_migrations (misma tabla que usa la CLI).
 */
export async function migrate(sql, log = () => {}) {
  await applyShim(sql);
  const applied = new Set((await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version));
  let count = 0;
  for (const m of listMigrations()) {
    if (applied.has(m.version)) continue;
    const body = fs.readFileSync(m.file, "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into supabase_migrations.schema_migrations (version, name) values (${m.version}, ${m.name})`;
    });
    log(`migración aplicada: ${m.version}_${m.name}`);
    count++;
  }
  return count;
}

/** Ejecuta supabase/seed.sql y registra ADMIN_EMAIL en settings si existe la tabla. */
export async function seed(sql, { adminEmail } = {}) {
  if (fs.existsSync(SEED_FILE)) await sql.unsafe(fs.readFileSync(SEED_FILE, "utf8"));
  if (adminEmail) {
    const [{ exists }] = await sql`select to_regclass('public.settings') is not null as exists`;
    if (exists) {
      await sql`
        insert into public.settings (key, value, value_type, description)
        values ('admin_email', ${sql.json(adminEmail.toLowerCase())}, 'string', 'Correo que recibe rol admin al registrarse')
        on conflict (key) do update set value = excluded.value`;
    }
  }
}

/** Borra todo y vuelve a crear: shim + migraciones + seed. */
export async function reset(sql, { adminEmail, log = () => {} } = {}) {
  await sql.unsafe(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    drop schema if exists storage cascade;
    drop schema if exists supabase_migrations cascade;
    create schema public;
    grant all on schema public to postgres;
  `);
  const n = await migrate(sql, log);
  await seed(sql, { adminEmail });
  return n;
}

/** Carga .env y .env.local (sin pisar variables ya definidas). */
export async function loadEnvFiles() {
  const { config } = await import("dotenv");
  for (const file of [".env.local", ".env"]) {
    const p = path.join(ROOT, file);
    if (fs.existsSync(p)) config({ path: p, quiet: true });
  }
}
