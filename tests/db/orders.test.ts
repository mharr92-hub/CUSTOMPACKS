import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { asActor, closeTestSql, createUser, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { getPublicCatalog } = await import("@/lib/catalog/public");
const { evaluateCaliber, evaluatePaper } = await import("@/lib/compat");
const { saveDraft } = await import("@/lib/quote/drafts");
const { submitDraft } = await import("@/lib/quote/submit");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
const { changeRequestStatus } = await import("@/lib/panel/requests");
const { generateRfq, recordRfqResponse, sendRfq } = await import("@/lib/rfq");
const { acceptQuote, createQuoteDraft, issueQuote, updateQuoteDraft } = await import("@/lib/quotes");
const orders = await import("@/lib/orders");
const { reorderState } = await import("@/lib/orders/reorder");
const { putObject } = await import("@/lib/storage");
const { todayInPanama, addDays } = await import("@/lib/leadtime");
const { flagExpiredArtwork } = await import("@/lib/artwork/retention");
type CurrentUser = import("@/lib/auth").CurrentUser;
type WizardState = import("@/lib/quote/types").WizardState;

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

let seq = 0;
async function staff(role: "sales" | "ops" | "viewer" = "ops"): Promise<CurrentUser> {
  seq += 1;
  const id = await createUser(`pedidos-e8-${Date.now()}-${seq}@test.local`, role);
  return { userId: id, email: null, profileId: id, name: null, role, isActive: true };
}

/** Solicitud con una pieza impresa (1.000 y 20.000 unidades) y proof aprobado. */
async function acceptedOrder(opts: { quantity?: number } = {}) {
  const user = await staff("sales");
  const catalog = await getPublicCatalog();
  const s: WizardState = initialWizardState();
  s.segment = "commercial";
  s.product = { ...s.product, name: "Kits de regalo", weight: "350", length: "20", width: "15", height: "8" };
  for (const type of catalog.productTypes.filter((t) => t.segments.includes("commercial"))) {
    const size = catalog.sizes.find((z) => z.family === type.sizeFamily);
    const paper = catalog.papers.find((p) => evaluatePaper(catalog.compatibilities, type.id, p.id).allowed);
    const caliber = paper && catalog.calibers.find((c) => evaluateCaliber(catalog.compatibilities, type.id, paper.id, c.id).allowed);
    const print = catalog.printOptions.find((p) => !p.isNoPrint && !p.requiresPantone);
    if (!size || !paper || !caliber || !print) continue;
    s.items = [
      {
        ...emptyItem("a"),
        productTypeId: type.id,
        categoryId: type.categoryId,
        sizeMode: "standard",
        standardSizeId: size.id,
        paperId: paper.id,
        caliberId: caliber.id,
        printOptionId: print.id,
        faces: "outside",
        coverage: "logo",
        quantities: ["1000", "20000", ""],
        frequency: "once",
        artwork: "has_artwork",
      },
    ];
    break;
  }
  seq += 1;
  s.contact = { ...s.contact, company: "Dulces Istmo", name: "Paula Ríos", email: `paula-e8-${seq}@example.com`, whatsapp: "+507 6444-5555", city: "Panamá", address: "Punta Pacífica", consent: true };
  const { token } = await saveDraft(null, s);
  const sent = await submitDraft(token, { ip: null });
  if (!sent.ok) throw new Error("envío rechazado");
  const { requestId, accessToken } = sent;
  const [item] = await testSql()<{ id: string }[]>`select id from public.quote_items where request_id = ${requestId}`;
  const itemId = item!.id;
  await changeRequestStatus(user, requestId, "in_review");
  await testSql()`
    insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status, uploaded_by_client)
    values (${itemId}, ${requestId}, 'proof', 1, ${`requests/${requestId}/${itemId}/proof/p1-proof.pdf`}, 'proof.pdf', 'pdf', 100, 'proof_sent', false)`;
  const [proof] = await testSql()<{ id: string }[]>`select id from public.artwork_files where request_id = ${requestId} and kind = 'proof'`;
  await testSql()`insert into public.artwork_approvals (artwork_file_id, request_id, approved_by_name) values (${proof!.id}, ${requestId}, 'Paula')`;
  await testSql()`update public.artwork_files set status = 'released' where id = ${proof!.id}`;
  const gen = await generateRfq(user, requestId);
  if (!gen.ok) throw new Error(`RFQ: ${gen.error}`);
  await sendRfq(user, gen.rfq.id);
  const answer = await recordRfqResponse(user, gen.rfq.id, {
    costs: [
      { itemId, quantity: 1000, unitCost: "0.42" },
      { itemId, quantity: 20000, unitCost: "0.30" },
    ],
    currency: "usd",
    productionDays: "25",
    notes: "",
  });
  if (!answer.ok) throw new Error(`respuesta: ${answer.error}`);
  const draft = await createQuoteDraft(user, requestId);
  if (!draft.ok) throw new Error(`sin borrador: ${draft.error}`);
  await updateQuoteDraft(user, draft.quote.id, {
    lines: [
      { itemId, quantity: 1000, unitCost: "0.42", freightTotal: "80", marginPct: "35", leadTimeDays: "30" },
      { itemId, quantity: 20000, unitCost: "0.30", freightTotal: "600", marginPct: "30", leadTimeDays: "45" },
    ],
    validUntil: addDays(new Date(), 10).toISOString().slice(0, 10),
    notes: "",
  });
  if (!(await issueQuote(user, draft.quote.id)).ok) throw new Error("no se emitió");
  const quantity = opts.quantity ?? 20000;
  const accepted = await acceptQuote(accessToken, draft.quote.id, { name: "Paula Ríos", selection: [{ itemId, quantity }], ip: null, userAgent: null });
  if (!accepted.ok) throw new Error(`aceptación: ${accepted.error}`);
  const [order] = await testSql()<{ id: string }[]>`select id from public.orders where request_id = ${requestId}`;
  return { user, requestId, accessToken, itemId, proofId: proof!.id, quoteId: draft.quote.id, orderId: order!.id };
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]), Buffer.alloc(200)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200)]);

async function notificationsFor(requestId: string, code: string) {
  return testSql()<{ channel: string; payload: { vars: Record<string, string> } }[]>`
    select channel, payload from public.notifications where request_id = ${requestId} and template_code = ${code} order by created_at`;
}

describe("pedido al aceptar la cotización", () => {
  it("se crea con líneas, total, anticipo, saldo, plazo e hito de arte; el cliente no puede leer montos", async () => {
    const o = await acceptedOrder();
    const [row] = await testSql()<
      { number: string; status: string; total_amount: string; deposit_pct: number; deposit_amount: string; balance_amount: string; lead_time_days: number; estimated_delivery_date: Date | null }[]
    >`select number, status, total_amount, deposit_pct, deposit_amount, balance_amount, lead_time_days, estimated_delivery_date from public.orders where id = ${o.orderId}`;
    expect(row?.number).toMatch(/^P-\d{4}-\d{5}$/);
    expect(row?.status).toBe("pending_deposit");
    const [line] = await testSql()<{ subtotal: string }[]>`
      select (l->>'subtotal') as subtotal from public.quotes q, jsonb_array_elements(q.lines) l where q.id = ${o.quoteId} and (l->>'quantity')::int = 20000`;
    const total = Number(line!.subtotal);
    expect(Number(row!.total_amount)).toBeCloseTo(total, 2);
    expect(Number(row!.deposit_amount)).toBeCloseTo(Math.round(total * row!.deposit_pct) / 100, 2);
    expect(Number(row!.deposit_amount) + Number(row!.balance_amount)).toBeCloseTo(total, 2);
    expect(row?.lead_time_days).toBe(45);
    expect(row?.estimated_delivery_date).toBeNull(); // sin anticipo todavía
    const art = await testSql()`select 1 from public.milestones where order_id = ${o.orderId} and type = 'artwork_approved'`;
    expect(art).toHaveLength(1);

    // El cliente (anon con su token) ve el pedido pero no los montos.
    const visible = await asActor({ kind: "anon", accessToken: o.accessToken }, (tx) => tx`select id, status from public.orders where id = ${o.orderId}`);
    expect(visible).toHaveLength(1);
    await expect(asActor({ kind: "anon", accessToken: o.accessToken }, (tx) => tx`select total_amount from public.orders where id = ${o.orderId}`)).rejects.toThrow(/permission denied/);
    await expect(asActor({ kind: "anon", accessToken: o.accessToken }, (tx) => tx`select amount from public.payments`)).rejects.toThrow(/permission denied/);
    // Otro token no ve este pedido.
    const other = await asActor({ kind: "anon", accessToken: "x".repeat(43) }, (tx) => tx`select id from public.orders where id = ${o.orderId}`);
    expect(other).toHaveLength(0);

    const client = await orders.getClientOrder(o.accessToken);
    expect(client?.status).toBe("pending_deposit");
    // Con la cotización aceptada, el portal lleva los montos del pedido (D-101).
    expect(client?.amounts).toEqual({
      currency: "USD",
      total: Number(row!.total_amount),
      deposit: Number(row!.deposit_amount),
      balance: Number(row!.balance_amount),
      paidDeposit: 0,
      paidBalance: 0,
    });
    expect(client?.paymentList).toEqual([]);
    expect(client?.payments).toEqual({ deposit: "none", balance: "none" });
  });
});

describe("hitos, pagos y cierre", () => {
  it("de anticipo a cerrado: fecha estimada, producción con proof, QA con checklist, embarque, entrega, saldo y cierre", async () => {
    const o = await acceptedOrder();
    const ops = await staff("ops");
    const viewer = await staff("viewer");

    // Sin anticipo no hay hitos manuales; el viewer no registra nada.
    expect(await orders.recordMilestone(ops, o.orderId, { type: "production_started" })).toEqual({ ok: false, error: "type" });
    expect(await orders.recordPayment(viewer, o.orderId, { kind: "deposit", amount: "100", method: "", reference: "", paidOn: "" })).toEqual({ ok: false, error: "forbidden" });
    expect(await orders.recordPayment(ops, o.orderId, { kind: "deposit", amount: "0", method: "", reference: "", paidOn: "" })).toEqual({ ok: false, error: "amount" });

    // Anticipo: pasa a "Anticipo recibido", corre el plazo y se avisa al cliente.
    const before = await orders.getOrder(ops, o.orderId);
    expect(await orders.recordPayment(ops, o.orderId, { kind: "deposit", amount: String(before!.depositAmount), method: "ACH", reference: "123", paidOn: "" })).toEqual({ ok: true });
    const afterDeposit = await orders.getOrder(ops, o.orderId);
    expect(afterDeposit?.status).toBe("deposit_received");
    expect(afterDeposit?.leadTimeStart).toBe(todayInPanama());
    expect(afterDeposit?.estimatedDeliveryDate).toBe(addDays(new Date(`${todayInPanama()}T12:00:00Z`), 45).toISOString().slice(0, 10));
    expect(afterDeposit?.milestones.map((m) => m.type)).toEqual(["artwork_approved", "deposit_received"]);
    const deposit = await notificationsFor(o.requestId, "deposit_received");
    expect(deposit.length).toBeGreaterThan(0);
    expect(deposit[0]?.payload.vars.numero_pedido).toBe(afterDeposit?.number);

    // Producción: bloqueada si el proof deja de estar vigente.
    await testSql()`update public.artwork_files set deleted_at = now() where id = ${o.proofId}`;
    expect(await orders.recordMilestone(ops, o.orderId, { type: "production_started" })).toEqual({ ok: false, error: "artwork" });
    await testSql()`update public.artwork_files set deleted_at = null where id = ${o.proofId}`;
    const production = await orders.recordMilestone(ops, o.orderId, { type: "production_started", notes: "Arrancó la impresión." });
    expect(production.ok).toBe(true);
    expect((await notificationsFor(o.requestId, "order_production")).length).toBe(1);

    // La máquina de estados no deja saltar pasos.
    await expect(testSql()`update public.orders set status = 'closed' where id = ${o.orderId}`).rejects.toThrow(/Transición de pedido no permitida/);

    // QA: exige cada punto del checklist contra la especificación.
    const detail = await orders.getOrder(ops, o.orderId);
    const checklist = orders.orderQaChecklist(detail!);
    expect(checklist.map((p) => p.key)).toEqual(["1:material", "1:caliber", "1:size", "1:print", "1:finish", "1:quantity"]);
    expect(checklist.find((p) => p.key === "1:quantity")?.expected).toBe("20,000");
    const partial = checklist.slice(0, 3).map((p) => ({ key: p.key, result: "ok" }));
    expect(await orders.recordMilestone(ops, o.orderId, { type: "qa_completed", qa: partial })).toEqual({ ok: false, error: "qa" });
    const full = checklist.map((p, i) => ({ key: p.key, result: i === 4 ? "observed" : "ok", comment: i === 4 ? "Laminado con leve brillo" : "" }));
    const qa = await orders.recordMilestone(ops, o.orderId, { type: "qa_completed", qa: full, eta: addDays(new Date(), 3).toISOString().slice(0, 10) });
    expect(qa.ok).toBe(true);
    if (!qa.ok) return;

    // Evidencia (foto de QA): se valida el tipo real y el cliente la ve con su enlace.
    const slot = await orders.prepareEvidenceUpload(ops, qa.milestoneId, { name: "qa-1.jpg", size: JPEG.length });
    expect(slot.ok).toBe(true);
    if (!slot.ok) return;
    await putObject("evidence", slot.path, JPEG, "image/jpeg");
    const confirmed = await orders.confirmEvidenceUpload(ops, qa.milestoneId, { path: slot.path, name: "qa-1.jpg" });
    expect(confirmed).toMatchObject({ ok: true, file: { kind: "jpeg" } });
    const HTML = Buffer.from("<html><script>alert(1)</script></html>");
    const fake = await orders.prepareEvidenceUpload(ops, qa.milestoneId, { name: "falsa.jpg", size: HTML.length });
    if (!fake.ok) throw new Error("sin slot");
    await putObject("evidence", fake.path, HTML, "image/jpeg");
    expect(await orders.confirmEvidenceUpload(ops, qa.milestoneId, { path: fake.path, name: "falsa.jpg" })).toEqual({ ok: false, error: "typeMismatch" });
    expect(await orders.prepareEvidenceUpload(ops, qa.milestoneId, { name: "virus.exe", size: 10 })).toEqual({ ok: false, error: "badType" });
    const client = await orders.getClientOrder(o.accessToken);
    const clientQa = client?.milestones.find((m) => m.type === "qa_completed");
    expect(clientQa?.evidence).toHaveLength(1);
    expect(clientQa?.evidence[0]?.url).toBeTruthy();
    expect(clientQa?.qa?.find((p) => p.label.includes("Acabado"))?.result).toBe("observed");
    expect(await orders.evidenceUrl({ token: o.accessToken }, o.orderId, slot.path)).toBeTruthy();
    expect(await orders.evidenceUrl({ token: o.accessToken }, o.orderId, `orders/${o.orderId}/otro/x.jpg`)).toBeNull();
    const qaNotice = await notificationsFor(o.requestId, "order_milestone");
    expect(qaNotice).toHaveLength(1);

    // Embarque con guía y ETA; entrega.
    const eta = addDays(new Date(), 12).toISOString().slice(0, 10);
    expect((await orders.recordMilestone(ops, o.orderId, { type: "shipped", transport: "Marítimo Callao–Balboa", tracking: "MSKU1234567", eta })).ok).toBe(true);
    const shipped = await orders.getOrder(ops, o.orderId);
    expect([shipped?.status, shipped?.tracking, shipped?.eta]).toEqual(["shipped", "MSKU1234567", eta]);
    expect((await notificationsFor(o.requestId, "order_shipped")).length).toBe(1);
    expect((await orders.recordMilestone(ops, o.orderId, { type: "delivered" })).ok).toBe(true);
    expect((await notificationsFor(o.requestId, "order_delivered")).length).toBeGreaterThan(0);

    // Cerrar exige el saldo confirmado.
    expect(await orders.recordMilestone(ops, o.orderId, { type: "closed" })).toEqual({ ok: false, error: "balance" });

    // El cliente sube el comprobante del saldo; el equipo lo confirma.
    const receiptSlot = await orders.prepareReceiptUpload(o.accessToken, { name: "transferencia.pdf", size: PDF.length });
    if (!receiptSlot.ok) throw new Error("sin slot de comprobante");
    await putObject("documents", receiptSlot.path, PDF, "application/pdf");
    expect((await orders.confirmReceiptUpload(o.accessToken, { path: receiptSlot.path, name: "transferencia.pdf" })).ok).toBe(true);
    expect((await orders.getClientOrder(o.accessToken))?.payments.balance).toBe("pending");
    expect((await notificationsFor(o.requestId, "receipt_uploaded_team")).length).toBe(1);
    const pending = (await orders.getOrder(ops, o.orderId))!.payments.find((p) => p.status === "pending")!;
    expect(pending.kind).toBe("balance");
    expect(await orders.receiptUrl(ops, pending.id)).toBeTruthy();
    expect(await orders.reviewPayment(ops, pending.id, { decision: "confirm", amount: "" })).toEqual({ ok: false, error: "amount" });
    expect(await orders.reviewPayment(ops, pending.id, { decision: "confirm", amount: String(shipped!.balanceAmount), method: "Transferencia" })).toEqual({ ok: true });
    expect(await orders.reviewPayment(ops, pending.id, { decision: "reject" })).toEqual({ ok: false, error: "status" });

    expect((await orders.recordMilestone(ops, o.orderId, { type: "closed" })).ok).toBe(true);
    const closed = await orders.getOrder(ops, o.orderId);
    expect(closed?.status).toBe("closed");
    expect(closed?.closedAt).toBeInstanceOf(Date);
    expect(closed?.milestones.map((m) => m.type)).toEqual([
      "artwork_approved",
      "deposit_received",
      "production_started",
      "qa_completed",
      "shipped",
      "delivered",
      "balance_received",
      "closed",
    ]);
    const clientClosed = await orders.getClientOrder(o.accessToken);
    expect(clientClosed?.payments).toEqual({ deposit: "confirmed", balance: "confirmed" });
    expect(clientClosed?.amounts.paidDeposit).toBeCloseTo(shipped!.depositAmount, 2);
    expect(clientClosed?.amounts.paidBalance).toBeCloseTo(shipped!.balanceAmount, 2);
    expect(clientClosed?.paymentList.map((p) => [p.kind, p.status, p.uploadedByClient])).toEqual([
      ["deposit", "confirmed", false],
      ["balance", "confirmed", true],
    ]);
    // Los montos no quedan expuestos al rol anónimo: se leen en el servidor tras validar el enlace.
    await expect(asActor({ kind: "anon", accessToken: o.accessToken }, (tx) => tx`select amount from public.payments`)).rejects.toThrow(/permission denied/);

    // Encuesta NPS: 0 a 10, una por pedido.
    expect(await orders.submitSurvey(o.accessToken, { score: 11, comment: "", ip: null })).toEqual({ ok: false, error: "score" });
    expect(await orders.submitSurvey(o.accessToken, { score: 9, comment: "Muy puntuales", ip: "203.0.113.9" })).toEqual({ ok: true });
    expect(await orders.submitSurvey(o.accessToken, { score: 10, comment: "", ip: null })).toEqual({ ok: false, error: "status" });
    expect((await orders.getClientOrder(o.accessToken))?.surveyDone).toBe(true);
    // Pedido cerrado: ya no recibe comprobantes.
    expect(await orders.prepareReceiptUpload(o.accessToken, { name: "otro.pdf", size: PDF.length })).toEqual({ ok: false, error: "expired" });
  });
});

describe("procesos programados y recompra", () => {
  it("recuerda el saldo a los 2 y 5 días de la entrega (una vez por día) y manda la encuesta 7 días después del cierre", async () => {
    const o = await acceptedOrder({ quantity: 1000 });
    const deliveredAt = addDays(new Date(), -2);
    // Avanza por la máquina de estados hasta "Entregado" hace 2 días.
    for (const s of ["deposit_received", "in_production", "qa", "shipped", "delivered"]) {
      await testSql()`update public.orders set status = ${s}::public.order_status where id = ${o.orderId} and status <> ${s}::public.order_status`;
    }
    await testSql()`update public.orders set delivered_at = ${deliveredAt} where id = ${o.orderId}`;
    expect(await orders.balanceReminders(new Date())).toBeGreaterThanOrEqual(1);
    await orders.balanceReminders(new Date());
    expect(await notificationsFor(o.requestId, "balance_reminder")).toHaveLength(1);
    await testSql()`update public.orders set delivered_at = ${addDays(new Date(), -3)} where id = ${o.orderId}`;
    await orders.balanceReminders(new Date());
    expect(await notificationsFor(o.requestId, "balance_reminder")).toHaveLength(1); // el día 3 no toca

    await testSql()`update public.orders set status = 'closed' where id = ${o.orderId}`;
    await testSql()`update public.orders set closed_at = ${addDays(new Date(), -6)} where id = ${o.orderId}`;
    await orders.npsSurveys(new Date());
    expect(await notificationsFor(o.requestId, "nps_survey")).toHaveLength(0);
    await testSql()`update public.orders set closed_at = ${addDays(new Date(), -7)} where id = ${o.orderId}`;
    await orders.npsSurveys(new Date());
    await orders.npsSurveys(new Date());
    const nps = await notificationsFor(o.requestId, "nps_survey");
    expect(nps).toHaveLength(1);
    expect(nps[0]?.payload.vars.enlace).toContain(`/seguimiento/${o.accessToken}#encuesta`);
  });

  it("'Pedir de nuevo' arma el cotizador con las mismas piezas y la cantidad pedida", async () => {
    const o = await acceptedOrder({ quantity: 1000 });
    const source = await orders.getReorderSource(o.accessToken);
    expect(source?.lines).toHaveLength(1);
    const catalog = await getPublicCatalog();
    const state = reorderState(source!, catalog);
    expect(state.step).toBe(9);
    expect(state.segment).toBe("commercial");
    expect(state.items[0]?.quantities).toEqual(["1000", "", ""]);
    expect(state.items[0]?.productTypeId).toBe(source!.lines[0]!.spec.type!.id);
    expect(state.items[0]?.artworkFiles).toEqual([]);
    expect(state.contact.consent).toBe(false);
    expect(state.contact.comments).toContain((await orders.getClientOrder(o.accessToken))!.number);
    expect(await orders.getReorderSource("y".repeat(43))).toBeNull();
  });

  it("la retención del arte cuenta la actividad del pedido: no marca el arte de un pedido con movimiento reciente", async () => {
    const o = await acceptedOrder({ quantity: 1000 });
    const old = addDays(new Date(), -30 * 31);
    // Fechas viejas sin pasar por los triggers (la auditoría conserva created_at).
    await testSql().begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.quote_requests set submitted_at = ${old}, status_changed_at = ${old} where id = ${o.requestId}`;
      await tx`update public.artwork_files set created_at = ${old} where request_id = ${o.requestId}`;
      await tx`update public.orders set status_changed_at = ${old}, created_at = ${old} where id = ${o.orderId}`;
      await tx`update public.milestones set occurred_at = ${old} where order_id = ${o.orderId}`;
    });
    // Un hito de hace un mes mantiene vivo el arte.
    await testSql()`insert into public.milestones (order_id, type, occurred_at) values (${o.orderId}, 'deposit_received', now() - interval '30 days')`;
    await flagExpiredArtwork();
    const [kept] = await testSql()<{ flagged: Date | null }[]>`select retention_flagged_at as flagged from public.artwork_files where request_id = ${o.requestId}`;
    expect(kept?.flagged).toBeNull();
    // Sin actividad reciente, se marca (no se borra).
    await testSql()`update public.milestones set occurred_at = ${old} where order_id = ${o.orderId}`;
    await flagExpiredArtwork();
    const [flagged] = await testSql()<{ flagged: Date | null; deleted: Date | null }[]>`
      select retention_flagged_at as flagged, deleted_at as deleted from public.artwork_files where request_id = ${o.requestId}`;
    expect(flagged?.flagged).toBeInstanceOf(Date);
    expect(flagged?.deleted).toBeNull();
  });
});
