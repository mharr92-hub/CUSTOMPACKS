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
const { confirmRecordDeletion, flagExpiredArtwork, flagExpiredRecords, listFlaggedRecords } = await import("@/lib/artwork/retention");
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
        artwork: "no_artwork_yet",
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

async function confirmDeposit(o: { orderId: string }, ops: CurrentUser) {
  const [order] = await testSql()<{ deposit_amount: string }[]>`select deposit_amount from public.orders where id = ${o.orderId}`;
  const paid = await orders.recordPayment(ops, o.orderId, { kind: "deposit", amount: String(order!.deposit_amount), method: "ACH", reference: `M5-${Date.now()}`, paidOn: todayInPanama() });
  if (!paid.ok) throw new Error(`anticipo: ${paid.error}`);
}

describe("pagos conciliados por monto (M12)", () => {
  it("un abono parcial no da el anticipo por recibido; el que completa sí, y arranca el plazo", async () => {
    const o = await acceptedOrder();
    const ops = await staff();
    const [order] = await testSql()<{ deposit_amount: string }[]>`select deposit_amount from public.orders where id = ${o.orderId}`;
    const deposit = Number(order!.deposit_amount);
    const pay = (amount: number, reference: string) =>
      orders.recordPayment(ops, o.orderId, { kind: "deposit", amount: amount.toFixed(2), method: "ACH", reference, paidOn: todayInPanama() });

    expect(await pay(100, `M12-a-${o.orderId}`)).toEqual({ ok: true });
    let d = await orders.getOrder(ops, o.orderId);
    expect(d?.status).toBe("pending_deposit");
    expect(d?.depositConfirmed).toBe(false);
    expect(d?.paid.deposit).toBe(100);
    expect(d?.leadTimeStart).toBeNull();
    expect(d?.milestones.map((m) => m.type)).not.toContain("deposit_received");
    expect(await notificationsFor(o.requestId, "deposit_received")).toHaveLength(0);
    // La base tampoco deja producir.
    await expect(testSql()`update public.orders set status = 'deposit_received' where id = ${o.orderId}`).resolves.toBeDefined();
    await expect(testSql()`update public.orders set status = 'in_production' where id = ${o.orderId}`).rejects.toThrow(/anticipo no está cubierto/);
    await testSql()`update public.orders set status = 'pending_deposit' where id = ${o.orderId}`;

    // Misma referencia: rechazado.
    expect(await pay(50, `M12-a-${o.orderId}`)).toEqual({ ok: false, error: "duplicate" });

    expect(await pay(Math.round((deposit - 100) * 100) / 100, `M12-b-${o.orderId}`)).toEqual({ ok: true });
    d = await orders.getOrder(ops, o.orderId);
    expect(d?.status).toBe("deposit_received");
    expect(d?.depositConfirmed).toBe(true);
    expect(d?.leadTimeStart).toBe(todayInPanama());
    expect(await notificationsFor(o.requestId, "deposit_received")).toHaveLength(2); // correo y WhatsApp (M14)

    // Anular un abono antes de producir devuelve el pedido a "Esperando anticipo".
    const [b] = await testSql()<{ id: string }[]>`select id from public.payments where order_id = ${o.orderId} and reference = ${`M12-b-${o.orderId}`}`;
    expect(await orders.voidPayment(ops, b!.id, "x")).toEqual({ ok: false, error: "reason" });
    expect(await orders.voidPayment(ops, b!.id, "Monto mal escrito")).toEqual({ ok: true });
    d = await orders.getOrder(ops, o.orderId);
    expect(d?.status).toBe("pending_deposit");
    expect(d?.paid.deposit).toBe(100);
    expect(d?.milestones.map((m) => m.type)).not.toContain("deposit_received");
    expect(d?.payments.find((p) => p.id === b!.id)).toMatchObject({ status: "voided", voidedReason: "Monto mal escrito" });
  });

  it("cerrar exige el saldo completo, los montos del pedido no se editan y nadie escribe pagos con su sesión", async () => {
    const o = await acceptedOrder();
    const ops = await staff();
    await expect(testSql()`update public.orders set total_amount = total_amount + 1 where id = ${o.orderId}`).rejects.toThrow(/montos del pedido no se editan/);
    await expect(
      asActor({ kind: "user", userId: ops.userId }, (tx) => tx`insert into public.payments (order_id, kind, status, amount, confirmed_at) values (${o.orderId}, 'deposit', 'confirmed', 1, now())`),
    ).rejects.toThrow(/permission denied/);
  });

  it("tolerancia por comisiones: 1 % del monto o USD 25, lo que sea menor (D-113)", async () => {
    const [t] = await testSql()<{ small: string; big: string }[]>`select public.payment_tolerance(1000) as small, public.payment_tolerance(10000) as big`;
    expect(Number(t!.small)).toBe(10);
    expect(Number(t!.big)).toBe(25);

    const o = await acceptedOrder();
    const ops = await staff();
    const [order] = await testSql()<{ deposit_amount: string }[]>`select deposit_amount from public.orders where id = ${o.orderId}`;
    const deposit = Number(order!.deposit_amount);
    const tolerance = Math.min(deposit / 100, 25);
    const pay = (amount: number, reference: string) =>
      orders.recordPayment(ops, o.orderId, { kind: "deposit", amount: amount.toFixed(2), method: "ACH", reference, paidOn: todayInPanama() });
    // Falta más que la tolerancia: abono parcial.
    expect(await pay(deposit - tolerance - 1, `TOL-a-${o.orderId}`)).toEqual({ ok: true });
    expect((await orders.getOrder(ops, o.orderId))?.status).toBe("pending_deposit");
    expect((await orders.getClientOrder(o.accessToken))?.payments.deposit).toBe("partial");
    // Un segundo abono deja la diferencia dentro de la tolerancia: anticipo recibido.
    expect(await pay(1.5, `TOL-b-${o.orderId}`)).toEqual({ ok: true });
    expect((await orders.getOrder(ops, o.orderId))?.status).toBe("deposit_received");
    expect((await orders.getClientOrder(o.accessToken))?.payments.deposit).toBe("confirmed");
  });

  it("el portal muestra los datos de pago de Configuración (Bloque 3)", async () => {
    const o = await acceptedOrder();
    expect((await orders.getClientOrder(o.accessToken))?.paymentInfo).toMatchObject({ bank: "", accountNumber: "", notes: "" });
    const set = (key: string, value: string) => testSql()`update public.settings set value = ${testSql().json(value)} where key = ${key}`;
    await set("payment_bank_name", "Banco de Prueba");
    await set("payment_account_type", "Corriente");
    await set("payment_account_number", "04-01-99-123456-7");
    await set("payment_account_holder", "Empresa de Prueba, S.A.");
    await set("payment_receipts_email", "pagos@example.com");
    try {
      expect((await orders.getClientOrder(o.accessToken))?.paymentInfo).toEqual({
        bank: "Banco de Prueba",
        accountType: "Corriente",
        accountNumber: "04-01-99-123456-7",
        holder: "Empresa de Prueba, S.A.",
        receiptsEmail: "pagos@example.com",
        notes: "",
      });
    } finally {
      for (const key of ["payment_bank_name", "payment_account_type", "payment_account_number", "payment_account_holder", "payment_receipts_email"]) await set(key, "");
    }
  });

  it("el anticipo se redondea hacia arriba al centavo y anticipo + saldo = total", () => {
    expect(orders.depositFor(1000.01, 50)).toBe(500.01);
    expect(Math.round((1000.01 - orders.depositFor(1000.01, 50)) * 100) / 100).toBe(500);
    expect(orders.depositFor(999.99, 30)).toBe(300);
    expect(orders.depositFor(100, 50)).toBe(50);
  });
});

describe("proof antes de producir (M5)", () => {
  it("con el v1 aprobado y un v2 pendiente no entra a producción; tampoco si el proof no está liberado", async () => {
    const o = await acceptedOrder();
    const ops = await staff();
    await confirmDeposit(o, ops);
    await testSql()`
      insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status, uploaded_by_client)
      values (${o.itemId}, ${o.requestId}, 'proof', 2, ${`requests/${o.requestId}/${o.itemId}/proof/p2-proof.pdf`}, 'proof-v2.pdf', 'pdf', 100, 'proof_sent', false)`;
    expect(await orders.recordMilestone(ops, o.orderId, { type: "production_started" })).toEqual({ ok: false, error: "artwork" });
    // La base también lo impide aunque se salte la aplicación.
    await expect(testSql()`update public.orders set status = 'in_production' where id = ${o.orderId}`).rejects.toThrow(/no puede entrar a producción/);
    // v2 aprobado pero sin liberar: todavía no.
    const [v2] = await testSql()<{ id: string }[]>`select id from public.artwork_files where request_id = ${o.requestId} and kind = 'proof' and version = 2`;
    await testSql()`insert into public.artwork_approvals (artwork_file_id, request_id, approved_by_name) values (${v2!.id}, ${o.requestId}, 'Paula')`;
    expect(await orders.recordMilestone(ops, o.orderId, { type: "production_started" })).toEqual({ ok: false, error: "artwork" });
    await testSql()`update public.artwork_files set status = 'released' where id = ${v2!.id}`;
    expect((await orders.recordMilestone(ops, o.orderId, { type: "production_started" })).ok).toBe(true);
  });

  it("una pieza «No sé, sugiéranme» sin proof exige que el equipo confirme que va sin impresión", async () => {
    const o = await acceptedOrder();
    const ops = await staff();
    await testSql()`update public.quote_items set spec_snapshot = spec_snapshot || '{"needsAdvice": true, "artwork": "not_applicable"}'::jsonb where id = ${o.itemId}`;
    await testSql()`update public.artwork_files set deleted_at = now() where request_id = ${o.requestId}`;
    await confirmDeposit(o, ops);
    const detail = await orders.getOrder(ops, o.orderId);
    expect(detail?.artworkReady).toBe(false);
    expect(detail?.artworkAdvicePending.map((p) => p.itemId)).toEqual([o.itemId]);
    expect(await orders.recordMilestone(ops, o.orderId, { type: "production_started" })).toEqual({ ok: false, error: "artwork" });
    const viewer = await staff("viewer");
    expect(await orders.confirmNoPrint(viewer, o.orderId, o.itemId)).toEqual({ ok: false, error: "forbidden" });
    expect(await orders.confirmNoPrint(ops, o.orderId, o.itemId)).toEqual({ ok: true });
    const [item] = await testSql()<{ by: string }[]>`select no_print_confirmed_by as by from public.quote_items where id = ${o.itemId}`;
    expect(item?.by).toBe(ops.userId);
    expect((await orders.recordMilestone(ops, o.orderId, { type: "production_started" })).ok).toBe(true);
  });
});

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
    expect((await notificationsFor(o.requestId, "order_production")).length).toBe(2); // correo y WhatsApp (M14)

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
    expect(qaNotice).toHaveLength(2); // correo y WhatsApp (M14)

    // Embarque con guía y ETA; entrega.
    const eta = addDays(new Date(), 12).toISOString().slice(0, 10);
    expect((await orders.recordMilestone(ops, o.orderId, { type: "shipped", transport: "Marítimo Callao–Balboa", tracking: "MSKU1234567", eta })).ok).toBe(true);
    const shipped = await orders.getOrder(ops, o.orderId);
    expect([shipped?.status, shipped?.tracking, shipped?.eta]).toEqual(["shipped", "MSKU1234567", eta]);
    expect((await notificationsFor(o.requestId, "order_shipped")).length).toBe(2); // correo y WhatsApp (M14)
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
    // Anticipo cubierto (la base lo exige para producir) y avance hasta "Entregado" hace 2 días.
    await testSql()`
      insert into public.payments (order_id, kind, status, amount, confirmed_at)
      select id, 'deposit', 'confirmed', deposit_amount, now() from public.orders where id = ${o.orderId}`;
    for (const s of ["deposit_received", "in_production", "qa", "shipped", "delivered"]) {
      await testSql()`update public.orders set status = ${s}::public.order_status where id = ${o.orderId} and status <> ${s}::public.order_status`;
    }
    await testSql()`update public.orders set delivered_at = ${deliveredAt} where id = ${o.orderId}`;
    expect(await orders.balanceReminders(new Date())).toBeGreaterThanOrEqual(1);
    await orders.balanceReminders(new Date());
    expect(await notificationsFor(o.requestId, "balance_reminder")).toHaveLength(2); // correo y WhatsApp, una vez (M14)
    await testSql()`update public.orders set delivered_at = ${addDays(new Date(), -3)} where id = ${o.orderId}`;
    await orders.balanceReminders(new Date());
    expect(await notificationsFor(o.requestId, "balance_reminder")).toHaveLength(2); // el día 3 no toca

    await testSql()`
      insert into public.payments (order_id, kind, status, amount, confirmed_at)
      select id, 'balance', 'confirmed', balance_amount, now() from public.orders where id = ${o.orderId}`;
    await testSql()`update public.orders set status = 'closed' where id = ${o.orderId}`;
    await testSql()`update public.orders set closed_at = ${addDays(new Date(), -6)} where id = ${o.orderId}`;
    await orders.npsSurveys(new Date());
    expect(await notificationsFor(o.requestId, "nps_survey")).toHaveLength(0);
    await testSql()`update public.orders set closed_at = ${addDays(new Date(), -7)} where id = ${o.orderId}`;
    await orders.npsSurveys(new Date());
    await orders.npsSurveys(new Date());
    const nps = await notificationsFor(o.requestId, "nps_survey");
    expect(nps).toHaveLength(2); // correo y WhatsApp (M14)
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

  it("retención (D-115): arte y evidencias 24 meses tras cerrar el pedido; comprobantes y cotizaciones, 5 años", async () => {
    const o = await acceptedOrder({ quantity: 1000 });
    const old = addDays(new Date(), -30 * 31);
    const veryOld = addDays(new Date(), -366 * 6);
    // Fechas viejas sin pasar por los triggers.
    await testSql().begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.quote_requests set submitted_at = ${veryOld}, status_changed_at = ${veryOld} where id = ${o.requestId}`;
      await tx`update public.artwork_files set created_at = ${veryOld} where request_id = ${o.requestId}`;
    });
    const evidencePath = `orders/${o.orderId}/m/foto-qa.jpg`;
    const [m] = await testSql()<{ id: string }[]>`
      insert into public.milestones (order_id, type, occurred_at, evidence)
      values (${o.orderId}, 'qa_completed', ${veryOld}, ${testSql().json([{ path: evidencePath, kind: "jpeg", name: "foto-qa.jpg", size: 10 }])})
      returning id`;
    const receiptPath = `orders/${o.orderId}/receipts/r.pdf`;
    const [p] = await testSql()<{ id: string }[]>`
      insert into public.payments (order_id, kind, status, amount, receipt_path) values (${o.orderId}, 'deposit', 'pending', null, ${receiptPath}) returning id`;
    await putObject("evidence", evidencePath, JPEG, "image/jpeg");
    await putObject("documents", receiptPath, PDF, "application/pdf");

    // Pedido abierto: nada vence, aunque la solicitud sea vieja.
    await flagExpiredArtwork();
    await flagExpiredRecords();
    const artworkFlag = async () =>
      (await testSql()<{ flagged: Date | null }[]>`select retention_flagged_at as flagged from public.artwork_files where request_id = ${o.requestId}`)[0]?.flagged ?? null;
    const records = async () => testSql()<{ kind: string; source_id: string }[]>`select kind, source_id from public.retention_items where order_id = ${o.orderId} order by kind`;
    expect(await artworkFlag()).toBeNull();
    expect(await records()).toEqual([]);

    // Cerrado hace 25 meses: vencen el arte y las evidencias; los documentos legales no.
    const close = async (at: Date) => testSql().begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.orders set status = 'closed', closed_at = ${at} where id = ${o.orderId}`;
    });
    await close(old);
    await flagExpiredArtwork();
    await flagExpiredRecords();
    expect(await artworkFlag()).toBeInstanceOf(Date);
    expect((await records()).map((r) => r.kind)).toEqual(["evidence"]);

    // Cerrado hace 6 años: también el comprobante, la cotización (PDF) y nada se duplica.
    await close(veryOld);
    await flagExpiredRecords();
    await flagExpiredRecords();
    const kinds = (await records()).map((r) => r.kind);
    expect(kinds).toContain("receipt");
    expect(kinds).toContain("quote_pdf");
    expect(kinds.filter((k) => k === "evidence")).toHaveLength(1);

    // Solo admin confirma; se borra el archivo y se quita la referencia, el pago queda.
    const ops = await staff();
    const adminId = await createUser(`admin-ret-${Date.now()}@test.local`, "admin");
    const admin: CurrentUser = { userId: adminId, email: null, profileId: adminId, name: null, role: "admin", isActive: true };
    expect(await listFlaggedRecords(ops)).toEqual([]);
    const flagged = (await listFlaggedRecords(admin)).filter((r) => r.requestId === o.requestId);
    expect(flagged.length).toBe(kinds.length);
    expect(await confirmRecordDeletion(ops, flagged.map((r) => r.id))).toBe(0);
    expect(await confirmRecordDeletion(admin, flagged.map((r) => r.id))).toBe(flagged.length);
    const [pay] = await testSql()<{ receipt_path: string | null }[]>`select receipt_path from public.payments where id = ${p!.id}`;
    expect(pay?.receipt_path).toBeNull();
    const [ms] = await testSql()<{ evidence: unknown[] }[]>`select evidence from public.milestones where id = ${m!.id}`;
    expect(ms?.evidence).toEqual([]);
    const [q] = await testSql()<{ pdf_path: string | null; status: string }[]>`select pdf_path, status from public.quotes where id = ${o.quoteId}`;
    expect(q).toEqual({ pdf_path: null, status: "accepted" });
  });
});
