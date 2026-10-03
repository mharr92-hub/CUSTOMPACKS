import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeTestSql, createUser, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { purgeExpiredDrafts, saveDraft } = await import("@/lib/quote/drafts");
const { completionMinutes, submitDraft } = await import("@/lib/quote/submit");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
const { getReports } = await import("@/lib/panel/reports");
const { todayInPanama } = await import("@/lib/leadtime");
type CurrentUser = import("@/lib/auth").CurrentUser;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

let seq = 0;
function state(step: ReturnType<typeof initialWizardState>["step"]) {
  seq += 1;
  const s = initialWizardState();
  s.segment = "commercial";
  s.step = step;
  s.startedAt = new Date(Date.now() - 4 * 60_000).toISOString();
  s.product.name = `Jabones ${seq}`;
  s.items = [{ ...emptyItem("a"), needsAdvice: true, quantities: ["800", "", ""], frequency: "once" }];
  s.contact = { ...s.contact, name: "Rosa Díaz", email: `rosa-kpi-${seq}@example.com`, city: "David", address: "Calle 3", consent: true };
  return s;
}

describe("datos de los KPI desde el primer día (M7)", () => {
  it("la solicitud guarda su semáforo inicial y los minutos que tomó completarla", async () => {
    const { token } = await saveDraft(null, state(9));
    const sent = await submitDraft(token, { ip: null });
    if (!sent.ok) throw new Error("envío");
    const [r] = await testSql()<{ initial_traffic_light: string; traffic_light: string; initial_missing_fields: string[]; completion_minutes: number }[]>`
      select initial_traffic_light, traffic_light, initial_missing_fields, completion_minutes from public.quote_requests where id = ${sent.requestId}`;
    expect(r?.initial_traffic_light).toBe(r?.traffic_light);
    expect(r?.initial_missing_fields.length).toBeGreaterThan(0);
    expect(r?.completion_minutes).toBe(4);
    expect(completionMinutes("no es fecha")).toBeNull();
    expect(completionMinutes(new Date(Date.now() + 60_000).toISOString())).toBeNull();
  });

  it("purgar un borrador abandonado deja su fila de embudo sin nombre, correo ni WhatsApp", async () => {
    const { token } = await saveDraft(null, state(3));
    await saveDraft(token, state(5));
    await saveDraft(token, state(2));
    const [d] = await testSql()<{ max_step: number }[]>`select max_step from public.quote_drafts where token = ${token}`;
    expect(d?.max_step).toBe(5);
    await testSql()`update public.quote_drafts set expires_at = now() - interval '1 minute' where token = ${token}`;
    const before = await testSql()<{ n: number }[]>`select count(*)::int as n from public.wizard_funnel`;
    expect(await purgeExpiredDrafts()).toContain(token);
    const rows = await testSql()<Record<string, unknown>[]>`select * from public.wizard_funnel order by created_at desc limit 1`;
    const after = await testSql()<{ n: number }[]>`select count(*)::int as n from public.wizard_funnel`;
    expect(after[0]!.n).toBe(before[0]!.n + 1);
    expect(rows[0]).toMatchObject({ max_step: 5, segment: "commercial", submitted: false });
    expect(JSON.stringify(rows[0])).not.toMatch(/rosa-kpi|Rosa|David/);
  });

  it("los reportes no cuentan las solicitudes DEMO", async () => {
    const adminId = await createUser(`kpi-admin-${Date.now()}@test.local`, "admin");
    const admin: CurrentUser = { userId: adminId, email: null, profileId: adminId, name: null, role: "admin", isActive: true };
    const range = { from: todayInPanama(), to: todayInPanama() };
    const count = async () => {
      const [pipeline] = await getReports(admin, range, "pipeline");
      return pipeline!.rows.reduce((sum, row) => sum + Number(row[1] ?? 0), 0);
    };
    const { token } = await saveDraft(null, state(9));
    const sent = await submitDraft(token, { ip: null });
    if (!sent.ok) throw new Error("envío");
    const withIt = await count();
    await testSql()`update public.quote_requests set is_demo = true where id = ${sent.requestId}`;
    expect(await count()).toBe(withIt - 1);
  });
});
