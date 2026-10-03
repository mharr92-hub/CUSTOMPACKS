import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeTestSql, createUser, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { saveDraft } = await import("@/lib/quote/drafts");
const { submitDraft } = await import("@/lib/quote/submit");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
const { processNotificationQueue } = await import("@/lib/notify");
const { addRequestNote } = await import("@/lib/panel/requests");
const { anonymizeRequest, exportPersonalData, searchPersonalData } = await import("@/lib/panel/personal-data");
type CurrentUser = import("@/lib/auth").CurrentUser;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `provenpack-storage-${process.pid}`);
  delete process.env.RESEND_API_KEY;
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

async function staff(role: "admin" | "sales"): Promise<CurrentUser> {
  const id = await createUser(`ley81-${role}-${Date.now()}@test.local`, role);
  return { userId: id, email: null, profileId: id, name: null, role, isActive: true };
}

describe("Ley 81: acceso y eliminación (M17)", () => {
  it("busca y exporta por correo o WhatsApp; anonimiza sin dejar el correo ni el WhatsApp en ninguna tabla", async () => {
    const stamp = Date.now();
    const email = `titular-${stamp}@example.com`;
    const local = `6${String(stamp).slice(-7)}`;
    const s = initialWizardState();
    s.segment = "commercial";
    s.product.name = "Café molido";
    s.items = [{ ...emptyItem("a"), needsAdvice: true, quantities: ["900", "", ""], frequency: "once" }];
    s.contact = { ...s.contact, name: "Marta Titular", email, whatsapp: local, city: "Boquete", address: "Calle del Río 4", consent: true, comments: `Llámame al ${local}` };
    const { token } = await saveDraft(null, s);
    const sent = await submitDraft(token, { ip: "203.0.113.9" });
    if (!sent.ok) throw new Error("envío");
    await processNotificationQueue(200);
    const sales = await staff("sales");
    await addRequestNote(sales, sent.requestId, { channel: "call", body: `Hablé con Marta (${email})` });

    const admin = await staff("admin");
    expect(await searchPersonalData(sales, email)).toBeNull();
    const found = await searchPersonalData(admin, email.toUpperCase());
    expect(found?.map((f) => f.id)).toContain(sent.requestId);
    expect((await searchPersonalData(admin, local))?.map((f) => f.id)).toContain(sent.requestId);
    const exported = await exportPersonalData(admin, email);
    expect(JSON.stringify(exported)).toContain("Marta Titular");
    expect((exported?.avisos_enviados as unknown[]).length).toBeGreaterThan(0);

    expect(await anonymizeRequest(sales, sent.requestId, sent.number)).toEqual({ ok: false, error: "forbidden" });
    expect(await anonymizeRequest(admin, sent.requestId, "S-0000-00000")).toEqual({ ok: false, error: "confirm" });
    const result = await anonymizeRequest(admin, sent.requestId, sent.number);
    expect(result.ok).toBe(true);

    // Ninguna columna de texto del esquema public conserva el correo ni el WhatsApp.
    const columns = await testSql()<{ table_name: string; column_name: string }[]>`
      select c.table_name, c.column_name from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.table_schema = 'public' and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')`;
    const leaks: string[] = [];
    for (const col of columns) {
      const [row] = await testSql().unsafe<{ n: number }[]>(
        `select count(*)::int as n from public."${col.table_name}" where "${col.column_name}"::text ilike $1 or "${col.column_name}"::text like $2`,
        [`%${email}%`, `%${local}%`],
      );
      if ((row?.n ?? 0) > 0) leaks.push(`${col.table_name}.${col.column_name}`);
    }
    expect(leaks).toEqual([]);

    // Se conserva lo contable: número y estado.
    const [r] = await testSql()<{ number: string; status: string; contact_name: string }[]>`select number, status, contact_name from public.quote_requests where id = ${sent.requestId}`;
    expect(r).toEqual({ number: sent.number, status: "submitted", contact_name: "Anonimizado" });
    // El borrador que originó la solicitud se borra.
    expect(await testSql()`select 1 from public.quote_drafts where token = ${token}`).toHaveLength(0);
  });

  it("en una solicitud que llegó a pedido conserva la cotización aceptada, el pedido, los pagos y el arte (D-116)", async () => {
    const admin = await staff("admin");
    const stamp = Date.now();
    const s = initialWizardState();
    s.segment = "commercial";
    s.product.name = "Té";
    s.items = [{ ...emptyItem("a"), needsAdvice: true, quantities: ["500", "", ""], frequency: "once" }];
    s.contact = { ...s.contact, name: "Rosa Cliente", email: `rosa-${stamp}@example.com`, whatsapp: "", city: "David", address: "Calle 1", consent: true };
    const { token } = await saveDraft(null, s);
    const sent = await submitDraft(token, { ip: null });
    if (!sent.ok) throw new Error("envío");
    const [item] = await testSql()<{ id: string }[]>`select id from public.quote_items where request_id = ${sent.requestId}`;
    const artPath = `requests/${sent.requestId}/${item!.id}/artwork/v1-logo.pdf`;
    await testSql()`
      insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes)
      values (${item!.id}, ${sent.requestId}, 'artwork', 1, ${artPath}, 'logo.pdf', 'pdf', 100)`;
    // Cotización aceptada y pedido, sin pasar por todo el flujo.
    const [quote] = await testSql()<{ id: string }[]>`
      insert into public.quotes (request_id, base_number, number, version, status, currency, deposit_pct, valid_until, accepted_at, accepted_by_name, accepted_by_email, accepted_ip, pdf_path)
      values (${sent.requestId}, ${`C-${stamp}`}, ${`C-${stamp}-v1`}, 1, 'accepted', 'USD', 50, current_date + 10, now(), 'Rosa Cliente', ${`rosa-${stamp}@example.com`}, '198.51.100.7', ${`requests/${sent.requestId}/quotes/c.pdf`})
      returning id`;
    await testSql()`
      insert into public.orders (request_id, quote_id, number, status, currency, total_amount, deposit_pct, deposit_amount, balance_amount, lead_time_days)
      values (${sent.requestId}, ${quote!.id}, ${`P-${stamp}`}, 'pending_deposit', 'USD', 100, 50, 50, 50, 30)`;

    const result = await anonymizeRequest(admin, sent.requestId, sent.number);
    expect(result).toEqual({ ok: true, files: 0, converted: true });
    const [q] = await testSql()<{ accepted_by_name: string; accepted_by_email: string | null; accepted_ip: string | null; pdf_path: string | null }[]>`
      select accepted_by_name, accepted_by_email, accepted_ip, pdf_path from public.quotes where id = ${quote!.id}`;
    expect(q).toEqual({ accepted_by_name: "Rosa Cliente", accepted_by_email: null, accepted_ip: null, pdf_path: `requests/${sent.requestId}/quotes/c.pdf` });
    const [art] = await testSql()<{ deleted_at: Date | null }[]>`select deleted_at from public.artwork_files where storage_path = ${artPath}`;
    expect(art?.deleted_at).toBeNull();
    expect(await testSql()`select 1 from public.orders where request_id = ${sent.requestId}`).toHaveLength(1);
    const [r] = await testSql()<{ contact_email: string }[]>`select contact_email from public.quote_requests where id = ${sent.requestId}`;
    expect(r?.contact_email).toBe("anonimizado@anonimizado.invalid");
    expect(await testSql()`select 1 from public.quote_drafts where token = ${token}`).toHaveLength(0);
  });
});
