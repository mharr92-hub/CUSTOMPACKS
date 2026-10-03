import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { asActor, closeTestSql, createUser, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { ORDER_STATUSES, ORDER_TRANSITIONS, REQUEST_STATUSES, canOrderTransition, canTransition, MANUAL_TRANSITIONS, SYSTEM_ONLY_STATUSES } = await import("@/lib/states");
const { nextMilestones, statusAfterMilestone } = await import("@/lib/orders");

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

describe("máquinas de estado: TypeScript y la base dicen lo mismo (COD-10)", () => {
  it("solicitud: los 81 pares de estados coinciden con request_transition_allowed()", async () => {
    const rows = await testSql()<{ f: string; t: string; ok: boolean }[]>`
      select f::text, t::text, public.request_transition_allowed(f, t) as ok
        from unnest(enum_range(null::public.request_status)) f, unnest(enum_range(null::public.request_status)) t`;
    expect(rows).toHaveLength(REQUEST_STATUSES.length ** 2);
    for (const r of rows) expect([r.f, r.t, canTransition(r.f as never, r.t as never)]).toEqual([r.f, r.t, r.ok]);
  });

  it("pedido: los 64 pares coinciden con order_transition_allowed(), y cada hito manual lleva a una transición válida", async () => {
    const rows = await testSql()<{ f: string; t: string; ok: boolean }[]>`
      select f::text, t::text, public.order_transition_allowed(f, t) as ok
        from unnest(enum_range(null::public.order_status)) f, unnest(enum_range(null::public.order_status)) t`;
    expect(rows).toHaveLength(ORDER_STATUSES.length ** 2);
    for (const r of rows) expect([r.f, r.t, canOrderTransition(r.f as never, r.t as never)]).toEqual([r.f, r.t, r.ok]);
    for (const from of ORDER_STATUSES) {
      for (const milestone of nextMilestones(from)) {
        const to = statusAfterMilestone(milestone);
        if (to) expect([from, milestone, ORDER_TRANSITIONS[from].includes(to)]).toEqual([from, milestone, true]);
      }
    }
  });

  it("el selector manual nunca ofrece un estado que solo fija el sistema", () => {
    for (const [from, tos] of Object.entries(MANUAL_TRANSITIONS)) {
      for (const to of tos) {
        expect(SYSTEM_ONLY_STATUSES).not.toContain(to);
        expect(canTransition(from as never, to)).toBe(true);
      }
    }
  });
});

describe("estados que solo fija el sistema (REG-03, PAN-01)", () => {
  it("un usuario del equipo no puede pasar la solicitud a RFQ enviado, Cotizada ni Aceptada con un update directo", async () => {
    const userId = await createUser(`ventas-m3-${Date.now()}@test.local`, "sales");
    const [r] = await testSql()<{ id: string }[]>`
      insert into public.quote_requests (number, segment, status, traffic_light, contact_name, contact_email, access_token, consent_at)
      values (${`S-2099-${String(Date.now()).slice(-5)}`}, 'commercial', 'in_review', 'green', 'Prueba', 'p@example.com', ${`tok-${Date.now()}-${"x".repeat(40)}`}, now())
      returning id`;
    await expect(asActor({ kind: "user", userId }, (tx) => tx`update public.quote_requests set status = 'rfq_sent' where id = ${r!.id}`)).rejects.toThrow(/lo fija el sistema/);
    // Con la marca del sistema (la ponen sendRfq, markRfqSentManually e issueQuote) sí se puede.
    await asActor({ kind: "user", userId }, async (tx) => {
      await tx`select set_config('app.system_transition', 'on', true)`;
      await tx`update public.quote_requests set status = 'rfq_sent' where id = ${r!.id}`;
    });
    await testSql()`update public.quote_requests set status = 'rfq_sent' where id = ${r!.id}`;
    await expect(asActor({ kind: "user", userId }, (tx) => tx`update public.quote_requests set status = 'quoted' where id = ${r!.id}`)).rejects.toThrow(/lo fija el sistema/);
    await testSql()`update public.quote_requests set status = 'quoted' where id = ${r!.id}`;
    await expect(asActor({ kind: "user", userId }, (tx) => tx`update public.quote_requests set status = 'accepted' where id = ${r!.id}`)).rejects.toThrow(/lo fija el sistema/);
    // Lo manual sigue igual: Rechazada con motivo.
    await asActor({ kind: "user", userId }, (tx) => tx`update public.quote_requests set status = 'rejected', loss_reason = 'price' where id = ${r!.id}`);
  });
});
