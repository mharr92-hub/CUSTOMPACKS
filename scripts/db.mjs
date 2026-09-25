#!/usr/bin/env node
// Base de datos local. Uso:
//   pnpm db:start    arranca Postgres embebido en :54322 y aplica migraciones pendientes
//   pnpm db:reset    borra y recrea todo (shim + migraciones + seed)
//   pnpm db:migrate  aplica migraciones pendientes a DATABASE_URL (o al local)
//   pnpm db:seed     ejecuta supabase/seed.sql
import fs from "node:fs";
import path from "node:path";
import {
  LOCAL_PORT,
  LOCAL_URL,
  ROOT,
  connect,
  isPortOpen,
  loadEnvFiles,
  migrate,
  reset,
  seed,
  startEmbedded,
} from "./lib/pg-local.mjs";

await loadEnvFiles();
const command = process.argv[2] ?? "start";
const log = (m) => process.stdout.write(`[db] ${m}\n`);
const dataDir = path.join(ROOT, ".data", "postgres");
const adminEmail = process.env.ADMIN_EMAIL;

/** Devuelve una URL con servidor disponible; si es local y no corre, lo arranca. */
async function ensureServer() {
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, pg: null, fresh: false };
  if (await isPortOpen(LOCAL_PORT)) return { url: LOCAL_URL, pg: null, fresh: false };
  log(`arrancando Postgres embebido en :${LOCAL_PORT} (datos en .data/postgres)…`);
  const started = await startEmbedded({ dataDir, port: LOCAL_PORT });
  return { url: started.url, pg: started.pg, fresh: started.fresh };
}

async function main() {
  const { url, pg, fresh } = await ensureServer();
  const sql = connect(url);
  try {
    if (command === "reset") {
      const n = await reset(sql, { adminEmail, log });
      log(`base recreada (${n} migraciones + seed)`);
      // La caché de datos de Next guarda consultas de la base anterior.
      for (const dir of [".next/cache/fetch-cache", ".next/dev/cache/fetch-cache"]) {
        fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
      }
    } else if (command === "migrate") {
      const n = await migrate(sql, log);
      log(n ? `${n} migraciones aplicadas` : "sin migraciones pendientes");
    } else if (command === "seed") {
      await seed(sql, { adminEmail });
      log("seed aplicado");
    } else if (command === "start") {
      const n = await migrate(sql, log);
      if (fresh) {
        await seed(sql, { adminEmail });
        log("base nueva: seed aplicado");
      } else if (n) {
        log(`${n} migraciones aplicadas`);
      }
    } else {
      log(`comando desconocido: ${command}`);
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  if (command === "start" && pg) {
    log(`listo: ${LOCAL_URL} (Ctrl+C para detener)`);
    const stop = async () => {
      await pg.stop().catch(() => {});
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    setInterval(() => {}, 1 << 30);
  } else if (pg) {
    await pg.stop();
  }
}

main().catch(async (error) => {
  process.stderr.write(`[db] error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
