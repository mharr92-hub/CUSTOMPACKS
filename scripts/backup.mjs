#!/usr/bin/env node
// Respaldo de la base con pg_dump (formato custom, comprimido). Uso:
//   node scripts/backup.mjs
// Variables:
//   BACKUP_DATABASE_URL  base a respaldar (si falta, DATABASE_URL; si falta, la local :54322)
//   BACKUP_DIR           carpeta destino (por defecto .data/backups)
//   BACKUP_KEEP_DAYS     días que se conservan los respaldos anteriores (por defecto 14)
//   BACKUP_SCHEMAS       esquemas a incluir, separados por coma (por defecto, todos)
//   PG_DUMP              ruta de pg_dump si no está en el PATH (versión ≥ la del servidor)
// Restaurar:  pg_restore --clean --if-exists --no-owner --no-privileges -d "<url>" <archivo>.dump
// Detalle en docs/respaldos.md.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const url = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:54322/postgres";
const dir = path.resolve(process.env.BACKUP_DIR || ".data/backups");
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 14);
const schemas = (process.env.BACKUP_SCHEMAS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const pgDump = process.env.PG_DUMP || "pg_dump";
const out = (m) => process.stdout.write(`[respaldo] ${m}\n`);

fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const file = path.join(dir, `provenpack-${stamp}.dump`);

const args = ["--format=custom", "--compress=9", "--no-owner", "--no-privileges", `--file=${file}`, ...schemas.map((s) => `--schema=${s}`), `--dbname=${url}`];
const result = spawnSync(pgDump, args, { stdio: ["ignore", "inherit", "pipe"], encoding: "utf8" });
if (result.error) {
  process.stderr.write(`No se pudo ejecutar pg_dump (${result.error.message}). Instala el cliente de PostgreSQL o define PG_DUMP.\n`);
  process.exit(2);
}
if (result.status !== 0) {
  fs.rmSync(file, { force: true });
  // El mensaje de pg_dump puede incluir la URL: se oculta la contraseña.
  process.stderr.write(String(result.stderr).replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/g, "$1***@"));
  process.exit(result.status ?? 1);
}
const size = fs.statSync(file).size;
out(`${path.relative(process.cwd(), file)} (${(size / 1024 / 1024).toFixed(2)} MB)`);

// Conserva los últimos `keepDays` días.
const limit = Date.now() - keepDays * 86_400_000;
for (const name of fs.readdirSync(dir)) {
  if (!/^provenpack-.*\.dump$/.test(name)) continue;
  const full = path.join(dir, name);
  if (full !== file && fs.statSync(full).mtimeMs < limit) {
    fs.rmSync(full);
    out(`borrado por antigüedad: ${name}`);
  }
}
