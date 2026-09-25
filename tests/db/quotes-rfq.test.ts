import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
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
const { acceptQuote, createQuoteDraft, expireQuotes, getClientQuote, issueQuote, quoteExpiryReminders, requestQuoteChanges, updateQuoteDraft } = await import("@/lib/quotes");
const { processNotificationQueue } = await import("@/lib/notify");
const { getObject } = await import("@/lib/storage");
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
async function sales(): Promise<CurrentUser> {
  seq += 1;
  const id = await createUser(`ventas-e7-${Date.now()}-${seq}@test.local`, "sales");
  return { userId: id, email: null, profileId: id, name: null, role: "sales", isActive: true };
}

/** Solicitud "verde" con una pieza impresa (dos cantidades) armada con el catálogo sembrado. */
async function printedRequest(): Promise<{ requestId: string; accessToken: string; itemId: string }> {
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
        referenceLinks: ["https://example.com/idea"],
      },
    ];
    break;
  }
  seq += 1;
  s.contact = { ...s.contact, name: "Paula Ríos", email: `paula${seq}@example.com`, whatsapp: "+507 6444-5555", city: "Panamá", address: "Punta Pacífica", consent: true };
  const { token } = await saveDraft(null, s);
  const result = await submitDraft(token, { ip: null });
  if (!result.ok) throw new Error("envío rechazado");
  const [item] = await testSql()<{ id: string }[]>`select id from public.quote_items where request_id = ${result.requestId}`;
  return { requestId: result.requestId, accessToken: result.accessToken, itemId: item!.id };
}

async function addArtwork(requestId: string, itemId: string, status = "released") {
  await testSql()`
    insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status, uploaded_by_client)
    values (${itemId}, ${requestId}, 'proof', 1, ${`requests/${requestId}/${itemId}/proof/p1-proof.pdf`}, 'proof.pdf', 'pdf', 100, 'proof_sent', false)`;
  if (status === "released") {
    const [p] = await testSql()<{ id: string }[]>`select id from public.artwork_files where request_id = ${requestId} and kind = 'proof'`;
    await testSql()`insert into public.artwork_approvals (artwork_file_id, request_id, approved_by_name) values (${p!.id}, ${requestId}, 'Paula')`;
    await testSql()`update public.artwork_files set status = 'released' where id = ${p!.id}`;
  }
}

async function readyForQuote() {
  const user = await sales();
  const r = await printedRequest();
  await changeRequestStatus(user, r.requestId, "in_review");
  await addArtwork(r.requestId, r.itemId);
  const gen = await generateRfq(user, r.requestId);
  if (!gen.ok) throw new Error(`RFQ: ${gen.error}`);
  await sendRfq(user, gen.rfq.id);
  const answer = await recordRfqResponse(user, gen.rfq.id, {
    costs: [
      { itemId: r.itemId, quantity: 1000, unitCost: "0,42" },
      { itemId: r.itemId, quantity: 20000, unitCost: "0.30" },
    ],
    currency: "usd",
    productionDays: "25",
    notes: "Tinta Pantone con recargo incluido.",
  });
  if (!answer.ok) throw new Error(`respuesta: ${answer.error}`);
  return { user, ...r, rfq: gen.rfq };
}

describe("RFQ a fábrica", () => {
  it("se genera sin retipear (PDF y Excel con los códigos), exige arte y se envía a la fábrica", async () => {
    const user = await sales();
    const r = await printedRequest();
    expect((await generateRfq(user, r.requestId)).ok).toBe(false); // todavía Enviada
    await changeRequestStatus(user, r.requestId, "in_review");
    expect(await generateRfq(user, r.requestId)).toEqual({ ok: false, error: "artwork", pieces: [1] });
    await addArtwork(r.requestId, r.itemId);
    const gen = await generateRfq(user, r.requestId);
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;
    const [row] = await testSql()<{ pdf_path: string; xlsx_path: string }[]>`select pdf_path, xlsx_path from public.factory_rfqs where id = ${gen.rfq.id}`;
    const pdf = await getObject("documents", row!.pdf_path);
    expect(pdf?.data.subarray(0, 5).toString()).toBe("%PDF-");
    const xlsx = await getObject("documents", row!.xlsx_path);
    const book = XLSX.read(xlsx!.data, { type: "buffer" });
    const sheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]!]!);
    expect(sheet).toHaveLength(2);
    expect(sheet.map((x) => x["Cantidad"])).toEqual([1000, 20000]);
    expect(String(sheet[0]?.["Código tipo"])).toMatch(/^[A-Z]{2}-\d{2}/);
    expect(String(sheet[0]?.["Código papel"])).toMatch(/^PA-/);
    expect(String(sheet[0]?.["Arte"])).toContain("proof.pdf");

    expect(await sendRfq(user, gen.rfq.id)).toEqual({ ok: true });
    const [req] = await testSql()<{ status: string }[]>`select status from public.quote_requests where id = ${r.requestId}`;
    expect(req?.status).toBe("rfq_sent");
    expect(
      await recordRfqResponse(user, gen.rfq.id, { costs: [{ itemId: r.itemId, quantity: 1000, unitCost: "0.4" }], currency: "USD", productionDays: "20", notes: "" }),
    ).toEqual({ ok: false, error: "costs" });
  });
});

describe("cotización", () => {
  it("se calcula con margen, se emite, avisa al cliente y el cliente la acepta eligiendo cantidades", async () => {
    const { user, requestId, accessToken, itemId } = await readyForQuote();
    const draft = await createQuoteDraft(user, requestId);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.quote.number).toMatch(/^C-\d{4}-\d{5}-v1$/);
    expect(draft.quote.lines.map((l) => [l.quantity, l.unitCost, l.marginPct, l.leadTimeDays])).toEqual([
      [1000, 0.42, 35, 30],
      [20000, 0.3, 35, 45],
    ]);
    const saved = await updateQuoteDraft(user, draft.quote.id, {
      lines: [
        { itemId, quantity: 1000, unitCost: "0.42", freightTotal: "80", marginPct: "35", leadTimeDays: "30" },
        { itemId, quantity: 20000, unitCost: "0.30", freightTotal: "600", marginPct: "30", leadTimeDays: "45" },
      ],
      validUntil: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10),
      notes: "Incluye un color Pantone.",
    });
    expect(saved.ok && saved.quote.lines.map((l) => [l.unitPrice, l.subtotal])).toEqual([
      [0.7692, 769.2],
      [0.4714, 9428],
    ]);
    expect((await issueQuote(user, draft.quote.id)).ok).toBe(true);
    const [req] = await testSql()<{ status: string }[]>`select status from public.quote_requests where id = ${requestId}`;
    expect(req?.status).toBe("quoted");

    await processNotificationQueue(200);
    const sent = await testSql()<{ status: string; body: string }[]>`
      select status, body from public.notifications where request_id = ${requestId} and template_code = 'quote_sent' and channel = 'email'`;
    expect(sent[0]?.status).toBe("simulated");
    expect(sent[0]?.body).toContain(draft.quote.number);
    expect(sent[0]?.body).toContain("entrega en 30 a 45 días");

    // El cliente no lee costos, márgenes ni precios desde la base.
    await expect(asActor({ kind: "anon", accessToken }, (tx) => tx`select lines from public.quotes`)).rejects.toThrow(/permission denied/);
    const client = await getClientQuote(accessToken);
    expect(client?.options).toEqual([expect.objectContaining({ itemId, quantities: [1000, 20000] })]);
    expect(JSON.stringify(client)).not.toContain("0.7692");

    expect(await acceptQuote(accessToken, draft.quote.id, { name: "Paula Ríos", selection: [{ itemId, quantity: 5000 }], ip: null, userAgent: null })).toEqual({
      ok: false,
      error: "selection",
    });
    expect(await acceptQuote(accessToken, draft.quote.id, { name: "Paula Ríos", selection: [{ itemId, quantity: 20000 }], ip: "203.0.113.5", userAgent: "x" })).toEqual({ ok: true });
    const [after] = await testSql()<{ status: string; q: string; ip: string }[]>`
      select r.status, q.status as q, q.accepted_ip as ip from public.quote_requests r join public.quotes q on q.request_id = r.id where r.id = ${requestId}`;
    expect(after).toEqual({ status: "accepted", q: "accepted", ip: "203.0.113.5" });
    await expect(testSql()`update public.quotes set accepted_at = now() where id = ${draft.quote.id}`).rejects.toThrow(/inmutable/);
    const team = await testSql()`select 1 from public.notifications where request_id = ${requestId} and template_code = 'quote_accepted_team'`;
    expect(team).toHaveLength(1);
  });

  it("pedir cambios lleva a una versión nueva que reemplaza a la anterior", async () => {
    const { user, requestId, accessToken } = await readyForQuote();
    const v1 = await createQuoteDraft(user, requestId);
    if (!v1.ok) throw new Error("sin borrador");
    await issueQuote(user, v1.quote.id);
    expect(await requestQuoteChanges(accessToken, v1.quote.id, "¿Pueden cotizar con cartulina en vez de microcorrugado?")).toEqual({ ok: true });
    const v2 = await createQuoteDraft(user, requestId);
    if (!v2.ok) throw new Error("sin v2");
    expect(v2.quote.number).toBe(v1.quote.number.replace("-v1", "-v2"));
    await issueQuote(user, v2.quote.id);
    const rows = await testSql()<{ number: string; status: string }[]>`select number, status from public.quotes where request_id = ${requestId} order by version`;
    expect(rows.map((r) => r.status)).toEqual(["superseded", "sent"]);
    expect((await getClientQuote(accessToken))?.number).toBe(v2.quote.number);
  });

  it("rechazada exige motivo y cierra la cotización; al vencer, la solicitud pasa a Vencida y hay recordatorios", async () => {
    const a = await readyForQuote();
    const qa = await createQuoteDraft(a.user, a.requestId);
    if (!qa.ok) throw new Error("sin borrador");
    await issueQuote(a.user, qa.quote.id);
    expect(await changeRequestStatus(a.user, a.requestId, "rejected")).toEqual({ ok: false, error: "loss_reason" });
    expect(await changeRequestStatus(a.user, a.requestId, "rejected", { lossReason: "lead_time" })).toEqual({ ok: true });
    const [rejected] = await testSql()<{ status: string }[]>`select status from public.quotes where id = ${qa.quote.id}`;
    expect(rejected?.status).toBe("rejected");

    const b = await readyForQuote();
    const qb = await createQuoteDraft(b.user, b.requestId);
    if (!qb.ok) throw new Error("sin borrador");
    await issueQuote(b.user, qb.quote.id);
    await testSql()`update public.quotes set valid_until = (now() at time zone 'America/Panama')::date + 3 where id = ${qb.quote.id}`;
    // Dos pasadas el mismo día: un solo recordatorio (clave única).
    await quoteExpiryReminders(new Date());
    await quoteExpiryReminders(new Date());
    const reminders = await testSql()`select 1 from public.notifications where request_id = ${b.requestId} and template_code = 'quote_expiring'`;
    expect(reminders).toHaveLength(1);
    await testSql()`update public.quotes set valid_until = (now() at time zone 'America/Panama')::date - 1 where id = ${qb.quote.id}`;
    expect(await acceptQuote(b.accessToken, qb.quote.id, { name: "Paula Ríos", selection: [{ itemId: b.itemId, quantity: 1000 }], ip: null, userAgent: null })).toEqual({
      ok: false,
      error: "expired",
    });
    await expireQuotes();
    const [expired] = await testSql()<{ r: string; q: string }[]>`
      select r.status as r, q.status as q from public.quote_requests r join public.quotes q on q.request_id = r.id where q.id = ${qb.quote.id}`;
    expect(expired).toEqual({ r: "expired", q: "expired" });
  });
});
