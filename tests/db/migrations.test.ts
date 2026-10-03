import { afterAll, describe, expect, inject, it } from "vitest";
import { closeTestSql, testSql } from "../support/db";
// Mismo código que usan pnpm db:migrate y pnpm dev.
import { listMigrations, migrate, migrationChecksum } from "../../scripts/lib/pg-local.mjs";

afterAll(async () => {
  await closeTestSql();
});

describe("migraciones inmutables (M16, DAT-12)", () => {
  it("guarda la huella de cada migración aplicada y falla si un archivo aplicado cambió", async () => {
    expect(inject("databaseUrl")).toBeTruthy();
    const sql = testSql();
    // Primera pasada: registra las huellas que falten.
    expect(await migrate(sql)).toBe(0);
    const rows = await sql<{ version: string; sha256: string }[]>`select version, sha256 from supabase_migrations.provenpack_checksums order by version`;
    expect(rows.map((r) => r.version)).toEqual(listMigrations().map((m: { version: string }) => m.version));
    expect(migrationChecksum("a\r\nb")).toBe(migrationChecksum("a\nb"));

    // Simula que el archivo 003 se editó después de aplicarse.
    const [m003] = rows.filter((r) => r.version === "003");
    await sql`update supabase_migrations.provenpack_checksums set sha256 = 'otra' where version = '003'`;
    await expect(migrate(sql)).rejects.toThrow(/Migraciones ya aplicadas que cambiaron: 003_quotes/);
    await sql`update supabase_migrations.provenpack_checksums set sha256 = ${m003!.sha256} where version = '003'`;
    expect(await migrate(sql)).toBe(0);
  });
});
