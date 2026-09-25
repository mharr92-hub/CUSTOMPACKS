import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, inject, it } from "vitest";
import { closeTestSql, testSql } from "../support/db";

/*
 * Respaldo y restauración de ida y vuelta con scripts/backup.mjs. Necesita
 * pg_dump y pg_restore (versión ≥ 17): en CI se instalan; en una máquina sin
 * ellos la prueba se omite (queda indicado en la salida).
 */
const pgDump = process.env.PG_DUMP || "pg_dump";
const pgRestore = process.env.PG_RESTORE || "pg_restore";
const hasTools = spawnSync(pgDump, ["--version"]).status === 0 && spawnSync(pgRestore, ["--version"]).status === 0;

afterAll(async () => {
  await closeTestSql();
});

describe.skipIf(!hasTools)("respaldo diario (pg_dump)", () => {
  it("genera un .dump que se restaura en una base nueva con los mismos datos", async () => {
    const url = inject("databaseUrl");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provenpack-backup-"));
    const run = spawnSync(process.execPath, ["scripts/backup.mjs"], {
      env: { ...process.env, BACKUP_DATABASE_URL: url, BACKUP_DIR: dir },
      encoding: "utf8",
    });
    expect(run.status, run.stderr).toBe(0);
    const [file] = fs.readdirSync(dir).filter((f) => f.endsWith(".dump"));
    expect(file).toBeTruthy();

    const target = `restore_check_${Date.now()}`;
    await testSql().unsafe(`create database ${target}`);
    try {
      const targetUrl = url.replace(/\/[^/]+$/, `/${target}`);
      const restore = spawnSync(pgRestore, ["--no-owner", "--no-privileges", `--dbname=${targetUrl}`, path.join(dir, file!)], { encoding: "utf8" });
      expect(restore.status, restore.stderr).toBe(0);
      // Compara conteos entre la base original y la restaurada.
      const postgres = (await import("postgres")).default;
      const restored = postgres(targetUrl, { max: 1, onnotice: () => {} });
      try {
        for (const table of ["product_types", "papers", "settings", "message_templates", "quote_requests"]) {
          const [r] = await restored.unsafe<{ n: number }[]>(`select count(*)::int as n from public.${table}`);
          const [s] = await testSql().unsafe<{ n: number }[]>(`select count(*)::int as n from public.${table}`);
          expect(r?.n, table).toBe(s?.n);
        }
        const [rls] = await restored<{ n: number }[]>`
          select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
        expect(rls?.n).toBe(0);
      } finally {
        await restored.end({ timeout: 5 });
      }
    } finally {
      await testSql().unsafe(`drop database if exists ${target} with (force)`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
