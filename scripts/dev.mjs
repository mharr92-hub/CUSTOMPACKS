#!/usr/bin/env node
// `pnpm dev|build|start`: si no hay DATABASE_URL, levanta el Postgres embebido
// local (aplicando migraciones y seed) y luego corre `next dev|build|start`. Al salir detiene
// la base si la arrancó este proceso.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, connect, isPortOpen, loadEnvFiles, migrate, reset, seed, startEmbedded } from "./lib/pg-local.mjs";

await loadEnvFiles();
const log = (m) => process.stdout.write(`[dev] ${m}\n`);
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const mode = ["start", "build"].includes(process.argv[2]) ? process.argv[2] : "dev";
const extraArgs = process.argv.slice(3);
// LOCAL_DB_PORT / LOCAL_DB_DIR permiten una base aparte (por ejemplo, para e2e);
// LOCAL_DB_RESET=1 la recrea desde cero al arrancar.
const LOCAL_PORT = Number(process.env.LOCAL_DB_PORT ?? 54322);
const LOCAL_DIR = path.resolve(ROOT, process.env.LOCAL_DB_DIR ?? ".data/postgres");
const RESET = process.env.LOCAL_DB_RESET === "1";

let pg = null;
if (!process.env.DATABASE_URL) {
  if (await isPortOpen(LOCAL_PORT)) {
    log(`usando Postgres local ya activo en :${LOCAL_PORT}`);
    const sql = connect(`postgres://postgres:postgres@localhost:${LOCAL_PORT}/postgres`);
    try {
      if (RESET) await reset(sql, { adminEmail: process.env.ADMIN_EMAIL, log });
      else await migrate(sql, log);
    } finally {
      await sql.end({ timeout: 5 });
    }
  } else {
    log(`arrancando Postgres embebido en :${LOCAL_PORT}…`);
    const started = await startEmbedded({ dataDir: LOCAL_DIR, port: LOCAL_PORT });
    pg = started.pg;
    const sql = connect(started.url);
    try {
      if (RESET && !started.fresh) await reset(sql, { adminEmail: process.env.ADMIN_EMAIL, log });
      else await migrate(sql, log);
      if (started.fresh) {
        await seed(sql, { adminEmail: process.env.ADMIN_EMAIL });
        log("base nueva: seed aplicado");
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

const childEnv = { ...process.env };
if (!process.env.DATABASE_URL) childEnv.DATABASE_URL = `postgres://postgres:postgres@localhost:${LOCAL_PORT}/postgres`;
const child = spawn(process.execPath, [nextBin, mode, ...extraArgs], { stdio: "inherit", cwd: ROOT, env: childEnv });

let stopping = false;
async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  if (!child.killed) child.kill("SIGINT");
  if (pg) await pg.stop().catch(() => {});
  process.exit(code ?? 0);
}
child.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
