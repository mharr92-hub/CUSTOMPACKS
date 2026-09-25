import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { asActor, closeTestSql, createUser, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { saveDraft } = await import("@/lib/quote/drafts");
const { submitDraft } = await import("@/lib/quote/submit");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
const { addRequestNote, assignRequest, changeRequestStatus, getTimeline, listInbox, requestMissingData } = await import("@/lib/panel/requests");
const { clientReply } = await import("@/lib/artwork/client-portal");
const { changeStaffRole, inviteStaffUser, setStaffActive } = await import("@/lib/panel/users");
const { listAudit } = await import("@/lib/panel/audit");
type CurrentUser = import("@/lib/auth").CurrentUser;
type Role = CurrentUser["role"];

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `provenpack-storage-${process.pid}`);
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

let seq = 0;
const unique = () => `${Date.now().toString(36)}${(seq += 1)}`;

async function staff(role: Role): Promise<CurrentUser> {
  const id = await createUser(`${role}-${unique()}@test.local`, role);
  return { userId: id, email: null, profileId: id, name: null, role, isActive: true };
}

async function submitRequest() {
  const s = initialWizardState();
  s.segment = "commercial";
  s.product.name = `Producto ${unique()}`;
  s.items = [{ ...emptyItem("a"), needsAdvice: true, quantities: ["1000", "", ""], frequency: "once" }];
  s.contact = { ...s.contact, name: "Irene Castillo", email: `irene${unique()}@example.com`, city: "Panamá", address: "Calle 1", consent: true };
  const { token } = await saveDraft(null, s);
  const result = await submitDraft(token, { ip: null });
  if (!result.ok) throw new Error("envío rechazado");
  return result;
}

describe("panel: permisos", () => {
  it("el viewer no puede editar nada (lógica y base)", async () => {
    const viewer = await staff("viewer");
    const r = await submitRequest();
    expect(await assignRequest(viewer, r.requestId, "me")).toEqual({ ok: false, error: "forbidden" });
    expect(await changeRequestStatus(viewer, r.requestId, "in_review")).toEqual({ ok: false, error: "forbidden" });
    expect(await requestMissingData(viewer, r.requestId, "el peso")).toEqual({ ok: false, error: "forbidden" });
    expect(await addRequestNote(viewer, r.requestId, { channel: "note", body: "hola" })).toEqual({ ok: false, error: "forbidden" });
    await expect(
      asActor({ kind: "user", userId: viewer.userId }, (tx) => tx`insert into public.activities (request_id, entity_type, kind) values (${r.requestId}, 'quote_request', 'note')`),
    ).rejects.toThrow(/row-level security/);
    const touched = await asActor({ kind: "user", userId: viewer.userId }, (tx) => tx`update public.quote_requests set assigned_to = ${viewer.userId} where id = ${r.requestId} returning id`);
    expect(touched).toHaveLength(0);
    // Pero sí puede leer la bandeja.
    expect((await listInbox(viewer, { q: r.number })).map((row) => row.id)).toEqual([r.requestId]);
  });
});

describe("panel: flujo de una solicitud", () => {
  it("tomar, pedir datos, recibir la respuesta del cliente y pasar a RFQ enviado", async () => {
    const sales = await staff("sales");
    const r = await submitRequest();
    expect(await assignRequest(sales, r.requestId, "me")).toMatchObject({ ok: true });
    expect(await requestMissingData(sales, r.requestId, "  ")).toEqual({ ok: false, error: "reason" });
    expect(await requestMissingData(sales, r.requestId, "el peso por unidad y una foto de tu producto")).toEqual({ ok: true });
    const [req] = await testSql()<{ status: string; assigned_to: string }[]>`select status, assigned_to from public.quote_requests where id = ${r.requestId}`;
    expect(req).toEqual({ status: "data_pending", assigned_to: sales.userId });
    const [notified] = await testSql()<{ payload: { reason: string } }[]>`
      select payload from public.notifications where request_id = ${r.requestId} and template_code = 'data_missing' and channel = 'email'`;
    expect(notified?.payload.reason).toBe("el peso por unidad y una foto de tu producto");

    expect(await clientReply(r.accessToken, "Pesa 350 g; les envío la foto por aquí.")).toEqual({ ok: true });
    const team = await testSql()`select 1 from public.notifications where request_id = ${r.requestId} and template_code = 'client_replied_team'`;
    expect(team).toHaveLength(1);

    expect(await changeRequestStatus(sales, r.requestId, "rfq_sent")).toEqual({ ok: false, error: "transition" });
    expect(await changeRequestStatus(sales, r.requestId, "in_review", { reason: "Datos completos" })).toEqual({ ok: true });
    expect(await changeRequestStatus(sales, r.requestId, "rfq_sent")).toEqual({ ok: true });
    expect(await clientReply(r.accessToken, "otra respuesta")).toEqual({ ok: false, error: "status" });

    const timeline = await getTimeline(sales, r.requestId);
    const kinds = timeline.map((e) => (e.type === "status" ? `status:${e.to}` : e.kind));
    expect(kinds).toEqual(expect.arrayContaining(["status:submitted", "status:in_review", "status:data_pending", "status:rfq_sent", "assigned", "client_reply"]));
    const pending = timeline.find((e) => e.type === "status" && e.to === "data_pending");
    expect(pending && pending.type === "status" ? pending.reason : null).toBe("el peso por unidad y una foto de tu producto");
  });

  it("Rechazada exige motivo de la lista cerrada", async () => {
    const sales = await staff("sales");
    const r = await submitRequest();
    for (const s of ["in_review", "rfq_sent", "quoted"] as const) expect(await changeRequestStatus(sales, r.requestId, s)).toEqual({ ok: true });
    expect(await changeRequestStatus(sales, r.requestId, "rejected")).toEqual({ ok: false, error: "loss_reason" });
    expect(await changeRequestStatus(sales, r.requestId, "rejected", { lossReason: "caro" })).toEqual({ ok: false, error: "loss_reason" });
    expect(await changeRequestStatus(sales, r.requestId, "rejected", { lossReason: "price", lossNote: "Otro proveedor 10 % más barato" })).toEqual({ ok: true });
    const [row] = await testSql()<{ loss_reason: string; loss_note: string }[]>`select loss_reason, loss_note from public.quote_requests where id = ${r.requestId}`;
    expect(row).toEqual({ loss_reason: "price", loss_note: "Otro proveedor 10 % más barato" });
  });

  it("siguiente en turno reparte entre ventas por orden de última asignación", async () => {
    // Otros archivos de tests crean vendedores en paralelo: se los deja al final de la fila.
    await testSql()`update public.profiles set last_assigned_at = now() + interval '1 day' where role = 'sales'`;
    const a = await staff("sales");
    const b = await staff("sales");
    await testSql()`update public.profiles set last_assigned_at = null where user_id in (${a.userId}, ${b.userId})`;
    await testSql()`update public.profiles set created_at = now() - interval '2 minutes' where user_id = ${a.userId}`;
    const admin = await staff("admin");
    const got: (string | null | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await submitRequest();
      const result = await assignRequest(admin, r.requestId, "next");
      got.push(result.ok ? result.assignee : null);
    }
    expect(got.slice(0, 2)).toEqual([a.userId, b.userId]);
    expect(got[2]).not.toBe(b.userId);
  });
});

describe("usuarios y auditoría", () => {
  it("admin invita con rol; nadie se cambia su propio rol ni se desactiva", async () => {
    const admin = await staff("admin");
    const email = `nuevo-${unique()}@provenpack.test`;
    const invited = await inviteStaffUser(admin, { email, name: "Nuevo Vendedor", role: "sales" });
    expect(invited.ok).toBe(true);
    const [profile] = await testSql()<{ user_id: string; role: string; name: string }[]>`select user_id, role, name from public.profiles where email = ${email}`;
    expect(profile).toMatchObject({ role: "sales", name: "Nuevo Vendedor" });
    expect(await inviteStaffUser(admin, { email, name: "", role: "sales" })).toEqual({ ok: false, error: "exists" });
    expect(await inviteStaffUser(admin, { email: "no-es-correo", name: "", role: "sales" })).toEqual({ ok: false, error: "email" });
    const sales = await staff("sales");
    expect(await inviteStaffUser(sales, { email: `x-${unique()}@test.local`, name: "", role: "admin" })).toEqual({ ok: false, error: "forbidden" });
    expect(await changeStaffRole(admin, admin.userId, "viewer")).toEqual({ ok: false, error: "self" });
    expect(await setStaffActive(admin, admin.userId, false)).toEqual({ ok: false, error: "self" });
    expect(await changeStaffRole(admin, profile!.user_id, "ops")).toEqual({ ok: true });
    expect(await setStaffActive(admin, profile!.user_id, false)).toEqual({ ok: true });
  });

  it("la auditoría guarda quién, qué y cuándo con antes y después; solo admin la lee", async () => {
    const sales = await staff("sales");
    const admin = await staff("admin");
    const r = await submitRequest();
    await changeRequestStatus(sales, r.requestId, "in_review");
    const entries = await listAudit(admin, { table: "quote_requests", recordId: r.requestId });
    const change = entries.find((e) => e.action === "update" && e.changed.includes("status"));
    expect(change?.before?.status).toBe("submitted");
    expect(change?.after?.status).toBe("in_review");
    expect(entries.find((e) => e.action === "insert")?.after).not.toHaveProperty("access_token");
    const [raw] = await testSql()<{ actor: string }[]>`
      select actor from public.audit_log where table_name = 'quote_requests' and record_id = ${r.requestId} and 'status' = any(changed)`;
    expect(raw?.actor).toBe(sales.userId);
    expect(await listAudit(sales, { recordId: r.requestId })).toEqual([]);
  });
});
