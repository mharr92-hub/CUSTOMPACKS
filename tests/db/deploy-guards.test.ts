import { afterAll, describe, expect, inject, it } from "vitest";
import { connect, isSupabaseDatabase, migrate, reset } from "../../scripts/lib/pg-local.mjs";

/*
 * Resguardos para desplegar: contra un proyecto de Supabase (rol
 * supabase_admin), `migrate` no aplica el shim local y `reset` se niega.
 */
const sql = connect(inject("databaseUrl"));

afterAll(async () => {
  await sql`drop role if exists supabase_admin`;
  await sql.end({ timeout: 5 });
});

describe("migraciones contra Supabase", () => {
  it("en la base local aplica el shim; con supabase_admin no lo toca y reset se niega", async () => {
    expect(await isSupabaseDatabase(sql)).toBe(false);
    await sql`create role supabase_admin nologin`;
    expect(await isSupabaseDatabase(sql)).toBe(true);
    // Si el shim se aplicara, recrearía auth.role(): se borra para detectarlo.
    await sql`drop function if exists auth.role()`;
    const logs: string[] = [];
    expect(await migrate(sql, (m) => logs.push(m))).toBe(0);
    expect(logs).toContain("base de Supabase: no se aplica el shim local");
    const [fn] = await sql<{ exists: boolean }[]>`select to_regprocedure('auth.role()') is not null as exists`;
    expect(fn?.exists).toBe(false);
    await expect(reset(sql)).rejects.toThrow(/no se permite contra un proyecto de Supabase/);
    // Vuelve a la normalidad para el resto de las pruebas.
    await sql`drop role supabase_admin`;
    await migrate(sql);
    const [back] = await sql<{ exists: boolean }[]>`select to_regprocedure('auth.role()') is not null as exists`;
    expect(back?.exists).toBe(true);
  });
});
