import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeTestSql, createUser, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { getPublicCatalog } = await import("@/lib/catalog/public");
const { evaluateCaliber, evaluatePaper } = await import("@/lib/compat");
const { saveDraft } = await import("@/lib/quote/drafts");
const { submitDraft } = await import("@/lib/quote/submit");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
const { changeRequestStatus } = await import("@/lib/panel/requests");
const { editRequestContact, editRequestItem } = await import("@/lib/panel/edit");
const { generateRfq } = await import("@/lib/rfq");
type CurrentUser = import("@/lib/auth").CurrentUser;
type ItemDraft = import("@/lib/quote/types").ItemDraft;

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
async function staff(role: "sales" | "viewer"): Promise<CurrentUser> {
  seq += 1;
  const id = await createUser(`edicion-m13-${Date.now()}-${seq}@test.local`, role);
  return { userId: id, email: null, profileId: id, name: null, role, isActive: true };
}

/** Solicitud "No sé, sugiéranme": el cotizador la deja sin tipo ni material. */
async function adviceRequest() {
  const s = initialWizardState();
  s.segment = "commercial";
  s.product.name = "Tazas de cerámica";
  s.items = [{ ...emptyItem("a"), needsAdvice: true, quantities: ["1200", "", ""], frequency: "once" }];
  s.contact = { ...s.contact, name: "Luis Gómez", email: `luis-m13-${Date.now()}@example.com`, city: "Panamá", address: "Obarrio", consent: true };
  const { token } = await saveDraft(null, s);
  const sent = await submitDraft(token, { ip: null });
  if (!sent.ok) throw new Error("envío");
  const [item] = await testSql()<{ id: string }[]>`select id from public.quote_items where request_id = ${sent.requestId}`;
  return { requestId: sent.requestId, itemId: item!.id };
}

/** Pieza definida por el vendedor: un tipo de comercio, tamaño estándar, papel y calibre compatibles, sin impresión. */
async function definedDraft(): Promise<ItemDraft> {
  const catalog = await getPublicCatalog();
  for (const type of catalog.productTypes.filter((t) => t.segments.includes("commercial"))) {
    const size = catalog.sizes.find((z) => z.family === type.sizeFamily);
    const paper = catalog.papers.find((p) => evaluatePaper(catalog.compatibilities, type.id, p.id).allowed);
    const caliber = paper && catalog.calibers.find((c) => evaluateCaliber(catalog.compatibilities, type.id, paper.id, c.id).allowed);
    const noPrint = catalog.printOptions.find((p) => p.isNoPrint);
    if (!size || !paper || !caliber || !noPrint) continue;
    return {
      ...emptyItem("editar"),
      productTypeId: type.id,
      categoryId: type.categoryId,
      sizeMode: "standard",
      standardSizeId: size.id,
      paperId: paper.id,
      caliberId: caliber.id,
      printOptionId: noPrint.id,
      quantities: ["1200", "3000", ""],
      frequency: "monthly",
    };
  }
  throw new Error("catálogo sin combinación válida");
}

describe("editar la solicitud desde el panel (M13)", () => {
  it("el vendedor completa una pieza «No sé, sugiéranme» y el RFQ sale con tipo, tamaño y material", async () => {
    const sales = await staff("sales");
    const r = await adviceRequest();
    await changeRequestStatus(sales, r.requestId, "in_review");
    const draft = await definedDraft();

    const viewer = await staff("viewer");
    expect(await editRequestItem(viewer, r.requestId, r.itemId, { item: draft, reason: "Definido con el cliente" })).toEqual({ ok: false, error: "forbidden" });
    expect(await editRequestItem(sales, r.requestId, r.itemId, { item: draft, reason: "x" })).toEqual({ ok: false, error: "reason" });
    const invalid = await editRequestItem(sales, r.requestId, r.itemId, { item: { ...draft, paperId: null }, reason: "Definido con el cliente" });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.fields?.paper).toBe("paperRequired");

    expect(await editRequestItem(sales, r.requestId, r.itemId, { item: draft, reason: "Definido con el cliente por WhatsApp" })).toEqual({ ok: true, warning: null });
    const [item] = await testSql()<{ needs_advice: boolean; quantities: number[]; spec_snapshot: { type: { id: string } | null; needsAdvice: boolean; quantities: number[] } }[]>`
      select needs_advice, quantities, spec_snapshot from public.quote_items where id = ${r.itemId}`;
    expect(item?.needs_advice).toBe(false);
    expect(item?.quantities).toEqual([1200, 3000]);
    expect(item?.spec_snapshot.type?.id).toBe(draft.productTypeId);
    const versions = await testSql()<{ version: number; spec_snapshot: { needsAdvice: boolean }; reason: string; created_by: string }[]>`
      select version, spec_snapshot, reason, created_by from public.quote_item_versions where item_id = ${r.itemId}`;
    expect(versions).toEqual([{ version: 1, spec_snapshot: expect.objectContaining({ needsAdvice: true }), reason: "Definido con el cliente por WhatsApp", created_by: sales.userId }]);
    // Ya no falta el tipo: el semáforo se recalculó.
    const [req] = await testSql()<{ missing_fields: string[]; initial_missing_fields: string[] }[]>`select missing_fields, initial_missing_fields from public.quote_requests where id = ${r.requestId}`;
    expect(req?.missing_fields).not.toContain("1:type");
    expect(req?.initial_missing_fields).toContain("1:type");

    const rfq = await generateRfq(sales, r.requestId);
    expect(rfq.ok).toBe(true);
    // Con RFQ, la próxima edición avisa que hay que generar otro.
    expect(await editRequestItem(sales, r.requestId, r.itemId, { item: { ...draft, quantities: ["1500", "", ""] }, reason: "El cliente subió la cantidad" })).toEqual({
      ok: true,
      warning: "rfq",
    });
  });

  it("corrige el contacto con motivo y valida correo o WhatsApp", async () => {
    const sales = await staff("sales");
    const r = await adviceRequest();
    const base = { name: "Luis Gómez", company: "Cerámicas del Valle", email: "", whatsapp: "", city: "David", address: "Calle B", reason: "Correo mal escrito" };
    expect(await editRequestContact(sales, r.requestId, base)).toEqual({ ok: false, error: "contact" });
    expect(await editRequestContact(sales, r.requestId, { ...base, email: "luis@ceramicas.test", whatsapp: "6123-4567" })).toEqual({ ok: true, warning: null });
    const [row] = await testSql()<{ contact_email: string; contact_whatsapp: string; company_name: string }[]>`
      select contact_email, contact_whatsapp, company_name from public.quote_requests where id = ${r.requestId}`;
    expect(row).toEqual({ contact_email: "luis@ceramicas.test", contact_whatsapp: "+50761234567", company_name: "Cerámicas del Valle" });
    const act = await testSql()`select 1 from public.activities where request_id = ${r.requestId} and kind = 'contact_edited'`;
    expect(act).toHaveLength(1);
  });
});
