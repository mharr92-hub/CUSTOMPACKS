import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { confirmUpload, prepareUpload } from "@/lib/artwork/uploads";
import { getPublicCatalog, type PublicCatalog } from "@/lib/catalog/public";
import { evaluateCaliber, evaluatePaper } from "@/lib/compat";
import { serviceActor, withActor } from "@/lib/db/actor";
import { addDays } from "@/lib/leadtime";
import { getOrder, orderQaChecklist, prepareEvidenceUpload, confirmEvidenceUpload, recordMilestone, recordPayment } from "@/lib/orders";
import { assignRequest, changeRequestStatus } from "@/lib/panel/requests";
import { saveDraft } from "@/lib/quote/drafts";
import { submitDraft } from "@/lib/quote/submit";
import { emptyItem, initialWizardState, type ItemDraft, type WizardState } from "@/lib/quote/types";
import { acceptQuote, createQuoteDraft, issueQuote, updateQuoteDraft } from "@/lib/quotes";
import { generateRfq, recordRfqResponse, sendRfq } from "@/lib/rfq";
import { putObject } from "@/lib/storage";
import { demoArtworkPdf, demoQaPhoto } from "./png";

/**
 * Datos de demostración (pnpm db:seed-demo): dos empresas marcadas DEMO y tres
 * solicitudes, en estado Enviada, Cotizada, y Aceptada con su pedido en QA con
 * una foto. Todo pasa por las mismas funciones que usa la plataforma (wizard,
 * RFQ, cotización, aceptación, pagos e hitos). Costos y montos son ficticios.
 */
export type DemoRequest = { key: "nueva" | "cotizada" | "pedido"; number: string; requestId: string; accessToken: string; orderId: string | null; company: string };
export type DemoSummary = { created: boolean; adminEmail: string; salesEmail: string; requests: DemoRequest[] };

export const DEMO_COMPANIES = { cafe: "Café Altura Boquete (DEMO)", sabores: "Sabores del Istmo (DEMO)" } as const;
const SALES_EMAIL = "ventas.demo@provenpack.test";

async function staffUser(email: string, role: "admin" | "sales", name: string): Promise<CurrentUser> {
  const id = await withActor(serviceActor, async (tx) => {
    const [existing] = await tx<{ id: string }[]>`select id from auth.users where lower(email) = ${email.toLowerCase()}`;
    const userId = existing?.id ?? (await tx<{ id: string }[]>`insert into auth.users (email) values (${email.toLowerCase()}) returning id`)[0]!.id;
    await tx`update public.profiles set role = ${role}, name = coalesce(name, ${name}), is_active = true where user_id = ${userId}`;
    return userId;
  });
  return { userId: id, email, profileId: id, name, role, isActive: true };
}

function byCode<T extends { code: string }>(list: readonly T[], code: string): T {
  const found = list.find((x) => x.code === code);
  if (!found) throw new Error(`El catálogo no tiene ${code}: la demo usa el seed de supabase/seed.sql.`);
  return found;
}

/** Papel y calibre compatibles, con preferencia por los indicados. */
function material(catalog: PublicCatalog, typeId: string, paperCode: string, caliberCode: string) {
  const papers = [byCode(catalog.papers, paperCode), ...catalog.papers];
  const paper = papers.find((p) => evaluatePaper(catalog.compatibilities, typeId, p.id).allowed)!;
  const calibers = [byCode(catalog.calibers, caliberCode), ...catalog.calibers];
  const caliber = calibers.find((c) => evaluateCaliber(catalog.compatibilities, typeId, paper.id, c.id).allowed)!;
  return { paperId: paper.id, caliberId: caliber.id };
}

/**
 * Envía la solicitud como lo hace el cliente. Con `artwork`, primero sube el
 * archivo al borrador de la pieza 1 (así el semáforo lo cuenta).
 */
async function submit(state: WizardState, artwork?: { name: string; data: Buffer }): Promise<{ requestId: string; accessToken: string; number: string }> {
  const { token } = await saveDraft(null, state);
  if (artwork) {
    const scope = { scope: "draft" as const, draftToken: token, itemKey: state.items[0]!.key, purpose: "artwork" as const };
    const slot = await prepareUpload(scope, { name: artwork.name, size: artwork.data.length });
    if (!slot.ok) throw new Error(`Arte de demo: ${slot.error}`);
    await putObject("artwork", slot.path, artwork.data, "application/pdf");
    const confirmed = await confirmUpload(scope, { path: slot.path, name: artwork.name, size: artwork.data.length });
    if (!confirmed.ok) throw new Error(`Arte de demo: ${confirmed.error}`);
    state.items[0]!.artworkFiles = [confirmed.file];
    await saveDraft(token, state);
  }
  const sent = await submitDraft(token, { ip: null });
  if (!sent.ok) throw new Error(`La solicitud de demo no pasó la validación: ${JSON.stringify(sent)}`);
  return { requestId: sent.requestId, accessToken: sent.accessToken, number: sent.number };
}

function contact(company: string, name: string, email: string, whatsapp: string, city: string, address: string): WizardState["contact"] {
  return { company, ruc: "", name, position: "Compras", whatsapp, email, city, address, source: "social", comments: "Solicitud de demostración.", consent: true };
}

function foodItem(catalog: PublicCatalog, over: Partial<ItemDraft>, typeCode: string, sizeCode: string, paperCode: string, caliberCode: string): ItemDraft {
  const type = byCode(catalog.productTypes, typeCode);
  return {
    ...emptyItem(),
    categoryId: type.categoryId,
    productTypeId: type.id,
    sizeMode: "standard",
    standardSizeId: byCode(catalog.sizes, sizeCode).id,
    ...material(catalog, type.id, paperCode, caliberCode),
    foodIds: [byCode(catalog.foodAttributes, "AL-01").id],
    frequency: "monthly",
    ...over,
  };
}

/** RFQ enviado con su respuesta y la cotización emitida (35 % de margen, flete fijo). */
async function quote(user: CurrentUser, requestId: string, costs: { itemId: string; quantity: number; unitCost: string; freight: string; days: string }[]) {
  const gen = await generateRfq(user, requestId);
  if (!gen.ok) throw new Error(`RFQ de demo: ${gen.error}`);
  await sendRfq(user, gen.rfq.id);
  const answer = await recordRfqResponse(user, gen.rfq.id, {
    costs: costs.map((c) => ({ itemId: c.itemId, quantity: c.quantity, unitCost: c.unitCost })),
    currency: "usd",
    productionDays: "25",
    notes: "Respuesta de ejemplo (DEMO).",
  });
  if (!answer.ok) throw new Error(`Respuesta de fábrica de demo: ${answer.error}`);
  const draft = await createQuoteDraft(user, requestId);
  if (!draft.ok) throw new Error(`Cotización de demo: ${draft.error}`);
  const saved = await updateQuoteDraft(user, draft.quote.id, {
    lines: costs.map((c) => ({ itemId: c.itemId, quantity: c.quantity, unitCost: c.unitCost, freightTotal: c.freight, marginPct: "35", leadTimeDays: c.days })),
    validUntil: addDays(new Date(), 15).toISOString().slice(0, 10),
    notes: "Cotización de demostración: precios ficticios.",
  });
  if (!saved.ok) throw new Error(`Cotización de demo: ${saved.error}`);
  const issued = await issueQuote(user, draft.quote.id);
  if (!issued.ok) throw new Error(`Emisión de demo: ${issued.error}`);
  return draft.quote.id;
}

async function markDemo(requestIds: string[]): Promise<void> {
  await withActor(serviceActor, async (tx) => {
    await tx`update public.quote_requests set is_demo = true where id in ${tx(requestIds)}`;
    await tx`update public.companies set is_demo = true where id in (select company_id from public.quote_requests where id in ${tx(requestIds)} and company_id is not null)`;
  });
}

async function existingDemo(): Promise<DemoRequest[]> {
  const rows = await withActor(serviceActor, (tx) => tx<{ id: string; number: string; access_token: string; status: string; company: string; order_id: string | null }[]>`
    select r.id, r.number, r.access_token, r.status, coalesce(r.company_name, r.contact_name) as company,
           (select o.id from public.orders o where o.request_id = r.id limit 1) as order_id
      from public.quote_requests r where r.is_demo order by r.submitted_at`);
  const key = (r: (typeof rows)[number]): DemoRequest["key"] => (r.order_id ? "pedido" : r.status === "submitted" ? "nueva" : "cotizada");
  return rows.map((r) => ({ key: key(r), number: r.number, requestId: r.id, accessToken: r.access_token, orderId: r.order_id, company: r.company }));
}

export async function seedDemo(opts: { adminEmail: string }): Promise<DemoSummary> {
  const already = await existingDemo();
  if (already.length > 0) return { created: false, adminEmail: opts.adminEmail, salesEmail: SALES_EMAIL, requests: already };

  const admin = await staffUser(opts.adminEmail, "admin", "Admin (DEMO)");
  const sales = await staffUser(SALES_EMAIL, "sales", "Ventas (DEMO)");
  const catalog = await getPublicCatalog();

  // 1. Nueva: alimentos, clamshell con impresión y sin arte todavía (queda en amarillo).
  const nueva = initialWizardState();
  nueva.segment = "food";
  nueva.product = { ...nueva.product, name: "Hamburguesas para llevar", weight: "350", conditions: ["hot", "grease"] };
  nueva.items = [
    foodItem(
      catalog,
      {
        foodIds: [byCode(catalog.foodAttributes, "AL-01").id, byCode(catalog.foodAttributes, "AL-02").id],
        printOptionId: byCode(catalog.printOptions, "PR-02").id,
        faces: "outside",
        coverage: "logo",
        quantities: ["5000", "10000", ""],
        artwork: "no_artwork_yet",
      },
      "CJ-08",
      "AL-S03",
      "PA-05",
      "CA-01",
    ),
  ];
  nueva.contact = contact(DEMO_COMPANIES.sabores, "Rosa Ibarra", "rosa.ibarra@demo.provenpack.test", "+507 6000-0101", "Panamá", "Vía Argentina, local 12");
  const a = await submit(nueva);

  // 2. Cotizada: comercio, mailer impreso con el logo del cliente; RFQ respondido y cotización emitida.
  const cafe = initialWizardState();
  cafe.segment = "commercial";
  cafe.product = { ...cafe.product, name: "Café de altura en grano (340 g)", weight: "340", length: "14", width: "9", height: "6", uses: ["shipping", "gift"] };
  const mailer = byCode(catalog.productTypes, "CJ-06");
  cafe.items = [
    {
      ...emptyItem(),
      categoryId: mailer.categoryId,
      productTypeId: mailer.id,
      sizeMode: "standard",
      standardSizeId: byCode(catalog.sizes, "CJ-S03").id,
      ...material(catalog, mailer.id, "PA-03", "CA-02"),
      printOptionId: byCode(catalog.printOptions, "PR-02").id,
      faces: "outside",
      coverage: "logo",
      finishIds: [byCode(catalog.finishes, "AC-01").id],
      quantities: ["1000", "3000", ""],
      frequency: "quarterly",
      artwork: "has_artwork",
      // Referencia elegida de la galería (muestra del catálogo).
      referenceSampleIds: catalog.gallery.slice(0, 1).map((g) => g.id),
    },
  ];
  cafe.contact = contact(DEMO_COMPANIES.cafe, "Lucía Batista", "lucia.batista@demo.provenpack.test", "+507 6000-0202", "Boquete", "Alto Boquete, finca 3");
  // El cliente sube su logo en el paso de arte (PDF de ejemplo).
  const b = await submit(cafe, { name: "logo-cafe-altura.pdf", data: demoArtworkPdf() });
  const [bItem] = await withActor(serviceActor, (tx) => tx<{ id: string }[]>`select id from public.quote_items where request_id = ${b.requestId}`);
  await assignRequest(admin, b.requestId, sales.userId);
  await changeRequestStatus(sales, b.requestId, "in_review");
  await quote(sales, b.requestId, [
    { itemId: bItem!.id, quantity: 1000, unitCost: "0.52", freight: "90", days: "30" },
    { itemId: bItem!.id, quantity: 3000, unitCost: "0.41", freight: "180", days: "30" },
  ]);

  // 3. Aceptada con pedido en QA: alimentos, bolsa kraft sin impresión (no necesita proof).
  const bolsa = initialWizardState();
  bolsa.segment = "food";
  bolsa.product = { ...bolsa.product, name: "Pedidos para llevar", weight: "900", conditions: ["hot"] };
  bolsa.items = [
    foodItem(
      catalog,
      { printOptionId: byCode(catalog.printOptions, "PR-00").id, quantities: ["10000", "", ""] },
      "BL-01",
      "BL-S04",
      "PA-01",
      "CA-02",
    ),
  ];
  bolsa.contact = contact(DEMO_COMPANIES.sabores, "Rosa Ibarra", "rosa.ibarra@demo.provenpack.test", "+507 6000-0101", "Panamá", "Vía Argentina, local 12");
  const c = await submit(bolsa);
  const [cItem] = await withActor(serviceActor, (tx) => tx<{ id: string }[]>`select id from public.quote_items where request_id = ${c.requestId}`);
  await assignRequest(admin, c.requestId, sales.userId);
  await changeRequestStatus(sales, c.requestId, "in_review");
  const quoteId = await quote(sales, c.requestId, [{ itemId: cItem!.id, quantity: 10000, unitCost: "0.11", freight: "250", days: "30" }]);
  const accepted = await acceptQuote(c.accessToken, quoteId, { name: "Rosa Ibarra", selection: [{ itemId: cItem!.id, quantity: 10000 }], ip: null, userAgent: "seed-demo" });
  if (!accepted.ok) throw new Error(`Aceptación de demo: ${accepted.error}`);
  const [orderRow] = await withActor(serviceActor, (tx) => tx<{ id: string }[]>`select id from public.orders where request_id = ${c.requestId}`);
  const orderId = orderRow!.id;
  const order = await getOrder(admin, orderId);
  await recordPayment(admin, orderId, { kind: "deposit", amount: String(order!.depositAmount), method: "ACH", reference: "DEMO-0001", paidOn: "" });
  await recordMilestone(admin, orderId, { type: "production_started", notes: "Producción iniciada en planta (DEMO)." });
  const detail = await getOrder(admin, orderId);
  const qa = orderQaChecklist(detail!).map((p) => ({ key: p.key, result: "ok", comment: "" }));
  const milestone = await recordMilestone(admin, orderId, { type: "qa_completed", qa, notes: "Verificación contra la ficha aprobada (DEMO)." });
  if (!milestone.ok) throw new Error(`Hito de QA de demo: ${milestone.error}`);
  const photo = demoQaPhoto();
  const slot = await prepareEvidenceUpload(admin, milestone.milestoneId, { name: "qa-bolsas-demo.png", size: photo.length });
  if (!slot.ok) throw new Error(`Foto de QA de demo: ${slot.error}`);
  await putObject("evidence", slot.path, photo, "image/png");
  const confirmed = await confirmEvidenceUpload(admin, milestone.milestoneId, { path: slot.path, name: "qa-bolsas-demo.png" });
  if (!confirmed.ok) throw new Error(`Foto de QA de demo: ${confirmed.error}`);

  await markDemo([a.requestId, b.requestId, c.requestId]);
  return {
    created: true,
    adminEmail: opts.adminEmail,
    salesEmail: SALES_EMAIL,
    requests: [
      { key: "nueva", number: a.number, requestId: a.requestId, accessToken: a.accessToken, orderId: null, company: DEMO_COMPANIES.sabores },
      { key: "cotizada", number: b.number, requestId: b.requestId, accessToken: b.accessToken, orderId: null, company: DEMO_COMPANIES.cafe },
      { key: "pedido", number: c.number, requestId: c.requestId, accessToken: c.accessToken, orderId, company: DEMO_COMPANIES.sabores },
    ],
  };
}
