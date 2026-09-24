#!/usr/bin/env node
// `pnpm dev`: si no hay DATABASE_URL, levanta el Postgres embebido local
// (aplicando migraciones y seed) y luego arranca `next dev`. Al salir detiene
// la base si la arrancó este proceso.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { LOCAL_PORT, ROOT, connect, isPortOpen, loadEnvFiles, migrate, seed, startEmbedded } from "./lib/pg-local.mjs";

await loadEnvFiles();
const log = (m) => process.stdout.write(`[dev] ${m}\n`);
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const mode = process.argv[2] === "start" ? "start" : "dev";
const extraArgs = process.argv.slice(3);

let pg = null;
if (!process.env.DATABASE_URL) {
  if (await isPortOpen(LOCAL_PORT)) {
    log(`usando Postgres local ya activo en :${LOCAL_PORT}`);
    const sql = connect(`postgres://postgres:postgres@localhost:${LOCAL_PORT}/postgres`);
    await migrate(sql, log).finally(() => sql.end({ timeout: 5 }));
  } else {
    log(`arrancando Postgres embebido en :${LOCAL_PORT}…`);
    const started = await startEmbedded({ dataDir: path.join(ROOT, ".data", "postgres"), port: LOCAL_PORT });
    pg = started.pg;
    const sql = connect(started.url);
    try {
      await migrate(sql, log);
      if (started.fresh) {
        await seed(sql, { adminEmail: process.env.ADMIN_EMAIL });
        log("base nueva: seed aplicado");
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

const child = spawn(process.execPath, [nextBin, mode, ...extraArgs], { stdio: "inherit", cwd: ROOT, env: process.env });

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
