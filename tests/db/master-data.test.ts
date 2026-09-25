import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asActor, closeTestSql, createUser, testSql } from "../support/db";

let adminId: string;
let salesId: string;
let viewerId: string;
let clientId: string;

beforeAll(async () => {
  // admin@test.local es ADMIN_EMAIL en el global setup: el trigger le da rol admin.
  adminId = await createUser("admin@test.local");
  salesId = await createUser("ventas@test.local", "sales");
  viewerId = await createUser("lectura@test.local", "viewer");
  clientId = await createUser("cliente@test.local");
});

afterAll(closeTestSql);

describe("seed provisional", () => {
  it("carga las cantidades de §7 y todo queda marcado como provisional", async () => {
    const sql = testSql();
    const [counts] = await sql`
      select
        (select count(*)::int from product_types pt join categories c on c.id = pt.category_id where pt.code like 'CJ-%') as boxes,
        (select count(*)::int from product_types where code like 'BL-%') as bags,
        (select count(*)::int from papers) as papers,
        (select count(*)::int from calibers where grammage_gsm is null) as calibers,
        (select count(*)::int from standard_sizes) as sizes,
        (select count(*)::int from compatibilities) as compat,
        (select count(*)::int from product_types where not is_provisional) as not_provisional`;
    expect(counts).toMatchObject({ boxes: 12, bags: 6, papers: 5, calibers: 3, sizes: 30, compat: 6, not_provisional: 0 });
  });

  it("es idempotente", async () => {
    const sql = testSql();
    const { seed } = await import("../../scripts/lib/pg-local.mjs");
    await seed(sql);
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from product_types`;
    expect(row?.n).toBe(18);
  });
});

describe("perfiles y roles", () => {
  it("el correo de ADMIN_EMAIL recibe rol admin y el resto client", async () => {
    const rows = await testSql()<{ user_id: string; role: string }[]>`
      select user_id, role from profiles where user_id in (${adminId}, ${clientId})`;
    const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r.role]));
    expect(byUser[adminId]).toBe("admin");
    expect(byUser[clientId]).toBe("client");
  });

  it("un usuario no puede subirse de rol a sí mismo", async () => {
    await expect(
      asActor({ kind: "user", userId: clientId }, (tx) => tx`update profiles set role = 'admin' where user_id = ${clientId}`),
    ).rejects.toThrow(/Solo un administrador/);
  });

  it("no se puede quitar el último administrador", async () => {
    // Otros archivos de tests crean administradores: dentro de la misma
    // transacción (que se revierte) se degradan primero, así este queda como el último.
    await expect(
      asActor({ kind: "user", userId: adminId }, async (tx) => {
        await tx`update profiles set role = 'sales' where role = 'admin' and user_id <> ${adminId}`;
        await tx`update profiles set role = 'sales' where user_id = ${adminId}`;
      }),
    ).rejects.toThrow(/al menos un administrador/);
  });

  it("anon no ve perfiles", async () => {
    await expect(asActor({ kind: "anon" }, (tx) => tx`select * from profiles`)).rejects.toThrow(/permission denied/);
  });
});

describe("RLS del catálogo", () => {
  it("anon solo ve lo activo", async () => {
    const rows = await asActor({ kind: "anon" }, (tx) => tx<{ code: string }[]>`select code from categories order by sort_order`);
    expect(rows.map((r) => r.code)).toEqual(["CAJ", "BOL", "BPR", "ALI"]);
  });

  it("anon no puede leer notas para fábrica", async () => {
    await expect(asActor({ kind: "anon" }, (tx) => tx`select factory_notes from papers`)).rejects.toThrow(/permission denied/);
  });

  it("anon no puede escribir", async () => {
    await expect(
      asActor({ kind: "anon" }, (tx) => tx`update papers set name = 'x' where code = 'PA-01'`),
    ).rejects.toThrow(/permission denied/);
  });

  it("el staff ve también lo inactivo", async () => {
    const rows = await asActor({ kind: "user", userId: viewerId }, (tx) => tx`select code from categories`);
    expect(rows).toHaveLength(5);
  });

  it("solo admin escribe; ventas y lectura no", async () => {
    const updated = await asActor({ kind: "user", userId: salesId }, (tx) => tx`update papers set name = 'x' where code = 'PA-01' returning id`);
    expect(updated).toHaveLength(0);
    await expect(
      asActor({ kind: "user", userId: viewerId }, (tx) =>
        tx`insert into finishes (code, name) values ('AC-99', 'Prueba')`,
      ),
    ).rejects.toThrow(/row-level security/);
    const ok = await asActor({ kind: "user", userId: adminId }, (tx) =>
      tx<{ updated_by: string }[]>`update papers set name = 'Kraft' where code = 'PA-01' returning updated_by`,
    );
    expect(ok[0]?.updated_by).toBe(adminId);
  });

  it("la configuración interna no es pública", async () => {
    const rows = await asActor({ kind: "anon" }, (tx) => tx<{ key: string }[]>`select key from settings`);
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("lead_time_threshold_units");
    expect(keys).not.toContain("default_margin_pct");
    expect(keys).not.toContain("admin_email");
  });
});
