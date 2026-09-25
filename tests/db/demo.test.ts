import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeTestSql, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { seedDemo } = await import("@/lib/demo/seed");
const { getClientOrder } = await import("@/lib/orders");
const { getObject } = await import("@/lib/storage");

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `provenpack-storage-${process.pid}`);
  process.env.FACTORY_EMAIL = "fabrica@provenpack.test";
  delete process.env.RESEND_API_KEY;
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

const ADMIN = `demo-admin-${Date.now()}@test.local`;

describe("datos de demostración", () => {
  it("dos empresas DEMO y tres solicitudes: Enviada, Cotizada y Aceptada con pedido en QA con una foto; repetir no duplica", async () => {
    const summary = await seedDemo({ adminEmail: ADMIN });
    expect(summary.created).toBe(true);
    const rows = await testSql()<{ number: string; status: string; is_demo: boolean; company: string | null }[]>`
      select r.number, r.status, r.is_demo, c.trade_name as company from public.quote_requests r left join public.companies c on c.id = r.company_id
       where r.id in ${testSql()(summary.requests.map((r) => r.requestId))} order by r.submitted_at`;
    expect(rows.map((r) => r.status)).toEqual(["submitted", "quoted", "accepted"]);
    expect(rows.every((r) => r.is_demo)).toBe(true);
    expect(new Set(rows.map((r) => r.company))).toEqual(new Set(["Café Altura Boquete (DEMO)", "Sabores del Istmo (DEMO)"]));
    const companies = await testSql()`select 1 from public.companies where is_demo`;
    expect(companies).toHaveLength(2);

    const pedido = summary.requests.find((r) => r.key === "pedido")!;
    const [order] = await testSql()<{ status: string }[]>`select status from public.orders where id = ${pedido.orderId}`;
    expect(order?.status).toBe("qa");
    const client = await getClientOrder(pedido.accessToken);
    const qa = client?.milestones.find((m) => m.type === "qa_completed");
    expect(qa?.evidence).toHaveLength(1);
    const photo = await getObject("evidence", qa!.evidence[0]!.path);
    expect(photo?.data.subarray(1, 4).toString()).toBe("PNG");
    expect(client?.payments.deposit).toBe("confirmed");

    const cotizada = summary.requests.find((r) => r.key === "cotizada")!;
    const [light] = await testSql()<{ traffic_light: string }[]>`select traffic_light from public.quote_requests where id = ${cotizada.requestId}`;
    expect(light?.traffic_light).toBe("green");
    const art = await testSql()`select 1 from public.artwork_files where request_id = ${cotizada.requestId} and uploaded_by_client`;
    expect(art).toHaveLength(1);
    const [quote] = await testSql()<{ status: string; pdf_path: string | null }[]>`select status, pdf_path from public.quotes where request_id = ${cotizada.requestId}`;
    expect(quote?.status).toBe("sent");
    expect(quote?.pdf_path).toBeTruthy();

    const again = await seedDemo({ adminEmail: ADMIN });
    expect(again.created).toBe(false);
    expect(again.requests.map((r) => r.number).sort()).toEqual(summary.requests.map((r) => r.number).sort());
  });
});
