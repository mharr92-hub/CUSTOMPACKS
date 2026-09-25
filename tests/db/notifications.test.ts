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
const { checkSlaOverdue, markWhatsappSent, processNotificationQueue } = await import("@/lib/notify");
type CurrentUser = import("@/lib/auth").CurrentUser;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `provenpack-storage-${process.pid}`);
  delete process.env.RESEND_API_KEY;
  resetServerEnvCache();
  await testSql()`update public.settings set value = '"equipo@provenpack.test"' where key = 'team_notification_email'`;
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

let seq = 0;
async function submitRequest(contact: { whatsapp?: string; email?: string } = {}) {
  seq += 1;
  const s = initialWizardState();
  s.segment = "commercial";
  s.product.name = `Velas ${seq}`;
  s.items = [{ ...emptyItem("a"), needsAdvice: true, quantities: ["500", "", ""], frequency: "once" }];
  s.contact = { ...s.contact, name: "Lucía Méndez", email: contact.email ?? `lucia${seq}@example.com`, whatsapp: contact.whatsapp ?? "", city: "Panamá", address: "Calle 1", consent: true };
  const { token } = await saveDraft(null, s);
  const result = await submitDraft(token, { ip: null });
  if (!result.ok) throw new Error("envío rechazado");
  return result;
}

type Row = { template_code: string; channel: string; audience: string; recipient: string; status: string; subject: string | null; body: string | null; wa_link: string | null; error: string | null };
const notificationsOf = (requestId: string) =>
  testSql()<Row[]>`
    select template_code, channel, audience, recipient, status, subject, body, wa_link, error
      from public.notifications where request_id = ${requestId} order by created_at, audience, channel`;

describe("notificaciones por evento (§12)", () => {
  it("al enviar la solicitud se encola el aviso al cliente (correo y WhatsApp) y al equipo, y se envía simulado sin credenciales", async () => {
    const r = await submitRequest({ whatsapp: "+507 6123-4567" });
    const queued = await notificationsOf(r.requestId);
    expect(queued.map((n) => `${n.template_code}/${n.channel}/${n.status}`)).toEqual([
      "request_submitted/email/queued",
      "request_submitted/whatsapp/queued",
      "request_submitted_team/email/queued",
    ]);
    await processNotificationQueue(200);
    const [email, whatsapp, team] = await notificationsOf(r.requestId);
    expect(email?.status).toBe("simulated");
    expect(email?.subject).toBe(`Recibimos tu solicitud ${r.number}`);
    expect(email?.body).toContain(`Hola Lucía, recibimos tu solicitud ${r.number}`);
    expect(email?.body).toContain(`/seguimiento/${r.accessToken}`);
    expect(whatsapp?.status).toBe("simulated");
    expect(whatsapp?.wa_link).toMatch(/^https:\/\/wa\.me\/50761234567\?text=/);
    expect(decodeURIComponent(whatsapp?.wa_link ?? "")).toContain(r.number);
    expect(team?.recipient).toBe("equipo@provenpack.test");
    expect(team?.body).toContain(`/admin/solicitudes/${r.requestId}`);
    const activities = await testSql()`select 1 from public.activities where request_id = ${r.requestId} and kind = 'notification'`;
    expect(activities).toHaveLength(3);
  });

  it("datos pendientes: la lista sale del motivo que escribe el equipo", async () => {
    const sql = testSql();
    const r = await submitRequest();
    await sql`update public.quote_requests set status = 'in_review' where id = ${r.requestId}`;
    // El motivo de la transición viaja en app.transition_reason (lo fija la acción del panel).
    await sql.begin(async (tx) => {
      await tx`select set_config('app.transition_reason', 'el peso del producto y una foto', true)`;
      await tx`update public.quote_requests set status = 'data_pending' where id = ${r.requestId}`;
    });
    await processNotificationQueue(200);
    const missing = (await notificationsOf(r.requestId)).filter((n) => n.template_code === "data_missing");
    expect(missing).toHaveLength(1);
    expect(missing[0]?.body).toContain("nos falta: el peso del producto y una foto");
  });

  it("nunca sale un mensaje incompleto: sin datos de la cotización, «Cotización enviada» queda como fallida", async () => {
    const sql = testSql();
    const r = await submitRequest();
    for (const s of ["in_review", "rfq_sent", "quoted"]) await sql`update public.quote_requests set status = ${s}::public.request_status where id = ${r.requestId}`;
    await processNotificationQueue(200);
    const quote = (await notificationsOf(r.requestId)).find((n) => n.template_code === "quote_sent");
    expect(quote?.status).toBe("failed");
    expect(quote?.error).toMatch(/numero_cotizacion/);
  });

  it("arte observado y proof listo avisan al cliente; una plantilla desactivada no se encola", async () => {
    const sql = testSql();
    const r = await submitRequest();
    const [item] = await sql<{ id: string }[]>`select id from public.quote_items where request_id = ${r.requestId}`;
    const [art] = await sql<{ id: string }[]>`
      insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status)
      values (${item!.id}, ${r.requestId}, 'artwork', 1, ${`requests/${r.requestId}/${item!.id}/artwork/x-a.pdf`}, 'a.pdf', 'pdf', 10, 'in_review') returning id`;
    await sql`update public.artwork_files set status = 'observed', reviewed_at = now() where id = ${art!.id}`;
    await sql`update public.message_templates set is_active = false where code = 'proof_ready' and channel = 'email'`;
    await sql`
      insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status, uploaded_by_client)
      values (${item!.id}, ${r.requestId}, 'proof', 1, ${`requests/${r.requestId}/${item!.id}/proof/x-p.pdf`}, 'p.pdf', 'pdf', 10, 'proof_sent', false)`;
    await sql`update public.message_templates set is_active = true where code = 'proof_ready' and channel = 'email'`;
    const codes = (await notificationsOf(r.requestId)).map((n) => `${n.template_code}/${n.channel}`);
    expect(codes).toContain("artwork_observed/email");
    expect(codes).not.toContain("proof_ready/email");
  });

  it("SLA vencido: un aviso al equipo por solicitud y etapa", async () => {
    const sql = testSql();
    const r = await submitRequest();
    await sql`update public.quote_requests set submitted_at = now() - interval '10 days' where id = ${r.requestId}`;
    await checkSlaOverdue();
    await checkSlaOverdue();
    const sla = (await notificationsOf(r.requestId)).filter((n) => n.template_code === "sla_overdue_team");
    expect(sla).toHaveLength(1);
    await processNotificationQueue(200);
    const [done] = (await notificationsOf(r.requestId)).filter((n) => n.template_code === "sla_overdue_team");
    expect(done?.body).toMatch(/horas hábiles sin primera respuesta/);
  });

  it("el equipo marca enviado el WhatsApp precargado", async () => {
    const r = await submitRequest({ whatsapp: "+507 6000-0000" });
    await processNotificationQueue(200);
    const [wa] = await testSql()<{ id: string }[]>`select id from public.notifications where request_id = ${r.requestId} and channel = 'whatsapp'`;
    const salesId = await createUser(`ventas-wa-${Date.now()}@test.local`, "sales");
    const viewerId = await createUser(`lector-wa-${Date.now()}@test.local`, "viewer");
    const as = (userId: string, role: "sales" | "viewer"): CurrentUser => ({ userId, email: null, profileId: userId, name: null, role, isActive: true });
    expect(await markWhatsappSent(as(viewerId, "viewer"), wa!.id)).toBe(false);
    expect(await markWhatsappSent(as(salesId, "sales"), wa!.id)).toBe(true);
    expect(await markWhatsappSent(as(salesId, "sales"), wa!.id)).toBe(false);
    const [row] = await testSql()<{ status: string; manual_sent_by: string }[]>`select status, manual_sent_by from public.notifications where id = ${wa!.id}`;
    expect(row).toEqual({ status: "sent", manual_sent_by: salesId });
  });
});
